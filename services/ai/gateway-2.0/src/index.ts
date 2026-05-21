/**
 * Gateway 2.0 entry point.
 *
 * Loads configuration, initialises infrastructure connections,
 * starts the Fastify server, and handles graceful shutdown.
 */

import { loadConfig } from "./config.js";
import { createPool } from "./db/postgres.js";
import { createRedisClient } from "./db/redis.js";
import { createServer } from "./server.js";
import { startPipelineConsumer } from "./core/pipeline-consumer.js";
import { startDigestScheduler } from "./core/analysis/digest-scheduler.js";
import type { FastifyInstance } from "fastify";
import type { ErrorNotifier } from "./core/error-notifier.js";

async function main(): Promise<void> {
  // ---- Configuration ----
  const config = loadConfig();

  // We need a temporary logger before Fastify is up.
  // Fastify creates its own pino instance, so we use a lightweight
  // pino-compatible object for the bootstrap phase.
  const { default: pino } = await import("pino");
  const bootstrapLogger = pino({ level: process.env["LOG_LEVEL"] ?? "info" });

  bootstrapLogger.info(
    {
      port: config.port,
      maxConcurrent: config.maxConcurrent,
      defaultModel: config.defaultModel,
    },
    "Starting gateway-2.0",
  );

  // ---- Infrastructure ----
  const db = createPool(config.databaseURL, bootstrapLogger);
  const redis = createRedisClient(config.redisURL, bootstrapLogger);

  // Verify connectivity before accepting traffic
  try {
    await db.healthCheck();
    bootstrapLogger.info("PostgreSQL connection verified");
  } catch (err) {
    bootstrapLogger.fatal({ err }, "Failed to connect to PostgreSQL");
    process.exit(1);
  }

  try {
    await redis.healthCheck();
    bootstrapLogger.info("Redis connection verified");
  } catch (err) {
    bootstrapLogger.fatal({ err }, "Failed to connect to Redis");
    process.exit(1);
  }

  bootstrapLogger.info(
    {
      curatorModel: config.curatorModel,
      curatorSequentialBatches: config.curatorSequentialBatches,
      curatorVerboseLogs: config.curatorVerboseLogs,
      curatorLlmTimeoutMs: config.curatorLlmTimeoutMs,
      curatorMaxStories: config.curatorMaxStories,
      curatorMaxStoriesPerBatch: config.curatorMaxStoriesPerBatch,
      cursorApiKeyConfigured: config.cursorApiKeyConfigured,
    },
    "Memory curator / Cursor CLI bootstrap summary",
  );

  // ---- Validate cursor-agent CLI ----
  try {
    const { CLIExecutor } = await import("./core/cli/executor.js");
    const cliCheck = new CLIExecutor(config, bootstrapLogger as never);
    const available = await cliCheck.checkCLIAvailable();
    if (!available) {
      bootstrapLogger.error(
        "cursor-agent CLI not available or failed version check — bot messages will fail",
      );
    } else {
      bootstrapLogger.info("cursor-agent CLI validated");
    }
  } catch (err) {
    bootstrapLogger.error({ err }, "cursor-agent validation error");
  }

  // ---- Server ----
  let app: FastifyInstance | undefined;
  let errorNotifier: ErrorNotifier | undefined;
  let closePipelineConsumer: (() => Promise<void>) | undefined;
  let stopDigestScheduler: (() => void) | undefined;

  try {
    const result = await createServer({ config, db, redis });
    app = result.app;
    errorNotifier = result.errorNotifier;

    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`Gateway listening on port ${config.port}`);

    const consumer = await startPipelineConsumer({
      db: result.pool,
      redis: redis.redis,
      extensions: result.extensions,
      log: app.log,
      briefMode: config.smartDigestBriefBlend ? "blended" : "strict",
    });
    closePipelineConsumer = consumer.close;

    const telegramNotify = (config.telegramBotToken && config.telegramErrorChatId)
      ? buildSchedulerTelegramNotify(config.telegramBotToken, config.telegramErrorChatId)
      : undefined;

    const digestScheduler = startDigestScheduler({
      db: result.pool,
      redis: redis.redis,
      extensions: result.extensions,
      log: app.log,
      curatorModel: config.curatorModel,
      telegramNotify,
      curatorSequentialBatches: config.curatorSequentialBatches,
      curatorVerboseLogs: config.curatorVerboseLogs,
      curatorTelegramErrorMaxChars: config.curatorTelegramErrorMaxChars,
      curatorLlmTimeoutMs: config.curatorLlmTimeoutMs,
      curatorMaxStories: config.curatorMaxStories,
      curatorMaxStoriesPerBatch: config.curatorMaxStoriesPerBatch,
    });
    stopDigestScheduler = digestScheduler.stop;
  } catch (err) {
    const logger = app?.log ?? bootstrapLogger;
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }

  // ---- Process-level error handlers ----

  process.on("uncaughtException", (err) => {
    app?.log.fatal({ err }, "Uncaught exception");
    errorNotifier?.notify(err, { type: "UncaughtException" }).catch(() => {});
  });

  process.on("unhandledRejection", (reason) => {
    app?.log.error({ err: reason }, "Unhandled rejection");
    const err = reason instanceof Error ? reason : new Error(String(reason));
    errorNotifier?.notify(err, { type: "UnhandledRejection" }).catch(() => {});
  });

  // ---- Graceful shutdown ----
  const shutdown = async (signal: string): Promise<void> => {
    app!.log.info({ signal }, "Received shutdown signal");

    try {
      stopDigestScheduler?.();
    } catch (err) {
      app!.log.error({ err }, "Error stopping digest scheduler");
    }

    try {
      await closePipelineConsumer?.();
    } catch (err) {
      app!.log.error({ err }, "Error closing pipeline consumer");
    }

    try {
      await app!.close();
      app!.log.info("Fastify server closed");
    } catch (err) {
      app!.log.error({ err }, "Error closing Fastify server");
    }

    try {
      await redis.close();
    } catch {
      // already logged inside close()
    }

    try {
      await db.close();
    } catch {
      // already logged inside close()
    }

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

function buildSchedulerTelegramNotify(
  botToken: string,
  chatId: string,
): (msg: string) => Promise<void> {
  return async (msg: string) => {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
      });
    } catch {
      // Best-effort notification
    }
  };
}

main().catch((err: unknown) => {
  // Last-resort handler – if even bootstrap logging failed.
  // eslint-disable-next-line no-console
  console.error("Unhandled error during startup:", err);
  process.exit(1);
});
