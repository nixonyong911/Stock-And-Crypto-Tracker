import type { BotContext } from '../types/context.js';
import { logger } from './logger.js';

/**
 * Global error handler middleware
 */
export async function errorHandler(
  err: Error,
  ctx: BotContext
): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  
  logger.error({
    error: err.message,
    stack: err.stack,
    user_id: userId,
    chat_id: chatId,
    has_message: !!ctx.message,
  }, 'Unhandled error in bot');

  try {
    await ctx.reply(
      '⚠️ Something went wrong. Please try again later.\n\n' +
      'If this persists, contact support.'
    );
  } catch (replyError) {
    logger.error({
      error: (replyError as Error).message,
      user_id: userId,
    }, 'Failed to send error message to user');
  }
}
