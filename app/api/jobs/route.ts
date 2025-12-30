import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.TERMTIDY_API_URL; // e.g. https://termtidy-api.onrender.com (NO trailing slash required)
const JOBS_TABLE = process.env.TERMTIDY_JOBS_TABLE || "audit_jobs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    if (!API_BASE) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL env var" },
        { status: 500 }
      );
    }

    // 1) Must be logged in (use cookie auth)
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2) Read incoming form-data (CSV files + config fields)
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

    // 3) Forward to FastAPI /jobs (absolute URL)
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
    });

    const startText = await startRes.text();
    let startJson: any;
    try {
      startJson = JSON.parse(startText);
    } catch {
      startJson = { ok: false, error: "Non-JSON response", detail: startText };
    }

    if (!startRes.ok || startJson?.ok !== true || !startJson?.job_id) {
      return NextResponse.json(
        { ok: false, error: "Job start failed", detail: startJson },
        { status: 500 }
      );
    }

    const jobId: string = startJson.job_id;

    // 4) Persist job in Supabase (durable)
    const supabaseAdmin = admin();
    const nowIso = new Date().toISOString();

    const { error: insertErr } = await supabaseAdmin.from(JOBS_TABLE).upsert(
      {
        id: jobId,
        user_id: user.id,
        status: "queued",
        progress: 0,
        stats: null,
        results: null,
        error: null,
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

    // 5) Return to frontend
    return NextResponse.json({
      ok: true,
      job_id: jobId,
      status: "queued",
      progress: 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
