import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const { Pool } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('pg');
export async function digest(url) {
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
