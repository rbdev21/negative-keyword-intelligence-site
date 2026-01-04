import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("Missing Supabase env vars.");
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount ?? 0);
    const source = typeof body?.source === "string" ? body.source : "manual";
    const notes = typeof body?.notes === "string" ? body.notes : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Bad Request", detail: "amount must be > 0" }, { status: 400 });
    }

    const supabaseAdmin = admin();
    const { data, error } = await supabaseAdmin.rpc("add_term_credits", {
      p_user_id: user.id,
      p_amount: amount,
      p_source: source,
      p_notes: notes,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: "Top up failed", detail: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, ...row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
