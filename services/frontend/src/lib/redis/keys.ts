export const cacheKeys = {
  // User data
  userTier: (clerkUserId: string) => `user:${clerkUserId}:tier`,
  userSubscription: (clerkUserId: string) => `user:${clerkUserId}:subscription`,
  
  // Pricing data
  stripePrices: () => "stripe:prices",
  stripeProducts: () => "stripe:products",
  
  // Analytics
  analytics: (type: string) => `analytics:${type}`,
} as const;

// TTL values in seconds
export const cacheTTL = {
  userTier: 60 * 60, // 1 hour - subscription status rarely changes
  userSubscription: 60 * 60, // 1 hour
  stripePrices: 60 * 60 * 24, // 24 hours - prices rarely change
  stripeProducts: 60 * 60 * 24, // 24 hours
} as const;
