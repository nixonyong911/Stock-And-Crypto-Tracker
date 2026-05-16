/**
 * Unified per-user delivery preference resolution.
 *
 * Step 15.2 (slice E): collapses the two pre-15.2 read paths
 *   - Smart Digest: `is_enabled` via `digest-eligibility.checkDigestThrottle`
 *   - Daily Overview: inline `COALESCE(dp.daily_overview_enabled, true)`
 * into a single helper with one consistent default policy:
 *   - missing row    → both flags `true`
 *   - explicit `false` on a column → that flag `false`
 *
 * The Daily Overview broadcaster keeps its DB-level `WHERE` filter as a
 * fast-path (so the recipient set is already trimmed at the SQL layer).
 * The helper is the place to reason about defaults and is what
 * `digest-eligibility.checkDigestThrottle` consults — Step 16 may later
 * collapse the DB filter into this helper, but 15.2 leaves it.
 */

import type { Pool } from "pg";

export interface DeliveryPrefs {
  smartDigestEnabled: boolean;
  dailyOverviewEnabled: boolean;
}

const DEFAULT_PREFS: DeliveryPrefs = {
  smartDigestEnabled: true,
  dailyOverviewEnabled: true,
};

/**
 * Single-user lookup. Returns the default-on prefs when no row exists.
 * Never throws — DB hiccups bubble up to the caller's try/catch.
 */
export async function loadDeliveryPrefsForUser(
  db: Pool,
  clerkUserId: string,
): Promise<DeliveryPrefs> {
  const { rows } = await db.query<{
    is_enabled: boolean | null;
    daily_overview_enabled: boolean | null;
  }>(
    `SELECT is_enabled, daily_overview_enabled
     FROM user_digest_preferences
     WHERE clerk_user_id = $1`,
    [clerkUserId],
  );
  const row = rows[0];
  if (!row) return { ...DEFAULT_PREFS };
  return {
    smartDigestEnabled: row.is_enabled !== false,
    dailyOverviewEnabled: row.daily_overview_enabled !== false,
  };
}

/**
 * Batched lookup. Used by Daily Overview broadcaster as a defense-in-depth
 * second pass after the recipient SQL filter, and reserved for future
 * Smart Digest fan-out optimisations. Users with no row receive defaults.
 */
export async function loadDeliveryPrefs(
  db: Pool,
  clerkUserIds: string[],
): Promise<Map<string, DeliveryPrefs>> {
  const out = new Map<string, DeliveryPrefs>();
  if (clerkUserIds.length === 0) return out;

  const { rows } = await db.query<{
    clerk_user_id: string;
    is_enabled: boolean | null;
    daily_overview_enabled: boolean | null;
  }>(
    `SELECT clerk_user_id, is_enabled, daily_overview_enabled
     FROM user_digest_preferences
     WHERE clerk_user_id = ANY($1)`,
    [clerkUserIds],
  );

  for (const row of rows) {
    out.set(row.clerk_user_id, {
      smartDigestEnabled: row.is_enabled !== false,
      dailyOverviewEnabled: row.daily_overview_enabled !== false,
    });
  }
  for (const id of clerkUserIds) {
    if (!out.has(id)) out.set(id, { ...DEFAULT_PREFS });
  }
  return out;
}
