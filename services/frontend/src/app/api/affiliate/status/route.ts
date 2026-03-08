import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import {
  getAffiliateMemberByUserId,
  getAffiliateStats,
} from "@/lib/db/affiliate";

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ isMember: false });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return NextResponse.json({ isMember: false });
    }

    const member = await getAffiliateMemberByUserId(user.id);
    if (!member) {
      return NextResponse.json({
        isMember: false,
        phoneVerified: !!user.phone_hash,
      });
    }

    const stats = await getAffiliateStats(user.id);
    return NextResponse.json({
      isMember: true,
      affiliateCode: member.affiliate_code,
      status: member.status,
      stats: stats
        ? {
            totalReferrals: stats.totalReferrals,
            referralsByMonth: stats.referralsByMonth,
          }
        : { totalReferrals: 0, referralsByMonth: {} },
    });
  } catch (error) {
    console.error("Error fetching affiliate status:", error);
    return NextResponse.json(
      { error: "Failed to fetch affiliate status" },
      { status: 500 }
    );
  }
}
