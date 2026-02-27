import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";
import { getSupabaseAdmin } from "@/lib/db/supabase";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByClerkId(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();

    // Find the channel_account linked to this Clerk user
    const { data: ca } = await supabase
      .from("channel_accounts")
      .select("platform_user_id, clerk_user_id")
      .eq("clerk_user_id", userId)
      .eq("channel_type", "telegram")
      .single();

    if (!ca) {
      return NextResponse.json(
        { error: "No Telegram account linked" },
        { status: 400 }
      );
    }

    // 1. Clear users.telegram_user_id
    const { error: userErr } = await supabase
      .from("users")
      .update({
        telegram_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_user_id", userId);

    if (userErr) throw userErr;

    // 2. Clear channel_accounts.clerk_user_id and paired_at
    const { error: caErr } = await supabase
      .from("channel_accounts")
      .update({ clerk_user_id: null, paired_at: null })
      .eq("platform_user_id", ca.platform_user_id)
      .eq("channel_type", "telegram");

    if (caErr) throw caErr;

    // 3. Expire active sessions
    await supabase
      .from("gateway_sessions")
      .update({ expires_at: new Date().toISOString() })
      .eq("platform_user_id", ca.platform_user_id)
      .eq("channel_type", "telegram");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unlinking Telegram:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
