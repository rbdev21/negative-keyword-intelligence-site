import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.TERMTIDY_API_URL;
const JOBS_TABLE = process.env.TERMTIDY_JOBS_TABLE || "audit_jobs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    if (!API_BASE) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL env var" },
        { status: 500 }
      );
    }

    const { id } = await ctx.params;

    // 1) Must be logged in
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = admin();

    // 2) Fetch job row from Supabase to verify ownership
    const { data: jobRow, error: readErr } = await supabaseAdmin
      .from(JOBS_TABLE)
      .select("id, user_id, status, progress, stats, results, error")
      .eq("id", id)
      .single();

    if (readErr || !jobRow) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    if (jobRow.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // 3) Poll FastAPI for fresh status
    const pollRes = await fetch(`${API_BASE.replace(/\/$/, "")}/jobs/${encodeURIComponent(id)}`, {
      method: "GET",
      cache: "no-store",
    });

    const pollText = await pollRes.text();
    let pollJson: any;
    try {
      pollJson = JSON.parse(pollText);
    } catch {
      pollJson = { ok: false, status: "error", error: { message: "Non-JSON response" }, detail: pollText };
    }

    // If FastAPI says not found, keep Supabase as source of truth but surface the error
    if (!pollRes.ok || pollJson?.ok !== true) {
      return NextResponse.json({
        ok: true,
        job_id: jobRow.id,
        status: jobRow.status ?? "queued",
        progress: jobRow.progress ?? 0,
        stats: jobRow.stats ?? undefined,
        results: jobRow.results ?? undefined,
        error: jobRow.error ?? pollJson?.error ?? { message: "Failed to poll upstream job" },
      });
    }

    // 4) Sync back into Supabase
    const status = pollJson.status ?? "running";
    const progress = typeof pollJson.progress === "number" ? pollJson.progress : 0;

    const patch: any = {
      status,
      progress,
      updated_at: new Date().toISOString(),
    };

    if (status === "done") {
      patch.stats = pollJson.stats ?? null;
      patch.results = pollJson.results ?? [];
      patch.error = null;
    } else if (status === "error" || status === "failed") {
      patch.error = pollJson.error ?? pollJson.detail ?? { message: "Job failed" };
    }

    await supabaseAdmin.from(JOBS_TABLE).update(patch).eq("id", id);

    // 5) Return to frontend (stable shape)
    return NextResponse.json({
      ok: true,
      job_id: id,
      status: status === "failed" ? "error" : status,
      progress,
      stats: pollJson.stats ?? (status === "done" ? jobRow.stats : undefined),
      results: pollJson.results ?? (status === "done" ? jobRow.results : undefined),
      error: pollJson.error ?? (status !== "done" ? jobRow.error : undefined),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
