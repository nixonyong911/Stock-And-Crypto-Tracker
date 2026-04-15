/**
 * Health check route handlers.
 */

import type { FastifyInstance } from 'fastify';
import type { PostgresClient } from '../db/postgres.js';
import type { RedisClient } from '../db/redis.js';
import type { CLIExecutor } from '../core/cli/executor.js';
import type { GatewayConfig } from '../config.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  db: PostgresClient,
  redis: RedisClient,
  cliExecutor: CLIExecutor,
  config: GatewayConfig,
): void {
  // GET /health - basic liveness
  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', service: 'gateway-2.0' });
  });

  // GET /health/live - Kubernetes liveness probe
  app.get('/health/live', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  // GET /health/ready - readiness probe (checks DB, Redis, CLI)
  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, string> = {};
    let allOk = true;

    try {
      await db.healthCheck();
      checks['database'] = 'ok';
    } catch (err) {
      checks['database'] = `error: ${err instanceof Error ? err.message : String(err)}`;
      allOk = false;
    }

    try {
      await redis.healthCheck();
      checks['redis'] = 'ok';
    } catch (err) {
      checks['redis'] = `error: ${err instanceof Error ? err.message : String(err)}`;
      allOk = false;
    }

    try {
      const available = await cliExecutor.checkCLIAvailable();
      checks['cursor_agent'] = available ? 'ok' : 'not available';
      if (!available) allOk = false;
    } catch {
      checks['cursor_agent'] = 'not available';
      allOk = false;
    }

    checks['memory_curator_model'] = config.curatorModel;
    checks['memory_curator_sequential_batches'] = config.curatorSequentialBatches
      ? 'on'
      : 'off';
    checks['memory_curator_llm_timeout_ms'] = String(config.curatorLlmTimeoutMs);
    checks['memory_curator_max_stories'] = String(config.curatorMaxStories);
    checks['memory_curator_max_stories_per_batch'] = String(
      config.curatorMaxStoriesPerBatch,
    );
    checks['cursor_api_key_configured'] = config.cursorApiKeyConfigured ? 'yes' : 'no';

    const status = allOk ? 'ok' : 'degraded';
    const statusCode = allOk ? 200 : 503;
    return reply.status(statusCode).send({ status, checks });
  });
}
