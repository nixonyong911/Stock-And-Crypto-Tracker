import { Redis } from "@upstash/redis";

const NAMESPACE = "frontend";

// Uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env
export const redis = Redis.fromEnv();

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
