import type { FastifyInstance } from 'fastify';
import type { SecurityService } from '../core/security/service.js';
import type { UsageTracker } from '../core/usage/tracker.js';
import type { SessionManager } from '../core/session/manager.js';
import type { QueueManager } from '../core/queue/manager.js';
import type { CLIExecutor } from '../core/cli/executor.js';
import type { OutputFilter } from '../core/filter/filter.js';
import type { MetricsCollector } from '../core/metrics/collector.js';
import type { GatewayConfig } from '../config.js';
import { parseTier, getTierConfig } from '../config.js';

interface ChatBody {
  message: string;
  user_id: string;
  session_id?: string;
  tier?: string;
  channel_type?: string;
}

export function registerChatRoutes(
  app: FastifyInstance,
  deps: {
    config: GatewayConfig;
    security: SecurityService;
    usage: UsageTracker;
    session: SessionManager;
    queue: QueueManager;
    cli: CLIExecutor;
    filter: OutputFilter;
    metrics: MetricsCollector;
  },
): void {
  app.post<{ Body: ChatBody }>('/api/v1/chat', async (request, reply) => {
    const startTime = Date.now();
    const { config, security, usage, session, queue, cli, filter, metrics } = deps;
    const body = request.body;

    // Validate
    if (!body?.message) return reply.status(400).send({ error: 'Message is required' });
    if (!body?.user_id) return reply.status(400).send({ error: 'user_id is required' });

    const tier = parseTier(body.tier ?? 'free');
    const tierCfg = getTierConfig(tier);
    const channelType = body.channel_type ?? (request.headers['x-channel-type'] as string) ?? 'unknown';

    metrics.incTotalRequests();
    metrics.incTierRequest(tier);

    app.log.info({ userId: body.user_id, tier, channel: channelType, msgLen: body.message.length }, 'Chat request');

    // Step 1: Security check
    const secCheck = security.check(body.message);
    if (secCheck.blocked) {
      metrics.incBlockedInjections();
      metrics.incFailedRequests();
      security.logBlock({ userId: body.user_id, channelType, messagePreview: body.message.slice(0, 200), detectionType: 'injection' }).catch(() => {});
      return reply.status(403).send({ error: 'Message blocked', reason: secCheck.reason });
    }

    // Step 2: Usage check (free tier only)
    if (tier === 'free') {
      try {
        const { remaining } = await usage.checkAndConsume(body.user_id, channelType);
        if (remaining < 0) {
          metrics.incUsageRejections();
          metrics.incFailedRequests();
          const usageInfo = await usage.getUsageInfo(body.user_id);
          return reply.status(429).send({ error: 'No messages remaining', next_recharge_at: usageInfo.nextRechargeAt, full_recharge_at: usageInfo.fullRechargeAt });
        }
      } catch (err) {
        metrics.incFailedRequests();
        app.log.error({ err }, 'Usage check failed');
        return reply.status(500).send({ error: 'Usage check failed' });
      }
    }

    // Step 3: Acquire per-user lock
    let unlock: (() => Promise<void>) | undefined;
    try {
      unlock = await session.acquireUserLock(body.user_id, tierCfg.cliTimeoutSeconds * 1000);
    } catch {
      metrics.incFailedRequests();
      return reply.status(409).send({ error: 'Your previous message is still processing' });
    }

    try {
      // Step 4: Enter priority queue
      metrics.incQueueEnqueues();
      let release: (() => void) | undefined;
      try {
        release = await queue.enqueue(tier);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('timeout')) metrics.incQueueTimeouts();
        else metrics.incQueueFullErrors();
        metrics.incFailedRequests();
        return reply.status(503).send({ error: 'Server busy, please try again' });
      }

      try {
        // Step 5: Execute CLI
        metrics.incCLIExecutions();
        const cliResult = await cli.execute({
          message: body.message,
          contextPath: config.contextPath,
          model: config.defaultModel,
          sessionId: body.session_id ?? '',
          tier,
          homePath: `${config.tierHomesPath}/${tier}`,
          timeoutMs: tierCfg.cliTimeoutSeconds * 1000,
        });
        metrics.addCLIDuration(cliResult.executionTimeMs);

        if (!cliResult.success) {
          if (cliResult.executionTimeMs >= tierCfg.cliTimeoutSeconds * 1000 - 1000) {
            metrics.incCLITimeouts();
          } else {
            metrics.incCLIErrors();
          }
          metrics.incFailedRequests();
          return reply.status(500).send({ error: 'AI processing failed' });
        }

        // Step 6: Filter output
        const filteredResponse = filter.apply(cliResult.output, tier);

        const processingMs = Date.now() - startTime;
        metrics.incSuccessRequests();

        // Log usage asynchronously
        usage.logUsage({ userId: body.user_id, channelType, tier, processingMs, model: config.defaultModel }).catch(() => {});

        return reply.send({
          response: filteredResponse,
          session_id: body.session_id ?? '',
          metadata: { processing_ms: processingMs, model: config.defaultModel, tier },
        });
      } finally {
        release?.();
      }
    } finally {
      await unlock?.();
    }
  });
}
