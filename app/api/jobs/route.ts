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

  // Strip trailing slash
  return base.replace(/\/+$/, "");
}

export async function POST(req: Request) {
  try {
    const apiBase = getApiBase();

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

    // Forward as-is to FastAPI /jobs
    const targetUrl = `${apiBase}/jobs`;

    // Add a timeout so you never get “hung for 5 minutes” without a useful error
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 minutes

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(targetUrl, {
        method: "POST",
        body: form,
        cache: "no-store",
        signal: controller.signal,
        // no headers needed; fetch will set multipart boundary automatically
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
