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
