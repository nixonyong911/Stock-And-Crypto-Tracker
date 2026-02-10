/**
 * Request logging middleware for Fastify.
 * Logs request completion with timing information.
 */

import type { FastifyInstance } from 'fastify';
import type { PgPool } from '../db/postgres.js';

export function registerLoggingMiddleware(app: FastifyInstance, _db: PgPool): void {
  app.addHook('onResponse', async (request, reply) => {
    // Don't log health checks
    if (request.url.startsWith('/health')) {
      return;
    }

    const responseTime = reply.elapsedTime; // Fastify built-in timing

    app.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(responseTime),
    }, 'Request completed');
  });
}
