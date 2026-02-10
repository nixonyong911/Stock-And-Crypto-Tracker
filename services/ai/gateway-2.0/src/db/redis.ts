/**
 * Redis connection wrapper using ioredis.
 */

import { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

export type RedisInstance = Redis;

export interface RedisClient {
  readonly redis: Redis;
  /** Run a PING health-check. Rejects on failure. */
  healthCheck(): Promise<void>;
  /** Gracefully disconnect. */
  close(): Promise<void>;
}

/**
 * Create and return a Redis client wrapper with health-check and
 * graceful-close helpers.
 */
export function createRedisClient(
  redisUrl: string,
  logger: FastifyBaseLogger,
): RedisClient {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error("Redis: max retry attempts reached, giving up");
        return null; // stop retrying
      }
      return Math.min(times * 200, 5_000);
    },
    lazyConnect: false,
  });

  redis.on("error", (err: Error) => {
    logger.error({ err }, "Redis connection error");
  });

  redis.on("connect", () => {
    logger.debug("Redis connected");
  });

  redis.on("ready", () => {
    logger.info("Redis ready");
  });

  return {
    redis,

    async healthCheck(): Promise<void> {
      try {
        const pong = await redis.ping();
        if (pong !== "PONG") {
          throw new Error(`Unexpected PING response: ${pong}`);
        }
      } catch (err) {
        logger.error({ err }, "Redis health check failed");
        throw err;
      }
    },

    async close(): Promise<void> {
      try {
        await redis.quit();
        logger.info("Redis connection closed");
      } catch (err) {
        logger.error({ err }, "Error closing Redis connection");
        throw err;
      }
    },
  };
}
