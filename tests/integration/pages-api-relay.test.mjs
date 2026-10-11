import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proxyApiRequest, proxyHealthRequest } from '../../functions/_lib/api-proxy.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const simulationEnv = {
  APP_ENV: 'simulation',
  API_UPSTREAM_ORIGIN: 'http://127.0.0.1:18789',
};

function context(path, init = {}, env = simulationEnv) {
  const request = new Request(new URL(path, 'https://play.jiuxiaogame.cn'), init);
  return { request, env };
}

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('Pages Functions are in the project root and only configured routes invoke them', () => {
  const routes = JSON.parse(readFileSync(resolve(root, 'apps/web/public/_routes.json'), 'utf8'));
  assert.deepEqual(Object.keys(routes).sort(), ['exclude', 'include', 'version']);
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ['/api/*', '/health', '/ready']);
  assert.deepEqual(routes.exclude, []);
  assert.ok(existsSync(resolve(root, 'functions/api/[[path]].js')));
  assert.ok(existsSync(resolve(root, 'functions/health.js')));
  assert.ok(existsSync(resolve(root, 'functions/ready.js')));
  assert.equal(existsSync(resolve(root, 'apps/web/public/functions/api/[[path]].js')), false);
  assert.ok(existsSync(resolve(root, 'apps/web/public/_headers')));
});

test('Route A blocks credential and account writes before any upstream request', async () => {
  const blockedPaths = [
    '/api/auth/guest',
    '/api/auth/guest/',
    '/api/auth/guest%2Fupgrade',
    '/api/auth/guest%252Fupgrade',
    '/api/auth/%67uest',
    '/api/auth//guest',
    '/api/auth/phone',
    '/api/auth/phone/request',
    '/api/account',
    '/api/account/capabilities',
    '/api/account/operation/begin',
  ];
  let upstreamCalls = 0;
  await withFetch(async () => { upstreamCalls += 1; throw new Error('unexpected upstream call'); }, async () => {
    for (const path of blockedPaths) {
      const response = await proxyApiRequest(context(path, { method: 'POST', body: '{}' }));
      assert.equal(response.status, 404, path);
      assert.equal((await response.json()).code, 'ROUTE_A_BLOCKED', path);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
    }
  });
  assert.equal(upstreamCalls, 0);
});

test('diagnostic reads pass through with same-origin, cookie, query, and safe headers only', async () => {
  let observed;
  const response = await withFetch(async (input, init) => {
    observed = { url: String(input), init };
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  }, () => proxyApiRequest(context('/api/auth/session?view=compact', {
    headers: {
      accept: 'application/json',
      cookie: 'jx_session=synthetic-session',
      origin: 'https://play.jiuxiaogame.cn',
      'x-forwarded-for': '203.0.113.77',
      'cf-connecting-ip': '203.0.113.77',
      'x-jiuxiao-account': 'synthetic-account',
    },
  })));

  assert.equal(response.status, 404);
  assert.equal(observed.url, 'http://127.0.0.1:18789/api/auth/session?view=compact');
  assert.equal(observed.init.headers.get('cookie'), 'jx_session=synthetic-session');
  assert.equal(observed.init.headers.get('origin'), 'https://play.jiuxiaogame.cn');
  assert.equal(observed.init.headers.get('x-jiuxiao-account'), 'synthetic-account');
  assert.equal(observed.init.headers.has('x-forwarded-for'), false);
  assert.equal(observed.init.headers.has('cf-connecting-ip'), false);
  assert.equal(observed.init.headers.has('host'), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('POST request body is preserved and oversized bodies fail closed', async () => {
  let capturedBody;
  const response = await withFetch(async (_input, init) => {
    capturedBody = new TextDecoder().decode(init.body);
    return Response.json({ accepted: true });
  }, () => proxyApiRequest(context('/api/turns', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://play.jiuxiaogame.cn' },
    body: JSON.stringify({ action: 'synthetic test action' }),
  })));
  assert.equal(response.status, 200);
  assert.equal(capturedBody, JSON.stringify({ action: 'synthetic test action' }));

  let upstreamCalls = 0;
  const tooLarge = new Request('https://play.jiuxiaogame.cn/api/turns', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array(8 * 1024 * 1024 + 1),
  });
  const oversizedResponse = await withFetch(async () => { upstreamCalls += 1; }, () => proxyApiRequest({ request: tooLarge, env: simulationEnv }));
  assert.equal(oversizedResponse.status, 413);
  assert.equal((await oversizedResponse.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(upstreamCalls, 0);
});

test('upstream cookie and download headers survive without caching', async () => {
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'content-disposition': 'attachment; filename="synthetic-export.json"',
    location: 'https://api.jiuxiaogame.cn/api/account/export',
  });
  headers.append('set-cookie', 'jx_session=synthetic-a; Path=/; HttpOnly; Secure; SameSite=Strict');
  headers.append('set-cookie', 'jx_csrf=synthetic-b; Path=/; Secure; SameSite=Strict');
  const response = await withFetch(async () => new Response('synthetic payload', { status: 200, headers }),
    () => proxyApiRequest(context('/api/diagnostics/export')));

  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="synthetic-export.json"');
  assert.equal(response.headers.get('location'), 'https://api.jiuxiaogame.cn/api/account/export');
  assert.deepEqual(response.headers.getSetCookie(), [
    'jx_session=synthetic-a; Path=/; HttpOnly; Secure; SameSite=Strict',
    'jx_csrf=synthetic-b; Path=/; Secure; SameSite=Strict',
  ]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(await response.text(), 'synthetic payload');
});

test('health and readiness routes are exact, GET/HEAD-only proxies', async () => {
  let calls = 0;
  const response = await withFetch(async input => {
    calls += 1;
    assert.equal(String(input), 'http://127.0.0.1:18789/ready');
    return Response.json({ status: 'ready' });
  }, () => proxyHealthRequest(context('/ready'), '/ready'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready' });

  const postResponse = await proxyHealthRequest(context('/health', { method: 'POST', body: '{}' }), '/health');
  const wrongPathResponse = await proxyHealthRequest(context('/api/health'), '/health');
  assert.equal(postResponse.status, 405);
  assert.equal(wrongPathResponse.status, 404);
  assert.equal(calls, 1);
});

test('production relay uses only the approved API origin on a production site host', async () => {
  let observedUrl;
  const response = await withFetch(async input => {
    observedUrl = String(input);
    return Response.json({ email: false, phone: false });
  }, () => proxyApiRequest(context('/api/auth/providers', {}, {})));

  assert.equal(response.status, 200);
  assert.equal(observedUrl, 'https://api.jiuxiaogame.cn/api/auth/providers');
});

test('unreachable upstreams, previews, and unapproved origins fail closed without leaking details', async () => {
  let calls = 0;
  const unreachable = await withFetch(async () => { calls += 1; throw new Error('synthetic secret detail'); },
    () => proxyApiRequest(context('/api/health')));
  assert.equal(unreachable.status, 503);
  assert.equal((await unreachable.json()).code, 'UPSTREAM_UNREACHABLE');

  const previewRequest = new Request('https://pr-42.jiuxiao-game.pages.dev/api/auth/providers');
  const preview = await proxyApiRequest({
    request: previewRequest,
    env: { API_UPSTREAM_ORIGIN: 'https://api.jiuxiaogame.cn' },
  });
  assert.equal(preview.status, 503);
  assert.equal((await preview.json()).code, 'UPSTREAM_CONFIG_INVALID');

  const unapproved = await proxyApiRequest(context('/api/health', {}, {
    APP_ENV: 'production',
    API_UPSTREAM_ORIGIN: 'http://127.0.0.1:18789',
  }));
  assert.equal(unapproved.status, 503);
  assert.equal((await unapproved.json()).code, 'UPSTREAM_CONFIG_INVALID');
  assert.equal(calls, 1);

  const nonLoopbackSimulation = await proxyApiRequest(context('/api/auth/providers', {}, {
    APP_ENV: 'simulation',
    API_UPSTREAM_ORIGIN: 'http://api.example.invalid',
  }));
  assert.equal(nonLoopbackSimulation.status, 503);
  assert.equal((await nonLoopbackSimulation.json()).code, 'UPSTREAM_CONFIG_INVALID');
  assert.equal(calls, 1);
});
