/**
 * Gateway configuration loaded from environment variables.
 */

import { Tier, getTierConfig, parseTier } from "./core/tier/config.js";
import type { TierConfig } from "./core/tier/config.js";

export { Tier, getTierConfig, parseTier };
export type { TierConfig };

export interface GatewayConfig {
  readonly port: number;
  readonly apiKey: string;
  readonly contextPath: string;
  readonly tierHomesPath: string;
  readonly maxConcurrent: number;
  readonly defaultModel: string;
  readonly freeMaxMessages: number;
  readonly freeRechargeHours: number;
  readonly sessionExpiryDays: number;
  readonly sessionPruneIntervalMinutes: number;
  readonly defaultCLITimeoutSeconds: number;
  readonly databaseURL: string;
  readonly redisURL: string;
  readonly maxMessageLength: number;
  readonly telegramBotToken: string | undefined;
  readonly telegramWebhookURL: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envStr(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== "") {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Required environment variable ${key} is not set`);
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Environment variable ${key} must be a valid integer, got "${raw}"`,
    );
  }
  return parsed;
}

function envOptional(key: string): string | undefined {
  const value = process.env[key];
  if (value !== undefined && value !== "") {
    return value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load gateway configuration from environment variables.
 * Throws if any required variable is missing or invalid.
 */
export function loadConfig(): GatewayConfig {
  return {
    port: envInt("PORT", 8080),
    apiKey: envStr("AI_HUB_API_KEY", ""),
    contextPath: envStr(
      "GATEWAY_CONTEXT_PATH",
      "/app/agent-context",
    ),
    tierHomesPath: envStr(
      "GATEWAY_TIER_HOMES_PATH",
      "/app/tier-homes",
    ),
    maxConcurrent: envInt("GATEWAY_MAX_CONCURRENT", 3),
    defaultModel: envStr("GATEWAY_DEFAULT_MODEL", "sonnet-4.5"),
    freeMaxMessages: envInt("GATEWAY_FREE_MAX_MESSAGES", 5),
    freeRechargeHours: envInt("GATEWAY_FREE_RECHARGE_HOURS", 5),
    sessionExpiryDays: envInt("GATEWAY_SESSION_EXPIRY_DAYS", 7),
    sessionPruneIntervalMinutes: envInt(
      "GATEWAY_SESSION_PRUNE_MINUTES",
      30,
    ),
    defaultCLITimeoutSeconds: envInt(
      "GATEWAY_CLI_TIMEOUT_SECONDS",
      120,
    ),
    databaseURL: envStr("DATABASE_URL"),
    redisURL: envStr("REDIS_URL", "redis://redis:6379"),
    maxMessageLength: envInt("GATEWAY_MAX_MESSAGE_LENGTH", 4000),
    telegramBotToken: envOptional("TELEGRAM_BOT_TOKEN"),
    telegramWebhookURL: envOptional("TELEGRAM_WEBHOOK_URL"),
  };
}
