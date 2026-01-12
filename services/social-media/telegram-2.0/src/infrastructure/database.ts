import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config.js';

/**
 * Database context with connection pooling and transaction support.
 */
export class DatabaseContext {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  /**
   * Execute a query and return all rows
   */
  async fetchAll<T>(query: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.pool.query(query, params);
    return result.rows as T[];
  }

  /**
   * Execute a query and return the first row or null
   */
  async fetchOne<T>(query: string, ...params: unknown[]): Promise<T | null> {
    const result = await this.pool.query(query, params);
    return (result.rows[0] as T) || null;
  }

  /**
   * Execute a query (INSERT, UPDATE, DELETE) and return affected rows info
   */
  async execute(query: string, ...params: unknown[]): Promise<QueryResult> {
    return this.pool.query(query, params);
  }

  /**
   * Run multiple queries in a transaction
   */
  async transaction<T>(
    callback: (client: TransactionClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient = new TransactionClient(client);
      const result = await callback(txClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Transaction client wrapper
 */
export class TransactionClient {
  constructor(private client: PoolClient) {}

  async fetchAll<T>(query: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.client.query(query, params);
    return result.rows as T[];
  }

  async fetchOne<T>(query: string, ...params: unknown[]): Promise<T | null> {
    const result = await this.client.query(query, params);
    return (result.rows[0] as T) || null;
  }

  async execute(query: string, ...params: unknown[]): Promise<QueryResult> {
    return this.client.query(query, params);
  }
}

// Singleton instance
let dbInstance: DatabaseContext | null = null;

export function getDatabase(): DatabaseContext {
  if (!dbInstance) {
    dbInstance = new DatabaseContext();
  }
  return dbInstance;
}
