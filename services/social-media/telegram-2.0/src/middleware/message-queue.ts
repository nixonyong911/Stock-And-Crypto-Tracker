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
    // Deduplication: Atomically claim this message (prevents Telegram retry duplicates)
    const isNewMessage = await tryClaimMessage(ctx.redis, messageId);
    if (!isNewMessage) {
      logger.debug({ message_id: messageId, chat_id: chatId }, 'Duplicate webhook ignored (Telegram retry)');
      return; // Silently ignore duplicate
    }

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

    // Chat is busy processing - atomically reserve a queue slot
    const queuePosition = await ctx.redis.incr(keys.pending);

    if (queuePosition > maxQueuedPerChat) {
      // Queue full - release the slot we just reserved
      await ctx.redis.decr(keys.pending);
      
      logger.info({
        chat_id: chatId,
        user_id: userId,
        queue_position: queuePosition,
        max_allowed: maxQueuedPerChat,
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
      // RabbitMQ down - release slot and fallback to direct processing
      await ctx.redis.decr(keys.pending);
      logger.warn({ chat_id: chatId }, 'RabbitMQ unavailable, processing directly');
      return next();
    }

    logger.info({
      chat_id: chatId,
      user_id: userId,
      queue_position: queuePosition,
      message_id: queueMessage.id,
    }, 'Message published to queue');

    await ctx.reply(
      `⏳ Your message is queued (position ${queuePosition}). Please wait...`
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
