// nki-marketing/app/api/jobs/[id]/cancel/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getApiBase() {
  const base = process.env.TERMTIDY_API_URL;
  if (!base) throw new Error("Missing TERMTIDY_API_URL env var");
  return base.replace(/\/+$/, "");
}

function getUserId(req: Request): string | null {
  // if you already have auth later, swap this to your real user id
  return req.headers.get("x-user-id");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  try {
    const apiBase = getApiBase();
    const url = `${apiBase}/jobs/${encodeURIComponent(id)}/cancel`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        // pass through user id if present (optional)
        ...(getUserId(req) ? { "x-user-id": getUserId(req)! } : {}),
      },
      cache: "no-store",
    });

    const text = await r.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Non-JSON response", detail: text };
    }

    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Proxy error",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
