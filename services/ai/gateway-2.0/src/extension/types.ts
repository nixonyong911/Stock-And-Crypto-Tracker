/**
 * Extension system type definitions.
 *
 * Defines the contracts for channel extensions (Telegram, Discord, etc.)
 * and the GatewayAPI surface they receive to interact with gateway core.
 */

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { GatewayConfig } from '../config.js';
import type { ErrorNotifier } from '../core/error-notifier.js';

// Re-export Tier from the canonical source so extension authors can import
// from a single module.
export { Tier } from '../config.js';
export type { GatewayConfig } from '../config.js';

// Also re-export as a convenience string union for contexts where the enum
// feels heavy. The enum values ARE these strings, so they're interchangeable.
import { Tier } from '../config.js';

// ---------------------------------------------------------------------------
// Channel extension
// ---------------------------------------------------------------------------

/** Channel extension interface – implemented by each channel (Telegram, Discord, etc.) */
export interface IChannelExtension {
  /** Unique channel identifier (e.g. "telegram", "discord") */
  readonly id: string;

  /** Channel metadata */
  readonly meta: {
    readonly label: string;
    readonly description: string;
    readonly aliases?: readonly string[];
  };

  /** Channel capabilities */
  readonly capabilities: {
    readonly chatTypes: readonly ('direct' | 'group')[];
    readonly media?: boolean;
    readonly streaming?: boolean;
  };

  /** Start the channel (connect to platform, set up webhooks, etc.) */
  start(api: GatewayAPI): Promise<void>;

  /** Stop the channel gracefully */
  stop(): Promise<void>;

  /** Send a text message to a chat on this channel */
  sendText(params: {
    platformChatId: string;
    text: string;
    parseMode?: string;
  }): Promise<{ ok: boolean }>;

  /** Send a processing indicator (e.g., "Processing your request…") */
  sendProcessingIndicator?(params: {
    platformChatId: string;
  }): Promise<{ messageId?: string }>;

  /** Send a photo (image buffer) to a chat on this channel */
  sendPhoto?(params: {
    platformChatId: string;
    photo: Buffer;
    caption?: string;
    parseMode?: string;
    replyMarkup?: unknown;
  }): Promise<{ ok: boolean }>;

  /** Delete a message on this channel */
  deleteMessage?(params: {
    platformChatId: string;
    messageId: string;
  }): Promise<void>;

  /** Validate channel-specific configuration */
  validateConfig?(config: Record<string, unknown>): boolean;

  /** Register HTTP routes (e.g., webhook endpoints) */
  registerRoutes?(fastify: FastifyInstance): void;
}

// ---------------------------------------------------------------------------
// Gateway API (passed to extensions)
// ---------------------------------------------------------------------------

/** API object passed to extensions – gives them access to gateway core functionality */
export interface GatewayAPI {
  /**
   * Process an inbound message through the gateway pipeline
   * (security → usage → queue → CLI → filter → response).
   */
  processMessage(params: {
    channelType: string;
    platformUserId: string;
    platformChatId: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ response: string; sessionId: string }>;

  /** Database pool */
  readonly db: Pool;

  /** Redis client */
  readonly redis: Redis;

  /** Logger */
  readonly logger: FastifyBaseLogger;

  /** Gateway configuration */
  readonly config: GatewayConfig;

  /** Emit an event to the WebSocket control plane */
  emit(event: string, payload: unknown): void;

  /** Get active session for a user */
  getSession(userId: string): Promise<GatewaySession | null>;

  /** Resolve a user's subscription tier */
  resolveUserTier(platformUserId: string, channelType: string): Promise<Tier>;

  /** Error notifier for critical errors (may be undefined if not configured) */
  readonly errorNotifier?: ErrorNotifier;
}

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

/** Gateway session (from unified gateway_sessions table) */
export interface GatewaySession {
  id: string;
  clerkUserId: string | null;
  channelType: string;
  platformUserId: string;
  platformChatId: string;
  cliSessionId: string;
  tier: Tier;
  deviceInfo: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}

/** Channel account (from unified channel_accounts table) */
export interface ChannelAccount {
  id: string;
  clerkUserId: string | null;
  channelType: string;
  platformUserId: string;
  platformUsername: string | null;
  displayName: string | null;
  pairedAt: Date | null;
  createdAt: Date;
}
