import { Pool, PoolClient, QueryResult } from 'pg';
import dns from 'dns';
import { config } from '../config.js';

// Force IPv4 DNS resolution to avoid Docker IPv6 connectivity issues
dns.setDefaultResultOrder('ipv4first');

/**
 * Parse a Postgres connection string in key=value format (like asyncpg uses)
 * and convert it to pg Pool config.
 */
function parseConnectionString(connStr: string): {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
} {
  // If it's already a URL format, parse it differently
  if (connStr.startsWith('postgresql://') || connStr.startsWith('postgres://')) {
    const url = new URL(connStr);
    return {
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      database: url.pathname.slice(1), // Remove leading /
    };
  }
  
  // Parse key=value format (e.g., "user=x password=y host=z port=5432 dbname=postgres")
  const pairs: Record<string, string> = {};
  const regex = /(\w+)=([^\s]+)/g;
  let match;
  while ((match = regex.exec(connStr)) !== null) {
    // URL-decode the value (handles %2A -> * etc.)
    pairs[match[1]] = decodeURIComponent(match[2]);
  }
  
  return {
    user: pairs.user || 'postgres',
    password: pairs.password || '',
    host: pairs.host || 'localhost',
    port: parseInt(pairs.port || '5432', 10),
    database: pairs.dbname || 'postgres',
  };
}

/**
 * Database context with connection pooling and transaction support.
 */
export class DatabaseContext {
  private pool: Pool;

  constructor() {
    const connConfig = parseConnectionString(config.databaseUrl);
    
    this.pool = new Pool({
      ...connConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: {
        rejectUnauthorized: false, // Supabase requires SSL
      },
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
    } catch (error) {
      console.error('Database health check failed:', (error as Error).message);
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
