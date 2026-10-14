import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createPagesApiStub } from '../fixtures/pages-api-stub.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const caddy = arg('--caddy');
const scratch = await mkdtemp(join(tmpdir(), 'jiuxiao-environment-runtime-'));
const output = resolve(arg('--output') ?? join(scratch, 'results.json'));
const checks = [];
const children = [];
const seen = [];
const upstream = createPagesApiStub({ onRequest: event => seen.push(event) });
let upstreamPort;
let closing;

function safeEnvironment() {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE',
    'LOCALAPPDATA', 'APPDATA', 'SystemDrive', 'ComSpec', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env, WRANGLER_SEND_METRICS: 'false', CI: 'true',
    XDG_DATA_HOME: join(scratch, 'caddy-data'), XDG_CONFIG_HOME: join(scratch, 'caddy-config'),
  };
}
function start(binary, args, cwd = scratch) {
  const child = spawn(binary, args, { cwd, env: safeEnvironment(), windowsHide: true });
  child.logs = '';
  child.spawnError = null;
  child.on('error', error => { child.spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { child.logs = (child.logs + chunk.toString()).slice(-12000); });
  }
  children.push(child);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.spawnError) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
  await Promise.race([
    new Promise(done => child.once('exit', done)),
    delay(3000),
  ]);
}
async function cleanup() {
  if (closing) return closing;
  closing = (async () => {
    for (const child of children.reverse()) await stop(child);
    if (upstream.listening) {
      upstream.closeAllConnections();
      await new Promise(done => upstream.close(done));
    }
  })();
  return closing;
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await cleanup(); process.exit(130); });
}
async function freePort() {
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
function send(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((done, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => done({
        status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    request.setTimeout(10000, () => request.destroy(new Error('LOCAL_SIMULATION_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
}
async function waitFor(child, port) {
  const expires = Date.now() + 30000;
  while (Date.now() < expires) {
    if (child.spawnError) throw child.spawnError;
    if (child.exitCode !== null) throw new Error('Runtime exited: ' + child.logs);
    try {
      if ((await send(port, '/health')).status === 200) return;
    } catch { /* wait for local listener */ }
    await delay(100);
  }
  throw new Error('Runtime did not start: ' + child.logs);
}
async function check(name, run) {
  await run();
  checks.push({ name, status: 'PASS' });
}
function apiResponse(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers['content-type'] ?? '', /application\/json/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  const data = JSON.parse(response.body);
  if (code) assert.equal(data.code, code);
  return data;
}

try {
  await new Promise(done => upstream.listen(0, '127.0.0.1', done));
  upstreamPort = upstream.address().port;
  const project = join(scratch, 'pages');
  const assets = join(project, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(join(root, 'functions'), join(project, 'functions'), { recursive: true });
  await cp(join(root, 'apps/web/public/_routes.json'), join(assets, '_routes.json'));
  await cp(join(root, 'apps/web/public/_headers'), join(assets, '_headers'));
  await writeFile(join(assets, 'index.html'), '<!doctype html><title>simulation</title>SIMULATION_STATIC');
  await writeFile(join(assets, 'probe.txt'), 'SIMULATION_ASSET');
  const pagesPort = await freePort();
  const pages = start(process.execPath, [
    join(root, 'apps/api/node_modules/wrangler/bin/wrangler.js'),
    'pages', 'dev', assets, '--ip', '127.0.0.1', '--port', String(pagesPort),
    '--inspector-port', String(await freePort()), '--compatibility-date', '2026-10-04',
    '--binding', 'APP_ENV=simulation',
    '--binding', 'API_UPSTREAM_ORIGIN=http://127.0.0.1:' + upstreamPort,
    '--persist-to', join(scratch, 'pages-state'), '--log-level', 'warn',
  ], project);
  await waitFor(pages, pagesPort);

  const blocked = [
    '/api/auth/guest', '/api/auth/guest/', '/api//auth/guest', '/api/auth//guest',
    '/api/auth/guest%2Fupgrade', '/api/auth/guest%252Fupgrade', '/api/auth/%67uest',
    '/api/%2Fauth/guest', '/api//account', '/api/account', '/api/account/capabilities',
    '/api/auth/phone', '/api/auth/phone/request', '/api/auth/code',
  ];
  for (const path of blocked) {
    await check('pages denies ' + path, async () => {
      const before = seen.length;
      apiResponse(await send(pagesPort, path, { method: 'POST', body: '{}' }), 404, 'ROUTE_A_BLOCKED');
      assert.equal(seen.length, before, 'Blocked request reached upstream');
    });
  }
  await check('pages API root is JSON, not static fallback', async () => {
    apiResponse(await send(pagesPort, '/api'), 404, 'NOT_FOUND');
  });
  await check('pages invalid encoding fails before upstream', async () => {
    const before = seen.length;
    apiResponse(await send(pagesPort, '/api/%ZZ'), 400, 'INVALID_API_PATH');
    assert.equal(seen.length, before);
  });
  await check('pages static and SPA paths stay available', async () => {
    for (const path of ['/', '/lobby']) {
      const response = await send(pagesPort, path);
      assert.equal(response.status, 200);
      assert.match(response.body, /SIMULATION_STATIC/);
    }
    assert.equal((await send(pagesPort, '/probe.txt')).body, 'SIMULATION_ASSET');
  });
  await check('pages health, readiness and diagnostic reads', async () => {
    apiResponse(await send(pagesPort, '/health'), 200);
    apiResponse(await send(pagesPort, '/ready'), 200);
    apiResponse(await send(pagesPort, '/api/auth/session'), 404, 'NOT_FOUND');
    assert.deepEqual(apiResponse(await send(pagesPort, '/api/auth/providers'), 200), { email: false, phone: false });
    const head = await send(pagesPort, '/health', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    const before = seen.length;
    apiResponse(await send(pagesPort, '/health', { method: 'POST', body: '{}' }), 405, 'METHOD_NOT_ALLOWED');
    assert.equal(seen.length, before);
  });
  await check('pages preserves body, cookie and query without trusting client IP headers', async () => {
    const payload = JSON.stringify({ action: 'synthetic action' });
    const data = apiResponse(await send(pagesPort, '/api/echo?probe=1', {
      method: 'POST', body: payload, headers: {
        origin: 'https://play.jiuxiaogame.cn', cookie: 'jx_session=synthetic-session',
        'content-type': 'application/json', 'x-forwarded-for': '203.0.113.77',
        'cf-connecting-ip': '203.0.113.77',
      },
    }), 200);
    assert.equal(data.body, payload);
    assert.equal(data.cookie, 'jx_session=synthetic-session');
    assert.equal(data.origin, 'https://play.jiuxiaogame.cn');
    assert.equal(data.path, '/api/echo?probe=1');
    assert.equal(data.forwardedFor, null);
    assert.equal(data.connectingIp, null);
  });
  await check('pages rejects oversized request bodies before upstream', async () => {
    const before = seen.length;
    apiResponse(await send(pagesPort, '/api/echo', {
      method: 'POST', body: Buffer.alloc(8 * 1024 * 1024 + 1),
      headers: { 'content-type': 'application/octet-stream' },
    }), 413, 'PAYLOAD_TOO_LARGE');
    assert.equal(seen.length, before);
  });
  await check('pages preserves independent cookies and downloads', async () => {
    const response = await send(pagesPort, '/api/diagnostics/export');
    assert.equal(response.status, 200);
    assert.equal(response.body, 'synthetic payload');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['set-cookie'].length, 2);
    assert.match(response.headers['content-disposition'], /synthetic-export/);
  });

  let caddyPort;
  let caddyVersion = 'NOT_TESTED';
  if (caddy) {
    const source = await readFile(join(root, 'deployment/Caddyfile'), 'utf8');
    assert.equal(source.split('api.jiuxiaogame.cn {').length, 2);
    assert.equal(source.split('reverse_proxy api:8787').length, 2);
    caddyPort = await freePort();
    const simulated = '{\n admin off\n auto_https off\n}\n' + source
      .replace('api.jiuxiaogame.cn {', 'http://127.0.0.1:' + caddyPort + ' {')
      .replace('reverse_proxy api:8787', 'reverse_proxy 127.0.0.1:' + upstreamPort);
    const config = join(scratch, 'Caddyfile');
    await writeFile(config, simulated);
    const version = spawnSync(caddy, ['version'], { env: safeEnvironment(), encoding: 'utf8', windowsHide: true });
    assert.equal(version.status, 0, version.stderr);
    caddyVersion = version.stdout.trim();
    const validation = spawnSync(caddy, ['validate', '--config', config, '--adapter', 'caddyfile'],
      { env: safeEnvironment(), encoding: 'utf8', windowsHide: true });
    assert.equal(validation.status, 0, validation.stderr);
    checks.push({ name: 'Caddy config validation', status: 'PASS' });
    const proxy = start(caddy, ['run', '--config', config, '--adapter', 'caddyfile']);
    await waitFor(proxy, caddyPort);
    for (const path of [...blocked, '/api/auth/refresh/', '/api/auth/logout/', '/API/AUTH/GUEST']) {
      await check('Caddy denies ' + path, async () => {
        const before = seen.length;
        const response = await send(caddyPort, path, { method: 'POST', body: '{}' });
        assert.ok([400, 404].includes(response.status), path + ' status=' + response.status);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.headers['x-content-type-options'], 'nosniff');
        assert.equal(seen.length, before, 'Blocked request reached upstream');
      });
    }
    await check('Caddy fixes CORS for arbitrary origins and preserves diagnostics', async () => {
      for (const origin of ['https://evil.example', 'https://play.jiuxiaogame.cn']) {
        const response = await send(caddyPort, '/health', { headers: { origin } });
        apiResponse(response, 200);
        assert.equal(response.headers['access-control-allow-origin'], 'https://play.jiuxiaogame.cn');
      }
      apiResponse(await send(caddyPort, '/api/auth/session'), 404, 'NOT_FOUND');
      apiResponse(await send(caddyPort, '/api/auth/providers'), 200);
    });
  }
  upstream.closeAllConnections();
  await new Promise(done => upstream.close(done));
  await check('pages returns private JSON 503 when upstream stops', async () => {
    apiResponse(await send(pagesPort, '/api/echo'), 503, 'UPSTREAM_UNREACHABLE');
  });
  if (caddyPort) {
    await check('Caddy reports upstream failure without success or caching', async () => {
      const response = await send(caddyPort, '/health');
      assert.equal(response.status, 502);
      assert.equal(response.headers['cache-control'], 'no-store');
    });
  }

  const fingerprints = {};
  for (const path of ['functions/_middleware.js', 'functions/_lib/api-proxy.mjs',
    'apps/web/public/_routes.json', 'deployment/Caddyfile', 'deployment/api-production.compose.yml', 'docker-compose.yml',
    'tests/integration/environment-runtime.mjs', 'tests/fixtures/pages-api-stub.mjs']) {
    fingerprints[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
  const report = {
    status: 'ENVIRONMENT_SIMULATION_PASS', at: new Date().toISOString(),
    scope: 'isolated loopback fixtures only', productionDeployment: 'NOT_PERFORMED',
    realMailDelivery: 'NOT_TESTED', physicalDevices: 'NOT_TESTED',
    caddy: caddyVersion, checks, fingerprints,
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, passed: checks.length, caddy: caddyVersion, output }));
} finally {
  await cleanup();
}
