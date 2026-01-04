import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.TERMTIDY_API_URL; // e.g. https://termtidy-api.onrender.com
const JOBS_TABLE = process.env.TERMTIDY_JOBS_TABLE || "audit_jobs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createSupabaseAdmin(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// First day of month in UTC (date)
function monthStartUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const ms = Date.UTC(y, m, 1, 0, 0, 0);
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

// Efficient CSV row count from uploaded File (counts lines minus header)
async function countCsvRows(file: File): Promise<number> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return 0;

  let lines = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 10) lines++;
  }

  const endsWithNewline = buf[buf.length - 1] === 10;
  if (!endsWithNewline) lines++;

  // subtract header
  return Math.max(0, lines - 1);
}

function safeNumber(x: any, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(n: any) {
  const v = safeNumber(n, 0);
  return v.toLocaleString();
}

export async function POST(req: Request) {
  try {
    if (!API_BASE) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL env var" },
        { status: 500 }
      );
    }

    // 1) Must be logged in
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2) Read incoming form-data
    const form = await req.formData();

    const searchFile = form.get("search_terms_file");
    const keywordsFile = form.get("keywords_file");

    if (!(searchFile instanceof File) || !(keywordsFile instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bad Request",
          detail:
            "Missing CSV files. Expect form-data keys: search_terms_file, keywords_file",
        },
        { status: 400 }
      );
    }

    // 3) Count search terms reviewed
    const termsCount = await countCsvRows(searchFile);
    if (termsCount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Bad Request", detail: "Search Terms CSV is empty." },
        { status: 400 }
      );
    }

    const supabaseAdmin = admin();

    // 4) Reserve quota + credits atomically via RPC
    const monthStart = monthStartUTC();
    const { data: reserveData, error: reserveErr } = await supabaseAdmin.rpc(
      "reserve_terms",
      {
        p_user_id: user.id,
        p_month_start: monthStart,
        p_amount: termsCount,
      }
    );

    if (reserveErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to reserve quota", detail: reserveErr.message },
        { status: 500 }
      );
    }

    const reserveRow = Array.isArray(reserveData) ? reserveData[0] : reserveData;

    const remaining = safeNumber(reserveRow?.remaining, 0);
    const quota = safeNumber(reserveRow?.quota, 0);
    const used = safeNumber(reserveRow?.used, 0);
    const usedFromQuota = safeNumber(reserveRow?.used_from_quota, 0);
    const usedFromCredits = safeNumber(reserveRow?.used_from_credits, 0);

    if (!reserveRow?.ok) {
      const deficit = Math.max(0, termsCount - remaining);

      return NextResponse.json(
        {
          ok: false,
          error: "Quota exceeded",
          detail: {
            reason: reserveRow?.reason || "quota_exceeded",
            requested: termsCount,
            month_start: monthStart,
            quota,
            used,
            remaining,
            deficit, // how many additional terms needed (top-up suggestion)
            hint:
              deficit > 0
                ? `You need ${fmt(deficit)} more search terms. Add a top-up to continue.`
                : "Quota exceeded.",
          },
        },
        { status: 402 }
      );
    }

    // 5) Start FastAPI job
    const forward = new FormData();
    forward.append("search_terms_file", searchFile);
    forward.append("keywords_file", keywordsFile);

    const passthroughKeys = [
      "min_clicks",
      "min_cost",
      "similarity_threshold",
      "use_llm",
      "batch_size",
      "currency",
      "brand_terms",
    ] as const;

    for (const k of passthroughKeys) {
      const v = form.get(k);
      if (typeof v === "string" && v.length > 0) forward.append(k, v);
    }

    const startRes = await fetch(`${API_BASE.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      body: forward,
      cache: "no-store",
      headers: {
        "x-user-id": user.id,
      },
    });

    const startText = await startRes.text();
    let startJson: any;
    try {
      startJson = JSON.parse(startText);
    } catch {
      startJson = { ok: false, error: "Non-JSON response", detail: startText };
    }

    if (!startRes.ok || startJson?.ok !== true || !startJson?.job_id) {
      // IMPORTANT: we already reserved usage, but job creation failed.
      // For now, we surface error clearly. (Optional next improvement: add a refund_terms RPC.)
      return NextResponse.json(
        { ok: false, error: "Job start failed", detail: startJson },
        { status: 500 }
      );
    }

    const jobId: string = startJson.job_id;

    // 6) Persist job row (durable)
    const nowIso = new Date().toISOString();

    const parts: string[] = [];
    parts.push(`Queued. Reserved ${fmt(termsCount)} terms for ${monthStart}.`);
    if (usedFromQuota > 0) parts.push(`Used ${fmt(usedFromQuota)} from monthly quota.`);
    if (usedFromCredits > 0) parts.push(`Used ${fmt(usedFromCredits)} from top-up credits.`);
    parts.push(`Remaining this period: ${fmt(remaining)}.`);

    const message = parts.join(" ");

    const { error: insertErr } = await supabaseAdmin.from(JOBS_TABLE).upsert(
      {
        id: jobId,
        user_id: user.id,
        status: "queued",
        progress: 0,
        stats: null,
        results: null,
        error: null,
        message,
        cancel_requested: false,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    );

    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to persist job", detail: insertErr.message },
        { status: 500 }
      );
    }

    // 7) Return to frontend
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      status: "queued",
      progress: 0,
      message,
      metering: {
        terms_count: termsCount,
        month_start: monthStart,
        remaining,
        used_from_quota: usedFromQuota,
        used_from_credits: usedFromCredits,
        quota,
        used,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
