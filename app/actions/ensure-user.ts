"use server";

import { createClient } from "@/lib/supabase/server";

const FREE_TRIAL_TERMS = 20000;

export async function ensureUserAndTrial() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  // 1) Ensure row in public.users
  await supabase
    .from("users")
    .upsert(
      {
        id: user.id, // IMPORTANT: use auth user id as primary key
        email: user.email,
        plan: "trial",
      },
      { onConflict: "id" }
    );

  // 2) Ensure usage row exists (lifetime bucket)
  const { data: usageRow } = await supabase
    .from("usage")
    .select("user_id, remaining_terms")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!usageRow) {
    await supabase.from("usage").insert({
      user_id: user.id,
      remaining_terms: FREE_TRIAL_TERMS,
      plan: "trial",
    });

    // Optional: record an event
    await supabase.from("usage_events").insert({
      user_id: user.id,
      event_type: "trial_granted",
      amount_terms: FREE_TRIAL_TERMS,
      meta: { source: "signup" },
    });
  }

  // 3) Ensure monthly tracking row exists
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: monthlyRow } = await supabase
    .from("user_usage_monthly")
    .select("user_id, month_key")
    .eq("user_id", user.id)
    .eq("month_key", monthKey)
    .maybeSingle();

  if (!monthlyRow) {
    await supabase.from("user_usage_monthly").insert({
      user_id: user.id,
      month_key: monthKey,
      terms_used: 0,
      runs_used: 0,
    });
  }

  return { ok: true };
}
