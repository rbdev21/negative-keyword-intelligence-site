import Stripe from "stripe";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
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

function parseCredits(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing stripe-signature header or STRIPE_WEBHOOK_SECRET",
      },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whsec);
  } catch (err: any) {
    console.error("[billing webhook] signature verification failed", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;
  const userId = String(session.metadata?.user_id ?? "");
  const pack = String(session.metadata?.pack ?? "");
  const credits = parseCredits(session.metadata?.credits);

  if (!userId || !sessionId || !credits) {
    console.error("[billing webhook] missing metadata", {
      sessionId,
      userId,
      pack,
      credits,
    });
    return NextResponse.json({ ok: false, error: "Missing metadata" }, { status: 400 });
  }

  try {
    const sb = admin();

    const { data: existingRow, error: existingErr } = await sb
      .from("credits_ledger")
      .select("id")
      .eq("meta->>stripe_session_id", sessionId)
      .maybeSingle();

    if (existingErr) {
      console.error("[billing webhook] idempotency check failed", existingErr);
      return NextResponse.json({ ok: false, error: "Idempotency check failed" }, { status: 500 });
    }

    if (existingRow) {
      console.log("[billing webhook] session already applied", sessionId);
      return NextResponse.json({ ok: true, idempotent: true });
    }

    const amountGbp =
      typeof session.amount_total === "number" ? session.amount_total / 100 : null;

    const payload = {
      p_user_id: userId,
      p_amount: credits,
      p_reason: "stripe_topup",
      p_job_id: null,
      p_meta: {
        stripe_session_id: sessionId,
        pack,
        amount_gbp: amountGbp,
      },
    };
    console.log("[billing webhook] apply_credits payload keys", Object.keys(payload));

    const { data: rpcData, error: rpcErr } = await sb.rpc("apply_credits", payload);

    if (rpcErr) {
      console.error("[billing webhook] apply_credits failed", rpcErr);
      return NextResponse.json({ ok: false, error: "apply_credits failed" }, { status: 500 });
    }

    console.log("[billing webhook] credits applied", { sessionId, userId, credits, rpcData });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[billing webhook] unhandled error", err?.message ?? err);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

// Stripe webhook setup checklist:
// 1) stripe listen --forward-to https://<your-domain>/api/billing/webhook
// 2) Set STRIPE_WEBHOOK_SECRET from the Stripe CLI output.
// 3) Trigger a test payment: stripe trigger checkout.session.completed
