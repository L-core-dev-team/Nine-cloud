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
const docker = args => execFileSync('docker', ['exec', container, ...args], { maxBuffer: 64 * 1024 * 1024 });
async function digest(url) {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
  const hash = createHash('sha256'); const counts = Object.create(null);
  try {
    // Follow the actual restored catalog instead of a stale hand-maintained table list.
    // Include all user schemas, including Drizzle's migration history.
    const tables = await pool.query(
      "SELECT schemaname, tablename FROM pg_catalog.pg_tables " +
      "WHERE schemaname NOT IN ('pg_catalog','information_schema') " +
      "AND left(schemaname,3) <> 'pg_' ORDER BY schemaname,tablename");
    assert.ok(tables.rows.some(row => row.schemaname === 'public' && row.tablename === 'auth_accounts'),
      'Expected migrated application tables in the isolated test database');
    const quote = name => '"' + name.replaceAll('"', '""') + '"';
    for (const { schemaname, tablename } of tables.rows) {
      const key = schemaname + '.' + tablename;
      const qualified = quote(schemaname) + '.' + quote(tablename);
      const result = await pool.query(
        'SELECT to_jsonb(t)::text AS content FROM ' + qualified + ' t ORDER BY to_jsonb(t)::text');
      counts[key] = result.rows.length; hash.update(key + '\0');
      for (const row of result.rows) hash.update(row.content + '\0');
    }
    const columns = await pool.query(
      "SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_schema,udt_name," +
      "is_nullable,column_default,is_identity,identity_generation FROM information_schema.columns " +
      "WHERE table_schema NOT IN ('pg_catalog','information_schema') AND left(table_schema,3)<>'pg_' " +
      "ORDER BY table_schema,table_name,ordinal_position");
    const indexes = await pool.query(
      "SELECT schemaname,tablename,indexname,indexdef FROM pg_catalog.pg_indexes " +
      "WHERE schemaname NOT IN ('pg_catalog','information_schema') AND left(schemaname,3)<>'pg_' " +
      "ORDER BY schemaname,tablename,indexname");
    // PostgreSQL pretty deparsing removes redundant parentheses introduced by
    // BETWEEN expansion and flattened again by the dump/restore SQL parser.
    // It preserves Boolean precedence; do not strip parentheses with a regex.
    const constraints = await pool.query(
      "SELECT n.nspname AS schema,c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid, true) AS definition " +
      "FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND left(n.nspname,3)<>'pg_' " +
      "ORDER BY n.nspname,c.relname,k.conname");
    const triggers = await pool.query(
      "SELECT n.nspname AS schema,c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition " +
      "FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal " +
      "AND n.nspname NOT IN ('pg_catalog','information_schema') AND left(n.nspname,3)<>'pg_' " +
      "ORDER BY n.nspname,c.relname,t.tgname");
    const structure = { columns: columns.rows, indexes: indexes.rows,
      constraints: constraints.rows, triggers: triggers.rows };
    return { counts, structure, sha256: hash.digest('hex'),
      structureSha256: createHash('sha256').update(JSON.stringify(structure)).digest('hex') };
  } finally { await pool.end(); }
}
let created = false;
try {
  const before = await digest(sourceUrl.toString());
  const dump = docker(['pg_dump', '-U', user, '-d', sourceName, '--format=custom']);
  docker(['createdb', '-U', user, restoreName]); created = true;
  execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', user, '-d', restoreName, '--exit-on-error'], { input: dump, maxBuffer: 64 * 1024 * 1024 });
  const restoredUrl = new URL(sourceUrl); restoredUrl.pathname = `/${restoreName}`;
  const after = await digest(restoredUrl.toString());
  assert.deepEqual(after.counts, before.counts, 'Restored table row counts differ');
  assert.equal(after.sha256, before.sha256, 'Restored logical contents differ');
  assert.equal(after.structureSha256, before.structureSha256, 'Restored schema structure differs');
  assert.deepEqual(after, before);
  const unchanged = await digest(sourceUrl.toString()); assert.deepEqual(unchanged, before, 'Restoration must not change the source test database');
  const output = resolve(root, 'test-results/cloud'); mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'database-restore.json'), JSON.stringify({ kind: 'ephemeral-postgres-backup-restore', sourceUnchanged: true,
    restoredCounts: after.counts, restoredTables: Object.keys(after.counts), restoredSha256: after.sha256, restoredStructureSha256: after.structureSha256, dumpSha256: createHash('sha256').update(dump).digest('hex'), productionAcceptance: false }, null, 2));
  console.log('Isolated PostgreSQL backup restored with identical logical table contents; source unchanged.');
} finally {
  if (created) docker(['dropdb', '-U', user, restoreName]); // Only this run's verified, newly-created test database.
}
