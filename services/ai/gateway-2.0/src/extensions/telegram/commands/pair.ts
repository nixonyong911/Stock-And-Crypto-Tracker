import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';
import { PairingService } from '../../../core/pairing/service.js';

const composer = new Composer<TelegramBotContext>();
composer.command('pair', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) { await ctx.reply('Error: Could not identify user.'); return; }

  const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
  const code = args[0]?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    await ctx.reply(
      '🔗 **Pair your web account**\n\nUsage: `/pair <6-digit code>`\n\nGet your code from the dashboard at stockandcryptotracker.com/pair\n\nExample: `/pair 483291`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  try {
    const pairing = new PairingService(ctx.gatewayAPI.db, ctx.gatewayAPI.logger, ctx.gatewayAPI.config);

    const result = await pairing.pairChannel({
      code,
      platformUserId: String(userId),
      channelType: 'telegram',
      platformUsername: ctx.from?.username,
      displayName: ctx.from?.first_name ?? 'User',
    });

    if (!result.success) {
      switch (result.error) {
        case 'invalid_or_expired_code':
          await ctx.reply('❌ **Invalid or expired code**\n\nPlease generate a new code from the web dashboard.', { parse_mode: 'Markdown' });
          break;
        case 'telegram_already_paired':
          await ctx.reply(`⚠️ **Already paired**\n\nThis Telegram account is already linked to ${result.email}.`, { parse_mode: 'Markdown' });
          break;
        case 'web_already_paired':
          await ctx.reply('⚠️ **Account already paired**\n\nThis web account already has a Telegram account linked.', { parse_mode: 'Markdown' });
          break;
        case 'user_not_found':
          await ctx.reply('❌ Web account not found.', { parse_mode: 'Markdown' });
          break;
        default:
          await ctx.reply('❌ Pairing failed. Please try again.', { parse_mode: 'Markdown' });
      }
      return;
    }

    // Auto-create session after pairing
    await pairing.createSession({
      platformUserId: String(userId),
      platformChatId: String(chatId),
      channelType: 'telegram',
      clerkUserId: result.clerkUserId,
      tier: result.tier!,
      deviceInfo: { language_code: ctx.from?.language_code, chat_type: ctx.chat?.type },
    });

    const tierDisplay = String(result.tier).charAt(0).toUpperCase() + String(result.tier).slice(1);
    await ctx.reply(
      `✅ **Pairing successful!**\n\nLinked to: ${result.email}\nSubscription: ${tierDisplay}\n\nYou're logged in and ready to go! Ask me anything about stocks and crypto.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, 'Pairing failed');
    await ctx.reply('❌ **Pairing failed**\n\nAn unexpected error occurred. Please try again.', { parse_mode: 'Markdown' });
  }
});
export default composer;
