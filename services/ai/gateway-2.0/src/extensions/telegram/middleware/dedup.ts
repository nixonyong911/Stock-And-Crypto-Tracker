import type { NextFunction } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

/**
 * Smart deduplication middleware.
 *
 * Tracks per-message processing status in Redis so that Telegram webhook
 * retries are handled intelligently:
 *   - "completed"       → silently ignore (already processed)
 *   - "processing:<ts>" → ignore if still recent (< HUNG_THRESHOLD_MS),
 *                          otherwise treat as hung and allow reprocessing
 *   - missing / other   → process normally
 *
 * The messages handler is responsible for marking the key as "completed"
 * on success, or deleting it on failure so a retry can go through.
 */

const HUNG_THRESHOLD_MS = 120_000; // 2 minutes

export async function dedupMiddleware(ctx: TelegramBotContext, next: NextFunction): Promise<void> {
  if (!ctx.message?.text || ctx.message.text.startsWith('/')) return next();

  const messageId = ctx.message?.message_id;
  if (!messageId) return next();

  const key = `msg:${messageId}:status`;

  try {
    const existing = await ctx.gatewayAPI.redis.get(key);

    if (existing) {
      if (existing === 'completed') {
        ctx.gatewayAPI.logger.debug({ messageId }, 'Duplicate ignored (completed)');
        return;
      }

      if (existing.startsWith('processing:')) {
        const startTime = parseInt(existing.split(':')[1]!, 10);
        const elapsed = Date.now() - startTime;

        if (elapsed < HUNG_THRESHOLD_MS) {
          ctx.gatewayAPI.logger.debug({ messageId, elapsed }, 'Duplicate ignored (still processing)');
          return;
        }

        ctx.gatewayAPI.logger.warn({ messageId, elapsed }, 'Original appears hung — allowing retry');
      }
      // "failed" or hung → fall through to reprocess
    }

    await ctx.gatewayAPI.redis.set(key, `processing:${Date.now()}`, 'EX', 600);
  } catch {
    // Redis failure — process anyway (graceful degradation)
  }

  ctx.dedupKey = key;
  return next();
}
