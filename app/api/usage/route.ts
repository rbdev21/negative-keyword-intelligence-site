import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// First day of the current month (UTC) as YYYY-MM-DD
function monthStartISO(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const month_start = monthStartISO();

    // Read usage row for this month
    const { data: row, error } = await supabase
      .from("user_usage_monthly")
      .select("month_start, terms_used, terms_quota")
      .eq("user_id", user.id)
      .eq("month_start", month_start)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to read usage", details: error.message },
        { status: 500 }
      );
    }

    const used = Number(row?.terms_used ?? 0);
    const quota = Number(row?.terms_quota ?? 0);
    const remaining = Math.max(0, quota - used);

    return NextResponse.json({
      ok: true,
      month_start,
      used,
      quota,
      remaining,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Internal Server Error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
