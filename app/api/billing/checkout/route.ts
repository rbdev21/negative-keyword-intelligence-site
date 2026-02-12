import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PACK_CREDITS: Record<string, number> = {
  starter: 10000,
  growth: 30000,
  scale: 75000,
  agency: 175000,
};

function getPriceId(pack: string) {
  const p = pack.toLowerCase();
  if (p === "starter") return process.env.STRIPE_PRICE_STARTER;
  if (p === "growth") return process.env.STRIPE_PRICE_GROWTH;
  if (p === "scale") return process.env.STRIPE_PRICE_SCALE;
  if (p === "agency") return process.env.STRIPE_PRICE_AGENCY;
  return null;
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
    const pack = String(body?.pack ?? "").toLowerCase();
    if (!pack || !Object.keys(PACK_CREDITS).includes(pack)) {
      return NextResponse.json(
        { ok: false, error: "Bad Request", detail: "pack must be starter|growth|scale|agency" },
        { status: 400 }
      );
    }

    const priceId = getPriceId(pack);
    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: "Missing Stripe price env for pack", detail: pack },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    if (!appUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const credits = PACK_CREDITS[pack];
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app?success=1`,
      cancel_url: `${appUrl}/app?canceled=1`,
      metadata: {
        user_id: user.id,
        pack,
        credits: String(credits),
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
