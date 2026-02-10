import type { WebSocketServer } from '../server.js';
import type { SessionManager } from '../../core/session/manager.js';
import type { UsageTracker } from '../../core/usage/tracker.js';
import type { MetricsCollector } from '../../core/metrics/collector.js';
import type { QueueManager } from '../../core/queue/manager.js';
import type { ExtensionRegistry } from '../../extension/registry.js';

export function registerWSHandlers(
  ws: WebSocketServer,
  deps: {
    session: SessionManager;
    usage: UsageTracker;
    metrics: MetricsCollector;
    queue: QueueManager;
    extensions: ExtensionRegistry;
  },
): void {
  const { session, usage, metrics, queue, extensions } = deps;

  // sessions.list - Get all active sessions (no params)
  ws.registerMethod('sessions.list', async () => {
    // This would need a listActive method on SessionManager
    // For now, return the extension list as a proxy
    return { channels: extensions.listIds() };
  });

  // sessions.get - Get session for a user
  ws.registerMethod('sessions.get', async (params) => {
    const { userId, channelType } = params as { userId: string; channelType?: string };
    return session.getActiveSession(userId, channelType ?? 'telegram');
  });

  // usage.get - Get usage info for a user
  ws.registerMethod('usage.get', async (params) => {
    const { userId } = params as { userId: string };
    return usage.getUsageInfo(userId);
  });

  // metrics.snapshot - Get metrics + queue stats
  ws.registerMethod('metrics.snapshot', async () => {
    return { metrics: metrics.snapshot(), queue: queue.stats() };
  });

  // channels.list - List registered channel extensions
  ws.registerMethod('channels.list', async () => {
    const all = extensions.getAll();
    return {
      channels: all.map(ext => ({
        id: ext.id,
        label: ext.meta.label,
        capabilities: ext.capabilities,
      })),
    };
  });
}
