import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates a top-up checkout session.
 * NOTE: Stripe wiring comes later — this endpoint exists so the build passes
 * and the UI can call a stable route.
 */
export async function POST(req: Request) {
  try {
    // Require auth (consistent with the rest of your API routes)
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body (optional)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // allow empty body
    }

    // For now: return 501 so UI can show "coming soon" or you can add Stripe next.
    return NextResponse.json(
      {
        ok: false,
        error: "Top-ups not enabled yet",
        detail: {
          message:
            "Top-up checkout is not wired to Stripe yet. This endpoint is a placeholder.",
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
