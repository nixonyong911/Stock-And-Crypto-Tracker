import type { Api } from 'grammy';
import type { Channel, ConsumeMessage } from 'amqplib';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';
import { getRedis, type RedisClient } from '../infrastructure/redis.js';
import { getRabbitMQ, type QueueMessage } from '../infrastructure/rabbitmq.js';
import { getAIHubClient } from './ai-hub-client.js';
import { splitMessage } from '../utils/message-splitter.js';

const { lockTtlSeconds, lockExtendIntervalMs } = config.messageQueue;
const { requeueDelayMs } = config.rabbitmq;

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
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Message consumer that processes queued messages from RabbitMQ.
 * 
 * Key behaviors:
 * - Acquires per-chat lock before processing
 * - If lock busy, nacks with requeue (message goes back to queue)
 * - Extends lock periodically during long AI Hub calls
 * - Notifies user on failure
 */
export class MessageConsumer {
  private api: Api | null = null;
  private redis: RedisClient;
  private running = false;

  constructor() {
    this.redis = getRedis();
  }

  /**
   * Set the Telegram API instance (must be called before start)
   */
  setApi(api: Api): void {
    this.api = api;
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (!this.api) {
      throw new Error('Telegram API not set. Call setApi() first.');
    }

    const rabbitmq = getRabbitMQ();
    this.running = true;

    await rabbitmq.startConsumers(this.handleMessage.bind(this));
    logger.info('Message consumer started');
  }

  /**
   * Stop consuming (graceful shutdown)
   */
  stop(): void {
    this.running = false;
    logger.info('Message consumer stopping');
  }

  /**
   * Handle a single message from the queue
   */
  private async handleMessage(msg: ConsumeMessage, channel: Channel): Promise<void> {
    if (!this.running || !this.api) {
      channel.nack(msg, false, true); // Requeue
      return;
    }

    let payload: QueueMessage;
    try {
      payload = JSON.parse(msg.content.toString()) as QueueMessage;
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to parse message');
      channel.nack(msg, false, false); // Don't requeue malformed messages
      return;
    }

    const { chatId, userId, messageId, text, sessionId, id: msgId, notificationMessageId } = payload;
    const keys = getQueueKeys(chatId);

    logger.debug({
      message_id: msgId,
      chat_id: chatId,
      user_id: userId,
    }, 'Processing queued message');

    // Try to acquire lock for this chat
    const acquired = await this.redis.setNx(keys.lock, 'consumer', lockTtlSeconds);

    if (!acquired) {
      // Chat is busy - requeue with small delay
      logger.debug({ chat_id: chatId }, 'Lock busy, requeuing message');
      await sleep(requeueDelayMs);
      channel.nack(msg, false, true); // Requeue
      return;
    }

    // Lock acquired - process the message
    let lockExtendInterval: NodeJS.Timeout | null = null;

    try {
      // Extend lock periodically during processing
      lockExtendInterval = setInterval(async () => {
        try {
          await this.redis.expire(keys.lock, lockTtlSeconds);
        } catch {
          // Ignore errors
        }
      }, lockExtendIntervalMs);

      // Send typing indicator
      await this.api.sendChatAction(chatId, 'typing').catch(() => {});

      // Process with AI Hub
      const aiHub = getAIHubClient();
      const response = await aiHub.chatWithProgress(
        this.api,
        chatId,
        text,
        sessionId
      );

      // Send response to user
      await this.sendResponse(chatId, messageId, response);

      // Delete the "queued" notification message
      if (notificationMessageId) {
        await this.api.deleteMessage(chatId, notificationMessageId).catch((err) => {
          logger.debug({ error: (err as Error).message, chat_id: chatId }, 'Failed to delete notification');
        });
      }

      // Success - acknowledge
      channel.ack(msg);

      // Decrement pending counter
      await this.decrementPending(keys.pending);

      logger.info({
        message_id: msgId,
        chat_id: chatId,
        response_length: response.length,
      }, 'Queued message processed successfully');

    } catch (error) {
      logger.error({
        error: (error as Error).message,
        message_id: msgId,
        chat_id: chatId,
      }, 'Failed to process queued message');

      // Delete the "queued" notification message
      if (notificationMessageId) {
        await this.api.deleteMessage(chatId, notificationMessageId).catch(() => {});
      }

      // Notify user of failure
      try {
        await this.api.sendMessage(
          chatId,
          '❌ Failed to process your message. Please try again.',
          { reply_parameters: { message_id: messageId } }
        );
      } catch {
        // Ignore notification errors
      }

      // Acknowledge (don't retry failed AI requests)
      channel.ack(msg);

      // Decrement pending counter
      await this.decrementPending(keys.pending);

    } finally {
      // Clean up
      if (lockExtendInterval) {
        clearInterval(lockExtendInterval);
      }

      // Release lock
      await this.redis.del(keys.lock);
    }
  }

  /**
   * Send response to user (handles long messages)
   */
  private async sendResponse(chatId: number, replyToMessageId: number, response: string): Promise<void> {
    if (!this.api) return;

    const chunks = splitMessage(response);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        // Only reply to original message on first chunk
        const options = i === 0
          ? { reply_parameters: { message_id: replyToMessageId } }
          : {};

        try {
          await this.api.sendMessage(chatId, chunk, {
            ...options,
            parse_mode: 'Markdown',
          });
        } catch {
          // If Markdown fails, try plain text
          await this.api.sendMessage(chatId, chunk, options);
        }
      } catch (error) {
        logger.error({
          error: (error as Error).message,
          chat_id: chatId,
          chunk: i,
        }, 'Failed to send response chunk');
      }
    }
  }

  /**
   * Safely decrement pending counter (never go below 0)
   */
  private async decrementPending(key: string): Promise<void> {
    try {
      const current = await this.redis.get(key);
      if (current && parseInt(current, 10) > 0) {
        await this.redis.decr(key);
      }
    } catch {
      // Ignore errors
    }
  }
}

// Singleton instance
let consumerInstance: MessageConsumer | null = null;

export function getMessageConsumer(): MessageConsumer {
  if (!consumerInstance) {
    consumerInstance = new MessageConsumer();
  }
  return consumerInstance;
}
