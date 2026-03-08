import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import {
  getAffiliateMemberByUserId,
  createAffiliateMember,
} from "@/lib/db/affiliate";

export async function POST() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.phone_hash) {
      return NextResponse.json(
        { error: "Phone number must be verified to join the affiliate program" },
        { status: 400 }
      );
    }

    const existing = await getAffiliateMemberByUserId(user.id);
    if (existing) {
      return NextResponse.json(
        { error: "Already an affiliate member" },
        { status: 409 }
      );
    }

    const member = await createAffiliateMember(user.id);
    return NextResponse.json({
      affiliateCode: member.affiliate_code,
      createdAt: member.created_at,
    });
  } catch (error) {
    console.error("Error joining affiliate program:", error);
    return NextResponse.json(
      { error: "Failed to join affiliate program" },
      { status: 500 }
    );
  }
}
