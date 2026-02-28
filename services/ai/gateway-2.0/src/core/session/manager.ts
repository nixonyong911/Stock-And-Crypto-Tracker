/**
 * Session manager – handles creation, retrieval, expiration, pruning,
 * and distributed user locks for gateway sessions.
 *
 * Ported from the Go gateway session package to TypeScript for gateway-2.0.
 */

import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { GatewayConfig } from "../../config.js";
import type { PgPool } from "../../db/postgres.js";
import {
  getSessionFromCache,
  writeSessionToCache,
  deleteSessionFromCache,
} from "./cache.js";

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

/** Gateway session (matches the unified gateway_sessions table). */
export interface GatewaySession {
  id: string;
  clerkUserId: string | null;
  channelType: string;
  platformUserId: string;
  platformChatId: string;
  cliSessionId: string;
  tier: string;
  deviceInfo: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a database row to a GatewaySession object. */
function rowToSession(row: Record<string, unknown>): GatewaySession {
  return {
    id: String(row.id),
    clerkUserId: row.clerk_user_id != null ? String(row.clerk_user_id) : null,
    channelType: String(row.channel_type),
    platformUserId: String(row.platform_user_id),
    platformChatId: String(row.platform_chat_id),
    cliSessionId: String(row.cli_session_id),
    tier: String(row.tier),
    deviceInfo: (row.device_info as Record<string, unknown>) ?? null,
    createdAt: new Date(row.created_at as string | number | Date),
    expiresAt: new Date(row.expires_at as string | number | Date),
    lastActiveAt: new Date(row.last_active_at as string | number | Date),
  };
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  platformUserId: string;
  platformChatId: string;
  channelType: string;
  clerkUserId?: string;
  deviceInfo?: Record<string, unknown>;
}

export class SessionManager {
  private readonly config: GatewayConfig;
  private readonly db: PgPool;
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;
  private prunerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: GatewayConfig,
    db: PgPool,
    redis: Redis,
    logger: FastifyBaseLogger
  ) {
    this.config = config;
    this.db = db;
    this.redis = redis;
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Session CRUD
  // -------------------------------------------------------------------------

  /**
   * Create a new session. Any existing active sessions for the same
   * user + channel combination are expired first.
   */
  async createSession(params: CreateSessionParams): Promise<GatewaySession> {
    const {
      platformUserId,
      platformChatId,
      channelType,
      clerkUserId,
      deviceInfo,
    } = params;

    // Expire existing active sessions for this user + channel.
    try {
      await this.db.query(
        `UPDATE gateway_sessions
            SET expires_at = NOW()
          WHERE platform_user_id = $1
            AND channel_type = $2
            AND expires_at > NOW()`,
        [platformUserId, channelType]
      );
      await deleteSessionFromCache(this.redis, channelType, platformUserId);
    } catch (err) {
      this.logger.warn(
        { err, platformUserId, channelType },
        "Failed to expire old sessions"
      );
    }

    // Resolve tier from users table (single source of truth).
    // Unpaired users (no clerkUserId) default to 'free'.
    let tier = "free";
    if (clerkUserId) {
      try {
        const tierResult = await this.db.query(
          "SELECT tier FROM users WHERE clerk_user_id = $1",
          [clerkUserId]
        );
        if (tierResult.rows[0]?.tier) {
          tier = tierResult.rows[0].tier;
        }
      } catch (err) {
        this.logger.warn(
          { err, clerkUserId },
          "Failed to resolve user tier, defaulting to free"
        );
      }
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.sessionExpiryDays * 24 * 60 * 60 * 1000
    );

    const session: GatewaySession = {
      id: "", // assigned by the database (BIGSERIAL)
      clerkUserId: clerkUserId ?? null,
      channelType,
      platformUserId,
      platformChatId,
      cliSessionId: crypto.randomUUID(),
      tier,
      deviceInfo: deviceInfo ?? null,
      createdAt: now,
      expiresAt,
      lastActiveAt: now,
    };

    try {
      const result = await this.db.query(
        `INSERT INTO gateway_sessions
           (clerk_user_id, channel_type, platform_user_id, platform_chat_id,
            cli_session_id, tier, device_info, created_at, expires_at, last_active_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          session.clerkUserId,
          session.channelType,
          session.platformUserId,
          session.platformChatId,
          session.cliSessionId,
          session.tier,
          session.deviceInfo ? JSON.stringify(session.deviceInfo) : null,
          session.createdAt,
          session.expiresAt,
          session.lastActiveAt,
        ]
      );

      session.id = String(result.rows[0].id);
    } catch (err) {
      this.logger.error(
        { err, platformUserId, channelType },
        "Failed to create session"
      );
      throw new Error("Failed to create session", { cause: err });
    }

    this.logger.info(
      { platformUserId, sessionId: session.id, channelType, tier },
      "Session created"
    );

    writeSessionToCache(this.redis, session).catch(() => {});
    return session;
  }

  /**
   * Retrieve the most recent active (non-expired) session for a
   * platform user + channel combination.
   *
   * Checks Redis cache first, falls back to DB on miss.
   * Returns `null` when no active session exists (instead of throwing).
   */
  async getActiveSession(
    platformUserId: string,
    channelType: string
  ): Promise<GatewaySession | null> {
    // 1. Redis cache
    try {
      const cached = await getSessionFromCache(
        this.redis,
        channelType,
        platformUserId
      );
      if (cached) return cached;
    } catch {
      // Redis failure — fall through to DB
    }

    // 2. DB fallback
    try {
      const result = await this.db.query(
        `SELECT id, clerk_user_id, channel_type, platform_user_id,
                platform_chat_id, cli_session_id, tier, device_info,
                created_at, expires_at, last_active_at
           FROM gateway_sessions
          WHERE platform_user_id = $1
            AND channel_type = $2
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1`,
        [platformUserId, channelType]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const session = rowToSession(result.rows[0]);
      writeSessionToCache(this.redis, session).catch(() => {});
      return session;
    } catch (err) {
      this.logger.error(
        { err, platformUserId, channelType },
        "Failed to get active session"
      );
      return null;
    }
  }

  /** Immediately expire a session by its ID. */
  async expireSession(sessionId: string): Promise<void> {
    try {
      await this.db.query(
        "UPDATE gateway_sessions SET expires_at = NOW() WHERE id = $1",
        [sessionId]
      );
    } catch (err) {
      this.logger.error({ err, sessionId }, "Failed to expire session");
      throw new Error("Failed to expire session", { cause: err });
    }
  }

  /**
   * Update the last_active_at timestamp for a session.
   * Fire-and-forget – errors are logged but never propagated.
   */
  async updateLastActive(sessionId: string): Promise<void> {
    try {
      await this.db.query(
        "UPDATE gateway_sessions SET last_active_at = NOW() WHERE id = $1",
        [sessionId]
      );
    } catch (err) {
      this.logger.warn({ err, sessionId }, "Failed to update last_active_at");
    }
  }

  // -------------------------------------------------------------------------
  // Distributed lock
  // -------------------------------------------------------------------------

  /**
   * Acquire a distributed user-level lock via Redis.
   *
   * Waits up to 15 seconds for the lock. If still held after that, force-clears
   * the stale lock and retries once (handles orphaned locks from crashes).
   *
   * @param userId     - Unique user identifier (used as lock key).
   * @param timeoutMs  - How long the lock is held before automatic expiry.
   */
  async acquireUserLock(
    userId: string,
    timeoutMs: number
  ): Promise<() => Promise<void>> {
    const lockKey = `user:${userId}:lock`;
    const lockTtlMs = timeoutMs + 60_000;

    const acquired = await this.tryAcquireLock(lockKey, lockTtlMs, 15_000);
    if (acquired) return acquired;

    // Lock still held after 15s — likely orphaned. Force-clear and retry once.
    this.logger.warn({ userId }, "Force-clearing stale user lock");
    try {
      await this.redis.del(lockKey);
    } catch {
      // Best-effort
    }

    const retryAcquired = await this.tryAcquireLock(lockKey, lockTtlMs, 5_000);
    if (retryAcquired) return retryAcquired;

    throw new Error(`Lock timeout: user ${userId} is still processing`);
  }

  private async tryAcquireLock(
    lockKey: string,
    lockTtlMs: number,
    waitMs: number
  ): Promise<(() => Promise<void>) | null> {
    const deadline = Date.now() + waitMs;

    while (Date.now() < deadline) {
      try {
        const result = await this.redis.set(
          lockKey,
          "1",
          "PX",
          lockTtlMs,
          "NX"
        );

        if (result === "OK") {
          const unlock = async (): Promise<void> => {
            try {
              await this.redis.del(lockKey);
            } catch (err) {
              this.logger.warn({ err }, "Failed to release user lock");
            }
          };
          return unlock;
        }
      } catch (err) {
        throw new Error(`Lock error`, { cause: err });
      }

      await sleep(1_000);
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Pruner
  // -------------------------------------------------------------------------

  /** Start a periodic task that removes expired sessions from the database. */
  startPruner(): void {
    if (this.prunerHandle) {
      this.logger.warn("Session pruner is already running");
      return;
    }

    const intervalMs = this.config.sessionPruneIntervalMinutes * 60 * 1000;

    this.logger.info(
      { intervalMinutes: this.config.sessionPruneIntervalMinutes },
      "Session pruner started"
    );

    this.prunerHandle = setInterval(() => {
      void this.prune();
    }, intervalMs);
  }

  /** Stop the periodic session pruner. */
  stopPruner(): void {
    if (this.prunerHandle) {
      clearInterval(this.prunerHandle);
      this.prunerHandle = null;
      this.logger.info("Session pruner stopped");
    }
  }

  /** Delete all expired sessions and log how many were removed. */
  private async prune(): Promise<void> {
    try {
      const result = await this.db.query(
        "DELETE FROM gateway_sessions WHERE expires_at < NOW()"
      );

      const count = result.rowCount ?? 0;
      if (count > 0) {
        this.logger.info({ pruned: count }, "Expired sessions pruned");
      }
    } catch (err) {
      this.logger.error({ err }, "Session pruning failed");
    }
  }
}
