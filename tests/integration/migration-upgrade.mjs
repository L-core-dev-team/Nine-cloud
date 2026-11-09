import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
execFileSync(process.execPath, [resolve(root, 'scripts/assert-test-database.mjs')], { stdio: 'inherit' });
const base = new URL(process.env.TEST_DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Upgrade simulation requires loopback PostgreSQL');
const require = createRequire(resolve(root, 'packages/db/package.json'));
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const migrations = resolve(root, 'packages/db/drizzle');
const journal = JSON.parse(readFileSync(resolve(migrations, 'meta/_journal.json'), 'utf8'));
const runId = randomUUID();
const output = resolve(root, 'test-results/migration-upgrade', runId);
const admin = new Pool({ connectionString: base.toString(), max: 1 });
const created = new Set();
const evidence = [];

function historicalFolder(lastIndex) {
  const folder = resolve(output, `through-${lastIndex}`);
  mkdirSync(resolve(folder, 'meta'), { recursive: true });
  const entries = journal.entries.filter(entry => entry.idx <= lastIndex);
  writeFileSync(resolve(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) copyFileSync(resolve(migrations, entry.tag + '.sql'), resolve(folder, entry.tag + '.sql'));
  return folder;
}
async function hasRecallSchema(pool) {
  return (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.npc_authorized_observation_outbox'::regclass AND attname='memory_class' AND NOT attisdropped) AS column_present, to_regclass('public.npc_memory_observation_supersessions') IS NOT NULL AS table_present")).rows[0];
}

try {
  for (const kind of ['upgrade', 'fresh']) {
    const name = `jiuxiao_test_security${kind}-${runId}`;
    assert.match(name, /^jiuxiao_test_security(?:upgrade|fresh)-[a-f0-9-]{36}$/);
    await admin.query(`CREATE DATABASE "${name}"`); created.add(name);
    const url = new URL(base); url.pathname = '/' + name;
    const pool = new Pool({ connectionString: url.toString(), max: 1 });
    try {
      if (kind === 'upgrade') {
        await migrate(drizzle(pool), { migrationsFolder: historicalFolder(19) });
        assert.deepEqual(await hasRecallSchema(pool), { column_present: false, table_present: false });
        await pool.query("INSERT INTO auth_accounts(id,email) VALUES('upgrade-preserve','migration@example.invalid')");
        const before = (await pool.query("SELECT to_jsonb(a) AS row FROM auth_accounts a WHERE id='upgrade-preserve'")).rows[0].row;
        // The frozen historical journal reproduces the non-monotonic timestamp bug.
        await migrate(drizzle(pool), { migrationsFolder: historicalFolder(20) });
        const historical = await hasRecallSchema(pool);
        assert.deepEqual(historical, { column_present: false, table_present: false }, 'Historical 0020 must reproduce its skipped upgrade');
        await migrate(drizzle(pool), { migrationsFolder: migrations });
        assert.deepEqual((await pool.query("SELECT to_jsonb(a) AS row FROM auth_accounts a WHERE id='upgrade-preserve'")).rows[0].row, before, 'Upgrade must preserve the existing account');
        evidence.push({ kind, historicalRecallSchemaMissing: true, existingAccountPreserved: true });
      } else {
        await migrate(drizzle(pool), { migrationsFolder: migrations });
        evidence.push({ kind });
      }
      assert.deepEqual(await hasRecallSchema(pool), { column_present: true, table_present: true }, 'Current migrations must install the recall schema');
      // A disposable event-trigger fixture proves PUBLIC revocation leaves its
      // owner and installed DDL trigger usable; no production table is touched.
      await pool.query("CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS 'BEGIN RETURN; END'; CREATE EVENT TRIGGER security_fixture_ddl ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable()");
      const publicExecute = async () => (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.rls_auto_enable()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS allowed")).rows[0].allowed;
      assert.equal(await publicExecute(), true);
      await pool.query(readFileSync(resolve(migrations, '0022_function_scope_hardening.sql'), 'utf8'));
      assert.equal(await publicExecute(), false);
      await pool.query('CREATE TABLE public.security_fixture_trigger_probe(id integer); DROP TABLE public.security_fixture_trigger_probe');
      assert.equal((await pool.query("SELECT evtenabled FROM pg_event_trigger WHERE evtname='security_fixture_ddl'")).rows[0].evtenabled, 'O');
      const beforeCount = (await pool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations')).rows[0].count;
      await migrate(drizzle(pool), { migrationsFolder: migrations });
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations')).rows[0].count, beforeCount, 'Repeated migration must not apply 0020 twice');
      const functions = await pool.query("SELECT proname,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('append_turn_event_hash','verify_turn_event_chain','validate_npc_memory_observation_supersession') ORDER BY proname");
      assert.equal(functions.rows.length, 3);
      for (const fn of functions.rows) assert.ok(fn.proconfig?.includes('search_path=pg_catalog, public, pg_temp'), fn.proname);
    } finally { await pool.end(); }
  }
  mkdirSync(resolve(root, 'test-results'), { recursive: true });
  writeFileSync(resolve(root, 'test-results/security-migration-upgrade.json'), JSON.stringify({ productionAcceptance: false, evidence, repeatedMigrationIdempotent: true, recallSchemaPresent: true, fixedFunctionPaths: true, publicExecuteRevoked: true, installedEventTriggerPreserved: true }, null, 2));
  console.log('Fresh and existing-0019 PostgreSQL migrations passed; skipped-0020 reproduced, repaired, and repeated without data loss.');
} finally {
  for (const name of created) {
    assert.match(name, /^jiuxiao_test_security(?:upgrade|fresh)-[a-f0-9-]{36}$/);
    await admin.query(`DROP DATABASE "${name}"`);
  }
  await admin.end();
}
