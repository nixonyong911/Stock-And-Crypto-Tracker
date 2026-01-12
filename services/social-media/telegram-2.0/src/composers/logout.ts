import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';
import { logger } from '../middleware/index.js';

const composer = new Composer<BotContext>();

composer.command('logout', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  if (!ctx.telegramSession) {
    await ctx.reply(
      '❌ You are not logged in.\n\n' +
      'Use /login to start a session.'
    );
    return;
  }

  try {
    const result = await ctx.db.execute(
      `DELETE FROM telegram_sessions 
       WHERE telegram_user_id = $1 AND telegram_chat_id = $2`,
      userId,
      chatId
    );

    const deleted = result.rowCount && result.rowCount > 0;

    if (deleted) {
      logger.info({ user_id: userId }, 'User logged out');
      await ctx.reply(
        '👋 **Logged out successfully!**\n\n' +
        'Your session has been ended.\n\n' +
        'Use /login to start a new session.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply('No active session found.');
    }
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'Logout failed');

    await ctx.reply('❌ Logout failed. Please try again later.');
  }
});

export default composer;
