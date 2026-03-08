/**
 * API key authentication middleware for Fastify.
 */

import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../config.js";

export function registerAuthMiddleware(
  app: FastifyInstance,
  config: GatewayConfig
): void {
  // Skip auth for health endpoints
  const publicPaths = ["/health", "/health/live", "/health/ready"];

  app.addHook("onRequest", async (request, reply) => {
    // Skip auth for public paths
    if (publicPaths.some((p) => request.url.startsWith(p))) {
      return;
    }

    // Skip auth for webhook paths (extensions handle their own auth)
    if (request.url.startsWith("/webhook")) {
      return;
    }

    // Skip API-key auth for internal paths (they verify X-Service-Key themselves)
    if (request.url.startsWith("/internal")) {
      return;
    }

    // Skip auth if no API key is configured (dev mode)
    if (!config.apiKey) {
      return;
    }

    const apiKey = request.headers["x-api-key"] as string | undefined;
    if (!apiKey || apiKey !== config.apiKey) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });
}
