import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const baseUrl = process.env.TERMTIDY_API_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL env var" },
        { status: 500 }
      );
    }

    const resp = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await resp.json().catch(() => ({}));

    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Proxy failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
