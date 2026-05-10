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
  readonly telegramErrorChatId: string | undefined;
  readonly dataFetcherInternalUrl: string;
  readonly phoneHashSalt: string;
  readonly frontendUrl: string;
  readonly internalServiceKey: string;
  readonly curatorModel: string;
  /** Default true: one LLM batch at a time to reduce parallel cursor-agent failures. */
  readonly curatorSequentialBatches: boolean;
  /** When true, memory curator logs larger stderr from cursor-agent. */
  readonly curatorVerboseLogs: boolean;
  /** Max error characters in Telegram FAILED lines (200–3500). */
  readonly curatorTelegramErrorMaxChars: number;
  /** Per-batch memory curator LLM timeout (ms), clamped 60s–15m. */
  readonly curatorLlmTimeoutMs: number;
  /** Max filtered-news rows per curation run (clamped 5–50). */
  readonly curatorMaxStories: number;
  /** Max stories per curator batch (clamped 3–20, capped by max stories). */
  readonly curatorMaxStoriesPerBatch: number;
  /** Whether CURSOR_API_KEY is set (for readiness / ops; value is never stored). */
  readonly cursorApiKeyConfigured: boolean;
  /**
   * Smart Digest brief composition mode.
   *  - `false` (default): strict — `whatHappening` only quotes signal-derived facts.
   *  - `true`: blended — may append a short DB-backed phrase from
   *    `analysis_market_memory.summary` when impact/affected-tickers gates pass.
   *  Sourced from env `SMART_DIGEST_BRIEF_BLEND`.
   */
  readonly smartDigestBriefBlend: boolean;
  /**
   * Maximum age (hours) for `analysis_market_memory` rows to be eligible
   * as Smart Digest context or blend material. Both the SQL fetchers and
   * the in-process `memoryPasses*Gate` checks consume this value through
   * `getMemoryFreshnessHours()`. Default 72; clamped 1–720 (30 days).
   * Sourced from env `SMART_DIGEST_MEMORY_FRESHNESS_HOURS`.
   */
  readonly smartDigestMemoryFreshnessHours: number;
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
      `Environment variable ${key} must be a valid integer, got "${raw}"`
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

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const v = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
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
    contextPath: envStr("GATEWAY_CONTEXT_PATH", "/app/agent-context"),
    tierHomesPath: envStr("GATEWAY_TIER_HOMES_PATH", "/app/tier-homes"),
    maxConcurrent: envInt("GATEWAY_MAX_CONCURRENT", 3),
    defaultModel: envStr("GATEWAY_DEFAULT_MODEL", "claude-4.5-sonnet"),
    freeMaxMessages: envInt("GATEWAY_FREE_MAX_MESSAGES", 5),
    freeRechargeHours: envInt("GATEWAY_FREE_RECHARGE_HOURS", 5),
    sessionExpiryDays: envInt("GATEWAY_SESSION_EXPIRY_DAYS", 7),
    sessionPruneIntervalMinutes: envInt("GATEWAY_SESSION_PRUNE_MINUTES", 30),
    defaultCLITimeoutSeconds: envInt("GATEWAY_CLI_TIMEOUT_SECONDS", 120),
    databaseURL: envStr("DATABASE_URL"),
    redisURL: envStr("REDIS_URL", "redis://redis:6379"),
    maxMessageLength: envInt("GATEWAY_MAX_MESSAGE_LENGTH", 4000),
    telegramBotToken: envOptional("TELEGRAM_BOT_TOKEN"),
    telegramWebhookURL: envOptional("TELEGRAM_WEBHOOK_URL"),
    telegramErrorChatId: envOptional("TELEGRAM_ERROR_CHAT_ID"),
    dataFetcherInternalUrl: envOptional("DATA_FETCHER_INTERNAL_URL") ?? "http://data-fetcher-2.0:8080",
    phoneHashSalt: envStr("PHONE_HASH_SALT", ""),
    frontendUrl: envStr("FRONTEND_URL", "https://stockandcryptotracker.com"),
    internalServiceKey: envStr("INTERNAL_SERVICE_KEY", ""),
    curatorModel: envStr("CURATOR_MODEL", "claude-4.6-sonnet-medium-thinking"),
    curatorSequentialBatches: envBool("CURATOR_SEQUENTIAL_BATCHES", true),
    curatorVerboseLogs: envBool("CURATOR_VERBOSE_LOGS", false),
    curatorTelegramErrorMaxChars: Math.min(
      3500,
      Math.max(200, envInt("CURATOR_TELEGRAM_ERROR_MAX_CHARS", 2000)),
    ),
    curatorLlmTimeoutMs: Math.min(
      900_000,
      Math.max(60_000, envInt("CURATOR_LLM_TIMEOUT_MS", 360_000)),
    ),
    curatorMaxStories: Math.min(
      50,
      Math.max(5, envInt("CURATOR_MAX_STORIES", 25)),
    ),
    curatorMaxStoriesPerBatch: Math.min(
      20,
      Math.max(3, envInt("CURATOR_MAX_STORIES_PER_BATCH", 10)),
    ),
    cursorApiKeyConfigured: Boolean(envOptional("CURSOR_API_KEY")),
    smartDigestBriefBlend: envBool("SMART_DIGEST_BRIEF_BLEND", false),
    smartDigestMemoryFreshnessHours: Math.min(
      720,
      Math.max(1, envInt("SMART_DIGEST_MEMORY_FRESHNESS_HOURS", 72)),
    ),
  };
}
