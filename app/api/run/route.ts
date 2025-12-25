import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const apiUrl = process.env.TERMTIDY_API_URL;
    if (!apiUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing TERMTIDY_API_URL in .env.local" },
        { status: 500 }
      );
    }

    // Proxy request to Python API
    const resp = await fetch(`${apiUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // You can add timeout/abort later
    });

    const text = await resp.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
