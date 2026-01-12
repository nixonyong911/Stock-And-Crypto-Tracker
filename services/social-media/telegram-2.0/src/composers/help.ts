import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';

const composer = new Composer<BotContext>();

composer.command('help', async (ctx) => {
  await ctx.reply(
    '📚 **Stock Tracker Bot Help**\n\n' +
    '**Commands:**\n' +
    '/start - Register or welcome back\n' +
    '/login - Start a new session (7 days)\n' +
    '/logout - End your current session\n' +
    '/refresh - Reset your AI conversation context\n' +
    '/status - Check your session status\n' +
    '/help - Show this help message\n\n' +
    '**How to use:**\n' +
    '1. Register with /start\n' +
    '2. Login with /login\n' +
    '3. Ask questions about stocks and crypto!\n\n' +
    '**Example questions:**\n' +
    '• "What are today\'s bullish patterns?"\n' +
    '• "Show me recent candlestick analysis"\n' +
    '• "What stocks should I watch today?"\n\n' +
    '**Tips:**\n' +
    '• Use /refresh to start a fresh conversation\n' +
    '• Wait for responses before sending more messages\n' +
    '• Sessions expire after 7 days',
    { parse_mode: 'Markdown' }
  );
});

export default composer;
