import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import { getTrialClaimByPhoneHash, getTrialClaimByUserId } from "@/lib/db/trial";
import { getSupabaseAdmin } from "@/lib/db/supabase";

export type TrialEligibilityReason =
  | "not_signed_in"
  | "no_telegram"
  | "phone_not_verified"
  | "trial_already_used"
  | "already_subscribed";

export interface TrialEligibilityResponse {
  eligible: boolean;
  reason?: TrialEligibilityReason;
  telegramLinked: boolean;
  phoneVerified: boolean;
}

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "not_signed_in",
        telegramLinked: false,
        phoneVerified: false,
      });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "not_signed_in",
        telegramLinked: false,
        phoneVerified: false,
      });
    }

    const telegramLinked = user.telegram_user_id !== null;
    const phoneVerified = user.phone_hash !== null;

    if (!telegramLinked) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "no_telegram",
        telegramLinked: false,
        phoneVerified: false,
      });
    }

    if (!phoneVerified) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "phone_not_verified",
        telegramLinked: true,
        phoneVerified: false,
      });
    }

    // Check for existing active/trialing subscription
    const supabase = getSupabaseAdmin();
    const { data: subscription } = await supabase
      .from("users_subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .single();

    if (subscription) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "already_subscribed",
        telegramLinked: true,
        phoneVerified: true,
      });
    }

    // Check trial_claims by user ID
    const userClaim = await getTrialClaimByUserId(user.id);
    if (userClaim) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "trial_already_used",
        telegramLinked: true,
        phoneVerified: true,
      });
    }

    // Check trial_claims by phone hash
    const phoneClaim = await getTrialClaimByPhoneHash(user.phone_hash!);
    if (phoneClaim) {
      return NextResponse.json<TrialEligibilityResponse>({
        eligible: false,
        reason: "trial_already_used",
        telegramLinked: true,
        phoneVerified: true,
      });
    }

    return NextResponse.json<TrialEligibilityResponse>({
      eligible: true,
      telegramLinked: true,
      phoneVerified: true,
    });
  } catch (error) {
    console.error("Error checking trial eligibility:", error);
    return NextResponse.json(
      { error: "Failed to check trial eligibility" },
      { status: 500 }
    );
  }
}
