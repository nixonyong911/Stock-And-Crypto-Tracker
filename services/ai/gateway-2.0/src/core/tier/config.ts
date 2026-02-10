/**
 * Tier configuration system.
 *
 * Defines subscription tiers and their resource limits used throughout the gateway.
 */

export enum Tier {
  Free = "free",
  Pro = "pro",
  Max = "max",
  Dev = "dev",
}

export interface TierConfig {
  readonly maxMessageLength: number;
  readonly cliTimeoutSeconds: number;
  readonly maxQueueDepth: number;
  readonly priority: number;
}

const TIER_DEFAULTS: Record<Tier, TierConfig> = {
  [Tier.Free]: {
    maxMessageLength: 2000,
    cliTimeoutSeconds: 60,
    maxQueueDepth: 1,
    priority: 1,
  },
  [Tier.Pro]: {
    maxMessageLength: 4000,
    cliTimeoutSeconds: 120,
    maxQueueDepth: 3,
    priority: 2,
  },
  [Tier.Max]: {
    maxMessageLength: 8000,
    cliTimeoutSeconds: 180,
    maxQueueDepth: 5,
    priority: 3,
  },
  [Tier.Dev]: {
    maxMessageLength: 0, // 0 = unlimited
    cliTimeoutSeconds: 300,
    maxQueueDepth: 5,
    priority: 3,
  },
};

/**
 * Get the tier configuration for a given tier.
 * Returns defaults; the gateway config's global overrides (e.g. maxMessageLength)
 * are applied at the call-site when needed.
 */
export function getTierConfig(tier: Tier): TierConfig {
  return TIER_DEFAULTS[tier];
}

/**
 * Parse a string into a Tier enum value.
 * Returns Tier.Free if the string is unrecognised.
 */
export function parseTier(s: string): Tier {
  const lower = s.toLowerCase().trim();
  const tierValues = Object.values(Tier) as string[];
  if (tierValues.includes(lower)) {
    return lower as Tier;
  }
  return Tier.Free;
}
