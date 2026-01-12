import type { Context } from 'grammy';
import type { DatabaseContext } from '../infrastructure/database.js';
import type { RedisClient } from '../infrastructure/redis.js';
import type { TelegramSessionRow } from './session.js';

/**
 * Extended bot context with custom properties
 */
export interface BotContext extends Context {
  // Infrastructure
  db: DatabaseContext;
  redis: RedisClient;
  
  // Session (populated by session middleware)
  telegramSession: TelegramSessionRow | null;
  
  // User state (for registration flow)
  pendingRegister?: boolean;
}
