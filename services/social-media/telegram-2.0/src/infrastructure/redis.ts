import Redis from 'ioredis';
import { config } from '../config.js';

/**
 * Redis client wrapper with common operations
 */
export class RedisClient {
  private client: Redis;

  constructor() {
    this.client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Get a value
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set a value with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Set a key only if it doesn't exist (for locking)
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Push to a list
   */
  async rpush(key: string, value: string): Promise<number> {
    return this.client.rpush(key, value);
  }

  /**
   * Pop from a list (left side)
   */
  async lpop(key: string): Promise<string | null> {
    return this.client.lpop(key);
  }

  /**
   * Get list length
   */
  async llen(key: string): Promise<number> {
    return this.client.llen(key);
  }

  /**
   * Set TTL on a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.quit();
  }
}

// Singleton instance
let redisInstance: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!redisInstance) {
    redisInstance = new RedisClient();
  }
  return redisInstance;
}
