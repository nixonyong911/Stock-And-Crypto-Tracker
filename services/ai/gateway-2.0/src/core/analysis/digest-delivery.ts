/**
 * Smart Digest delivery layer.
 *
 * Owns:
 *   - the Smart Digest card render facade (`renderCard` + `buildCardCaption`)
 *   - channel send dispatch (`extensions.get("telegram").sendPhoto`)
 *   - the `user_recommendation_log` INSERT (delivery ledger)
 *   - delivery failure semantics
 *
 * Knows nothing about sessions, prefs, daily caps, or watcher SQL — those
 * concerns live in `digest-eligibility.ts`. Brief generation and card visuals
 * live in their own modules and are imported here as pure helpers.
 */

import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import { renderCard, buildCardCaption } from "./card-renderer.js";
import type { DigestBrief } from "./digest-brief-generator.js";
import type { TickerSignal } from "./recommendation-engine.js";
import type { DigestTarget } from "./digest-eligibility.js";
import type { DeliveryFailureReason } from "./delivery-failure.js";

export type { DeliveryFailureReason } from "./delivery-failure.js";

// ── Public types ──────────────────────────────────────────────────────

export interface ArtifactRef {
  kind: "smart_digest" | "daily_overview";
  id: number;
}

export interface RenderedDigestCard {
  photo: Buffer;
  caption: string;
}

export interface DeliveryResult {
  ok: boolean;
  reason?: DeliveryFailureReason;
}

export interface DeliveryDeps {
  db: Pool;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
}

// ── Render facade ─────────────────────────────────────────────────────

/**
 * Smart Digest-flavored wrapper around `renderCard` + `buildCardCaption`.
 * Returns `null` on render failure so callers can degrade to log-only mode
 * without raising — this preserves the long-standing "brief always logged,
 * card best-effort" guarantee.
 */
export async function renderSmartDigestCard(
  brief: DigestBrief,
  log: FastifyBaseLogger,
): Promise<RenderedDigestCard | null> {
  try {
    const photo = await renderCard(brief);
    const caption = buildCardCaption(brief);
    return { photo, caption };
  } catch (err) {
    log.error(
      { err, symbol: brief.ticker },
      "Failed to render Smart Digest card; logging brief only",
    );
    return null;
  }
}

// ── Delivery ──────────────────────────────────────────────────────────

/**
 * Send the rendered Smart Digest card to a single target and write the
 * `user_recommendation_log` row. The DB INSERT runs whether the photo send
 * succeeded, failed, or was skipped (no `rendered` available, no telegram
 * extension registered) — that mirrors the long-standing "brief always
 * recorded" guarantee from the legacy `fanOutToWatchers` implementation.
 *
 * When `artifactRef` is provided, the ledger row links to the canonical
 * artifact via `(artifact_kind, artifact_id)`. When null (fallback path),
 * those columns are written as NULL.
 */
export async function deliverSmartDigest(
  deps: DeliveryDeps,
  target: DigestTarget,
  brief: DigestBrief,
  primary: TickerSignal,
  rendered: RenderedDigestCard | null,
  artifactRef: ArtifactRef | null = null,
): Promise<DeliveryResult> {
  const { db, extensions, log } = deps;

  let result: DeliveryResult;

  const telegram = extensions.get("telegram");
  if (!telegram?.sendPhoto) {
    result = { ok: false, reason: "telegram_unavailable" };
  } else if (!rendered) {
    // `renderSmartDigestCard` returned null — the brief never produced a
    // photo buffer. This is distinct from a downstream send error so the
    // operator can attribute regressions to the rendering pipeline.
    result = { ok: false, reason: "render_failed" };
  } else {
    try {
      const r = await telegram.sendPhoto({
        platformChatId: target.platformChatId,
        photo: rendered.photo,
        caption: rendered.caption,
      });
      if (r.ok) {
        result = { ok: true };
      } else {
        log.warn(
          { clerkUserId: target.clerkUserId, symbol: brief.ticker },
          "Telegram sendPhoto returned ok=false",
        );
        result = { ok: false, reason: "send_failed" };
      }
    } catch (err) {
      log.error(
        { err, clerkUserId: target.clerkUserId, symbol: brief.ticker },
        "Failed to send Smart Digest card",
      );
      result = { ok: false, reason: "send_error" };
    }
  }

  await db
    .query(
      `INSERT INTO user_recommendation_log
       (clerk_user_id, ticker_symbol, recommendation_type,
        artifact_kind, artifact_id,
        channel_type, delivery_status, delivery_failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        target.clerkUserId,
        primary.symbol,
        primary.type,
        artifactRef?.kind ?? null,
        artifactRef?.id ?? null,
        "telegram",
        result.ok ? "sent" : "failed",
        result.reason ?? null,
      ],
    )
    .catch((err) => log.error({ err }, "Failed to log recommendation"));

  return result;
}
