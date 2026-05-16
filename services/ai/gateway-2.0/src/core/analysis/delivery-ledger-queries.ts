/**
 * Read-side helpers against `user_recommendation_log` (the delivery
 * ledger). These are deliberately scoped: they answer a single,
 * well-defined question each, and never read content columns
 * (`message_body`, `headline`) — those come from the artifact tables.
 *
 * Step 15.2 — introduces ledger-backed per-user duplicate prevention for
 * Daily Overview broadcasts. The Redis short-circuit
 * (`digest:overview:sent:{date}:{session}`) remains the cheap fast-path;
 * this lookup is the authoritative second gate.
 */

import type { Pool } from "pg";
import type { ArtifactRef } from "./digest-delivery.js";

/**
 * Returns the set of `clerk_user_id`s that already have a ledger row
 * pointing at this exact `(artifact_kind, artifact_id)` pair. Caller
 * uses the set to skip recipients on a re-invocation (e.g. crash
 * recovery, manual replay) without producing duplicate ledger rows or
 * re-sending the message.
 *
 * Uses `idx_url_artifact (artifact_kind, artifact_id)` from migration
 * 025 — single index lookup per call, irrespective of recipient count.
 *
 * Filters by `delivery_status = 'sent'` so a previously-failed delivery
 * is allowed to be retried on the next invocation. (A failed row is
 * recorded for audit but does not "consume" the dedup slot.)
 */
export async function loadAlreadyDeliveredUserIds(
  db: Pool,
  artifact: ArtifactRef,
): Promise<Set<string>> {
  const { rows } = await db.query<{ clerk_user_id: string }>(
    `SELECT DISTINCT clerk_user_id
     FROM user_recommendation_log
     WHERE artifact_kind = $1
       AND artifact_id = $2
       AND delivery_status = 'sent'`,
    [artifact.kind, artifact.id],
  );
  return new Set(rows.map((r) => r.clerk_user_id));
}
