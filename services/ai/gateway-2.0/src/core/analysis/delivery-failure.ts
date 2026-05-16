/**
 * Unified delivery failure taxonomy used by every Smart Digest /
 * Daily Overview writer that records a row in `user_recommendation_log`.
 *
 * Step 15.2: collapses the two divergent vocabularies that grew up between
 * `digest-delivery.ts` (Smart Digest) and `daily-overview-broadcaster.ts`
 * (Daily Overview) into one closed union.
 *
 * Mapping from the pre-15.2 vocabularies:
 *   - Smart Digest `'render_or_send_error'` was overloaded for both
 *     "card render threw" and "sendPhoto threw". It is now split into
 *     `'render_failed'` (card produced no buffer) and `'send_error'`
 *     (channel call threw).
 *   - Daily Overview already used `'send_failed'` (channel returned ok=false)
 *     and `'send_error'` (channel call threw); both are kept.
 *   - Daily Overview previously wrote NO row when the Telegram extension
 *     was missing — Step 15.2 brings it in line by writing a single
 *     `'telegram_unavailable'` row and skipping the loop.
 *
 * The union must remain narrow: the column is `VARCHAR(40)` and the
 * RUNBOOK §4 audit query groups by it.
 */

export type DeliveryFailureReason =
  | "telegram_unavailable"
  | "render_failed"
  | "send_failed"
  | "send_error";

export const DELIVERY_FAILURE_REASONS: readonly DeliveryFailureReason[] = [
  "telegram_unavailable",
  "render_failed",
  "send_failed",
  "send_error",
] as const;

/**
 * Runtime guard intended for tests and one-off scripts. Production code
 * should rely on the type system; this exists so the invariant tests in
 * `__tests__/ledger-invariants.test.ts` can statically forbid drift when
 * a writer is changed.
 */
export function isDeliveryFailureReason(
  s: unknown,
): s is DeliveryFailureReason {
  return (
    typeof s === "string" &&
    (DELIVERY_FAILURE_REASONS as readonly string[]).includes(s)
  );
}

/**
 * Throwing variant. Use only in tests.
 */
export function assertDeliveryFailureReason(
  s: unknown,
): asserts s is DeliveryFailureReason {
  if (!isDeliveryFailureReason(s)) {
    throw new Error(
      `Invalid DeliveryFailureReason: ${JSON.stringify(s)}. ` +
        `Expected one of: ${DELIVERY_FAILURE_REASONS.join(", ")}`,
    );
  }
}
