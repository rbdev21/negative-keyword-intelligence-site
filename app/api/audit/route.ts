import { NextResponse } from "next/server";

const API_URL = process.env.TERMTIDY_API_URL;

export async function POST(req: Request) {
  try {
    if (!API_URL) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL env var" },
        { status: 500 }
      );
    }

    const body = await req.json();

    const upstream = await fetch(`${API_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Non-JSON response from API", raw: text };
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Proxy error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
