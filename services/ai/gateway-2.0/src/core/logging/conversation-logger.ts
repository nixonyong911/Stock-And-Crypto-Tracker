/**
 * Conversation logger.
 *
 * Append-only logging for the gateway live path. Writes one row per message
 * into `logging_conversations`. A shared `traceId` ties one inbound row to its
 * one-or-more outbound row(s).
 *
 * Semantics:
 *  - direction "inbound"  -> what is sent to the agent.
 *  - direction "outbound" -> the generated reply prepared for send. This records
 *    that the system produced a reply, NOT that the channel/provider confirmed
 *    delivery (the actual send happens later, outside this logging point).
 *
 * Writes are best-effort: failures are logged and swallowed so logging can never
 * break a reply.
 */

import type { FastifyBaseLogger } from "fastify";
import type { PgPool } from "../../db/postgres.js";

export type ConversationDirection = "inbound" | "outbound";

export interface LogMessageParams {
  /** Shared id tying an inbound row to its outbound row(s). */
  traceId: string;
  /** "inbound" (sent to agent) or "outbound" (generated reply prepared for send). */
  direction: ConversationDirection;
  /** Dynamic channel string (e.g. "telegram"). */
  channel: string;
  /** External user this conversation turn belongs to (author inbound / recipient outbound). */
  externalUserId: string;
  /** Resolved internal identity, if known. */
  clerkUserId?: string | null;
  /** CLI session id, if known. */
  sessionId?: string | null;
  /** Inbound: message sent to the agent. Outbound: generated reply text. */
  messageText: string;
  /** Optional channel-specific extras. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Best-effort append of a single conversation message row.
 *
 * Never throws: any failure is logged via `logger.error` and swallowed.
 */
export async function logMessage(
  db: PgPool,
  logger: FastifyBaseLogger,
  params: LogMessageParams
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO logging_conversations
         (trace_id, direction, channel, external_user_id,
          clerk_user_id, session_id, message_text, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.traceId,
        params.direction,
        params.channel,
        params.externalUserId,
        params.clerkUserId ?? null,
        params.sessionId ?? null,
        params.messageText,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );
  } catch (err: unknown) {
    logger.error(
      { err, traceId: params.traceId, direction: params.direction },
      "Failed to write conversation log"
    );
  }
}
