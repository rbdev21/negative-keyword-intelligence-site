import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // allow empty body
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Top-ups not enabled yet",
        detail: {
          message: "Top-up checkout is not wired to Stripe yet.",
          requested: body ?? null,
        },
      },
      { status: 501 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
