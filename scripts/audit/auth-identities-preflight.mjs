import { createRequire } from 'node:module';
const { Pool } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 });
const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  const accounts = await client.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE closed_at IS NOT NULL)::int AS closed FROM auth_accounts`);
  const collisions = await client.query(`SELECT count(*)::int AS groups,
    coalesce(sum(account_count),0)::int AS affected FROM (
      SELECT count(*)::int AS account_count FROM auth_accounts
      GROUP BY lower(email) HAVING count(*) > 1
    ) duplicate_emails`);
  const sessions = await client.query(`SELECT count(*)::int AS active FROM auth_sessions WHERE expires_at > now()`);
  const owners = await client.query(`SELECT count(DISTINCT owner_id)::int AS owners,
    count(*) FILTER (WHERE owner_id NOT IN (SELECT id FROM auth_accounts))::int AS orphan_rows
    FROM game_saves`);
  const mapping = await client.query(`SELECT to_regclass('public.auth_external_identities') IS NOT NULL AS already_migrated`);
  await client.query('ROLLBACK');
  const report = {
    status: Number(collisions.rows[0].groups) === 0 ? 'AUTH_IDENTITY_PREFLIGHT_PASS' : 'AUTH_EMAIL_CASE_COLLISIONS',
    readOnly: true,
    accounts: accounts.rows[0],
    caseInsensitiveEmailCollisions: collisions.rows[0],
    activeSessions: sessions.rows[0].active,
    cloudSaveOwners: owners.rows[0],
    identityMappingTableAlreadyPresent: mapping.rows[0].already_migrated,
    rawEmailsIncluded: false,
  };
  console.log(JSON.stringify(report));
  if (report.status !== 'AUTH_IDENTITY_PREFLIGHT_PASS') process.exitCode = 2;
} catch {
  try { await client.query('ROLLBACK'); } catch { /* Preserve the sanitized failure. */ }
  console.error(JSON.stringify({ status: 'AUTH_IDENTITY_PREFLIGHT_FAILED', rawValuesPrinted: false }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
