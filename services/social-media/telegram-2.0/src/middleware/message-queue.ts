import type { NextFunction } from 'grammy';
import type { BotContext } from '../types/context.js';
import { logger } from './logger.js';

/**
 * Check if message webhook was already handled (deduplication for Telegram retries)
 * Uses SET NX to atomically check and mark in one operation
 * Returns true if this is a NEW message (should be handled)
 * Returns false if this is a DUPLICATE (should be ignored)
 */
async function tryClaimMessage(redis: BotContext['redis'], messageId: number): Promise<boolean> {
  const key = `msg:${messageId}:seen`;
  // SET NX returns true if key was set (new message), false if already exists (duplicate)
  return await redis.setNx(key, '1', 600); // 10 min TTL
}

/**
 * Message deduplication middleware.
 * 
 * Simplified from the previous queue middleware:
 * - REMOVED: RabbitMQ queuing (Gateway handles queuing internally)
 * - REMOVED: Per-chat Redis lock (Gateway has per-user lock)
 * - REMOVED: Pending counter (Gateway manages queue depth)
 * - KEPT: Webhook deduplication (prevents Telegram retry duplicates)
 * 
 * Gateway now handles: per-user locking, priority queuing, CLI concurrency.
 * Telegram bot only needs to prevent duplicate webhook deliveries.
 */
export async function messageQueueMiddleware(
  ctx: BotContext,
  next: NextFunction
): Promise<void> {
  // Only apply to text messages (not commands)
  if (!ctx.message?.text || ctx.message.text.startsWith('/')) {
    return next();
  }

  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  if (!chatId || !messageId) {
    return next();
  }

  try {
    // Deduplication: Atomically claim this message (prevents Telegram retry duplicates)
    const isNewMessage = await tryClaimMessage(ctx.redis, messageId);
    if (!isNewMessage) {
      logger.debug({ message_id: messageId, chat_id: chatId }, 'Duplicate webhook ignored (Telegram retry)');
      return; // Silently ignore duplicate
    }

    // Pass through to message handler (Gateway handles queuing)
    return next();
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      chat_id: chatId,
    }, 'Dedup middleware error');

    // On error, process anyway (graceful degradation)
    return next();
  }
}
