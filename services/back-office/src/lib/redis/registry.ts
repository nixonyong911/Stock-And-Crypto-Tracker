// Cache registry for Redis monitoring UI
// Fully automatic discovery with optional manual overrides

export interface CacheMetadata {
  owner: string;
  ttl: number; // seconds
  description: string | null;
  refreshEndpoint: string | null; // API endpoint to refresh this cache, null if manual only
}

/**
 * Optional registry for enhanced metadata (descriptions, refresh endpoints)
 * Keys not in this registry will still be discovered automatically
 */
export const CACHE_REGISTRY: Record<string, Partial<CacheMetadata>> = {
  "back-office:workers": {
    description: "Worker registry from Supabase",
    refreshEndpoint: "/back-office/api/workers?refresh=true",
  },
  "back-office:schedules": {
    description: "Fetch schedules from Supabase",
    refreshEndpoint: "/back-office/api/schedules?refresh=true",
  },
  "back-office:worker:*": {
    description: "Individual worker cache",
  },
  "back-office:schedule:*": {
    description: "Individual schedule cache",
  },
  "mcp-analysis__*": {
    description: "Cached database query results",
  },
  "chat:*": {
    description: "Message queue locks and state",
  },
};

/**
 * Map of key prefixes to friendly owner names
 * Add new services here for custom naming, otherwise auto-derived from prefix
 */
const OWNER_MAP: Record<string, string> = {
  "back-office": "Back Office",
  "chat": "Telegram Bot",
  "mcp-analysis": "MCP Analysis",
  "telegram": "Telegram Bot",
  "stock": "Stock Fetcher",
  "crypto": "Crypto Fetcher",
  "analysis": "Analysis Worker",
};

/**
 * Auto-derive owner from key prefix
 * Converts kebab-case/snake_case to Title Case
 */
function deriveOwnerFromKey(key: string): string {
  // Handle double underscore separator (e.g., mcp-analysis__query)
  const prefix = key.split(/[:_]{2}|:/)[0];
  
  // Check if we have a custom mapping
  if (OWNER_MAP[prefix]) {
    return OWNER_MAP[prefix];
  }
  
  // Auto-convert: kebab-case or snake_case → Title Case
  return prefix
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Get metadata for a cache key
 * Fully automatic - always returns metadata (derived if not in registry)
 */
export function getCacheMetadata(key: string): CacheMetadata {
  // Default auto-derived metadata
  const autoMetadata: CacheMetadata = {
    owner: deriveOwnerFromKey(key),
    ttl: 0,
    description: null,
    refreshEndpoint: null,
  };

  // Try exact match in registry for enhanced metadata
  if (CACHE_REGISTRY[key]) {
    return { ...autoMetadata, ...CACHE_REGISTRY[key] };
  }

  // Try pattern matching for enhanced metadata
  for (const [pattern, metadata] of Object.entries(CACHE_REGISTRY)) {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(key)) {
        return { ...autoMetadata, ...metadata };
      }
    }
  }

  // Return auto-derived metadata (fully automatic)
  return autoMetadata;
}

/**
 * Get the owner of a cache key (always returns a value)
 */
export function getCacheOwner(key: string): string {
  return getCacheMetadata(key).owner;
}
