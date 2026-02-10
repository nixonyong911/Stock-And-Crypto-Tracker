import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId, createPairingCode } from "@/lib/db/users";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database
    const user = await getUserByClerkId(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if already linked
    if (user.telegram_user_id) {
      return NextResponse.json(
        { error: "Telegram already linked" },
        { status: 400 }
      );
    }

    // Generate 6-digit pairing code
    const code = await createPairingCode(user.id);

    return NextResponse.json({
      success: true,
      code,
      expiresIn: 5 * 60, // 5 minutes in seconds
    });
  } catch (error) {
    console.error("Error creating pairing code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET to check link status (used for polling)
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByClerkId(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      isLinked: user.telegram_user_id !== null,
      telegramUserId: user.telegram_user_id,
    });
  } catch (error) {
    console.error("Error checking link status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
