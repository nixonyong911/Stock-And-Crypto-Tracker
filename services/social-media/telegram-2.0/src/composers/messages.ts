import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';
import { logger } from '../middleware/index.js';
import { getAIHubClient } from '../services/ai-hub-client.js';
import { splitMessage } from '../utils/message-splitter.js';

const composer = new Composer<BotContext>();

/**
 * Handle regular text messages (not commands)
 */
composer.on('message:text', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const messageText = ctx.message.text;

  // Skip commands
  if (messageText.startsWith('/')) {
    return;
  }

  if (!userId || !chatId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  // Check for active session
  if (!ctx.telegramSession) {
    await ctx.reply(
      '🔒 **Please login first**\n\n' +
      'Use /login to start a session.\n\n' +
      'Not registered? Use /start to register!',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Update last active
  try {
    await ctx.db.execute(
      `UPDATE telegram_sessions 
       SET last_active_at = NOW()
       WHERE telegram_user_id = $1 AND telegram_chat_id = $2`,
      userId,
      chatId
    );
  } catch {
    // Ignore update errors
  }

  // Call AI Hub
  const aiClient = getAIHubClient();
  const sessionId = ctx.telegramSession.cursor_chat_id;

  logger.info({
    user_id: userId,
    message_length: messageText.length,
    cursor_chat_id: sessionId,
  }, 'Processing AI request');

  try {
    const response = await aiClient.chatWithProgress(
      ctx.api,
      chatId,
      messageText,
      sessionId
    );

    // Split long responses
    const chunks = splitMessage(response);

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: 'Markdown' });
      } catch {
        // If Markdown fails, try plain text
        await ctx.reply(chunk);
      }
    }

    logger.info({
      user_id: userId,
      response_length: response.length,
      chunks: chunks.length,
    }, 'AI response sent');
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'AI request failed');

    await ctx.reply(
      '⚠️ **Something went wrong**\n\n' +
      'Unable to process your request. Please try again.\n\n' +
      'If this persists, use /refresh to reset your conversation.',
      { parse_mode: 'Markdown' }
    );
  }
});

/**
 * Handle unknown commands
 */
composer.on('message', async (ctx) => {
  // This catches any other message types (photos, stickers, etc.)
  await ctx.reply(
    '❓ I can only process text messages.\n\n' +
    'Use /help to see available commands.',
    { parse_mode: 'Markdown' }
  );
});

export default composer;
