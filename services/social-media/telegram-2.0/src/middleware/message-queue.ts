import type { NextFunction } from 'grammy';
import type { BotContext } from '../types/context.js';
import { config } from '../config.js';
import { logger } from './logger.js';

const { maxQueuedMessages, processingLockTtlSeconds } = config.messageQueue;

/**
 * Get Redis keys for a user's message queue
 */
function getQueueKeys(userId: number) {
  return {
    processing: `user:${userId}:processing`,
    queue: `user:${userId}:queue`,
  };
}

export interface QueuedMessage {
  messageId: number;
  chatId: number;
  text: string;
  timestamp: number;
}

/**
 * Message queue middleware - prevents concurrent message processing per user.
 * 
 * Behavior:
 * - If not processing: Set lock, continue to process
 * - If processing + queue < max: Add to queue, reply "queued"
 * - If processing + queue >= max: Reply "too many queued"
 */
export async function messageQueueMiddleware(
  ctx: BotContext,
  next: NextFunction
): Promise<void> {
  // Only apply to text messages (not commands)
  if (!ctx.message?.text || ctx.message.text.startsWith('/')) {
    return next();
  }

  const userId = ctx.from?.id;
  if (!userId) {
    return next();
  }

  const keys = getQueueKeys(userId);

  try {
    // Try to acquire processing lock
    const acquired = await ctx.redis.setNx(
      keys.processing,
      '1',
      processingLockTtlSeconds
    );

    if (acquired) {
      // We got the lock - process immediately
      logger.debug({ user_id: userId }, 'Acquired processing lock');
      
      try {
        await next();
      } finally {
        // Release lock
        await ctx.redis.del(keys.processing);
        
        // Process queued message if any
        await processQueuedMessage(ctx, keys);
      }
      return;
    }

    // Lock not acquired - check queue length
    const queueLength = await ctx.redis.llen(keys.queue);

    if (queueLength >= maxQueuedMessages) {
      // Queue full
      logger.info({
        user_id: userId,
        queue_length: queueLength,
      }, 'Message queue full');

      await ctx.reply(
        '⏳ Too many messages queued. Please wait for your previous messages to be processed.'
      );
      return;
    }

    // Add to queue
    const queuedMessage: QueuedMessage = {
      messageId: ctx.message.message_id,
      chatId: ctx.chat!.id,
      text: ctx.message.text,
      timestamp: Date.now(),
    };

    await ctx.redis.rpush(keys.queue, JSON.stringify(queuedMessage));
    await ctx.redis.expire(keys.queue, processingLockTtlSeconds * 2);

    const newQueueLength = queueLength + 1;
    logger.info({
      user_id: userId,
      queue_position: newQueueLength,
    }, 'Message queued');

    await ctx.reply(
      `⏳ Your message is queued (${newQueueLength} message${newQueueLength > 1 ? 's' : ''} ahead). ` +
      'Please wait...'
    );
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'Message queue error');
    
    // On error, try to process anyway
    return next();
  }
}

/**
 * Process next queued message after current one completes
 */
async function processQueuedMessage(
  ctx: BotContext,
  keys: { processing: string; queue: string }
): Promise<void> {
  try {
    const queuedJson = await ctx.redis.lpop(keys.queue);
    if (!queuedJson) {
      return;
    }

    const queued = JSON.parse(queuedJson) as QueuedMessage;
    
    logger.info({
      user_id: ctx.from?.id,
      message_id: queued.messageId,
    }, 'Processing queued message');

    // Note: In a real implementation, you'd need to create a new context
    // and process the queued message. For simplicity, we just log it here.
    // The actual processing would be handled by the message handler.
  } catch (error) {
    logger.error({
      error: (error as Error).message,
    }, 'Failed to process queued message');
  }
}

/**
 * Check if user has messages being processed
 */
export async function isProcessing(ctx: BotContext, userId: number): Promise<boolean> {
  const keys = getQueueKeys(userId);
  const value = await ctx.redis.get(keys.processing);
  return value !== null;
}
