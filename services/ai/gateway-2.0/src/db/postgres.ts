/**
 * PostgreSQL connection pool wrapper.
 */

import pg from "pg";
import type { FastifyBaseLogger } from "fastify";

const { Pool } = pg;

export type PgPool = pg.Pool;

export interface PostgresClient {
  readonly pool: PgPool;
  /** Run a simple health-check query. Rejects on failure. */
  healthCheck(): Promise<void>;
  /** Gracefully drain and close the pool. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Resilient query wrapper
// ---------------------------------------------------------------------------

const CONNECTION_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "CONNECTION_ENDED",
]);

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  if (err.message.includes("connection terminated")) return true;
  if (err.message.includes("Client has encountered a connection error"))
    return true;
  return false;
}

/**
 * Wrap a pg.Pool so that `query()` automatically retries once on stale
 * connection errors (ECONNRESET, EPIPE, etc.).  All other methods pass
 * through unchanged.
 */
export function withQueryRetry(
  pool: PgPool,
  logger: FastifyBaseLogger,
): PgPool {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return async (...args: unknown[]) => {
          try {
            return await (target.query as Function).apply(target, args);
          } catch (err) {
            if (isConnectionError(err)) {
              logger.warn({ err }, "Stale PG connection — retrying query");
              return await (target.query as Function).apply(target, args);
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Create a PostgreSQL connection pool and return a thin wrapper with
 * health-check and graceful-close helpers.
 */
export function createPool(
  databaseUrl: string,
  logger: FastifyBaseLogger,
): PostgresClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    min: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  pool.on("error", (err) => {
    logger.error({ err }, "Unexpected PostgreSQL pool error");
  });

  pool.on("connect", () => {
    logger.debug("New PostgreSQL connection established");
  });

  return {
    pool,

    async healthCheck(): Promise<void> {
      try {
        const client = await pool.connect();
        try {
          await client.query("SELECT 1");
        } finally {
          client.release();
        }
      } catch (err) {
        logger.error({ err }, "PostgreSQL health check failed");
        throw err;
      }
    },

    async close(): Promise<void> {
      try {
        await pool.end();
        logger.info("PostgreSQL pool closed");
      } catch (err) {
        logger.error({ err }, "Error closing PostgreSQL pool");
        throw err;
      }
    },
  };
}
