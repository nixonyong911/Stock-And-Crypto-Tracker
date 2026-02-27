/**
 * Centralized pairing service.
 *
 * Encapsulates all account-linking logic so Telegram commands (and any future
 * channel) can share a single implementation.
 */

import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";
import crypto from "node:crypto";
import type { GatewayConfig } from "../../config.js";
import { parseTier, type Tier } from "../../config.js";

export interface PairResult {
  success: boolean;
  email?: string;
  tier?: Tier;
  clerkUserId?: string;
  error?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  cliSessionId: string;
}

export class PairingService {
  constructor(
    private readonly db: Pool,
    private readonly log: FastifyBaseLogger,
    private readonly config: GatewayConfig
  ) {}

  /**
   * Verify a 6-digit pairing code and link the Telegram account to the web
   * user. Creates/updates `channel_accounts` with `clerk_user_id`.
   */
  async pairChannel(params: {
    code: string;
    platformUserId: string;
    channelType: string;
    platformUsername?: string | null;
    displayName?: string | null;
  }): Promise<PairResult> {
    const { code, platformUserId, channelType, platformUsername, displayName } =
      params;

    // 1. Verify code
    const tokenResult = await this.db.query(
      `SELECT * FROM users_link_tokens
       WHERE token = $1 AND direction = 'web_to_telegram'
         AND used_at IS NULL AND expires_at > NOW()`,
      [code]
    );
    const linkToken = tokenResult.rows[0];
    if (!linkToken?.user_id) {
      return { success: false, error: "invalid_or_expired_code" };
    }

    // 2. Check if this Telegram user is already paired
    const existingLink = await this.db.query(
      "SELECT id, email FROM users WHERE telegram_user_id = $1",
      [platformUserId]
    );
    if (existingLink.rows[0]) {
      return {
        success: false,
        error: "telegram_already_paired",
        email: existingLink.rows[0].email,
      };
    }

    // 3. Get target user
    const targetResult = await this.db.query(
      "SELECT id, email, telegram_user_id, tier, clerk_user_id FROM users WHERE id = $1",
      [linkToken.user_id]
    );
    const targetUser = targetResult.rows[0];
    if (!targetUser) {
      return { success: false, error: "user_not_found" };
    }
    if (targetUser.telegram_user_id) {
      return { success: false, error: "web_already_paired" };
    }

    // 4. Link accounts
    await this.db.query(
      "UPDATE users SET telegram_user_id = $1, updated_at = NOW() WHERE id = $2",
      [platformUserId, linkToken.user_id]
    );
    await this.db.query(
      "UPDATE users_link_tokens SET used_at = NOW(), telegram_user_id = $1 WHERE id = $2",
      [platformUserId, linkToken.id]
    );

    // 5. Upsert channel_account with clerk_user_id
    await this.db.query(
      `INSERT INTO channel_accounts (channel_type, platform_user_id, platform_username, display_name, clerk_user_id, paired_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (channel_type, platform_user_id)
       DO UPDATE SET clerk_user_id = $5, paired_at = NOW()`,
      [
        channelType,
        platformUserId,
        platformUsername ?? null,
        displayName ?? "User",
        targetUser.clerk_user_id,
      ]
    );

    this.log.info(
      { platformUserId, channelType, email: targetUser.email },
      "Account paired successfully"
    );

    return {
      success: true,
      email: targetUser.email,
      tier: parseTier(targetUser.tier),
      clerkUserId: targetUser.clerk_user_id,
    };
  }

  /**
   * Unpair a channel account. Accepts either platformUserId (bot-side)
   * or clerkUserId (frontend-side) to resolve the pairing, then clears
   * both tables and expires active sessions.
   */
  async unpairChannel(params: {
    platformUserId?: string;
    clerkUserId?: string;
    channelType: string;
  }): Promise<{ success: boolean; error?: string }> {
    let caRow: { platform_user_id: string; clerk_user_id: string } | undefined;

    if (params.platformUserId) {
      const r = await this.db.query(
        `SELECT platform_user_id, clerk_user_id FROM channel_accounts
         WHERE platform_user_id = $1 AND channel_type = $2`,
        [params.platformUserId, params.channelType]
      );
      caRow = r.rows[0];
    } else if (params.clerkUserId) {
      const r = await this.db.query(
        `SELECT platform_user_id, clerk_user_id FROM channel_accounts
         WHERE clerk_user_id = $1 AND channel_type = $2`,
        [params.clerkUserId, params.channelType]
      );
      caRow = r.rows[0];
    }

    if (!caRow?.clerk_user_id) {
      return { success: false, error: "not_paired" };
    }

    await this.db.query(
      "UPDATE users SET telegram_user_id = NULL, updated_at = NOW() WHERE clerk_user_id = $1",
      [caRow.clerk_user_id]
    );

    await this.db.query(
      `UPDATE channel_accounts SET clerk_user_id = NULL, paired_at = NULL
       WHERE platform_user_id = $1 AND channel_type = $2`,
      [caRow.platform_user_id, params.channelType]
    );

    await this.db.query(
      `UPDATE gateway_sessions SET expires_at = NOW()
       WHERE platform_user_id = $1 AND channel_type = $2 AND expires_at > NOW()`,
      [caRow.platform_user_id, params.channelType]
    );

    this.log.info(
      { platformUserId: caRow.platform_user_id, channelType: params.channelType },
      "Account unpaired successfully"
    );

    return { success: true };
  }

  /**
   * Resolve the user's tier from channel_accounts → users.
   */
  async resolveUserTier(
    platformUserId: string,
    channelType: string
  ): Promise<Tier> {
    try {
      const result = await this.db.query(
        `SELECT u.tier FROM channel_accounts ca
         JOIN users u ON u.clerk_user_id = ca.clerk_user_id
         WHERE ca.platform_user_id = $1 AND ca.channel_type = $2 AND ca.clerk_user_id IS NOT NULL`,
        [platformUserId, channelType]
      );
      if (result.rows[0]?.tier) return parseTier(result.rows[0].tier);
    } catch {
      // Fall through to default
    }
    return parseTier("free");
  }

  /**
   * Check if a channel account is paired (has a clerk_user_id).
   */
  async isPaired(
    platformUserId: string,
    channelType: string
  ): Promise<boolean> {
    const result = await this.db.query(
      `SELECT clerk_user_id FROM channel_accounts
       WHERE platform_user_id = $1 AND channel_type = $2`,
      [platformUserId, channelType]
    );
    return result.rows[0]?.clerk_user_id != null;
  }

  /**
   * Create a new gateway session after pairing (or on /login).
   * Expires any existing sessions first.
   * Tier is resolved from users table (single source of truth).
   */
  async createSession(params: {
    platformUserId: string;
    platformChatId: string;
    channelType: string;
    clerkUserId?: string | null;
    deviceInfo?: Record<string, unknown>;
  }): Promise<CreateSessionResult> {
    const {
      platformUserId,
      platformChatId,
      channelType,
      clerkUserId,
      deviceInfo,
    } = params;

    // Expire existing sessions
    await this.db.query(
      `UPDATE gateway_sessions SET expires_at = NOW()
       WHERE platform_user_id = $1 AND channel_type = $2 AND expires_at > NOW()`,
      [platformUserId, channelType]
    );

    // Resolve tier from users table
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
      } catch {
        this.log.warn(
          { clerkUserId },
          "Failed to resolve tier, defaulting to free"
        );
      }
    }

    const expiresAt = new Date(
      Date.now() + this.config.sessionExpiryDays * 24 * 60 * 60 * 1000
    );
    const cliSessionId = crypto.randomUUID();

    const result = await this.db.query(
      `INSERT INTO gateway_sessions
         (channel_type, platform_user_id, platform_chat_id, tier, device_info, expires_at, clerk_user_id, cli_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        channelType,
        platformUserId,
        platformChatId,
        tier,
        JSON.stringify(deviceInfo ?? {}),
        expiresAt,
        clerkUserId ?? null,
        cliSessionId,
      ]
    );

    this.log.info(
      { platformUserId, channelType, tier, sessionId: result.rows[0].id },
      "Session created"
    );

    return {
      sessionId: String(result.rows[0].id),
      cliSessionId,
    };
  }
}
