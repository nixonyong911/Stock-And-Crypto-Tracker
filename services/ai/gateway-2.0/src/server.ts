/**
 * Fastify server factory.
 *
 * Creates and configures the Fastify instance with CORS, WebSocket support,
 * core services, the extension system, routes, middleware, and WebSocket
 * handlers.  The caller is responsible for calling `app.listen()`.
 */

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";

// Config
import type { GatewayConfig } from "./config.js";
import { Tier, getTierConfig, parseTier } from "./config.js";

// DB
import type { PostgresClient } from "./db/postgres.js";
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

// Extension system
import { ExtensionRegistry } from "./extension/registry.js";
import { createGatewayAPI } from "./extension/api.js";
import { loadExtensions } from "./extension/loader.js";

// Routes
import { registerHealthRoutes } from "./http/health.js";
import { registerChatRoutes } from "./http/chat.js";
import { registerSessionRoutes } from "./http/session.js";
import { registerUsageRoutes } from "./http/usage.js";
import { registerChannelRoutes } from "./http/channel.js";
import { registerAdminRoutes } from "./http/admin.js";

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
export async function createServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { config, db, redis } = deps;

  // ---- 1. Create Fastify instance ----

  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
    },
  });

  // ---- 2. Plugins ----

  await app.register(fastifyCors, {
    origin: true, // reflect request origin
  });

  await app.register(fastifyWebsocket);

  // ---- 3. Initialize core services ----

  const security = new SecurityService(config, db.pool, app.log);
  const usage = new UsageTracker(config, redis.redis, db.pool, app.log);
  const session = new SessionManager(config, db.pool, redis.redis, app.log);
  const queue = new QueueManager(config, app.log);
  const cli = new CLIExecutor(config, app.log);
  const filter = new OutputFilter(config, app.log);
  const keywordFilter = new KeywordFilter(db.pool, app.log);
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
      const result = await db.pool.query(
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
        // 7. Execute CLI
        const cliResult = await cli.execute({
          message: params.message,
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
    db: db.pool,
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
  });

  // ---- 8. Register middleware ----

  registerAuthMiddleware(app, config);
  registerLoggingMiddleware(app, db.pool);

  // ---- 9. Register HTTP routes ----

  registerHealthRoutes(app, db, redis, cli);
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
  registerSessionRoutes(app, session);
  registerUsageRoutes(app, usage);
  registerChannelRoutes(app, extensions);
  registerAdminRoutes(app, { metrics, queue, db: db.pool });

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

  return app;
}
