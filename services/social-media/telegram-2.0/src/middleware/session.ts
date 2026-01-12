import type { NextFunction } from 'grammy';
import type { BotContext } from '../types/context.js';
import type { TelegramSessionRow } from '../types/session.js';
import { logger } from './logger.js';

/**
 * Session middleware - loads active session from database
 */
export async function sessionMiddleware(
  ctx: BotContext,
  next: NextFunction
): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    ctx.telegramSession = null;
    return next();
  }

  try {
    const session = await ctx.db.fetchOne<TelegramSessionRow>(
      `SELECT s.*, u.display_name, u.telegram_username
       FROM telegram_sessions s
       JOIN telegram_users u ON s.user_id = u.id
       WHERE s.telegram_user_id = $1 
         AND s.telegram_chat_id = $2 
         AND s.expires_at > NOW()`,
      userId,
      chatId
    );

    ctx.telegramSession = session;

    if (session) {
      logger.debug({
        user_id: userId,
        session_id: session.id,
        cursor_chat_id: session.cursor_chat_id,
      }, 'Session loaded');
    }
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'Failed to load session');
    ctx.telegramSession = null;
  }

  return next();
}
