import { getSupabaseAdmin } from "./supabase";
import { createStripeCustomer } from "@/lib/stripe/stripe";
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
  tier: "free" | "pro" | "max" | "dev";
  referral_source_id: number | null;
  referral_source_other: string | null;
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
export async function getUserByClerkId(
  clerkUserId: string
): Promise<User | null> {
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

// Clerk user data for creating user in Supabase
interface ClerkUserData {
  id: string;
  email: string | null | undefined;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}

/**
 * Ensures user exists in Supabase - creates if missing (fallback for webhook failure)
 * This is useful for local development where webhooks can't reach localhost
 */
export async function ensureUserExists(
  clerkUser: ClerkUserData
): Promise<User> {
  const supabase = getSupabaseAdmin();

  // Try to find existing user
  const existingUser = await getUserByClerkId(clerkUser.id);
  if (existingUser) {
    return existingUser;
  }

  // User doesn't exist - create them (webhook likely failed)
  console.log(
    `Creating user in Supabase (webhook fallback) for Clerk user: ${clerkUser.id}`
  );

  const email = clerkUser.email || undefined;
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email?.split("@")[0] ||
    "User";

  // Create Stripe customer first
  let stripeCustomerId: string | null = null;
  if (email) {
    try {
      const stripeCustomer = await createStripeCustomer(email, displayName, {
        clerk_user_id: clerkUser.id,
      });
      stripeCustomerId = stripeCustomer.id;
      console.log(
        `Stripe customer created: ${stripeCustomerId} for Clerk user ${clerkUser.id}`
      );
    } catch (stripeError) {
      console.error("Error creating Stripe customer (fallback):", stripeError);
      // Continue without Stripe customer - can be created later
    }
  }

  // Create user in database
  const { data, error } = await supabase
    .from("users")
    .insert({
      clerk_user_id: clerkUser.id,
      email: email,
      display_name: displayName,
      avatar_url: clerkUser.imageUrl,
      tier: "free",
      stripe_customer_id: stripeCustomerId,
    })
    .select()
    .single();

  if (error) {
    // Handle race condition - user might have been created by webhook in parallel
    if (error.code === "23505") {
      // Unique constraint violation
      const user = await getUserByClerkId(clerkUser.id);
      if (user) return user;
    }
    console.error("Error creating user (fallback):", error);
    throw error;
  }

  console.log(`User created via fallback: ${clerkUser.id}`);
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

  const { error } = await supabase.from("users_link_tokens").insert({
    token,
    user_id: direction === "web_to_telegram" ? userId : null,
    telegram_user_id: null,
    direction,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;

  return token;
}

// Generate a 6-digit numeric pairing code (for web → telegram linking)
export async function createPairingCode(userId: number): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Delete any existing unused codes for this user first
  await supabase
    .from("users_link_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("direction", "web_to_telegram")
    .is("used_at", null);

  // Generate 6-digit code (100000-999999)
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const { error } = await supabase.from("users_link_tokens").insert({
    token: code,
    user_id: userId,
    telegram_user_id: null,
    direction: "web_to_telegram",
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;
  return code;
}

// Verify a pairing code and get the associated link token
export async function verifyPairingCode(
  code: string
): Promise<LinkToken | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users_link_tokens")
    .select("*")
    .eq("token", code)
    .eq("direction", "web_to_telegram")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }

  return data;
}

// Complete pairing: link Telegram user to Clerk user via pairing code
export async function completePairing(
  code: string,
  telegramUserId: number
): Promise<{ success: boolean; userId?: number }> {
  const linkToken = await verifyPairingCode(code);

  if (!linkToken || !linkToken.user_id) {
    return { success: false };
  }

  const supabase = getSupabaseAdmin();

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
    .from("users_link_tokens")
    .update({
      used_at: new Date().toISOString(),
      telegram_user_id: telegramUserId,
    })
    .eq("token", code);

  if (tokenError) throw tokenError;

  return { success: true, userId: linkToken.user_id };
}

// Verify and consume a link token
export async function verifyLinkToken(
  token: string
): Promise<LinkToken | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users_link_tokens")
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

  if (
    !linkToken ||
    linkToken.direction !== "web_to_telegram" ||
    !linkToken.user_id
  ) {
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
    .from("users_link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  if (tokenError) throw tokenError;

  return true;
}

// Update user's tier
// @deprecated Use setUserTierById from user-tier.ts instead (has caching)
export async function updateUserTier(
  userId: number,
  tier: "free" | "pro" | "max" | "dev"
): Promise<void> {
  // Import and use the cached version
  const { setUserTierById } = await import("./user-tier");
  await setUserTierById(userId, tier);
}

// Check if user has telegram linked
export async function hasLinkedTelegram(clerkUserId: string): Promise<boolean> {
  const user = await getUserByClerkId(clerkUserId);
  return user?.telegram_user_id !== null;
}
