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

// First day of month in UTC (date) fallback
function monthStartUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const ms = Date.UTC(y, m, 1, 0, 0, 0);
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

// Convert a Date/ISO to YYYY-MM-DD in UTC (date-only)
function dateOnlyUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function safeNumber(x: any, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(n: any) {
  const v = safeNumber(n, 0);
  return v.toLocaleString();
}

// -------- CSV helpers (counts only real rows + applies filters before charging) --------

// Parse one CSV line into fields (handles quotes + commas)
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Escaped quote
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumberLoose(v: string): number {
  // Handles: "£1.23", "1,234.56", "", etc
  const cleaned = (v ?? "").replace(/[£,$]/g, "").replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Counts billable rows in a Search Terms CSV:
 * - ignores blank lines
 * - requires non-empty search term cell
 * - applies minClicks / minCost filters BEFORE charging
 */
async function countBillableSearchTerms(
  file: File,
  opts: { minClicks: number; minCost: number }
): Promise<number> {
  const text = await file.text();
  if (!text.trim()) return 0;

  // Split lines, remove fully-empty lines
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return 0;

  const header = parseCsvLine(lines[0]);
  const headerNorm = header.map(normHeader);

  // Try common column names
  const termIdx =
    headerNorm.indexOf("search term") !== -1
      ? headerNorm.indexOf("search term")
      : headerNorm.indexOf("search term (search query)") !== -1
      ? headerNorm.indexOf("search term (search query)")
      : headerNorm.indexOf("search query") !== -1
      ? headerNorm.indexOf("search query")
      : -1;

  const clicksIdx =
    headerNorm.indexOf("clicks") !== -1 ? headerNorm.indexOf("clicks") : -1;

  const costIdx =
    headerNorm.indexOf("cost") !== -1
      ? headerNorm.indexOf("cost")
      : headerNorm.indexOf("cost (gbp)") !== -1
      ? headerNorm.indexOf("cost (gbp)")
      : -1;

  // If we can't find the term column, fallback to “non-empty line” count (still ignores blank lines)
  if (termIdx === -1) {
    return Math.max(0, lines.length - 1);
  }

  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const term = (cols[termIdx] ?? "").trim();
    if (!term) continue; // ignore blank rows

    // Apply filters if those columns exist; if missing, treat as 0
    const clicks = clicksIdx !== -1 ? toNumberLoose(cols[clicksIdx] ?? "") : 0;
    const cost = costIdx !== -1 ? toNumberLoose(cols[costIdx] ?? "") : 0;

    if (clicks < opts.minClicks) continue;
    if (cost < opts.minCost) continue;

    count++;
  }

  return count;
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

    // Read filter values (so we can bill *after* filters)
    const minClicks = safeNumber(form.get("min_clicks"), 3);
    const minCost = safeNumber(form.get("min_cost"), 0);

    // 3) Count billable search terms (non-empty + filters applied)
    const termsCount = await countBillableSearchTerms(searchFile, {
      minClicks,
      minCost,
    });

    if (termsCount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bad Request",
          detail:
            "No billable rows found. Your Search Terms CSV may be blank or all rows are filtered out (min clicks / min cost).",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = admin();

    // 4) Determine billing window start (Stripe current_period_start) if present, else fallback
    let monthStart = monthStartUTC();

    const { data: subRow, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_start, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!subErr && subRow?.current_period_start) {
      const d = new Date(subRow.current_period_start);
      if (!Number.isNaN(d.getTime())) {
        monthStart = dateOnlyUTC(d);
      }
    }

    // 5) Reserve quota + credits atomically via RPC
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
            deficit,
            hint:
              deficit > 0
                ? `You need ${fmt(deficit)} more search terms. Add a top-up to continue.`
                : "Quota exceeded.",
          },
        },
        { status: 402 }
      );
    }

    // 6) Start FastAPI job
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
      // NOTE: quota already reserved; later improvement could add refund RPC.
      return NextResponse.json(
        { ok: false, error: "Job start failed", detail: startJson },
        { status: 500 }
      );
    }

    const jobId: string = startJson.job_id;

    // 7) Persist job row (durable)
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

    // 8) Return to frontend
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
