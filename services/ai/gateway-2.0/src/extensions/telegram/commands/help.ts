import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('help', async (ctx) => {
  await ctx.reply(
    '📚 **Stock Tracker Bot Help**\n\n**Getting started:**\n1. Pair your account at stockandcryptotracker.com/pair\n2. Login with /login\n3. Ask questions about stocks and crypto!\n\n**Commands:**\n/start - Register or pair via deep link\n/pair <code> - Link your web account with a 6-digit code\n/login - Start a new session\n/logout - End your current session\n/refresh - Reset your AI conversation context\n/status - Check your session status\n/add <symbol> [type] - Track a ticker (stock, etf, crypto)\n/remove <symbol> - Stop tracking a ticker\n/help - Show this help message\n\n**Examples:**\n`/add AAPL` — track a stock\n`/add BTC crypto` — track a cryptocurrency\n`/remove AAPL` — stop tracking\n\n**Tips:**\n• Use /refresh to start a fresh conversation\n• Wait for responses before sending more messages\n• Sessions expire after 7 days',
    { parse_mode: 'Markdown' }
  );
});
export default composer;
