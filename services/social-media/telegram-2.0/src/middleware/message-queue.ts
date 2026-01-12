import type { NextFunction } from 'grammy';
import { v4 as uuidv4 } from 'uuid';
import type { BotContext } from '../types/context.js';
import { config } from '../config.js';
import { logger } from './logger.js';
import { getRabbitMQ, type QueueMessage } from '../infrastructure/rabbitmq.js';

const { maxQueuedPerChat, lockTtlSeconds } = config.messageQueue;

/**
 * Get Redis keys for a chat's message queue
 */
function getQueueKeys(chatId: number) {
  return {
    lock: `chat:${chatId}:lock`,
    pending: `chat:${chatId}:pending`,
  };
}

/**
 * Check if message was already processed (deduplication)
 */
async function isMessageProcessed(redis: BotContext['redis'], messageId: number): Promise<boolean> {
  const key = `msg:${messageId}:processed`;
  const exists = await redis.get(key);
  return exists !== null;
}

/**
 * Mark message as processed (prevents duplicates from Telegram retries)
 */
async function markMessageProcessed(redis: BotContext['redis'], messageId: number): Promise<void> {
  const key = `msg:${messageId}:processed`;
  await redis.set(key, '1', 300); // 5 min TTL - enough to cover processing time
}

/**
 * Message queue middleware - Fair queuing per chat.
 * 
 * Behavior:
 * - 1 chat = 1 AI Hub slot maximum
 * - If not processing: Acquire lock, process directly (fast path)
 * - If processing + queue < max: Publish to RabbitMQ, reply "queued"
 * - If queue >= max: Reply "too many queued"
 * 
 * This prevents spammers from hogging all AI Hub resources.
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
  const userId = ctx.from?.id;
  const messageId = ctx.message.message_id;
  
  if (!chatId || !userId) {
    return next();
  }

  const keys = getQueueKeys(chatId);
  const rabbitmq = getRabbitMQ();

  try {
    // Deduplication: Check if this message was already processed (Telegram retry)
    if (await isMessageProcessed(ctx.redis, messageId)) {
      logger.debug({ message_id: messageId, chat_id: chatId }, 'Duplicate message ignored (Telegram retry)');
      return; // Silently ignore duplicate
    }

    // Mark message as being processed
    await markMessageProcessed(ctx.redis, messageId);

    // Check current queue depth for this chat
    const pendingCount = await ctx.redis.get(keys.pending);
    const queueDepth = pendingCount ? parseInt(pendingCount, 10) : 0;

    // Check if chat is currently processing
    const isProcessing = await ctx.redis.get(keys.lock);

    if (!isProcessing) {
      // Lock is free - process directly (fast path)
      const acquired = await ctx.redis.setNx(keys.lock, '1', lockTtlSeconds);

      if (acquired) {
        logger.debug({ chat_id: chatId }, 'Acquired processing lock - fast path');

        try {
          await next();
        } finally {
          // Release lock
          await ctx.redis.del(keys.lock);
        }
        return;
      }
      // Lock was acquired by another request between check and setNx - fall through to queue
    }

    // Chat is busy processing - check if we can queue

    if (queueDepth >= maxQueuedPerChat) {
      // Queue full
      logger.info({
        chat_id: chatId,
        user_id: userId,
        queue_depth: queueDepth,
      }, 'Message queue full for chat');

      await ctx.reply(
        '⏳ Too many messages queued. Please wait for your previous messages to be processed.'
      );
      return;
    }

    // Publish to RabbitMQ
    const queueMessage: QueueMessage = {
      id: uuidv4(),
      messageId: ctx.message.message_id,
      chatId,
      userId,
      text: ctx.message.text,
      sessionId: ctx.telegramSession?.cursor_chat_id ?? null,
      timestamp: Date.now(),
    };

    const published = await rabbitmq.publish(queueMessage);

    if (!published) {
      // RabbitMQ down - fallback to direct processing
      logger.warn({ chat_id: chatId }, 'RabbitMQ unavailable, processing directly');
      return next();
    }

    // Increment pending counter
    await ctx.redis.incr(keys.pending);

    const newQueueDepth = queueDepth + 1;
    logger.info({
      chat_id: chatId,
      user_id: userId,
      queue_position: newQueueDepth,
      message_id: queueMessage.id,
    }, 'Message published to queue');

    await ctx.reply(
      `⏳ Your message is queued (position ${newQueueDepth}). Please wait...`
    );

  } catch (error) {
    logger.error({
      error: (error as Error).message,
      chat_id: chatId,
      user_id: userId,
    }, 'Message queue error');

    // On error, try to process anyway (graceful degradation)
    return next();
  }
}

/**
 * Check if chat has messages being processed
 */
export async function isProcessing(ctx: BotContext, chatId: number): Promise<boolean> {
  const keys = getQueueKeys(chatId);
  const value = await ctx.redis.get(keys.lock);
  return value !== null;
}

/**
 * Get queue depth for a chat
 */
export async function getQueueDepth(ctx: BotContext, chatId: number): Promise<number> {
  const keys = getQueueKeys(chatId);
  const value = await ctx.redis.get(keys.pending);
  return value ? parseInt(value, 10) : 0;
}
