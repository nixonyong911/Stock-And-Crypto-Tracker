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
    });
    closePipelineConsumer = consumer.close;

    const digestScheduler = startDigestScheduler({
      db: result.pool,
      redis: redis.redis,
      extensions: result.extensions,
      log: app.log,
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

main().catch((err: unknown) => {
  // Last-resort handler – if even bootstrap logging failed.
  // eslint-disable-next-line no-console
  console.error("Unhandled error during startup:", err);
  process.exit(1);
});
