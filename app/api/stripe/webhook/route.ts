import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Don't force apiVersion (avoids type unions causing build issues)
// Legacy subscription webhooks (Stripe). Credits model uses one-time top-ups.
// Keep for reference; remove before launch.
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
  // Legacy trial cap = 20,000 credits
  if (status === "trialing") return 20000;

  if (plan === "starter") return 100000;
  if (plan === "pro") return 300000;
  if (plan === "scale") return 500000;

  return 0;
}

// unix seconds -> YYYY-MM-DD (UTC)
function dateOnlyUTCFromUnix(ts: number | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts * 1000);
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
  const periodStartDate = dateOnlyUTCFromUnix(periodStartUnix);
  if (!periodStartDate) return;

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

async function resolveUserId(sub: any, customerId: string) {
  // Legacy subscription metadata
  const subUserId = (sub?.metadata?.supabase_user_id as string) || null;
  if (subUserId) return subUserId;

  // Fallback to customer metadata
  const cust = await stripe.customers.retrieve(customerId);
  if (cust && !("deleted" in cust)) {
    return (cust.metadata?.supabase_user_id as string) || null;
  }

  return null;
}

// Legacy subscription handler (credits model uses top-ups)
async function handleSubscription(sb: ReturnType<typeof admin>, subRaw: any) {
  const customerId =
    typeof subRaw.customer === "string" ? subRaw.customer : subRaw.customer?.id;

  if (!customerId) return;

  const priceId = subRaw?.items?.data?.[0]?.price?.id ?? null;
  const plan = planFromPrice(priceId);
  const status: string | null = subRaw?.status ?? null;

  const userId = await resolveUserId(subRaw, customerId);
  if (!userId) return;

  // ✅ IMPORTANT: cast these two fields because your Stripe types don’t include them
  const cps: number | null = typeof subRaw?.current_period_start === "number" ? subRaw.current_period_start : null;
  const cpe: number | null = typeof subRaw?.current_period_end === "number" ? subRaw.current_period_end : null;

  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subRaw.id,
      stripe_price_id: priceId,
      plan,
      status,
      current_period_start: cps ? new Date(cps * 1000).toISOString() : null,
      current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  const baseQuota = baseQuotaFor(status, plan);
  await upsertUsageWindow(sb, userId, cps, baseQuota);
}

export async function POST(req: Request) {
  try {
    const sig = (await headers()).get("stripe-signature");
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whsec) {
      return NextResponse.json(
        { ok: false, error: "Missing stripe-signature header or STRIPE_WEBHOOK_SECRET" },
        { status: 400 }
      );
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, whsec);
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: "Invalid signature", detail: err?.message },
        { status: 400 }
      );
    }

    const sb = admin();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.subscription) {
          const subId = String(session.subscription);
          const sub = await stripe.subscriptions.retrieve(subId);
          await handleSubscription(sb, sub as any);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        await handleSubscription(sb, sub);
        break;
      }

      default:
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
