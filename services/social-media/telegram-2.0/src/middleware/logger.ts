import pino from 'pino';
import type { BotContext } from '../types/context.js';
import type { NextFunction } from 'grammy';

/**
 * Structured JSON logger
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Request logging middleware
 */
export async function loggerMiddleware(
  ctx: BotContext,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const hasMessage = !!ctx.message;

  logger.info({
    user_id: userId,
    chat_id: chatId,
    has_message: hasMessage,
    message_text: ctx.message?.text?.substring(0, 50),
  }, 'Incoming update');

  try {
    await next();
  } finally {
    const durationMs = Date.now() - startTime;
    logger.info({
      user_id: userId,
      chat_id: chatId,
      has_message: hasMessage,
      duration_ms: durationMs,
    }, 'Update processed');
  }
}
