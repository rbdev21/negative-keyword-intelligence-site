import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_USAGE_TABLE = process.env.TERMTIDY_USAGE_TABLE || "user_usage_monthly";
const CREDITS_TABLE = process.env.TERMTIDY_CREDITS_TABLE || "credits_balance";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

function addOneMonth(dateStrYYYYMMDD: string) {
  // dateStr is "YYYY-MM-DD"
  const [y, m, d] = dateStrYYYYMMDD.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m - 1), d, 0, 0, 0));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return dt.toISOString().slice(0, 10);
}

export async function GET(_req: Request) {
  try {
    // 1) Must be logged in
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const sb = admin();

    // 2) Fetch latest usage period row
    const { data: usageRow, error: usageErr } = await sb
      .from(USER_USAGE_TABLE)
      .select("month_start, terms_used, terms_quota, base_quota, topup_quota, updated_at")
      .eq("user_id", user.id)
      .order("month_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no row yet, return a friendly default (legacy subscription fields may be zero)
    const monthStart = usageRow?.month_start ?? null;
    const used = Number(usageRow?.terms_used ?? 0);
    const baseQuota = Number(usageRow?.base_quota ?? usageRow?.terms_quota ?? 0);
    const topupQuota = Number(usageRow?.topup_quota ?? 0);
    const quotaTotal = baseQuota + topupQuota;

    // 3) Credits balance
    const { data: creditsRow } = await sb
      .from(CREDITS_TABLE)
      .select("balance, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const creditsBalance = Number(creditsRow?.balance ?? 0);
    console.log("[usage] user", user.id, "credits_balance", creditsBalance);

    // 4) Compute remaining
    const remainingQuota = Math.max(0, quotaTotal - used);
    const remainingTotal = Math.max(0, creditsBalance);

    // 5) Reporting window end (legacy monthly tracking)
    const periodStart = monthStart;
    const periodEnd = periodStart ? addOneMonth(periodStart) : null;

    if (usageErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to load usage", detail: usageErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      period: {
        start: periodStart,
        end: periodEnd,
        // This is the source row timestamp (useful for debugging refresh)
        updated_at: usageRow?.updated_at ?? null,
      },
      usage: {
        used_terms: used,
      },
      quota: {
        base: baseQuota,
        topup: topupQuota,
        total: quotaTotal,
        remaining_quota: remainingQuota,
      },
      credits: {
        balance: creditsBalance,
      },
      remaining_total: remainingTotal,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
