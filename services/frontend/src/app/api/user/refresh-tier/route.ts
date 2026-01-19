import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { refreshUserTierCache } from "@/lib/db/user-tier";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Refresh the tier cache and get fresh value
    const tier = await refreshUserTierCache(userId);

    return NextResponse.json({ 
      success: true, 
      tier,
      message: "Tier cache refreshed" 
    });
  } catch (error) {
    console.error("Error refreshing tier cache:", error);
    return NextResponse.json(
      { error: "Failed to refresh tier cache" },
      { status: 500 }
    );
  }
}
