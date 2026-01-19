import { Redis } from "@upstash/redis";

const NAMESPACE = "frontend";

// Lazy-initialized Redis client to avoid build-time errors
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are only available at runtime
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    // Only initialize if env vars are present (runtime only)
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("Upstash Redis environment variables not configured");
    }
    _redis = Redis.fromEnv();
  }
  return _redis;
}

// Export getter for backward compatibility
export const redis = {
  get: <T>(key: string) => getRedis().get<T>(key),
  set: <T>(key: string, value: T, opts?: { ex: number }) => 
    opts ? getRedis().set(key, value, { ex: opts.ex }) : getRedis().set(key, value),
  del: (...keys: string[]) => getRedis().del(...keys),
  keys: (pattern: string) => getRedis().keys(pattern),
};

// Namespace-aware helpers with error handling
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get<T>(`${NAMESPACE}:${key}`);
    return data ?? null;
  } catch (error) {
    console.error(`Redis GET failed for ${key}:`, error);
    return null; // Graceful degradation - continue without cache
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<boolean> {
  try {
    await redis.set(`${NAMESPACE}:${key}`, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    console.error(`Redis SET failed for ${key}:`, error);
    return false; // Don't throw - cache miss is acceptable
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  try {
    await redis.del(`${NAMESPACE}:${key}`);
    return true;
  } catch (error) {
    console.error(`Redis DEL failed for ${key}:`, error);
    return false;
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(`${NAMESPACE}:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Redis pattern delete failed for ${pattern}:`, error);
  }
}
