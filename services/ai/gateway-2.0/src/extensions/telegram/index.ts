import { Bot, webhookCallback as _webhookCallback } from 'grammy';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IChannelExtension, GatewayAPI } from '../../extension/types.js';
import { getTelegramConfig, type TelegramConfig } from './config.js';
import { createBot, type TelegramBotContext } from './bot.js';

// Middleware
import { dedupMiddleware } from './middleware/dedup.js';
import { sessionMiddleware } from './middleware/session.js';

// Commands
import startComposer from './commands/start.js';
import helpComposer from './commands/help.js';
import loginComposer from './commands/login.js';
import logoutComposer from './commands/logout.js';
import refreshComposer from './commands/refresh.js';
import statusComposer from './commands/status.js';
import pairComposer from './commands/pair.js';
import messagesComposer from './commands/messages.js';

export function createTelegramExtension(): IChannelExtension {
  let bot: Bot<TelegramBotContext> | null = null;
  let api: GatewayAPI | null = null;
  let telegramConfig: TelegramConfig | null = null;

  return {
    id: 'telegram',
    meta: {
      label: 'Telegram',
      description: 'Telegram Bot channel via grammY',
      aliases: ['tg'],
    },
    capabilities: {
      chatTypes: ['direct'],
      media: false,
      streaming: false,
    },

    async start(gatewayAPI: GatewayAPI): Promise<void> {
      api = gatewayAPI;
      telegramConfig = getTelegramConfig(gatewayAPI.config);
      bot = createBot(telegramConfig.botToken);

      // Inject gateway API and config into every context
      bot.use(async (ctx, next) => {
        ctx.gatewayAPI = api!;
        ctx.telegramConfig = telegramConfig!;
        ctx.activeSession = null;
        return next();
      });

      // Middleware
      bot.use(dedupMiddleware);
      bot.use(sessionMiddleware);

      // Commands (order matters - commands before messages)
      bot.use(startComposer);
      bot.use(helpComposer);
      bot.use(loginComposer);
      bot.use(logoutComposer);
      bot.use(refreshComposer);
      bot.use(statusComposer);
      bot.use(pairComposer);
      bot.use(messagesComposer);

      // Error handler
      bot.catch((err) => {
        api?.logger.error({ err: err.error, update: err.ctx?.update?.update_id }, 'Telegram bot error');
      });

      // Set webhook
      try {
        await bot.api.setWebhook(telegramConfig.webhookUrl, {
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true,
        });
        api.logger.info({ webhookUrl: telegramConfig.webhookUrl }, 'Telegram webhook set');
      } catch (err) {
        api.logger.error({ err }, 'Failed to set Telegram webhook');
      }

      api.logger.info('Telegram extension started');
    },

    async stop(): Promise<void> {
      if (bot) {
        try { await bot.api.deleteWebhook(); } catch { /* ignore */ }
        bot = null;
      }
      api?.logger.info('Telegram extension stopped');
    },

    async sendText(params): Promise<{ ok: boolean }> {
      if (!bot) return { ok: false };
      try {
        await bot.api.sendMessage(Number(params.platformChatId), params.text, {
          parse_mode: (params.parseMode as 'Markdown' | 'HTML') ?? 'Markdown',
        });
        return { ok: true };
      } catch (err) {
        api?.logger.error({ err, chatId: params.platformChatId }, 'Failed to send Telegram message');
        return { ok: false };
      }
    },

    async sendProcessingIndicator(params): Promise<{ messageId?: string }> {
      if (!bot) return {};
      try {
        const msg = await bot.api.sendMessage(Number(params.platformChatId), '⏳ Processing your request...');
        return { messageId: String(msg.message_id) };
      } catch {
        return {};
      }
    },

    async deleteMessage(params): Promise<void> {
      if (!bot) return;
      try {
        await bot.api.deleteMessage(Number(params.platformChatId), Number(params.messageId));
      } catch { /* ignore */ }
    },

    registerRoutes(fastify: FastifyInstance): void {
      // Webhook endpoint: POST /webhook
      // Caddy's handle_path strips the /telegram prefix, so Telegram sends
      // POST /telegram/webhook → Caddy forwards POST /webhook here.
      fastify.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!bot) return reply.status(503).send({ error: 'Telegram extension not started' });
        try {
          // Use handleUpdate directly with the parsed body
          await bot.handleUpdate(request.body as Parameters<typeof bot.handleUpdate>[0]);
          return reply.send({ ok: true });
        } catch (err) {
          api?.logger.error({ err }, 'Webhook handler error');
          return reply.status(500).send({ error: 'Webhook processing failed' });
        }
      });
    },
  };
}
