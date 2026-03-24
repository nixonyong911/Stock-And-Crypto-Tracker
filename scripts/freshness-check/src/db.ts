import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new pg.Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function fetchMaxTimestamp(
  table: string,
  column: string,
): Promise<Date | null> {
  const p = getPool();
  const sql = `SELECT MAX(${column}) AS latest FROM public.${table}`;
  const { rows } = await p.query(sql);
  const val = rows[0]?.latest;
  return val ? new Date(val) : null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
