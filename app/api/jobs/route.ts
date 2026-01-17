import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.TERMTIDY_API_URL; // e.g. https://termtidy-api.onrender.com
const UPLOADS_BUCKET = process.env.TERMTIDY_UPLOADS_BUCKET || "termtidy-uploads";

type Body = {
  search_path: string; // "<user_id>/<run_id>/search_terms.csv"
  keywords_path: string; // "<user_id>/<run_id>/keywords.csv"
  min_clicks?: number | string;
  min_cost?: number | string;
  similarity_threshold?: number | string;
  use_llm?: boolean | string;
  batch_size?: number | string;
  currency?: string;
  brand_terms?: string; // comma string
};

function toNum(v: any, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: any, fallback: boolean) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return fallback;
}

export async function POST(req: Request) {
  try {
    if (!API_BASE) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL env var" },
        { status: 500 }
      );
    }

    // Must be logged in
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      body = null;
    }

    const search_path = (body?.search_path ?? "").trim();
    const keywords_path = (body?.keywords_path ?? "").trim();

    if (!search_path || !keywords_path) {
      return NextResponse.json(
        { ok: false, error: "Bad Request", detail: "Missing search_path / keywords_path" },
        { status: 400 }
      );
    }

    const payload = {
      uploads_bucket: UPLOADS_BUCKET,
      search_path,
      keywords_path,
      min_clicks: toNum(body?.min_clicks, 3),
      min_cost: toNum(body?.min_cost, 0),
      similarity_threshold: toNum(body?.similarity_threshold, 0.75),
      use_llm: toBool(body?.use_llm, true),
      batch_size: toNum(body?.batch_size, 5),
      currency: (body?.currency ?? "GBP").toString(),
      brand_terms: (body?.brand_terms ?? "").toString(),
    };

    const startRes = await fetch(`${API_BASE.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-user-id": user.id,
      },
      body: JSON.stringify(payload),
    });

    const text = await startRes.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Non-JSON response", detail: text };
    }

    /**
     * Normalize FastAPI quota errors into the shape your UI already expects:
     * UI expects:
     *  { ok:false, error:"Quota exceeded", detail:{ requested, remaining, deficit, hint, ... } }
     *
     * FastAPI currently throws:
     *  HTTPException(402, detail={ error:"Quota exceeded", detail:{...}, job_id })
     */
    if (startRes.status === 402) {
      const fastDetail = data?.detail ?? data; // depends on how FastAPI serialized it
      const err = fastDetail?.error ?? data?.error ?? "Quota exceeded";
      const detail = fastDetail?.detail ?? fastDetail;

      // If already in correct shape, pass through.
      if (data?.error === "Quota exceeded" && data?.detail) {
        return NextResponse.json(data, { status: 402 });
      }

      const requested = Number(detail?.requested ?? 0);
      const remaining = Number(detail?.remaining ?? 0);
      const deficit = Math.max(0, requested - remaining);

      return NextResponse.json(
        {
          ok: false,
          error: err,
          detail: {
            ...detail,
            requested,
            remaining,
            deficit,
            hint:
              detail?.hint ??
              (deficit > 0
                ? `You need ${deficit.toLocaleString()} more search terms. Add a top-up to continue.`
                : "Quota exceeded."),
          },
        },
        { status: 402 }
      );
    }

    // Otherwise: pass through (FastAPI returns {ok:true, job_id, status} on success)
    return NextResponse.json(data, { status: startRes.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
