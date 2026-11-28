import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { checkCaddyfile, checkPagesHeaders, checkRepository, parseCaddyfile } from './response-headers-check.mjs';

const root = resolve(import.meta.dirname, '../..');
const caddy = readFileSync(resolve(root, 'deployment/Caddyfile'), 'utf8');
const pages = readFileSync(resolve(root, 'apps/web/public/_headers'), 'utf8');

test('the committed Caddyfile and Pages _headers satisfy the header policy', () => {
  assert.deepEqual(checkRepository(), []);
});

test('Caddyfile parsing keeps quoted values and nested blocks', () => {
  const tree = parseCaddyfile(caddy);
  const site = tree.children.find(node => node.tokens[0] === 'api.jiuxiaogame.cn');
  assert.ok(site);
  const header = site.children.find(node => node.tokens[0] === 'header');
  const csp = header.children.find(node => node.tokens[0] === 'Content-Security-Policy');
  assert.match(csp.tokens[1], /^default-src 'none'; frame-ancestors/);
  assert.throws(() => parseCaddyfile('a {\n'), /UNBALANCED/);
});

test('removing a required header from either Caddy block fails', () => {
  for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
    const lines = caddy.split('\n');
    const first = lines.findIndex(line => line.trim().startsWith(name));
    const dropped = lines.filter((_, index) => index !== first).join('\n');
    assert.ok(checkCaddyfile(dropped).some(problem => problem.includes(`missing ${name}`) && !problem.includes('handle_errors')), name);
    const last = lines.findLastIndex(line => line.trim().startsWith(name));
    const droppedErrors = lines.filter((_, index) => index !== last).join('\n');
    assert.ok(checkCaddyfile(droppedErrors).some(problem => problem.includes('handle_errors') && problem.includes(`missing ${name}`)), name);
  }
});

test('weakened Caddy values and a lifted Route A block fail', () => {
  assert.ok(checkCaddyfile(caddy.replace('X-Content-Type-Options nosniff', 'X-Content-Type-Options off')).some(problem => problem.includes('must be nosniff')));
  assert.ok(checkCaddyfile(caddy.replace('Referrer-Policy strict-origin-when-cross-origin', 'Referrer-Policy unsafe-url')).some(problem => problem.includes('leaks full URLs')));
  assert.ok(checkCaddyfile(caddy.replace(/frame-ancestors 'self'; /g, '')).some(problem => problem.includes('frame-ancestors')));
  assert.ok(checkCaddyfile(caddy.replace('    header {\n', '    header {\n        -Content-Security-Policy\n')).some(problem => problem.includes('removed')));
  assert.ok(checkCaddyfile(caddy.replace('respond @blocked 404', 'respond @blocked 200')).some(problem => problem.includes('respond 404')));
  assert.ok(checkCaddyfile(caddy.replace(' /api/account /api/account/*', '')).some(problem => problem.includes('/api/account')));
  assert.ok(checkCaddyfile('example.org {\n}\n').some(problem => problem.includes('no production site')));
});

test('Pages _headers must cover /* and may not detach required headers', () => {
  for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
    const dropped = pages.split('\n').filter(line => !line.trim().startsWith(`${name}:`)).join('\n');
    assert.ok(checkPagesHeaders(dropped).some(problem => problem.includes(`missing ${name}`)), name);
  }
  assert.ok(checkPagesHeaders(pages.replace('/*', '/index.html')).some(problem => problem.includes('missing the /* rule')));
  assert.ok(checkPagesHeaders(`${pages}/feedback/*\n  ! Content-Security-Policy\n`).some(problem => problem.includes('detaches Content-Security-Policy')));
});
