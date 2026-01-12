import { Composer } from 'grammy';
import { v4 as uuidv4 } from 'uuid';
import type { BotContext } from '../types/context.js';
import { logger } from '../middleware/index.js';

const composer = new Composer<BotContext>();

/**
 * /refresh - Reset the cursor_chat_id UUID without full logout/login.
 * This starts a fresh AI conversation context.
 */
composer.command('refresh', async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  if (!ctx.telegramSession) {
    await ctx.reply(
      '❌ You are not logged in.\n\n' +
      'Use /login to start a session first.'
    );
    return;
  }

  try {
    const newCursorChatId = uuidv4();

    await ctx.db.execute(
      `UPDATE telegram_sessions 
       SET cursor_chat_id = $1
       WHERE telegram_user_id = $2 AND expires_at > NOW()`,
      newCursorChatId,
      userId
    );

    logger.info({
      user_id: userId,
      old_cursor_chat_id: ctx.telegramSession.cursor_chat_id,
      new_cursor_chat_id: newCursorChatId,
    }, 'Cursor chat ID refreshed');

    await ctx.reply(
      '🔄 **Conversation context refreshed!**\n\n' +
      'Your AI conversation has been reset.\n\n' +
      'Previous context has been cleared. ' +
      'You can now start a fresh conversation.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'Failed to refresh cursor chat ID');

    await ctx.reply('❌ Failed to refresh. Please try again later.');
  }
});

export default composer;
