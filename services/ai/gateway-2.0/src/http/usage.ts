import type { FastifyInstance } from 'fastify';
import type { UsageTracker } from '../core/usage/tracker.js';

export function registerUsageRoutes(app: FastifyInstance, usage: UsageTracker): void {
  app.get<{ Params: { userId: string } }>('/api/v1/usage/:userId', async (request, reply) => {
    try {
      const info = await usage.getUsageInfo(request.params.userId);
      return reply.send(info);
    } catch (err) {
      app.log.error({ err }, 'Failed to get usage info');
      return reply.status(500).send({ error: 'Failed to get usage' });
    }
  });
}
