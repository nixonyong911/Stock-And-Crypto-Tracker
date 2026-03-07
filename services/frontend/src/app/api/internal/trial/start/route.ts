import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import type { User } from "@/lib/db/users";
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
} from "@/lib/db/trial";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

function validateServiceKey(request: NextRequest): boolean {
  if (!INTERNAL_SERVICE_KEY) return false;
  const provided = request.headers.get("x-service-key");
  return provided === INTERNAL_SERVICE_KEY;
}

async function getUserByTelegramId(
  telegramUserId: string
): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function POST(request: NextRequest) {
  try {
    if (!validateServiceKey(request)) {
      return NextResponse.json(
        { success: false, reason: "unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const telegramUserId = body.telegram_user_id;
    if (!telegramUserId) {
      return NextResponse.json(
        { success: false, reason: "missing_telegram_user_id" },
        { status: 400 }
      );
    }

    const user = await getUserByTelegramId(String(telegramUserId));
    if (!user) {
      return NextResponse.json(
        { success: false, reason: "user_not_found" },
        { status: 404 }
      );
    }

    if (!user.phone_hash) {
      return NextResponse.json(
        { success: false, reason: "phone_not_verified" },
        { status: 409 }
      );
    }

    if (user.tier !== "free") {
      return NextResponse.json(
        { success: false, reason: "already_subscribed" },
        { status: 409 }
      );
    }

    const existingUserClaim = await getTrialClaimByUserId(user.id);
    if (existingUserClaim) {
      return NextResponse.json(
        { success: false, reason: "trial_already_used" },
        { status: 409 }
      );
    }

    const existingPhoneClaim = await getTrialClaimByPhoneHash(user.phone_hash);
    if (existingPhoneClaim) {
      return NextResponse.json(
        { success: false, reason: "trial_already_used" },
        { status: 409 }
      );
    }

    const emailTrialUsed = await hasUsedTrial(user.email);
    if (emailTrialUsed) {
      return NextResponse.json(
        { success: false, reason: "trial_already_used" },
        { status: 409 }
      );
    }

    const prices = await getStripePrices();
    const monthlyPrice = prices.monthly;
    if (!monthlyPrice || monthlyPrice.id.startsWith("fallback")) {
      return NextResponse.json(
        { success: false, reason: "pricing_unavailable" },
        { status: 503 }
      );
    }

    const customer = await getOrCreateStripeCustomer(
      user.email,
      user.display_name,
      user.stripe_customer_id
    );

    const subscription = await createTrialSubscription({
      customerId: customer.id,
      priceId: monthlyPrice.id,
      metadata: {
        user_id: String(user.id),
        source: "telegram_auto_trial",
        telegram_user_id: String(user.telegram_user_id),
      },
    });

    const trialEndAt = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await insertTrialClaim({
      user_id: user.id,
      phone_hash: user.phone_hash,
      telegram_user_id: String(user.telegram_user_id),
      stripe_subscription_id: subscription.id,
      trial_end_at: trialEndAt,
      source: "telegram",
    });

    console.log(`Trial auto-started for user ${user.id} via gateway:`, {
      email: user.email,
      subscriptionId: subscription.id,
      trialEnd: trialEndAt,
    });

    return NextResponse.json({
      success: true,
      trial_end: trialEndAt,
    });
  } catch (error) {
    console.error("Error in internal trial start:", error);
    return NextResponse.json(
      { success: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
