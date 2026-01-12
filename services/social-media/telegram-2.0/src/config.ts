/**
 * Environment configuration for Telegram Bot 2.0
 */

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // Telegram
  botToken: getEnvOrThrow('TELEGRAM_BOT_TOKEN'),
  webhookUrl: getEnvOrThrow('WEBHOOK_URL'),
  
  // Database
  databaseUrl: getEnvOrThrow('DATABASE_URL'),
  
  // Redis
  redisUrl: getEnvOrDefault('REDIS_URL', 'redis://localhost:6379'),
  
  // RabbitMQ
  rabbitmq: {
    url: getEnvOrDefault('RABBITMQ_URL', 'amqp://stocktracker:password@localhost:5672'),
    prefetch: 1,            // FIFO: Process 1 message at a time
    consumerCount: 1,       // Single consumer for strict FIFO order
    requeueDelayMs: 1000,   // ms to wait before retry if lock busy
  },
  
  // AI Hub 2.0
  aiHubUrl: getEnvOrThrow('AI_HUB_URL'),
  aiHubApiKey: getEnvOrThrow('AI_HUB_API_KEY'),
  aiHubEndpoint: '/cli/telegram-agent/cursor/sonnet-4.5',
  aiHubTimeout: 120000, // 120 seconds
  
  // Server
  port: parseInt(getEnvOrDefault('BOT_PORT', '8087'), 10),
  
  // Session
  sessionExpiryDays: 7,
  
  // Rate Limits
  rateLimits: {
    register: { maxAttempts: 3, windowMinutes: 60 },
    login: { maxAttempts: 5, windowMinutes: 15 },
  },
  
  // Message Queue
  messageQueue: {
    maxQueuedPerChat: 3,         // Max queued messages per chat
    lockTtlSeconds: 300,         // 5 min lock TTL (AI Hub timeout + buffer)
    lockExtendIntervalMs: 60000, // Extend lock every 60s while processing
  },
  
  // Circuit Breaker
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeoutMs: 30000,
  },
} as const;

export type Config = typeof config;
