import { Pool } from 'pg';
import type { AppConfig } from './config.js';

let pool: Pool | undefined;

/** Lazily create the shared connection pool. */
export function getPool(config: AppConfig): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      // Enforced by PostgreSQL: any statement exceeding this is aborted.
      statement_timeout: config.database.statementTimeoutMs,
      // Client-side guard so a hung socket cannot block a tool call forever.
      query_timeout: config.database.statementTimeoutMs + 1000,
      application_name: config.server.name,
      max: 10,
    });
    pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Safely quote an SQL identifier (defends against odd table names). */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
