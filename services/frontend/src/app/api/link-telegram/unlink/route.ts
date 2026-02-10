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

    if (!user.telegram_user_id) {
      return NextResponse.json(
        { error: "No Telegram account linked" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Remove telegram_user_id from user
    const { error } = await supabase
      .from("users")
      .update({
        telegram_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unlinking Telegram:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
