import type { FastifyInstance } from 'fastify';
import type { ExtensionRegistry } from '../extension/registry.js';

export function registerChannelRoutes(app: FastifyInstance, registry: ExtensionRegistry): void {
  app.get('/api/v1/channels', async (_request, reply) => {
    const extensions = registry.getAll();
    const channels = extensions.map(ext => ({
      id: ext.id,
      label: ext.meta.label,
      description: ext.meta.description,
      capabilities: ext.capabilities,
    }));
    return reply.send({ channels, total: channels.length });
  });
}
