import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Seed the demo e-commerce dataset on first boot.
 *
 * Managed hosts (Render, Fly, Railway) do not run `docker-entrypoint-initdb.d`,
 * so a freshly provisioned database would otherwise be empty. This runs once,
 * only when the schema is absent, and retries while the database comes online.
 */
export async function ensureDemoData(pool: Pool, attempts = 15, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { rows } = await pool.query<{ present: string | null }>(
        "SELECT to_regclass('public.customers')::text AS present",
      );
      if (rows[0]?.present) {
        console.log('[bootstrap] demo schema already present; skipping seed.');
        return;
      }

      console.log('[bootstrap] empty database detected; applying schema + seed...');
      const schema = readFileSync(resolve(projectRoot, 'db/schema.sql'), 'utf8');
      const seed = readFileSync(resolve(projectRoot, 'db/seed.sql'), 'utf8');
      await pool.query(schema);
      await pool.query(seed);

      const counts = await pool.query<{ customers: string; orders: string }>(
        'SELECT (SELECT count(*) FROM customers)::text AS customers, (SELECT count(*) FROM orders)::text AS orders',
      );
      console.log(
        `[bootstrap] demo data ready: ${counts.rows[0]?.customers} customers, ${counts.rows[0]?.orders} orders.`,
      );
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[bootstrap] attempt ${attempt}/${attempts} failed: ${message}`);
      if (attempt === attempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
