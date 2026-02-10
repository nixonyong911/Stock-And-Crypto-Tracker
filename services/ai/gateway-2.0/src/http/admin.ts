import type { FastifyInstance } from 'fastify';
import type { MetricsCollector } from '../core/metrics/collector.js';
import type { QueueManager } from '../core/queue/manager.js';
import type { PgPool } from '../db/postgres.js';

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: { metrics: MetricsCollector; queue: QueueManager; db: PgPool },
): void {
  const { metrics, queue, db } = deps;

  // GET /api/v1/admin/metrics
  app.get('/api/v1/admin/metrics', async (_request, reply) => {
    return reply.send({ metrics: metrics.snapshot(), queue: queue.stats() });
  });

  // GET /api/v1/admin/security-logs?limit=50&offset=0
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/api/v1/admin/security-logs', async (request, reply) => {
      const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 200);
      const offset = parseInt(request.query.offset ?? '0', 10) || 0;

      try {
        const result = await db.query(
          `SELECT id, user_id, channel_type, message_preview, detection_type, rule_matched, created_at
           FROM gateway_security_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        return reply.send({ logs: result.rows, count: result.rows.length });
      } catch (err) {
        app.log.error({ err }, 'Failed to query security logs');
        return reply.status(500).send({ error: 'Failed to query security logs' });
      }
    }
  );

  // GET /api/v1/admin/sessions
  app.get('/api/v1/admin/sessions', async (_request, reply) => {
    try {
      const [activeResult, totalResult, avgResult, tierResult, channelResult] = await Promise.all([
        db.query('SELECT COUNT(*)::int as count FROM gateway_sessions WHERE expires_at > NOW()'),
        db.query('SELECT COUNT(*)::int as count FROM gateway_sessions'),
        db.query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (LEAST(expires_at, last_active_at) - created_at)) / 60), 0)::float as avg FROM gateway_sessions WHERE expires_at < NOW()`),
        db.query('SELECT tier, COUNT(*)::int as count FROM gateway_sessions WHERE expires_at > NOW() GROUP BY tier'),
        db.query('SELECT channel_type, COUNT(*)::int as count FROM gateway_sessions WHERE expires_at > NOW() GROUP BY channel_type'),
      ]);

      const byTier: Record<string, number> = {};
      for (const row of tierResult.rows) byTier[row.tier] = row.count;

      const byChannel: Record<string, number> = {};
      for (const row of channelResult.rows) byChannel[row.channel_type] = row.count;

      return reply.send({
        active_sessions: activeResult.rows[0]?.count ?? 0,
        total_sessions: totalResult.rows[0]?.count ?? 0,
        avg_duration_min: Math.round((avgResult.rows[0]?.avg ?? 0) * 100) / 100,
        by_tier: byTier,
        by_channel: byChannel,
      });
    } catch (err) {
      app.log.error({ err }, 'Failed to query session stats');
      return reply.status(500).send({ error: 'Failed to query session stats' });
    }
  });

  // GET /api/v1/admin/usage?hours=24
  app.get<{ Querystring: { hours?: string } }>(
    '/api/v1/admin/usage', async (request, reply) => {
      const hours = Math.min(parseInt(request.query.hours ?? '24', 10) || 24, 168);

      try {
        const [totalResult, tierResult, channelResult] = await Promise.all([
          db.query(`SELECT COUNT(*)::int as count FROM gateway_usage_log WHERE created_at > NOW() - $1 * INTERVAL '1 hour'`, [hours]),
          db.query(`SELECT tier, COUNT(*)::int as count FROM gateway_usage_log WHERE created_at > NOW() - $1 * INTERVAL '1 hour' GROUP BY tier`, [hours]),
          db.query(`SELECT channel_type, COUNT(*)::int as count FROM gateway_usage_log WHERE created_at > NOW() - $1 * INTERVAL '1 hour' GROUP BY channel_type`, [hours]),
        ]);

        const byTier: Record<string, number> = {};
        for (const row of tierResult.rows) byTier[row.tier] = row.count;
        const byChannel: Record<string, number> = {};
        for (const row of channelResult.rows) byChannel[row.channel_type] = row.count;

        return reply.send({
          total_messages: totalResult.rows[0]?.count ?? 0,
          by_tier: byTier,
          by_channel: byChannel,
          hours_queried: hours,
        });
      } catch (err) {
        app.log.error({ err }, 'Failed to query usage stats');
        return reply.status(500).send({ error: 'Failed to query usage stats' });
      }
    }
  );
}
