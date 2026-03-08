import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import {
  getAffiliateMemberByCode,
  getAffiliateReferralByUser,
  createAffiliateReferral,
} from "@/lib/db/affiliate";

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ valid: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const code = (body.code as string)?.trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ valid: false, error: "invalid_code" });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return NextResponse.json({ valid: false, error: "unauthorized" }, { status: 404 });
    }

    const existing = await getAffiliateReferralByUser(user.id);
    if (existing) {
      return NextResponse.json({ valid: false, error: "already_referred" });
    }

    const affiliateMember = await getAffiliateMemberByCode(code);
    if (!affiliateMember) {
      return NextResponse.json({ valid: false, error: "invalid_code" });
    }

    if (affiliateMember.user_id === user.id) {
      return NextResponse.json({ valid: false, error: "self_referral" });
    }

    await createAffiliateReferral({
      affiliateMemberId: affiliateMember.id,
      referredUserId: user.id,
      affiliateCode: code,
    });

    return NextResponse.json({ valid: true, discountAmount: 500 });
  } catch (error) {
    console.error("Error applying affiliate code:", error);
    return NextResponse.json(
      { valid: false, error: "server_error" },
      { status: 500 }
    );
  }
}
