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
  botToken: getEnvOrThrow("TELEGRAM_BOT_TOKEN"),
  webhookUrl: getEnvOrThrow("WEBHOOK_URL"),

  // Database
  databaseUrl: getEnvOrThrow("DATABASE_URL"),

  // Redis
  redisUrl: getEnvOrDefault("REDIS_URL", "redis://localhost:6379"),

  // Gateway
  gatewayUrl: getEnvOrThrow("GATEWAY_URL"),
  gatewayApiKey: getEnvOrThrow("GATEWAY_API_KEY"),
  gatewayTimeout: 300000, // 300 seconds (max tier timeout + queue wait)

  // Server
  port: parseInt(getEnvOrDefault("BOT_PORT", "8087"), 10),

  // Session
  sessionExpiryDays: 7,

  // Rate Limits
  rateLimits: {
    register: { maxAttempts: 3, windowMinutes: 60 },
    login: { maxAttempts: 5, windowMinutes: 15 },
  },

  // Circuit Breaker
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeoutMs: 30000,
  },
} as const;

export type Config = typeof config;
