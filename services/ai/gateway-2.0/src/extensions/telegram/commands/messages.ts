import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';
import { splitMessage } from '../utils.js';

const composer = new Composer<TelegramBotContext>();

composer.on('message:text', async (ctx) => {
  const messageText = ctx.message.text;
  if (messageText.startsWith('/')) return; // Skip commands

  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) { await ctx.reply('Error: Could not identify user.'); return; }

  if (!ctx.activeSession) {
    await ctx.reply('🔒 **Please login first**\n\nUse /login to start a session.\n\nNot registered? Use /start to register!', { parse_mode: 'Markdown' });
    return;
  }

  // Send processing indicator
  let processingMsgId: number | undefined;
  try {
    const msg = await ctx.reply('⏳ Processing your request...');
    processingMsgId = msg.message_id;
  } catch { /* continue */ }

  try {
    // Call processMessage directly (in-process, no HTTP!)
    const result = await ctx.gatewayAPI.processMessage({
      channelType: 'telegram',
      platformUserId: String(userId),
      platformChatId: String(chatId),
      message: messageText,
      metadata: { cliSessionId: ctx.activeSession.cliSessionId },
    });

    // Delete processing indicator
    if (processingMsgId) {
      ctx.api.deleteMessage(chatId, processingMsgId).catch(() => {});
    }

    // Split and send response
    const chunks = splitMessage(result.response);
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(chunk); // Fallback to plain text
      }
    }
  } catch (err) {
    // Delete processing indicator
    if (processingMsgId) {
      ctx.api.deleteMessage(chatId, processingMsgId).catch(() => {});
    }

    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes('No messages remaining')) {
      await ctx.reply(`⚠️ ${errMsg}\n\nUpgrade to Pro for unlimited messages.`, { parse_mode: 'Markdown' });
    } else if (errMsg.includes('blocked')) {
      await ctx.reply('⚠️ Your message was blocked by our safety system. Please rephrase your request.');
    } else if (errMsg.includes('still processing')) {
      await ctx.reply('⏳ Your previous message is still processing. Please wait...');
    } else {
      ctx.gatewayAPI.logger.error({ err, userId }, 'Message processing failed');
      await ctx.reply('⚠️ **Something went wrong**\n\nUnable to process your request. Please try again.\n\nIf this persists, use /refresh to reset your conversation.', { parse_mode: 'Markdown' });
    }
  }
});

// Handle non-text messages
composer.on('message', async (ctx) => {
  await ctx.reply('❓ I can only process text messages.\n\nUse /help to see available commands.');
});

export default composer;
