import { createRequire } from 'node:module';
const { Pool } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');

if (!process.env.DATABASE_URL) throw new Error('PRIVATE_DATABASE_REQUIRED');
const apply = process.argv.includes('--apply');
const utcCutoff = new Date().toISOString().slice(0, 10);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const tables = [
    ['ip', 'auth_provider_ip_limits'],
    ['account', 'auth_provider_account_limits'],
  ];
  const eligible = {};
  const deleted = {};
  if (apply) {
    for (const [key, table] of tables) {
      const preview = await pool.query(`SELECT count(*)::text AS expired FROM ${table} WHERE day_started_at < $1::date - 2`, [utcCutoff]);
      eligible[key] = preview.rows[0].expired;
      deleted[key] = 0;
      while (true) {
        const result = await pool.query(`WITH stale AS (
            SELECT ctid FROM ${table}
            WHERE day_started_at < $1::date - 2
            ORDER BY day_started_at LIMIT 1000 FOR UPDATE SKIP LOCKED
          ) DELETE FROM ${table} target USING stale
            WHERE target.ctid=stale.ctid RETURNING 1`, [utcCutoff]);
        deleted[key] += result.rowCount ?? 0;
        if (!result.rowCount) break;
      }
    }
  } else {
    for (const [key, table] of tables) {
      const preview = await pool.query(`SELECT count(*)::text AS expired FROM ${table} WHERE day_started_at < $1::date - 2`, [utcCutoff]);
      eligible[key] = preview.rows[0].expired;
      deleted[key] = 0;
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry_run', eligible, deleted }));
} catch {
  console.error('AUTH_RATE_LIMIT_RETENTION_UNAVAILABLE; no private database details logged.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
