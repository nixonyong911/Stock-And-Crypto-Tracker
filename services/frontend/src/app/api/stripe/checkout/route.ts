import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import { 
  getOrCreateStripeCustomer, 
  hasUsedTrial, 
  createCheckoutSession 
} from "@/lib/stripe/stripe";
import { getStripePrices } from "@/lib/stripe/prices";
import { getAffiliateReferralByUser } from "@/lib/db/affiliate";
import { getSupabaseAdmin } from "@/lib/db/supabase";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { billingPeriod } = body as { billingPeriod: "monthly" | "annual" };

    if (!billingPeriod || !["monthly", "annual"].includes(billingPeriod)) {
      return NextResponse.json(
        { error: "Invalid billing period. Must be 'monthly' or 'annual'" },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await getUserByClerkId(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get prices from Stripe
    const prices = await getStripePrices();
    const selectedPrice = billingPeriod === "monthly" ? prices.monthly : prices.annual;

    if (!selectedPrice || selectedPrice.id === "fallback_monthly" || selectedPrice.id === "fallback_annual") {
      return NextResponse.json(
        { error: "Pricing not available. Please try again later." },
        { status: 503 }
      );
    }

    // Get or create Stripe customer
    const customer = await getOrCreateStripeCustomer(
      user.email,
      user.display_name,
      user.stripe_customer_id
    );

    // Check if user has used a trial before
    const trialUsed = await hasUsedTrial(user.email);

    // Build URLs
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const successUrl = `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/pricing`;

    // Check if user has an affiliate referral for monthly discount (first-time subscribers only)
    let affiliateDiscount = false;
    if (billingPeriod === "monthly") {
      try {
        const supabase = getSupabaseAdmin();
        const { data: existingSub } = await supabase
          .from("users_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        const hasSubscribedBefore = trialUsed || !!existingSub;

        if (!hasSubscribedBefore) {
          const referral = await getAffiliateReferralByUser(user.id);
          affiliateDiscount = referral !== null && referral.status === "registered";
        }
      } catch {
        // Non-blocking
      }
    }

    // Create checkout session with conditional trial
    const session = await createCheckoutSession({
      priceId: selectedPrice.id,
      customerId: customer.id,
      customerEmail: user.email,
      successUrl,
      cancelUrl,
      clientReferenceId: `web_${user.id}`,
      includeTrial: !trialUsed,
      affiliateDiscount,
    });

    // Log for debugging
    console.log(`Checkout session created for user ${user.id}:`, {
      email: user.email,
      billingPeriod,
      priceId: selectedPrice.id,
      trialIncluded: !trialUsed,
      sessionId: session.id,
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      trialIncluded: !trialUsed,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
