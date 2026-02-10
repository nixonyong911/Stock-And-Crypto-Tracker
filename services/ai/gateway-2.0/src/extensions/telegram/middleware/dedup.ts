import type { NextFunction } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

export async function dedupMiddleware(ctx: TelegramBotContext, next: NextFunction): Promise<void> {
  // Only dedup text messages (not commands)
  if (!ctx.message?.text || ctx.message.text.startsWith('/')) return next();

  const messageId = ctx.message?.message_id;
  if (!messageId) return next();

  try {
    const key = `msg:${messageId}:seen`;
    const result = await ctx.gatewayAPI.redis.set(key, '1', 'EX', 600, 'NX');
    if (!result) {
      // Duplicate - ignore silently
      ctx.gatewayAPI.logger.debug({ messageId }, 'Duplicate webhook ignored');
      return;
    }
  } catch {
    // On error, process anyway (graceful degradation)
  }
  return next();
}
