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
  await t.test('valid PostgreSQL URL passes without printing credentials', () => {
    const result = runGuard('postgresql://test-user:private-value@127.0.0.1:5432/jiuxiao_test_ci');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /private-value/);
  });
});