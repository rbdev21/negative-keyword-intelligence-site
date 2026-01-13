import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("Missing Supabase service role env vars.");
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

function planFromPrice(priceId: string | null) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_SCALE) return "scale";
  return "unknown";
}

function baseQuotaFor(status: string | null, plan: string | null) {
  // Trial cap = 20,000 terms
  if (status === "trialing") return 20000;

  // Paid plans
  if (plan === "starter") return 100000;
  if (plan === "pro") return 300000;
  if (plan === "scale") return 500000;

  return 0;
}

function dateOnlyUTC(ts: number | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  // YYYY-MM-DD
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

async function upsertUsageWindow(
  sb: ReturnType<typeof admin>,
  userId: string,
  periodStartUnix: number | null,
  baseQuota: number
) {
  // month_start is actually "period_start" for you now
  const periodStartDate = dateOnlyUTC(periodStartUnix);
  if (!periodStartDate) return;

  // Ensure row exists and align base_quota + terms_quota.
  // Keep topup_quota as-is; terms_quota should always be base_quota + topup_quota.
  const { data: existing } = await sb
    .from("user_usage_monthly")
    .select("topup_quota")
    .eq("user_id", userId)
    .eq("month_start", periodStartDate)
    .maybeSingle();

  const topupQuota = Number(existing?.topup_quota ?? 0);

  await sb.from("user_usage_monthly").upsert(
    {
      user_id: userId,
      month_start: periodStartDate,
      base_quota: baseQuota,
      terms_quota: baseQuota + topupQuota,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_start" }
  );
}

export async function POST(req: Request) {
  try {
    const sig = (await headers()).get("stripe-signature");
    const whsec = process.env.STRIPE_WEBHOOK_SECRET!;
    if (!sig || !whsec) {
      return NextResponse.json({ ok: false, error: "Missing webhook signature/secret" }, { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, whsec);
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: "Invalid signature", detail: err?.message }, { status: 400 });
    }

    const sb = admin();

    // We normalize everything by fetching the Subscription when possible.
    const handleSubscription = async (sub: Stripe.Subscription) => {
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      const priceId =
        sub.items?.data?.[0]?.price?.id ?? null;

      // Map to user id using metadata first, fallback to customers metadata
      let userId = (sub.metadata?.supabase_user_id as string) || null;

      if (!userId) {
        const cust = await stripe.customers.retrieve(customerId);
        if (cust && !("deleted" in cust)) {
          userId = (cust.metadata?.supabase_user_id as string) || null;
        }
      }

      if (!userId) return; // can't link — ignore safely

      const plan = planFromPrice(priceId);
      const status = sub.status ?? null;

      await sb.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          plan,
          status,
          current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      const baseQuota = baseQuotaFor(status, plan);
      await upsertUsageWindow(sb, userId, sub.current_period_start ?? null, baseQuota);
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId = String(session.subscription);
          const sub = await stripe.subscriptions.retrieve(subId);
          await handleSubscription(sub);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscription(sub);
        break;
      }

      default:
        // ignore unhandled events
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Webhook error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
