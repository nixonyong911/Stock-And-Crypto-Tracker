/**
 * Smart Digest eligibility layer.
 *
 * Single source of truth for:
 *  - active session lookup (`gateway_sessions`)
 *  - paired Telegram channel lookup (`channel_accounts`)
 *  - watchlist join (`user_watchlist`)
 *  - per-user digest preferences (`user_digest_preferences.is_enabled`)
 *  - per-user daily cap (Redis `digest:count:<clerkUserId>`)
 *
 * No other Smart Digest module is allowed to touch these resources directly.
 * Generation, rendering, and delivery layers receive `DigestTarget` values
 * from this module and otherwise stay channel/session-agnostic.
 */

import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { secondsUntilMidnightUTC } from "./wishlist-calculator.js";

// ── Public types ──────────────────────────────────────────────────────

export interface DigestTarget {
  clerkUserId: string;
  platformChatId: string;
  channel: "telegram";
}

export type ThrottleReason = "disabled" | "daily_cap_reached";

export type CanReceiveFailureReason =
  | "no_session_or_not_paired"
  | "symbol_not_watched"
  | ThrottleReason;

export interface EligibilityDeps {
  db: Pool;
  redis: Redis;
}

// ── Constants ─────────────────────────────────────────────────────────

/**
 * Per-user daily Smart Digest send cap. Owned exclusively by this module —
 * any other layer that needs the cap should call `checkDigestThrottle` /
 * `recordDigestSent` rather than referencing this constant directly.
 */
export const MAX_DAILY_SENDS = 6;

const CAP_KEY_PREFIX = "digest:count:";

// ── Watcher resolution (touches gateway_sessions) ─────────────────────

/**
 * Returns every watcher that is eligible to receive a Smart Digest for
 * `symbol` right now. A watcher is eligible when they have:
 *   - an entry on `user_watchlist` for the given symbol,
 *   - a paired Telegram account (`channel_accounts.channel_type = 'telegram'`),
 *   - an active gateway session (`gateway_sessions.expires_at > NOW()`).
 *
 * This is the batched query used by the fan-out path.
 */
export async function listDigestWatchersForSymbol(
  deps: EligibilityDeps,
  symbol: string,
): Promise<DigestTarget[]> {
  const { db } = deps;
  const result = await db.query<{
    clerk_user_id: string;
    platform_user_id: string;
  }>(
    `SELECT DISTINCT ON (uw.clerk_user_id) uw.clerk_user_id, ca.platform_user_id
     FROM user_watchlist uw
     JOIN channel_accounts ca
       ON ca.clerk_user_id = uw.clerk_user_id AND ca.channel_type = 'telegram'
     JOIN gateway_sessions gs
       ON gs.clerk_user_id = uw.clerk_user_id AND gs.channel_type = 'telegram' AND gs.expires_at > NOW()
     WHERE uw.ticker_symbol = $1`,
    [symbol],
  );

  return result.rows.map((row) => ({
    clerkUserId: row.clerk_user_id,
    platformChatId: row.platform_user_id,
    channel: "telegram",
  }));
}

/**
 * Single-user variant of {@link listDigestWatchersForSymbol}. Returns the
 * user's `DigestTarget` if they pass session + paired Telegram (and, when
 * `symbol` is provided, watchlist) checks; otherwise `null`.
 *
 * Used by `/internal/force-send-digest` and any future per-user lookup.
 */
export async function resolveDigestTargetForUser(
  deps: EligibilityDeps,
  clerkUserId: string,
  symbol?: string,
): Promise<DigestTarget | null> {
  const { db } = deps;

  if (symbol) {
    const result = await db.query<{ platform_user_id: string }>(
      `SELECT ca.platform_user_id
         FROM channel_accounts ca
         JOIN gateway_sessions gs
           ON gs.clerk_user_id = ca.clerk_user_id
           AND gs.channel_type = 'telegram'
           AND gs.expires_at > NOW()
         JOIN user_watchlist uw
           ON uw.clerk_user_id = ca.clerk_user_id
           AND UPPER(uw.ticker_symbol) = UPPER($2)
         WHERE ca.clerk_user_id = $1 AND ca.channel_type = 'telegram'
         LIMIT 1`,
      [clerkUserId, symbol],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      clerkUserId,
      platformChatId: row.platform_user_id,
      channel: "telegram",
    };
  }

  const result = await db.query<{ platform_user_id: string }>(
    `SELECT ca.platform_user_id
       FROM channel_accounts ca
       JOIN gateway_sessions gs
         ON gs.clerk_user_id = ca.clerk_user_id
         AND gs.channel_type = 'telegram'
         AND gs.expires_at > NOW()
       WHERE ca.clerk_user_id = $1 AND ca.channel_type = 'telegram'
       LIMIT 1`,
    [clerkUserId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    clerkUserId,
    platformChatId: row.platform_user_id,
    channel: "telegram",
  };
}

// ── Throttle (prefs + cap) ────────────────────────────────────────────

/**
 * Throttle gate: returns `{ ok: true }` when the user has Smart Digest
 * enabled and is below {@link MAX_DAILY_SENDS} for the current UTC day.
 * Never throws — DB / Redis hiccups bubble up to the caller's try/catch.
 */
export async function checkDigestThrottle(
  deps: EligibilityDeps,
  clerkUserId: string,
): Promise<{ ok: true } | { ok: false; reason: ThrottleReason }> {
  const { db, redis } = deps;

  const capKey = `${CAP_KEY_PREFIX}${clerkUserId}`;
  const currentCount = await redis.get(capKey);
  if (currentCount != null && parseInt(currentCount, 10) >= MAX_DAILY_SENDS) {
    return { ok: false, reason: "daily_cap_reached" };
  }

  const prefResult = await db.query<{ is_enabled: boolean }>(
    "SELECT is_enabled FROM user_digest_preferences WHERE clerk_user_id = $1",
    [clerkUserId],
  );
  if (prefResult.rows[0]?.is_enabled === false) {
    return { ok: false, reason: "disabled" };
  }

  return { ok: true };
}

/**
 * Increment the per-user daily cap counter and ensure the TTL expires at
 * the next UTC midnight. Mirrors the legacy `redis.incr` / `ttl` / `expire`
 * sequence verbatim — call once per Smart Digest send attempt that has
 * passed {@link checkDigestThrottle}.
 */
export async function recordDigestSent(
  deps: EligibilityDeps,
  clerkUserId: string,
): Promise<void> {
  const { redis } = deps;
  const capKey = `${CAP_KEY_PREFIX}${clerkUserId}`;
  await redis.incr(capKey);
  const ttlExists = await redis.ttl(capKey);
  if (ttlExists < 0) {
    await redis.expire(capKey, secondsUntilMidnightUTC());
  }
}

// ── Convenience composer (used by force-send) ─────────────────────────

/**
 * Resolves the user's `DigestTarget` (session + paired Telegram + watchlist)
 * and optionally applies the throttle gate. The default `applyThrottle: false`
 * matches the legacy `/internal/force-send-digest` behavior, which deliberately
 * bypasses prefs/cap so manual verification cards always go out.
 */
export async function canReceiveSmartDigest(
  deps: EligibilityDeps,
  clerkUserId: string,
  symbol: string,
  opts?: { applyThrottle?: boolean },
): Promise<
  | { ok: true; target: DigestTarget }
  | { ok: false; reason: CanReceiveFailureReason }
> {
  const target = await resolveDigestTargetForUser(deps, clerkUserId, symbol);
  if (!target) {
    return { ok: false, reason: "no_session_or_not_paired" };
  }

  if (opts?.applyThrottle) {
    const throttle = await checkDigestThrottle(deps, clerkUserId);
    if (!throttle.ok) {
      return { ok: false, reason: throttle.reason };
    }
  }

  return { ok: true, target };
}
