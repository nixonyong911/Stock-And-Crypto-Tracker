import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('help', async (ctx) => {
  await ctx.reply(
    '📚 **Stock Tracker Bot Help**\n\n**Commands:**\n/start - Register or welcome back\n/login - Start a new session (7 days)\n/logout - End your current session\n/refresh - Reset your AI conversation context\n/status - Check your session status\n/pair <code> - Link your web account\n/help - Show this help message\n\n**How to use:**\n1. Register with /start\n2. Login with /login\n3. Ask questions about stocks and crypto!\n\n**Tips:**\n• Use /refresh to start a fresh conversation\n• Wait for responses before sending more messages\n• Sessions expire after 7 days',
    { parse_mode: 'Markdown' }
  );
});
export default composer;
