import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/api-production-smoke.mjs', import.meta.url));
const preload = String.raw`
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const path = url.pathname;
  const mode = process.env.TEST_SMOKE_FIXTURE;
  if ((mode === 'html-health' && path === '/health') ||
      (mode === 'html-session' && path === '/api/auth/session')) {
    return new Response('<!doctype html><title>SPA fallback</title>', {
      status: path === '/health' ? 200 : 404,
      headers: { 'content-type': 'text/html' },
    });
  }
  if (mode === 'html-site' && url.hostname === 'play.example.invalid'
      && path === '/api/auth/session') {
    return new Response('<!doctype html><title>SPA fallback</title>', {
      status: 200, headers: { 'content-type': 'text/html' },
    });
  }
  if (mode === 'html-site-health' && url.hostname === 'play.example.invalid'
      && path === '/health') {
    return new Response('<!doctype html><title>SPA fallback</title>', {
      status: 200, headers: { 'content-type': 'text/html' },
    });
  }
  if (mode === 'cors-reflect' && url.pathname === '/health' && init.headers?.origin) {
    return Response.json({ status: 'ok' }, {
      headers: { 'access-control-allow-origin': init.headers.origin },
    });
  }
  if (path === '/health') {
    const origin = init.headers?.origin;
    return Response.json({ status: 'ok' }, {
      headers: origin === 'https://play.example.invalid'
        ? { 'access-control-allow-origin': origin } : {},
    });
  }
  if (path === '/ready') return Response.json({
    status: 'ready', dependencies: { database: mode === 'database-unready' ? 'failed' : 'ok' },
  });
  if (path === '/api/auth/session') return Response.json(
    { code: process.env.SMOKE_ROUTE_A === '1' ? 'NOT_FOUND' : 'UNAUTHENTICATED' },
    { status: process.env.SMOKE_ROUTE_A === '1' ? 404 : 401 });
  return new Response(null, { status: 404 });
};
`;

function run(mode, routeA, base = 'https://api.example.invalid', site = '') {
  return spawnSync(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(preload), script,
  ], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PUBLIC_API_BASE_URL: base,
      PUBLIC_SITE_BASE_URL: site, SMOKE_ROUTE_A: routeA ? '1' : '', TEST_SMOKE_FIXTURE: mode },
  });
}
for (const routeA of [false, true]) {
  test('CLI smoke accepts the JSON API contract for Route ' + (routeA ? 'A' : 'B'), () => {
    const result = run('valid', routeA);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'PUBLIC_API_SMOKE_PASS');
    assert.equal(JSON.parse(result.stdout).emailDelivery, 'NOT_TESTED');
    assert.equal(JSON.parse(result.stdout).siteRelay, 'NOT_TESTED');
  });
}
for (const routeA of [false, true]) {
  test('CLI smoke verifies the real site same-origin relay for Route ' + (routeA ? 'A' : 'B'), () => {
    const result = run('valid', routeA, 'https://api.example.invalid', 'https://play.example.invalid');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).siteRelay, 'PASS');
  });
}
test('CLI smoke rejects SPA HTML returned by the site API route', () => {
  const result = run('html-site', true, 'https://api.example.invalid', 'https://play.example.invalid');
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr);
  assert.equal(output.code, 'SITE_RELAY_FAILED');
  assert.deepEqual(output.siteRelayFailedPaths, ['/api/auth/session']);
});
test('CLI smoke rejects SPA HTML returned by the site health route', () => {
  const result = run('html-site-health', true, 'https://api.example.invalid', 'https://play.example.invalid');
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr);
  assert.equal(output.code, 'SITE_RELAY_FAILED');
  assert.deepEqual(output.siteRelayFailedPaths, ['/health']);
});
test('CLI smoke rejects CORS that reflects an untrusted Origin', () => {
  const result = run('cors-reflect', true, 'https://api.example.invalid', 'https://play.example.invalid');
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr);
  assert.ok(output.codes.includes('CORS_ORIGIN_FAILED'));
});
for (const mode of ['html-health', 'html-session', 'database-unready']) {
  test('CLI smoke rejects a status-only false positive: ' + mode, () => {
    const result = run(mode, true);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).code, 'API_SMOKE_FAILED');
  });
}
for (const base of ['http://api.example.invalid', 'https://localhost', 'https://play.localhost',
  'https://192.168.1.10', 'https://10.0.0.8', 'https://[::1]']) {
  test('CLI smoke rejects an invalid public origin: ' + base, () => {
    const result = run('valid', true, base);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).code, 'PUBLIC_HTTPS_API_REQUIRED');
  });
}
test('CLI smoke rejects an invalid site origin', () => {
  const result = run('valid', true, 'https://api.example.invalid', 'http://play.example.invalid');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'PUBLIC_HTTPS_SITE_REQUIRED');
});
