import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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

function getPriceId(plan: string) {
  const p = plan.toLowerCase();
  if (p === "starter") return process.env.STRIPE_PRICE_STARTER!;
  if (p === "pro") return process.env.STRIPE_PRICE_PRO!;
  if (p === "scale") return process.env.STRIPE_PRICE_SCALE!;
  throw new Error("Unknown plan. Use starter|pro|scale");
}

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

    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan ?? "").toLowerCase();
    if (!plan || !["starter", "pro", "scale"].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: "Bad Request", detail: "plan must be starter|pro|scale" },
        { status: 400 }
      );
    }

    const priceId = getPriceId(plan);
    const supabaseAdmin = admin();

    // Try reuse existing Stripe customer id
    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = subRow?.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: user.id,
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    if (!appUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    // 7-day trial
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app?billing=success`,
      cancel_url: `${appUrl}/app?billing=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: user.id,
          plan,
        },
      },
      metadata: {
        supabase_user_id: user.id,
        plan,
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
