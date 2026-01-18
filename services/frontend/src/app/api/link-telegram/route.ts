import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId, createLinkToken } from "@/lib/db/users";

const TELEGRAM_BOT_USERNAME = "StockAndCryptoAdvisorBot";

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

    // Create a link token
    const token = await createLinkToken(user.id, "web_to_telegram");

    // Generate deep link
    const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=link_${token}`;

    return NextResponse.json({
      success: true,
      deepLink,
      expiresIn: 15 * 60, // 15 minutes in seconds
    });
  } catch (error) {
    console.error("Error creating link token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET to check link status
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
