/**
 * Usage tracker – manages per-user rate-limiting with a sliding-window
 * approach backed by Redis, and logs usage events to PostgreSQL.
 *
 * Ported from the Go gateway `internal/usage` package.
 */

import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { GatewayConfig } from "../../config.js";
import type { PgPool } from "../../db/postgres.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageInfo {
  tier: string;
  remaining: number;
  max: number;
  nextRechargeAt?: Date;
  fullRechargeAt?: Date;
}

export interface LogUsageParams {
  userId: string;
  channelType: string;
  tier: string;
  processingMs: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export class UsageTracker {
  private readonly config: GatewayConfig;
  private readonly redis: Redis;
  private readonly db: PgPool;
  private readonly logger: FastifyBaseLogger;

  constructor(
    config: GatewayConfig,
    redis: Redis,
    db: PgPool,
    logger: FastifyBaseLogger
  ) {
    this.config = config;
    this.redis = redis;
    this.db = db;
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private usageKey(userId: string): string {
    return `usage:${userId}:slots`;
  }

  // -------------------------------------------------------------------------
  // Check & Consume
  // -------------------------------------------------------------------------

  /**
   * Consume one usage slot for the given user.
   *
   * Returns `{ remaining }` where:
   *  - `remaining >= 0` – the number of slots still available *after* this
   *    consumption.
   *  - `remaining < 0`  – the user has exhausted their allowance; nothing was
   *    consumed.
   */
  async checkAndConsume(
    userId: string,
    _channelType: string
  ): Promise<{ remaining: number }> {
    try {
      const key = this.usageKey(userId);
      const rechargeDurationMs = this.config.freeRechargeHours * 3_600_000;
      const maxMessages = this.config.freeMaxMessages;
      const now = Date.now();

      // Retrieve all recorded timestamps from the Redis list.
      const timestamps = await this.redis.lrange(key, 0, -1);

      let activeCount = 0;
      for (const ts of timestamps) {
        const usedAtMs = parseInt(ts, 10) * 1_000; // stored as unix seconds
        if (now - usedAtMs < rechargeDurationMs) {
          activeCount++;
        }
      }

      const remaining = maxMessages - activeCount;
      if (remaining <= 0) {
        return { remaining: -1 };
      }

      // Record the current timestamp (unix seconds) at the head of the list.
      const nowUnix = Math.floor(now / 1_000);
      await this.redis.lpush(key, String(nowUnix));

      // Trim so we never store more entries than maxMessages.
      try {
        await this.redis.ltrim(key, 0, maxMessages - 1);
      } catch (err) {
        this.logger.warn({ err }, "Failed to trim usage list");
      }

      // Set a generous TTL so the key self-cleans.
      const maxTTLSeconds = maxMessages * this.config.freeRechargeHours * 3_600;
      try {
        await this.redis.expire(key, maxTTLSeconds);
      } catch (err) {
        this.logger.warn({ err }, "Failed to set usage TTL");
      }

      return { remaining: remaining - 1 };
    } catch (err) {
      this.logger.error({ err, userId }, "Failed in checkAndConsume");
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Usage Info
  // -------------------------------------------------------------------------

  /**
   * Return the current usage information for a user without consuming a slot.
   */
  async getUsageInfo(userId: string): Promise<UsageInfo> {
    const key = this.usageKey(userId);
    const rechargeDurationMs = this.config.freeRechargeHours * 3_600_000;
    const maxMessages = this.config.freeMaxMessages;
    const now = Date.now();

    let timestamps: string[];
    try {
      timestamps = await this.redis.lrange(key, 0, -1);
    } catch (err) {
      this.logger.warn({ err, userId }, "Failed to read usage slots for info");
      return { tier: "free", remaining: maxMessages, max: maxMessages };
    }

    let earliestUsedMs = 0;
    let latestUsedMs = 0;
    let activeCount = 0;

    for (const ts of timestamps) {
      const usedAtMs = parseInt(ts, 10) * 1_000;
      if (now - usedAtMs < rechargeDurationMs) {
        activeCount++;
        if (earliestUsedMs === 0 || usedAtMs < earliestUsedMs) {
          earliestUsedMs = usedAtMs;
        }
        if (latestUsedMs === 0 || usedAtMs > latestUsedMs) {
          latestUsedMs = usedAtMs;
        }
      }
    }

    const info: UsageInfo = {
      tier: "free",
      remaining: maxMessages - activeCount,
      max: maxMessages,
    };

    if (activeCount > 0) {
      info.nextRechargeAt = new Date(earliestUsedMs + rechargeDurationMs);
      info.fullRechargeAt = new Date(latestUsedMs + rechargeDurationMs);
    }

    return info;
  }

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  /**
   * Persist a usage event to the `gateway_usage_log` table.
   *
   * Failures are caught and logged – they must never break the request flow.
   */
  async logUsage(params: LogUsageParams): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO gateway_usage_log
           (user_id, channel_type, tier, processing_ms, model, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          params.userId,
          params.channelType,
          params.tier,
          params.processingMs,
          params.model,
        ]
      );
    } catch (err) {
      this.logger.error(
        { err, userId: params.userId },
        "Failed to log usage event"
      );
    }
  }
}
