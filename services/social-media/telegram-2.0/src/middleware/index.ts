import { Bot } from 'grammy';
import type { BotContext } from '../types/context.js';
import { loggerMiddleware } from './logger.js';
import { sessionMiddleware } from './session.js';
import { messageQueueMiddleware } from './message-queue.js';

/**
 * Compose and apply all middleware to the bot.
 * 
 * Order matters:
 * 1. Logger - logs all incoming updates
 * 2. Session - loads user session from database
 * 3. Message Queue - prevents concurrent processing per user
 */
export function applyMiddleware(bot: Bot<BotContext>): void {
  // Logger first - captures all requests
  bot.use(loggerMiddleware);
  
  // Session - loads from database
  bot.use(sessionMiddleware);
  
  // Message queue - prevents spam (only for non-command messages)
  bot.use(messageQueueMiddleware);
}

export { errorHandler } from './error-handler.js';
export { logger } from './logger.js';
export { checkRateLimit } from './rate-limiter.js';
