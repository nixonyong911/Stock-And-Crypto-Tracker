import { Bot, webhookCallback } from 'grammy';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { BotContext } from './types/context.js';
import { config } from './config.js';
import { getDatabase } from './infrastructure/database.js';
import { getRedis } from './infrastructure/redis.js';
import { applyMiddleware, errorHandler, logger } from './middleware/index.js';

// Import composers
import startComposer from './composers/start.js';
import helpComposer from './composers/help.js';
import loginComposer from './composers/login.js';
import logoutComposer from './composers/logout.js';
import refreshComposer from './composers/refresh.js';
import statusComposer from './composers/status.js';
import messagesComposer from './composers/messages.js';

/**
 * Initialize and start the Telegram Bot 2.0
 */
async function main() {
  logger.info('Starting Telegram Bot 2.0...');

  // Initialize infrastructure
  const db = getDatabase();
  const redis = getRedis();

  // Check database connection
  const dbHealthy = await db.healthCheck();
  if (!dbHealthy) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }
  logger.info('Database connected');

  // Connect to Redis
  try {
    await redis.connect();
    const redisHealthy = await redis.healthCheck();
    if (!redisHealthy) {
      logger.warn('Redis health check failed, but continuing...');
    } else {
      logger.info('Redis connected');
    }
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Redis connection failed, continuing without Redis');
  }

  // Create bot instance
  const bot = new Bot<BotContext>(config.botToken);

  // Add infrastructure to context
  bot.use(async (ctx, next) => {
    ctx.db = db;
    ctx.redis = redis;
    ctx.telegramSession = null;
    return next();
  });

  // Apply middleware
  applyMiddleware(bot);

  // Register command composers (order matters - commands before general messages)
  bot.use(startComposer);
  bot.use(helpComposer);
  bot.use(loginComposer);
  bot.use(logoutComposer);
  bot.use(refreshComposer);
  bot.use(statusComposer);
  
  // Messages composer last (catches all text messages)
  bot.use(messagesComposer);

  // Error handler
  bot.catch((err) => {
    errorHandler(err.error as Error, err.ctx);
  });

  // Create Hono HTTP server
  const app = new Hono();

  // Health check endpoint
  app.get('/health', async (c) => {
    const dbHealthy = await db.healthCheck();
    const redisHealthy = await redis.healthCheck();

    const status = dbHealthy ? 'healthy' : 'unhealthy';
    const statusCode = dbHealthy ? 200 : 503;

    return c.json({
      status,
      service: 'telegram-bot-2.0',
      version: '2.0.0',
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    }, statusCode);
  });

  // Webhook endpoint
  app.post('/webhook', async (c) => {
    const handler = webhookCallback(bot, 'hono');
    return handler(c);
  });

  // Set webhook
  const webhookUrl = config.webhookUrl;
  try {
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    logger.info({ webhook_url: webhookUrl }, 'Webhook set');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to set webhook');
    // Continue anyway - webhook might already be set
  }

  // Start HTTP server
  const port = config.port;
  serve({
    fetch: app.fetch,
    port,
  });

  logger.info({ port }, 'HTTP server started');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    
    try {
      await bot.api.deleteWebhook();
      logger.info('Webhook deleted');
    } catch {
      // Ignore webhook deletion errors
    }

    await redis.close();
    await db.close();
    
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Telegram Bot 2.0 is ready!');
}

// Run
main().catch((error) => {
  logger.error({ error: error.message }, 'Failed to start bot');
  process.exit(1);
});
