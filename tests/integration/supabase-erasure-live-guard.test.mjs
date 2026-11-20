import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAdminBoundary, validateLiveConfig } from './supabase-erasure-live-guard.mjs';

const projectRef = 'abcdefghijklmnopqrst';
const origin = `https://${projectRef}.supabase.co`;
const secret = 'sb_secret_SYNTHETIC_ONLY_' + 's'.repeat(32);
const runId = 'synthetic-guard-test-01';
const users = ['normal', 'uncertain', 'control'].map((label, i) => ({
  id: `0000000${i + 1}-1111-4222-8333-444444444444`, email: `${label}-${runId}@example.invalid`, label,
}));
const config = { projectRef, origin, secretKey: secret, publishableKey: 'sb_publishable_SYNTHETIC_ONLY' };
const body = user => ({ id: user.id, email: user.email, email_confirm: true,
  app_metadata: { purpose: 'NINE-CLOUD-M3-SUPABASE-LIVE', run_id: runId, label: user.label } });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const path = user => `${origin}/auth/v1/admin/users/${user.id}`;
const authorized = (init = {}) => ({ headers: { apikey: secret, accept: 'application/json' }, ...init });
const post = user => authorized({ method: 'POST', body: JSON.stringify(body(user)) });
const boundary = fetchImpl => createAdminBoundary({ config, runId, users, fetchImpl });

test('configuration binds the exact project, commit, explicit scope, and external output', () => {
  const root = mkdtempSync(join(tmpdir(), 'supabase-guard-'));
  try {
    const repo = join(root, 'repo'); mkdirSync(repo);
    const env = { NODE_ENV: 'test', CARD_SUPABASE_LIVE_CONFIRM: 'SYNTHETIC_USERS_ONLY',
      CARD_SUPABASE_LIVE_PROJECT_REF: projectRef, SUPABASE_URL: origin, SUPABASE_SECRET_KEY: secret,
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_ONLY', CARD_TEST_PG_BIN: join(root, 'pg-bin'),
      CARD_SUPABASE_LIVE_OUTPUT: join(root, 'private', 'run'), CARD_SUPABASE_LIVE_COMMIT: 'a'.repeat(40) };
    assert.equal(validateLiveConfig(env, repo).outputRoot, join(root, 'private', 'run'));
    for (const change of [
      { NODE_ENV: 'production' }, { NODE_ENV: ' Production ' },
      { CARD_SUPABASE_LIVE_CONFIRM: '' }, { CARD_SUPABASE_LIVE_PROJECT_REF: 'wrong' },
      { SUPABASE_URL: 'https://another-project.supabase.co' }, { SUPABASE_URL: origin + '/' },
      { SUPABASE_URL: origin + '?private=' + secret },
      { CARD_SUPABASE_LIVE_OUTPUT: repo }, { CARD_SUPABASE_LIVE_OUTPUT: join(repo, 'private') },
      { CARD_SUPABASE_LIVE_OUTPUT: 'relative' }, { CARD_SUPABASE_LIVE_COMMIT: 'main' },
      { SUPABASE_SECRET_KEY: '' }, { SUPABASE_SECRET_KEY: 'invalid-not-a-key' },
      { SUPABASE_SECRET_KEY: 'sb_secret_' + 's'.repeat(19) }, { SUPABASE_SECRET_KEY: 'eyJmalformed' },
      { SUPABASE_PUBLISHABLE_KEY: '' }, { CARD_TEST_PG_BIN: '' },
    ]) assert.throws(() => validateLiveConfig({ ...env, ...change }, repo), error => {
      assert.match(error.message, /^SUPABASE_LIVE_[A-Z_]+$/);
      assert.ok(!error.message.includes(secret)); return true;
    });
    const link = join(root, 'outside-looking-link');
    symlinkSync(repo, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => validateLiveConfig({ ...env, CARD_SUPABASE_LIVE_OUTPUT: join(link, 'future') }, repo), /EXTERNAL_OUTPUT_REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unknown hosts, users, collection GET, query, fragment, redirect and unsupported methods never leave the process', async () => {
  let calls = 0;
  const guard = boundary(async () => { calls++; return json({}, 404); });
  for (const [url, init] of [
    ['https://example.invalid/auth/v1/admin/users/' + users[0].id, {}],
    [origin + '/auth/v1/admin/users/ffffffff-1111-4222-8333-444444444444', {}],
    [origin + '/auth/v1/admin/users', {}], [path(users[0]) + '?page=1', {}],
    [path(users[0]) + '#fragment', {}], [path(users[0]), { method: 'PUT' }],
    [path(users[0]), { redirect: 'follow' }], [path(users[0]), { redirect: 'manual' }],
    [origin + '/rest/v1/auth_accounts', { method: 'DELETE' }],
  ]) await assert.rejects(guard.fetch(url, authorized(init)), /SUPABASE_LIVE_/);
  assert.equal(calls, 0); assert.deepEqual(guard.requests, []);
});

test('missing or wrong incoming admin authentication is rejected instead of silently repaired', async () => {
  let calls = 0;
  const guard = boundary(async () => { calls++; return json({ code: 'user_not_found' }, 404); });
  for (const headers of [undefined, {}, { apikey: 'wrong' },
    { apikey: config.publishableKey }, { apikey: secret, authorization: `Bearer ${secret}` }]) {
    await assert.rejects(guard.fetch(path(users[0]), { headers }), /AUTH_HEADERS_INVALID/);
  }
  assert.equal(calls, 0); assert.deepEqual(guard.requests, []);
  await guard.fetch(new Request(path(users[0]), authorized()));
  assert.equal(calls, 1);
  const legacy = 'eyJsynthetic.payload.signature';
  const old = createAdminBoundary({ config: { ...config, secretKey: legacy }, runId, users,
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.apikey, legacy); assert.equal(init.headers.authorization, `Bearer ${legacy}`);
      return json({ code: 'user_not_found' }, 404);
    } });
  await assert.rejects(old.fetch(path(users[0]), { headers: { apikey: legacy } }), /AUTH_HEADERS_INVALID/);
  await old.fetch(path(users[0]), { headers: { apikey: legacy, authorization: `Bearer ${legacy}` } });
  assert.equal(old.requests.length, 1);
});

test('creation is bound to registered id, email and metadata and rejects unrelated properties', async () => {
  let calls = 0;
  const guard = boundary(async () => { calls++; return json(body(users[0])); });
  for (const change of [{ id: users[1].id }, { email: 'real@example.com' }, { email_confirm: false },
    { app_metadata: { purpose: 'other', run_id: runId } },
    { app_metadata: { purpose: 'NINE-CLOUD-M3-SUPABASE-LIVE', run_id: 'other' } },
    { password: 'not-permitted' }, { phone: '+123456789' }]) {
    await assert.rejects(guard.fetch(origin + '/auth/v1/admin/users', authorized({ method: 'POST', body: JSON.stringify({ ...body(users[0]), ...change }) })), /CREATE_/);
  }
  assert.equal(calls, 0);
  const created = await guard.fetch(origin + '/auth/v1/admin/users', post(users[0]));
  assert.deepEqual(await created.json(), body(users[0]));
  assert.ok(guard.ownedIds.has(users[0].id));
  await assert.rejects(guard.fetch(origin + '/auth/v1/admin/users', post(users[0])), /CREATE_ALREADY_ATTEMPTED/);
  assert.equal(calls, 1);
});

test('lost creation response permits exact-identity GET recovery, never a second creation', async () => {
  const calls = [];
  const guard = boundary(async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === 'POST') throw Error('secret provider response: ' + secret);
    return json({ user: body(users[0]) });
  });
  await assert.rejects(guard.fetch(origin + '/auth/v1/admin/users', post(users[0])), error => {
    assert.equal(error.message, 'SUPABASE_LIVE_NETWORK_UNKNOWN'); return true;
  });
  assert.equal(guard.ownedIds.size, 0);
  await assert.rejects(guard.fetch(origin + '/auth/v1/admin/users', post(users[0])), /CREATE_ALREADY_ATTEMPTED/);
  await guard.fetch(path(users[0]), authorized());
  assert.ok(guard.ownedIds.has(users[0].id));
  await guard.fetch(path(users[0]), authorized({ method: 'DELETE' }));
  assert.equal(calls.length, 3);
  assert.deepEqual(guard.requests.map(r => r.status), ['unknown', 200, 200]);
  assert.ok(calls.every(call => call.init.redirect === 'error' && call.init.signal instanceof AbortSignal));
  assert.ok(calls.every(call => call.init.headers.apikey === secret && !call.init.headers.authorization));
  assert.ok(!JSON.stringify(guard.requests).includes(secret));
  assert.ok(!JSON.stringify(guard.requests).includes(origin));
  assert.ok(!JSON.stringify(guard.requests).includes(users[0].email));
});

test('a matching pre-existing user and an explicitly rejected create are never owned', async () => {
  const guard = boundary(async (_url, init) => init.method === 'POST' ? json({ code: 'already_exists' }, 422) : json(body(users[0])));
  await assert.rejects(guard.fetch(path(users[0]), authorized()), /EXISTING_USER_NOT_OWNED/);
  await assert.rejects(guard.fetch(path(users[0]), authorized({ method: 'DELETE' })), /DELETE_NOT_OWNED/);
  await guard.fetch(origin + '/auth/v1/admin/users', post(users[0]));
  await assert.rejects(guard.fetch(path(users[0]), authorized()), /EXISTING_USER_NOT_OWNED/);
  assert.equal(guard.ownedIds.size, 0);
  assert.equal(guard.requests.length, 3);
});

test('mismatched successful response does not authorize deletion', async () => {
  for (const field of ['id', 'email', 'purpose', 'run_id']) {
    const wrong = structuredClone(body(users[0]));
    if (field === 'id' || field === 'email') wrong[field] = 'different';
    else wrong.app_metadata[field] = 'different';
    const guard = boundary(async () => json(wrong));
    await assert.rejects(guard.fetch(origin + '/auth/v1/admin/users', post(users[0])), /IDENTITY_MISMATCH/);
    await assert.rejects(guard.fetch(path(users[0]), authorized({ method: 'DELETE' })), /DELETE_NOT_OWNED/);
    assert.equal(guard.ownedIds.size, 0);
  }
});

test('a later identity mismatch revokes cleanup permission for a previously created account', async () => {
  const guard = boundary(async (_url, init) => json(init.method === 'POST' ? body(users[0]) : { ...body(users[0]), email: 'changed@example.invalid' }));
  await guard.fetch(origin + '/auth/v1/admin/users', post(users[0]));
  assert.ok(guard.ownedIds.has(users[0].id));
  await assert.rejects(guard.fetch(path(users[0]), authorized()), /IDENTITY_MISMATCH/);
  assert.equal(guard.ownedIds.size, 0);
  await assert.rejects(guard.fetch(path(users[0]), authorized({ method: 'DELETE' })), /DELETE_NOT_OWNED/);
  assert.equal(guard.requests.length, 2);
});

test('redirect responses and timed-out upstream calls fail without exposing provider details', async () => {
  const redirect = boundary(async () => new Response(null, { status: 302, headers: { location: 'https://example.invalid/' } }));
  await assert.rejects(redirect.fetch(path(users[0]), authorized()), /REDIRECT_FORBIDDEN/);
  assert.equal(redirect.requests[0].status, 302);
  let signal;
  const slow = createAdminBoundary({ config, runId, users, timeoutMs: 10,
    fetchImpl: async (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  await assert.rejects(slow.fetch(origin + '/auth/v1/admin/users', post(users[0])), /NETWORK_UNKNOWN/);
  assert.equal(signal.aborted, true);
  await assert.rejects(slow.fetch(origin + '/auth/v1/admin/users', post(users[0])), /CREATE_ALREADY_ATTEMPTED/);
  assert.equal(slow.requests[0].status, 'unknown');
});

test('timeout includes response body completion and an oversized response cannot establish ownership', async () => {
  let signal;
  const stalled = createAdminBoundary({ config, runId, users, timeoutMs: 10,
    fetchImpl: async (_url, init) => {
      signal = init.signal;
      return new Response(new ReadableStream({ start(controller) {
        init.signal.addEventListener('abort', () => controller.close(), { once: true });
      } }), { status: 200 });
    } });
  await assert.rejects(stalled.fetch(origin + '/auth/v1/admin/users', post(users[0])), /NETWORK_UNKNOWN/);
  assert.equal(signal.aborted, true);
  assert.equal(stalled.ownedIds.size, 0);
  assert.equal(stalled.requests[0].status, 200);
  const huge = boundary(async () => json({ ...body(users[0]), unrelated: 'x'.repeat(65_536) }));
  await assert.rejects(huge.fetch(origin + '/auth/v1/admin/users', post(users[0])), /RESPONSE_TOO_LARGE/);
  assert.equal(huge.ownedIds.size, 0);
});

test('404 remains an uninterpreted provider response and request and delete budgets are hard', async () => {
  const guard = boundary(async (_url, init) => init.method === 'POST' ? json(body(users[0])) : json({ code: 'not_the_user_error' }, 404));
  const result = await guard.fetch(path(users[0]), authorized());
  assert.deepEqual(await result.json(), { code: 'not_the_user_error' });
  assert.equal(guard.ownedIds.size, 0);
  for (let n = 1; n < 40; n++) await guard.fetch(path(users[0]), authorized());
  await assert.rejects(guard.fetch(path(users[0]), authorized()), /REQUEST_BUDGET_EXHAUSTED/);
  assert.equal(guard.requests.length, 40);
  const deletion = boundary(async (_url, init) => init.method === 'POST' ? json(body(users[0])) : json({ code: 'user_not_found' }, 404));
  await deletion.fetch(origin + '/auth/v1/admin/users', post(users[0]));
  for (let n = 0; n < 6; n++) await deletion.fetch(path(users[0]), authorized({ method: 'DELETE' }));
  await assert.rejects(deletion.fetch(path(users[0]), authorized({ method: 'DELETE' })), /DELETE_BUDGET_EXHAUSTED/);
  assert.equal(deletion.requests.filter(r => r.method === 'DELETE').length, 6);
});

test('caller cannot modify ownership or records and global fetch replacement cannot recurse', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const guard = boundary(async () => { calls++; return json({ code: 'user_not_found' }, 404); });
  guard.ownedIds.add(users[0].id);
  guard.requests.push({ label: 'forged', method: 'DELETE', status: 200 });
  await assert.rejects(guard.fetch(path(users[0]), authorized({ method: 'DELETE' })), /DELETE_NOT_OWNED/);
  try { globalThis.fetch = guard.fetch; await globalThis.fetch(path(users[0]), authorized()); }
  finally { globalThis.fetch = original; }
  assert.equal(calls, 1); assert.equal(guard.requests.length, 1);
});

test('later caller config mutation cannot redirect the captured tenant or key', async () => {
  const mutable = { ...config }, calls = [];
  const guard = createAdminBoundary({ config: mutable, runId, users, fetchImpl: async (url, init) => {
    calls.push({ origin: url.origin, key: init.headers.apikey }); return json({ code: 'user_not_found' }, 404);
  } });
  mutable.origin = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'; mutable.secretKey = 'changed';
  await assert.rejects(guard.fetch(mutable.origin + '/auth/v1/admin/users/' + users[0].id, authorized()), /REQUEST_FORBIDDEN/);
  await guard.fetch(path(users[0]), authorized());
  assert.deepEqual(calls, [{ origin, key: secret }]);
});
