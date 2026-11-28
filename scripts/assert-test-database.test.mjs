import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const guardPath = fileURLToPath(new URL('./assert-test-database.mjs', import.meta.url));

function runGuard(databaseUrl) {
  const env = { ...process.env };
  if (databaseUrl === undefined) delete env.TEST_DATABASE_URL;
  else env.TEST_DATABASE_URL = databaseUrl;
  return spawnSync(process.execPath, [guardPath], { env, encoding: 'utf8' });
}

test('requires a PostgreSQL integration database and rejects other protocols', async t => {
  await t.test('missing URL fails with a non-secret diagnostic', () => {
    const result = runGuard(undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /TEST_DATABASE_URL is required/);
  });
  await t.test('non-PostgreSQL URL is rejected', () => {
    const result = runGuard('mysql://localhost/jiuxiao_test');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected a PostgreSQL URL/);
  });
  await t.test('PostgreSQL URL without a database is rejected', () => {
    const result = runGuard('postgresql://localhost/');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /host and database name/);
  });
  await t.test('database without the project test prefix is rejected', () => {
    const result = runGuard('postgresql://localhost/jiuxiao_dev');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must begin with jiuxiao_test/);
  });
  await t.test('encoded path separators cannot smuggle a different database name', () => {
    const result = runGuard('postgresql://localhost/jiuxiao_test%2Fproduction');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must begin with jiuxiao_test/);
  });
  await t.test('production hostnames are refused by name', () => {
    for (const host of ['api.jiuxiaogame.cn', 'db.jiuxiaogame.cn', 'abcdefgh.supabase.co', 'aws-0-ap-east-1.pooler.supabase.com', 'API.JIUXIAOGAME.CN.']) {
      const result = runGuard(`postgresql://postgres:private-value@${host}:5432/jiuxiao_test`);
      assert.equal(result.status, 1, host);
      assert.match(result.stderr, /production service/, host);
      assert.doesNotMatch(result.stdout + result.stderr, /private-value/);
    }
  });
  await t.test('non-loopback hosts are refused', () => {
    for (const host of ['db.example.com', '10.0.0.5', '192.168.1.20', 'postgres', '0.0.0.0', '[2001:db8::1]', '127.0.0.1.nip.io']) {
      const result = runGuard(`postgresql://postgres:postgres@${host}:5432/jiuxiao_test`);
      assert.equal(result.status, 1, host);
      assert.match(result.stderr, /local loopback test instance/, host);
    }
  });
  await t.test('libpq host overrides in the query string are refused', () => {
    for (const query of ['host=db.example.com', 'hostaddr=10.0.0.5']) {
      const result = runGuard(`postgresql://postgres:postgres@127.0.0.1:5432/jiuxiao_test?${query}`);
      assert.equal(result.status, 1, query);
      assert.match(result.stderr, /query parameter is not allowed/, query);
    }
  });
  await t.test('loopback hosts used by CI and local containers pass', () => {
    for (const host of ['localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
      const result = runGuard(`postgresql://postgres:postgres@${host}:55432/jiuxiao_test_ci`);
      assert.equal(result.status, 0, `${host}: ${result.stderr}`);
    }
  });
  await t.test('valid PostgreSQL URL passes without printing credentials', () => {
    const result = runGuard('postgresql://test-user:private-value@127.0.0.1:5432/jiuxiao_test_ci');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /private-value/);
  });
});