import { getSupabaseAdmin } from "./supabase";

export type UserTier = "free" | "pro";

// In-memory cache for user tiers
// Key: clerkUserId, Value: { tier, expiresAt }
const tierCache = new Map<string, { tier: UserTier; expiresAt: number }>();

// Cache TTL: 60 minutes
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Get user tier by Clerk ID with caching
 * - Cached for 60 minutes for fast retrieval
 * - Returns "free" if user not found in database
 */
export async function getUserTier(clerkUserId: string): Promise<UserTier> {
  // Check cache first
  const cached = tierCache.get(clerkUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tier;
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

  // Store in cache
  tierCache.set(clerkUserId, {
    tier,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

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
    tierCache.set(data.clerk_user_id, {
      tier,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  return tier;
}

/**
 * Invalidate tier cache for a user
 * Call this when subscription changes (subscribe/unsubscribe)
 */
export function invalidateUserTierCache(clerkUserId: string): void {
  tierCache.delete(clerkUserId);
}

/**
 * Invalidate all tier caches
 * Useful for admin operations or deployments
 */
export function invalidateAllTierCaches(): void {
  tierCache.clear();
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
  invalidateUserTierCache(clerkUserId);
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
    invalidateUserTierCache(userData.clerk_user_id);
  }
}

/**
 * Check if user is on Pro tier (convenience function)
 */
export async function isProUser(clerkUserId: string): Promise<boolean> {
  const tier = await getUserTier(clerkUserId);
  return tier === "pro";
}
