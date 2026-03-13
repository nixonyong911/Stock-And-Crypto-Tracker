/**
 * Factory for the GatewayAPI object that extensions receive.
 *
 * Keeps construction in a single place so the gateway server only needs to
 * supply the concrete implementations once.
 */

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { GatewayAPI } from './types.js';
import type { ErrorNotifier } from '../core/error-notifier.js';

export function createGatewayAPI(params: {
  db: Pool;
  redis: Redis;
  logger: FastifyBaseLogger;
  config: GatewayConfig;
  processMessage: GatewayAPI['processMessage'];
  getSession: GatewayAPI['getSession'];
  resolveUserTier: GatewayAPI['resolveUserTier'];
  emit: GatewayAPI['emit'];
  errorNotifier?: ErrorNotifier;
}): GatewayAPI {
  return {
    processMessage: params.processMessage,
    db: params.db,
    redis: params.redis,
    logger: params.logger,
    config: params.config,
    emit: params.emit,
    getSession: params.getSession,
    resolveUserTier: params.resolveUserTier,
    errorNotifier: params.errorNotifier,
  };
}
