import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import {
  getOrCreateStripeCustomer,
  hasUsedTrial,
  createTrialSubscription,
} from "@/lib/stripe/stripe";
import { getStripePrices } from "@/lib/stripe/prices";
import {
  getTrialClaimByPhoneHash,
  getTrialClaimByUserId,
  insertTrialClaim,
  countTrialClaimsByIp,
} from "@/lib/db/trial";

const MAX_TRIALS_PER_IP = 3;
const IP_WINDOW_DAYS = 30;

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Gate 1: Telegram must be linked
    if (!user.telegram_user_id) {
      return NextResponse.json(
        { error: "Telegram account must be linked before starting a trial", code: "no_telegram" },
        { status: 400 }
      );
    }

    // Gate 2: Phone must be verified
    if (!user.phone_hash) {
      return NextResponse.json(
        { error: "Phone number must be verified before starting a trial", code: "phone_not_verified" },
        { status: 400 }
      );
    }

    // Gate 3: Check if user already has a trial claim (by user ID)
    const existingUserClaim = await getTrialClaimByUserId(user.id);
    if (existingUserClaim) {
      return NextResponse.json(
        { error: "You have already used your free trial", code: "trial_already_used" },
        { status: 409 }
      );
    }

    // Gate 4: Check if phone has been used for a trial (different account, same phone)
    const existingPhoneClaim = await getTrialClaimByPhoneHash(user.phone_hash);
    if (existingPhoneClaim) {
      return NextResponse.json(
        { error: "A trial has already been claimed for this phone number", code: "trial_already_used" },
        { status: 409 }
      );
    }

    // Gate 5: Email-based check via Stripe (fallback)
    const emailTrialUsed = await hasUsedTrial(user.email);
    if (emailTrialUsed) {
      return NextResponse.json(
        { error: "A trial has already been used for this email", code: "trial_already_used" },
        { status: 409 }
      );
    }

    // Gate 6: IP rate limiting
    const clientIp = getClientIp(request);
    if (clientIp) {
      try {
        const ipCount = await countTrialClaimsByIp(clientIp, IP_WINDOW_DAYS);
        if (ipCount >= MAX_TRIALS_PER_IP) {
          return NextResponse.json(
            { error: "Too many trial requests from this network", code: "ip_rate_limited" },
            { status: 429 }
          );
        }
      } catch {
        // Non-blocking: allow trial if IP check fails
      }
    }

    // Get monthly price (trial defaults to monthly)
    const prices = await getStripePrices();
    const monthlyPrice = prices.monthly;
    if (!monthlyPrice || monthlyPrice.id.startsWith("fallback")) {
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

    // Create the trial subscription (no payment method required)
    const subscription = await createTrialSubscription({
      customerId: customer.id,
      priceId: monthlyPrice.id,
      metadata: {
        user_id: String(user.id),
        source: "web_trial",
        telegram_user_id: String(user.telegram_user_id),
      },
    });

    // Record the trial claim
    const trialEndAt = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await insertTrialClaim({
      user_id: user.id,
      phone_hash: user.phone_hash,
      telegram_user_id: String(user.telegram_user_id),
      stripe_subscription_id: subscription.id,
      trial_end_at: trialEndAt,
      source: "web",
      ip_address: clientIp,
    });

    console.log(`Trial started for user ${user.id}:`, {
      email: user.email,
      subscriptionId: subscription.id,
      trialEnd: trialEndAt,
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      trialEnd: trialEndAt,
    });
  } catch (error) {
    console.error("Error starting trial:", error);
    return NextResponse.json(
      { error: "Failed to start trial" },
      { status: 500 }
    );
  }
}
