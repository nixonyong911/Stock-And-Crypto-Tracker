import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';
import type { TelegramUserRow } from '../types/session.js';

const composer = new Composer<BotContext>();

composer.command('status', async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  // Check if user is registered
  const user = await ctx.db.fetchOne<TelegramUserRow>(
    'SELECT * FROM telegram_users WHERE telegram_user_id = $1',
    userId
  );

  if (!user) {
    await ctx.reply(
      '📊 **Status: Not Registered**\n\n' +
      'You have not registered yet.\n\n' +
      'Use /start to register.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (!ctx.telegramSession) {
    await ctx.reply(
      '📊 **Status: Registered but Not Logged In**\n\n' +
      `👤 User: ${user.display_name}\n` +
      `📝 Username: @${user.telegram_username || 'not set'}\n\n` +
      'Use /login to start a session.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const session = ctx.telegramSession;
  const expiresAt = new Date(session.expires_at);
  const now = new Date();
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  await ctx.reply(
    '📊 **Status: Active Session**\n\n' +
    `👤 User: ${session.display_name || user.display_name}\n` +
    `📝 Username: @${session.telegram_username || user.telegram_username || 'not set'}\n\n` +
    `🔑 Session ID: \`${session.session_token.substring(0, 8)}...\`\n` +
    `🤖 AI Context: \`${session.cursor_chat_id?.substring(0, 8) || 'none'}...\`\n` +
    `⏰ Expires: ${expiresAt.toLocaleDateString()} (${daysRemaining} days)\n` +
    `📅 Last Active: ${new Date(session.last_active_at).toLocaleString()}\n\n` +
    '✅ You can ask me financial questions!',
    { parse_mode: 'Markdown' }
  );
});

export default composer;
