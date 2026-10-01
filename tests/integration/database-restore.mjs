#!/usr/bin/env node
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
execFileSync(process.execPath, [resolve(root, 'scripts/assert-test-database.mjs')], { stdio: 'inherit' });
const container = process.env.TEST_POSTGRES_CONTAINER;
if (!container || !/^[a-f0-9]{12,64}$/.test(container)) throw new Error('Expected the isolated CI PostgreSQL container ID');
const sourceUrl = new URL(process.env.TEST_DATABASE_URL); const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
const user = decodeURIComponent(sourceUrl.username); const restoreName = `jiuxiao_test_restore_${randomUUID().replaceAll('-', '')}`;
assert.match(restoreName, /^jiuxiao_test_restore_[a-f0-9]{32}$/);
const { Pool } = createRequire(resolve(root, 'apps/api/package.json'))('pg');
const tables = ['auth_accounts','auth_challenges','auth_mail_limits','auth_sessions','cloud_archive_trash','game_saves','turn_requests','turn_events','npc_memory_journals','entitlement_balances','entitlement_ledger_entries'];
const docker = args => execFileSync('docker', ['exec', container, ...args], { maxBuffer: 64 * 1024 * 1024 });
async function digest(url) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  const hash = createHash('sha256'); const counts = {};
  try {
    for (const table of tables) {
      const result = await pool.query(`SELECT to_jsonb(t)::text AS content FROM "${table}" t ORDER BY to_jsonb(t)::text`);
      counts[table] = result.rows.length; hash.update(table + '\0');
      for (const row of result.rows) hash.update(row.content + '\0');
    }
    return { counts, sha256: hash.digest('hex') };
  } finally { await pool.end(); }
}
let created = false;
try {
  const before = await digest(sourceUrl.toString());
  const dump = docker(['pg_dump', '-U', user, '-d', sourceName, '--format=custom']);
  docker(['createdb', '-U', user, restoreName]); created = true;
  execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', user, '-d', restoreName, '--exit-on-error'], { input: dump, maxBuffer: 64 * 1024 * 1024 });
  const restoredUrl = new URL(sourceUrl); restoredUrl.pathname = `/${restoreName}`;
  const after = await digest(restoredUrl.toString()); assert.deepEqual(after, before);
  const unchanged = await digest(sourceUrl.toString()); assert.deepEqual(unchanged, before, 'Restoration must not change the source test database');
  const output = resolve(root, 'test-results/cloud'); mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'database-restore.json'), JSON.stringify({ kind: 'ephemeral-postgres-backup-restore', sourceUnchanged: true,
    restoredCounts: after.counts, restoredSha256: after.sha256, dumpSha256: createHash('sha256').update(dump).digest('hex'), productionAcceptance: false }, null, 2));
  console.log('Isolated PostgreSQL backup restored with identical logical table contents; source unchanged.');
} finally {
  if (created) docker(['dropdb', '-U', user, restoreName]); // Only this run's verified, newly-created test database.
}
