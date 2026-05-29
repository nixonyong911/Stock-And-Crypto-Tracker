/**
 * Fastify server factory.
 *
 * Creates and configures the Fastify instance with CORS, WebSocket support,
 * core services, the extension system, routes, middleware, and WebSocket
 * handlers.  The caller is responsible for calling `app.listen()`.
 */

import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";

// Config
import type { GatewayConfig } from "./config.js";
import { Tier, getTierConfig, parseTier } from "./config.js";

// DB
import type { PostgresClient } from "./db/postgres.js";
import { withQueryRetry } from "./db/postgres.js";
import type { RedisClient } from "./db/redis.js";

// Core services
import { SecurityService } from "./core/security/service.js";
import { UsageTracker } from "./core/usage/tracker.js";
import { SessionManager } from "./core/session/manager.js";
import { QueueManager } from "./core/queue/manager.js";
import { CLIExecutor } from "./core/cli/executor.js";
import { OutputFilter } from "./core/filter/filter.js";
import { KeywordFilter } from "./core/filter/keyword-filter.js";
import { MetricsCollector } from "./core/metrics/collector.js";
import { logMessage } from "./core/logging/conversation-logger.js";

// Extension system
import { ExtensionRegistry } from "./extension/registry.js";
import { createGatewayAPI } from "./extension/api.js";
import { loadExtensions } from "./extension/loader.js";

// Error notification
import { ErrorNotifier } from "./core/error-notifier.js";

// Routes
import { registerHealthRoutes } from "./http/health.js";
import { registerChatRoutes } from "./http/chat.js";
import { registerSessionRoutes } from "./http/session.js";
import { registerUsageRoutes } from "./http/usage.js";
import { registerChannelRoutes } from "./http/channel.js";
import { registerAdminRoutes } from "./http/admin.js";
import { registerRecommendationRoutes } from "./http/recommendations.js";

// Middleware
import { registerAuthMiddleware } from "./middleware/auth.js";
import { registerLoggingMiddleware } from "./middleware/logging.js";

// WebSocket
import { WebSocketServer } from "./ws/server.js";
import { registerWSHandlers } from "./ws/handlers/index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ServerDeps {
  config: GatewayConfig;
  db: PostgresClient;
  redis: RedisClient;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Build and return a fully-configured Fastify instance.
 *
 * The caller is responsible for calling `fastify.listen()`.
 */
export interface ServerResult {
  app: FastifyInstance;
  errorNotifier?: ErrorNotifier;
  extensions: ExtensionRegistry;
  pool: import("pg").Pool;
}

export async function createServer(deps: ServerDeps): Promise<ServerResult> {
  const { config, db, redis } = deps;

  // ---- 1. Create Fastify instance ----

  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
    },
  });

  // ---- 1b. Error notifier (Telegram group alerts) ----

  let errorNotifier: ErrorNotifier | undefined;
  if (config.telegramBotToken && config.telegramErrorChatId) {
    errorNotifier = new ErrorNotifier({
      botToken: config.telegramBotToken,
      chatId: config.telegramErrorChatId,
    });
    app.log.info("Error notifier enabled (Telegram group)");
  }

  // ---- 1c. Fastify error handler ----

  app.setErrorHandler(async (error, request, reply) => {
    app.log.error({ err: error, url: request.url, method: request.method }, "Unhandled route error");

    if (errorNotifier) {
      const userId = (request as unknown as Record<string, unknown>).userId as string | undefined;
      const body = request.body as Record<string, unknown> | undefined;
      const userMessage = typeof body?.message === "string" ? body.message : undefined;

      errorNotifier.notify(error, {
        type: "UnhandledRouteError",
        route: request.url,
        method: request.method,
        user: userId ?? "N/A",
        userMessage,
      }).catch(() => {});
    }

    return reply.status(500).send({ error: "Internal server error" });
  });

  // ---- 2. Plugins ----

  await app.register(fastifyCors, {
    origin: true, // reflect request origin
  });

  await app.register(fastifyWebsocket);

  // ---- 3. Initialize core services ----

  const pool = withQueryRetry(db.pool, app.log);

  const security = new SecurityService(config, pool, app.log);
  const usage = new UsageTracker(config, redis.redis, pool, app.log);
  const session = new SessionManager(config, pool, redis.redis, app.log);
  const queue = new QueueManager(config, app.log);
  const cli = new CLIExecutor(config, app.log);
  const filter = new OutputFilter(config, app.log);
  const keywordFilter = new KeywordFilter(pool, app.log);
  const metrics = new MetricsCollector();

  // ---- 4. Initialize extension system ----

  const extensions = new ExtensionRegistry(app.log);
  await loadExtensions(extensions, app.log);

  // ---- 5. Core message pipeline ----

  async function resolveUserTier(
    platformUserId: string,
    channelType: string
  ): Promise<Tier> {
    try {
      const result = await pool.query(
        `SELECT u.tier FROM channel_accounts ca
         JOIN users u ON u.clerk_user_id = ca.clerk_user_id
         WHERE ca.platform_user_id = $1 AND ca.channel_type = $2 AND ca.clerk_user_id IS NOT NULL`,
        [platformUserId, channelType]
      );
      if (result.rows[0]?.tier) return parseTier(result.rows[0].tier);
    } catch {
      // Fall through to default
    }
    return Tier.Free;
  }

  async function processMessage(params: {
    channelType: string;
    platformUserId: string;
    platformChatId: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ response: string; sessionId: string }> {
    // Emit processing event
    wsServer.broadcast("chat.processing", {
      channelType: params.channelType,
      platformUserId: params.platformUserId,
    });

    // Trace id ties the inbound log row to its outbound row(s). Generated once
    // per turn here (the single channel-agnostic chokepoint). Allow an upstream
    // override for future cross-service correlation.
    const traceId =
      (typeof params.metadata?.["traceId"] === "string"
        ? (params.metadata["traceId"] as string)
        : undefined) ?? randomUUID();

    // 1. Resolve tier (needed before security check for tier-aware rules)
    const tier = await resolveUserTier(
      params.platformUserId,
      params.channelType
    );

    // 2. Security check (tier-aware: e.g. slash commands blocked for non-DEV)
    const secCheck = security.check(params.message, parseTier(tier));
    if (secCheck.blocked) {
      wsServer.broadcast("security.blocked", {
        userId: params.platformUserId,
        channelType: params.channelType,
        reason: secCheck.reason,
      });
      security
        .logBlock({
          userId: params.platformUserId,
          channelType: params.channelType,
          messagePreview: params.message.slice(0, 200),
          detectionType: secCheck.reason.includes("CLI command")
            ? "cli_command_injection"
            : "injection",
        })
        .catch(() => {});
      throw new Error(`Message blocked: ${secCheck.reason}`);
    }

    // 2.5. Sensitive keyword filter (skip for DEV tier)
    if (parseTier(tier) !== Tier.Dev) {
      const kwCheck = keywordFilter.check(params.message);
      if (kwCheck.blocked) {
        keywordFilter
          .logViolation({
            userId: params.platformUserId,
            channelType: params.channelType,
            messageText: params.message,
            matchedKeyword: kwCheck.matchedKeyword,
          })
          .catch(() => {});
        throw new Error(`blocked:sensitive_keyword:${kwCheck.matchedKeyword}`);
      }
    }

    // 3. Usage check (free tier)
    if (tier === "free") {
      const { remaining } = await usage.checkAndConsume(
        params.platformUserId,
        params.channelType
      );
      if (remaining < 0) {
        const info = await usage.getUsageInfo(params.platformUserId);
        throw new Error(
          `No messages remaining. Next recharge: ${
            info.nextRechargeAt?.toISOString() ?? "unknown"
          }`
        );
      }
    }

    // 4. Get or create session
    // Tier on existing sessions is kept in sync by a DB trigger on users.tier.
    let sess = await session.getActiveSession(
      params.platformUserId,
      params.channelType
    );
    if (!sess) {
      sess = await session.createSession({
        platformUserId: params.platformUserId,
        platformChatId: params.platformChatId,
        channelType: params.channelType,
      });
    }

    // 5. Acquire user lock
    const unlock = await session.acquireUserLock(
      params.platformUserId,
      getTierConfig(parseTier(tier)).cliTimeoutSeconds * 1000
    );
    try {
      // 6. Enter priority queue
      const release = await queue.enqueue(parseTier(tier));
      try {
        // 7. Resolve user timezone and prepend context
        let messageWithContext = params.message;
        if (sess.clerkUserId) {
          try {
            const cacheKey = `user:tz:${sess.clerkUserId}`;
            let userTz = await redis.redis.get(cacheKey);
            if (!userTz) {
              const tzResult = await pool.query<{ timezone: string }>(
                "SELECT timezone FROM users WHERE clerk_user_id = $1",
                [sess.clerkUserId],
              );
              userTz = tzResult.rows[0]?.timezone ?? "UTC";
              await redis.redis.set(cacheKey, userTz, "EX", 3600);
            }
            if (userTz !== "UTC") {
              const now = new Date();
              const localTime = now.toLocaleString("en-US", {
                timeZone: userTz,
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              messageWithContext = `[Context: User timezone is ${userTz}. Current local time: ${localTime}]\n\n${params.message}`;
            }
          } catch (tzErr) {
            app.log.warn({ err: tzErr }, "Failed to resolve user timezone");
          }
        }

        // Log the inbound message (what is sent to the agent). Best-effort —
        // written here, after all guards pass, so only messages that actually
        // reach the agent are recorded.
        logMessage(pool, app.log, {
          traceId,
          direction: "inbound",
          channel: params.channelType,
          externalUserId: params.platformUserId,
          clerkUserId: sess.clerkUserId,
          sessionId: sess.cliSessionId,
          messageText: params.message,
        }).catch(() => {});

        // 8. Execute CLI
        const cliResult = await cli.execute({
          message: messageWithContext,
          contextPath: config.contextPath,
          model: config.defaultModel,
          sessionId: sess.cliSessionId,
          tier,
          homePath: `${config.tierHomesPath}/${tier}`,
          timeoutMs: getTierConfig(parseTier(tier)).cliTimeoutSeconds * 1000,
        });

        if (!cliResult.success) {
          throw new Error("AI processing failed");
        }

        // 8. Filter output
        const filtered = filter.apply(cliResult.output, parseTier(tier));

        // Log the outbound reply (generated reply prepared for send). This
        // records that the system produced a reply, NOT that the channel/
        // provider confirmed delivery (the actual send happens downstream).
        logMessage(pool, app.log, {
          traceId,
          direction: "outbound",
          channel: params.channelType,
          externalUserId: params.platformUserId,
          clerkUserId: sess.clerkUserId,
          sessionId: sess.cliSessionId,
          messageText: filtered,
        }).catch(() => {});

        // 9. Update session activity
        session.updateLastActive(String(sess.id));

        // Emit completion event
        wsServer.broadcast("chat.complete", {
          channelType: params.channelType,
          platformUserId: params.platformUserId,
          responseLength: filtered.length,
          executionTimeMs: cliResult.executionTimeMs,
        });

        return { response: filtered, sessionId: sess.cliSessionId };
      } finally {
        release();
      }
    } finally {
      await unlock();
    }
  }

  // ---- 6. WebSocket server (must be created before gatewayAPI) ----

  const wsServer = new WebSocketServer(app.log);

  // ---- 7. Create GatewayAPI and pass to extensions ----

  const gatewayAPI = createGatewayAPI({
    db: pool,
    redis: redis.redis,
    logger: app.log,
    config,
    processMessage,
    getSession: async (userId) => {
      const sess = await session.getActiveSession(userId, "telegram");
      if (!sess) return null;
      return { ...sess, tier: parseTier(sess.tier) };
    },
    resolveUserTier,
    emit: (event, payload) => wsServer.broadcast(event, payload),
    errorNotifier,
  });

  // ---- 8. Register middleware ----

  registerAuthMiddleware(app, config);
  registerLoggingMiddleware(app, pool);

  // ---- 9. Register HTTP routes ----

  registerHealthRoutes(app, db, redis, cli, config);
  registerChatRoutes(app, {
    config,
    security,
    usage,
    session,
    queue,
    cli,
    filter,
    metrics,
  });
  registerSessionRoutes(app, session, { redis: redis.redis, db: pool });
  registerUsageRoutes(app, usage);
  registerChannelRoutes(app, extensions);
  registerAdminRoutes(app, { metrics, queue, db: pool });
  registerRecommendationRoutes(app, { config, db: pool, redis: redis.redis, extensions });

  // ---- 10. Extension routes (webhooks) ----

  extensions.registerAllRoutes(app);

  // ---- 11. WebSocket setup ----

  registerWSHandlers(wsServer, {
    session,
    usage,
    metrics,
    queue,
    extensions,
  });
  wsServer.register(app);

  // ---- 12. Start extensions ----

  await extensions.startAll(gatewayAPI);

  // ---- 13. Start session pruner ----

  session.startPruner();

  // ---- 14. Periodic metrics broadcast (every 30s) ----

  const metricsBroadcastInterval = setInterval(() => {
    try {
      wsServer.broadcast("metrics.update", {
        metrics: metrics.snapshot(),
        queue: queue.stats(),
        wsClients: wsServer.clientCount,
        extensions: extensions.listIds(),
      });
    } catch {
      // Ignore broadcast errors
    }
  }, 30_000);

  // ---- 15. Shutdown hook ----

  app.addHook("onClose", async () => {
    clearInterval(metricsBroadcastInterval);
    await extensions.stopAll();
    session.stopPruner();
    queue.stop();
  });

  // ---- 15. Return fully-configured app ----

  return { app, errorNotifier, extensions, pool };
}
