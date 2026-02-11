import { getSupabaseAdmin } from "./supabase";
import { getCache, setCache, deleteCache } from "@/lib/redis/client";
import { cacheKeys, cacheTTL } from "@/lib/redis/keys";

export type UserTier = "free" | "pro" | "max" | "dev";

/**
 * Get user tier by Clerk ID with Redis caching
 * - Cached in Upstash Redis for 1 hour
 * - Returns "free" if user not found in database
 */
export async function getUserTier(clerkUserId: string): Promise<UserTier> {
  // Check Redis cache first
  const cached = await getCache<UserTier>(cacheKeys.userTier(clerkUserId));
  if (cached) {
    return cached;
  }

  // Fetch from database
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("tier")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // User not found, default to free
      return "free";
    }
    throw error;
  }

  const tier: UserTier = data?.tier || "free";

  // Store in Redis cache
  await setCache(cacheKeys.userTier(clerkUserId), tier, cacheTTL.userTier);

  return tier;
}

/**
 * Get user tier by database user ID with caching
 */
export async function getUserTierById(userId: number): Promise<UserTier> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("tier, clerk_user_id")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return "free";
    throw error;
  }

  const tier: UserTier = data?.tier || "free";

  // Also cache by clerk_user_id if available
  if (data?.clerk_user_id) {
    await setCache(cacheKeys.userTier(data.clerk_user_id), tier, cacheTTL.userTier);
  }

  return tier;
}

/**
 * Invalidate tier cache for a user
 * Call this when subscription changes (subscribe/unsubscribe)
 */
export async function invalidateUserTierCache(clerkUserId: string): Promise<void> {
  await deleteCache(cacheKeys.userTier(clerkUserId));
  console.log(`Invalidated tier cache for user ${clerkUserId}`);
}

/**
 * Update user tier and invalidate cache
 * Use this instead of direct database update to ensure cache consistency
 */
export async function setUserTier(
  clerkUserId: string,
  tier: UserTier
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("users")
    .update({
      tier,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_user_id", clerkUserId);

  if (error) throw error;

  // Invalidate cache so next read gets fresh data
  await invalidateUserTierCache(clerkUserId);
}

/**
 * Update user tier by database ID and invalidate cache
 */
export async function setUserTierById(
  userId: number,
  tier: UserTier
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // First get the clerk_user_id for cache invalidation
  const { data: userData } = await supabase
    .from("users")
    .select("clerk_user_id")
    .eq("id", userId)
    .single();

  const { error } = await supabase
    .from("users")
    .update({
      tier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;

  // Invalidate cache
  if (userData?.clerk_user_id) {
    await invalidateUserTierCache(userData.clerk_user_id);
  }
}

/**
 * Check if user is on Pro tier (convenience function)
 */
export async function isProUser(clerkUserId: string): Promise<boolean> {
  const tier = await getUserTier(clerkUserId);
  return tier === "pro";
}

/**
 * Refresh user tier cache - fetch from DB and update cache
 * Use this after subscription changes to ensure cache is fresh
 */
export async function refreshUserTierCache(clerkUserId: string): Promise<UserTier> {
  // Delete existing cache
  await deleteCache(cacheKeys.userTier(clerkUserId));
  
  // Fetch fresh from database and re-cache
  return getUserTier(clerkUserId);
}
