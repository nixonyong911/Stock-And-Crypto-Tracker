import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import { getAffiliateReferralByUser } from "@/lib/db/affiliate";

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ hasReferral: false });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return NextResponse.json({ hasReferral: false });
    }

    const referral = await getAffiliateReferralByUser(user.id);
    if (!referral) {
      return NextResponse.json({ hasReferral: false });
    }

    return NextResponse.json({
      hasReferral: true,
      code: referral.affiliate_code,
      status: referral.status,
    });
  } catch (error) {
    console.error("Error fetching referral status:", error);
    return NextResponse.json({ hasReferral: false });
  }
}
