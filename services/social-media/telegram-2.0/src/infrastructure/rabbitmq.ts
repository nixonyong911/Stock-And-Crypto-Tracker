import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';

const EXCHANGE_NAME = 'telegram.direct';
const QUEUE_NAME = 'telegram.messages';
const DLX_EXCHANGE = 'telegram.dlx';
const DLQ_NAME = 'telegram.dlq';

export interface QueueMessage {
  id: string;
  messageId: number;
  chatId: number;
  userId: number;
  text: string;
  sessionId: string | null;
  timestamp: number;
  /** Message ID of the "queued" notification to delete after processing */
  notificationMessageId?: number;
}

export type MessageHandler = (
  msg: ConsumeMessage,
  channel: Channel
) => Promise<void>;

/**
 * RabbitMQ client for message queue operations
 */
export class RabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private consumerTags: string[] = [];
  private reconnecting = false;

  /**
   * Connect to RabbitMQ with auto-reconnect
   */
  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Set prefetch for fair distribution
      await this.channel.prefetch(config.rabbitmq.prefetch);

      // Setup topology (exchanges, queues, bindings)
      await this.setupTopology();

      // Handle connection errors
      this.connection.on('error', (err) => {
        logger.error({ error: err.message }, 'RabbitMQ connection error');
        this.reconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.reconnect();
      });

      logger.info('RabbitMQ connected');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to connect to RabbitMQ');
      throw error;
    }
  }

  /**
   * Setup exchanges, queues, and bindings
   */
  private async setupTopology(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    // Dead letter exchange
    await this.channel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });

    // Dead letter queue
    await this.channel.assertQueue(DLQ_NAME, { durable: true });
    await this.channel.bindQueue(DLQ_NAME, DLX_EXCHANGE, 'failed');

    // Main exchange
    await this.channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

    // Main queue with dead letter configuration
    await this.channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_EXCHANGE,
        'x-dead-letter-routing-key': 'failed',
        'x-message-ttl': 86400000, // 24h max age
      },
    });

    await this.channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'message');

    logger.info('RabbitMQ topology setup complete');
  }

  /**
   * Reconnect to RabbitMQ
   */
  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    const maxRetries = 10;
    const retryDelay = 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info({ attempt }, 'Attempting to reconnect to RabbitMQ');
        await this.connect();
        this.reconnecting = false;
        return;
      } catch {
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    logger.error('Failed to reconnect to RabbitMQ after max retries');
    this.reconnecting = false;
  }

  /**
   * Publish a message to the queue
   */
  async publish(message: QueueMessage): Promise<boolean> {
    if (!this.channel) {
      logger.error('Cannot publish: channel not initialized');
      return false;
    }

    try {
      const content = Buffer.from(JSON.stringify(message));
      
      this.channel.publish(EXCHANGE_NAME, 'message', content, {
        persistent: true,
        contentType: 'application/json',
        headers: {
          chatId: message.chatId,
        },
      });

      logger.debug({
        message_id: message.id,
        chat_id: message.chatId,
      }, 'Message published to queue');

      return true;
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to publish message');
      return false;
    }
  }

  /**
   * Start consuming messages with N consumers
   */
  async startConsumers(handler: MessageHandler): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const count = config.rabbitmq.consumerCount;

    for (let i = 0; i < count; i++) {
      const { consumerTag } = await this.channel.consume(
        QUEUE_NAME,
        async (msg) => {
          if (msg) {
            try {
              await handler(msg, this.channel!);
            } catch (error) {
              logger.error({
                error: (error as Error).message,
                consumer: i,
              }, 'Consumer handler error');
              
              // Nack without requeue on handler errors
              this.channel?.nack(msg, false, false);
            }
          }
        },
        { noAck: false }
      );

      this.consumerTags.push(consumerTag);
      logger.info({ consumer: i, tag: consumerTag }, 'Consumer started');
    }

    logger.info({ count }, 'All consumers started');
  }

  /**
   * Get channel for direct operations (ack/nack)
   */
  getChannel(): Channel | null {
    return this.channel;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      return this.connection !== null && this.channel !== null;
    } catch {
      return false;
    }
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    try {
      // Cancel all consumers
      if (this.channel) {
        for (const tag of this.consumerTags) {
          await this.channel.cancel(tag);
        }
      }

      // Close channel and connection
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }

      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error closing RabbitMQ connection');
    }
  }
}

// Singleton instance
let rabbitmqInstance: RabbitMQClient | null = null;

export function getRabbitMQ(): RabbitMQClient {
  if (!rabbitmqInstance) {
    rabbitmqInstance = new RabbitMQClient();
  }
  return rabbitmqInstance;
}
