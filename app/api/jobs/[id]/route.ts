import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getApiBase() {
  const base =
    process.env.TERMTIDY_API_URL || process.env.NEXT_PUBLIC_TERMTIDY_API_URL;

  if (!base) {
    throw new Error(
      "Missing TERMTIDY_API_URL env var (server-side). Set TERMTIDY_API_URL in .env.local / Vercel."
    );
  }

  return base.replace(/\/+$/, "");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const apiBase = getApiBase();
    const { id } = await ctx.params;

    const targetUrl = `${apiBase}/jobs/${encodeURIComponent(id)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(targetUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstreamRes.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Non-JSON response from API", detail: text };
    }

    return NextResponse.json(data, { status: upstreamRes.status });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Upstream timeout" : e?.message ?? String(e);
    return NextResponse.json(
      {
        ok: false,
        error: "Proxy error",
        detail: msg,
      },
      { status: 502 }
    );
  }
}
