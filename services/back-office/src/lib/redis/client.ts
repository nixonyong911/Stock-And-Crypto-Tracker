import Redis from "ioredis";

// Lazy-initialized Redis client to avoid build-time errors
let redisInstance: Redis | null = null;

function getRedis(): Redis {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error("Missing REDIS_URL environment variable");
    }
    
    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redisInstance;
}

/**
 * Get cached value by key
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Redis GET failed for ${key}:`, error);
    return null; // Graceful degradation - continue without cache
  }
}

/**
 * Set cached value with TTL
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Redis SET failed for ${key}:`, error);
    return false; // Don't throw - cache miss is acceptable
  }
}

/**
 * Delete cached value by key
 */
export async function deleteCache(key: string): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.del(key);
    return true;
  } catch (error) {
    console.error(`Redis DEL failed for ${key}:`, error);
    return false;
  }
}

/**
 * Delete all keys matching a pattern
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  try {
    const redis = getRedis();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    return 0;
  } catch (error) {
    console.error(`Redis pattern delete failed for ${pattern}:`, error);
    return 0;
  }
}

/**
 * Get all keys matching a pattern with their TTL
 */
export async function getKeysWithTTL(pattern: string = "*"): Promise<Array<{ key: string; ttl: number }>> {
  try {
    const redis = getRedis();
    const keys = await redis.keys(pattern);
    
    const results = await Promise.all(
      keys.map(async (key) => {
        const ttl = await redis.ttl(key);
        return { key, ttl };
      })
    );
    
    return results;
  } catch (error) {
    console.error(`Redis KEYS failed for ${pattern}:`, error);
    return [];
  }
}

/**
 * Get Redis memory info
 */
export async function getRedisInfo(): Promise<{ usedMemory: number; maxMemory: number; keyCount: number } | null> {
  try {
    const redis = getRedis();
    const info = await redis.info("memory");
    const dbSize = await redis.dbsize();
    
    // Parse memory info
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
    
    return {
      usedMemory: usedMemoryMatch ? parseInt(usedMemoryMatch[1], 10) : 0,
      maxMemory: maxMemoryMatch ? parseInt(maxMemoryMatch[1], 10) : 134217728, // Default 128MB
      keyCount: dbSize,
    };
  } catch (error) {
    console.error("Redis INFO failed:", error);
    return null;
  }
}

/**
 * Health check for Redis connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
