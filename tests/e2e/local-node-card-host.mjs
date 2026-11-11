// Actual ordinary Node entry, synthetic model, isolated PostgreSQL only.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { EmailAuthService } from '../../apps/api/dist/services/email-auth.js';
import { PostgresEmailAuthRepository } from '../../apps/api/dist/services/postgres-email-auth.js';
const { Pool } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('pg');
const databaseUrl = process.env.MAIN_COMPOSITION_TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).hostname !== '127.0.0.1' || !/^\/jiuxiao_test_main\d+$/.test(new URL(databaseUrl).pathname)) throw Error('ISOLATED_DATABASE_REQUIRED');
const pool = new Pool({ connectionString: databaseUrl });
const secret = randomBytes(32).toString('hex');
let code;
const issuer = new EmailAuthService(new PostgresEmailAuthRepository(pool, secret), async (_email, value) => { code = value; }, secret);
const email = `ordinary-${randomUUID()}@example.invalid`;
await issuer.requestCode(email); const login = await issuer.verify(email, code); assert(login);
const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['apps/api/dist/index.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
  ...process.env, NODE_ENV: 'test', CARD_LOCAL_MODE: 'synthetic', API_HOST: '127.0.0.1', API_PORT: String(port), DATABASE_URL: databaseUrl,
  AUTH_ENABLED: 'true', SUPABASE_AUTH_ENABLED: 'false', AUTH_SECRET: secret, AUTH_PUBLIC_ORIGIN: origin,
  AUTH_MAILER: 'smtp', AUTH_MAIL_FROM: 'ordinary@example.invalid', SMTP_URL: 'smtp://127.0.0.1:1',
  TURN_RULES_MODULE: '', JIUXIAO_RELEASE_CHANNEL: '', STORY_ARCHIVE_ENABLED: 'false', AUTH_MAIL_PREFLIGHT: 'false',
} });
let errors = ''; child.stderr.on('data', b => { errors += b; }); child.stdout.on('data', () => {});
const request = (path, method = 'GET', body, cookie = `jx_session=${login.token}`) => fetch(origin + path, { method, headers: { origin, cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(origin + '/ready')).ok) { ready = true; break; } } catch {} if (child.exitCode !== null) throw Error('HOST_EXITED: ' + errors); await new Promise(r => setTimeout(r, 100)); }
  assert(ready, errors);
  assert.equal((await request('/api/auth/session')).status, 200);
  assert.equal((await request('/api/card-import/cards', 'GET', undefined, '')).status, 401);
  const raw = Buffer.from(JSON.stringify({ name: '普通入口测试卡', description: '合成', personality: '友好', scenario: '测试', first_mes: '默认开场', mes_example: '示例', alternate_greetings: ['备用开场'] }));
  const imported = await (await request('/api/card-import/imports', 'POST', { filename: 'fixture.json', kind: 'card', rightsConfirmed: true, bytesBase64: raw.toString('base64') })).json();
  const card = await (await request('/api/card-import/cards', 'POST', { importId: imported.id, parentId: null, source: 'synthetic', notes: '', links: [] })).json(); assert(card.id);
  const id = randomUUID();
  const session = await (await request('/api/card-import/sessions', 'POST', { id, cardId: card.id, greetingIndex: 0, recursiveWorldbook: false })).json(); assert.equal(session.greeting_index, 0);
  assert.equal((await (await request(`/api/card-import/sessions/${id}`)).json()).greeting, '备用开场');
  const key = randomUUID(), action = { idempotencyKey: key, expectedRevision: 0, action: '你好' };
  const result = await (await request(`/api/card-import/sessions/${id}/actions`, 'POST', action)).json(); assert.equal(result.status, 'completed');
  assert.deepEqual(await (await request(`/api/card-import/sessions/${id}/actions`, 'POST', action)).json(), result);
  const recovered = await (await request(`/api/card-import/sessions/${id}/requests/${key}`)).json(); assert.equal(recovered.status, 'completed');
  const history = await (await request(`/api/card-import/sessions/${id}/history`)).json(); assert.equal(history.length, 1);
  console.log(JSON.stringify({ status: 'PASS', entry: 'apps/api/dist/index.js', syntheticProvider: true, realSession: true, cardImport: true, greeting: true, idempotentRecovery: true, history: true, migrationsRunByHost: false }));
} finally { child.kill(); await once(child, 'exit').catch(() => {}); await pool.end(); }
