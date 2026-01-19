import { getSupabaseAdmin } from "./supabase";
import crypto from "crypto";

// User types
export interface User {
  id: number;
  clerk_user_id: string | null;
  stripe_customer_id: string | null;
  telegram_user_id: number | null;
  email: string;
  display_name: string;
  avatar_url: string | null;
  tier: "free" | "pro";
  created_at: string;
  updated_at: string;
}

export interface LinkToken {
  id: number;
  token: string;
  user_id: number | null;
  telegram_user_id: number | null;
  direction: "web_to_telegram" | "telegram_to_web";
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// Get user by Clerk ID
export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }

  return data;
}

// Get user by database ID
export async function getUserById(id: number): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

// Generate a secure link token (for web -> telegram linking)
export async function createLinkToken(
  userId: number,
  direction: "web_to_telegram" | "telegram_to_web"
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const { error } = await supabase.from("link_tokens").insert({
    token,
    user_id: direction === "web_to_telegram" ? userId : null,
    telegram_user_id: null,
    direction,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;

  return token;
}

// Verify and consume a link token
export async function verifyLinkToken(token: string): Promise<LinkToken | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("link_tokens")
    .select("*")
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

// Mark token as used and link accounts
export async function linkTelegramAccount(
  token: string,
  telegramUserId: number
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const linkToken = await verifyLinkToken(token);
  
  if (!linkToken || linkToken.direction !== "web_to_telegram" || !linkToken.user_id) {
    return false;
  }

  // Update the user with telegram_user_id
  const { error: userError } = await supabase
    .from("users")
    .update({
      telegram_user_id: telegramUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", linkToken.user_id);

  if (userError) throw userError;

  // Mark token as used
  const { error: tokenError } = await supabase
    .from("link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  if (tokenError) throw tokenError;

  return true;
}

// Update user's tier
// @deprecated Use setUserTierById from user-tier.ts instead (has caching)
export async function updateUserTier(userId: number, tier: "free" | "pro"): Promise<void> {
  // Import and use the cached version
  const { setUserTierById } = await import("./user-tier");
  await setUserTierById(userId, tier);
}

// Check if user has telegram linked
export async function hasLinkedTelegram(clerkUserId: string): Promise<boolean> {
  const user = await getUserByClerkId(clerkUserId);
  return user?.telegram_user_id !== null;
}
