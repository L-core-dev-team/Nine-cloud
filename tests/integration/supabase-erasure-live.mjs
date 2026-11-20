// Opt-in M3 test host. Never imported by the API, maintenance CLI or CI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { access, chmod, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminBoundary, validateLiveConfig } from './supabase-erasure-live-guard.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const purpose = 'NINE-CLOUD-M3-SUPABASE-LIVE';
const mode = process.argv[2] ?? '--check';
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0) throw Error('TEST_CHECKOUT_REQUIRED');
  return r.stdout.trim();
};
const fail = code => { throw Error(code); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pgExe = (bin, name) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const json = (value, status = 200) => Response.json(value, { status });
const notFound = () => json({ code: 404, error_code: 'user_not_found', msg: 'User not found' }, 404);

// Uses no sockets: exercises the same HTTP boundary and application adapter.
function simulatedAuth() {
  const rows = new Map();
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init.method ?? 'GET';
    const id = url.pathname.split('/').at(-1);
    if (method === 'POST') {
      const user = JSON.parse(init.body);
      if (rows.has(user.id)) return json({ code: 'conflict' }, 422);
      rows.set(user.id, { ...user, email_confirmed_at: new Date().toISOString() });
      return json(rows.get(user.id));
    }
    if (!rows.has(id)) return notFound();
    if (method === 'GET') return json(rows.get(id));
    if (method === 'DELETE') { rows.delete(id); return json({}); }
    return json({ code: 'unexpected_method' }, 405);
  };
}

async function run() {
  if (!['--check', '--simulate', '--live'].includes(mode) || process.argv.length > 3)
    fail('USAGE_CHECK_SIMULATE_OR_LIVE');
  const simulation = mode === '--simulate';
  const head = git('rev-parse', 'HEAD');
  const clean = git('status', '--porcelain=v1') === '';
  const projectRef = 'a'.repeat(20);
  const env = simulation ? {
    ...process.env, NODE_ENV: 'test',
    CARD_SUPABASE_LIVE_CONFIRM: 'SYNTHETIC_USERS_ONLY',
    CARD_SUPABASE_LIVE_PROJECT_REF: projectRef,
    SUPABASE_URL: 'https://' + projectRef + '.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_' + 'a'.repeat(40),
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'b'.repeat(40),
    CARD_SUPABASE_LIVE_COMMIT: head,
    CARD_SUPABASE_LIVE_OUTPUT: process.env.CARD_SUPABASE_LIVE_OUTPUT ?? join(tmpdir(), 'nine-cloud-m3-simulation'),
  } : process.env;
  // Validate before loading application modules, opening PG or issuing HTTP.
  const config = validateLiveConfig(env, root);
  if (head !== config.expectedCommit) fail('LIVE_COMMIT_MISMATCH');
  if (!simulation && !clean) fail('LIVE_CLEAN_CHECKOUT_REQUIRED');
  for (const name of ['initdb', 'pg_ctl', 'postgres']) await access(pgExe(config.pgBin, name));
  if (mode === '--check') {
    console.log(JSON.stringify({ status: 'PREFLIGHT_PASS', commit: head, requests: 0, databaseStarted: false }));
    return;
  }

  // Build from the checked revision: ignored/stale dist must not masquerade as
  // evidence for HEAD. No installs, source changes or generated author rules.
  const build = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['-r', '--filter', '@jiuxiao/api...', 'build'], {
      cwd: root, stdio: 'inherit', timeout: 240_000, windowsHide: true,
      shell: process.platform === 'win32',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) =>
        !/^(PG|DATABASE_URL|ACCOUNT_ERASURE_DATABASE_URL|SUPABASE|NARRATIVE_KEY|CARD_SUPABASE|AUTH_SECRET|AUTH_IDENTITY)/i.test(k))),
    });
  if (build.status !== 0) fail('CANDIDATE_BUILD_FAILED');
  if (git('rev-parse', 'HEAD') !== head || (!simulation && git('status', '--porcelain=v1') !== ''))
    fail('CHECKOUT_CHANGED_DURING_BUILD');
  async function artifactDigest() {
    const hash = createHash('sha256'); let files = 0;
    async function visit(path) {
      for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path + '/' + entry.name;
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile()) { hash.update(file + '\0'); hash.update(await readFile(join(root, file))); files++; }
        else fail('BUILD_SYMLINK_REFUSED');
      }
    }
    for (const path of ['packages/contracts/dist','packages/content/dist','packages/domain/dist','apps/api/dist']) await visit(path);
    return { sha256: hash.digest('hex'), files };
  }
  const buildArtifacts = await artifactDigest();
  const { Pool } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('pg');
  const [
    { AccountLifecycle }, { EmailAuthService, hashToken }, { PostgresEmailAuthRepository },
    { SupabaseAuthService }, { deliverExternalErasure }, { eraseCardImports },
    { CardImportService }, { createApp }, { AccountExport },
  ] = await Promise.all([
    import('../../apps/api/dist/services/account-lifecycle.js'),
    import('../../apps/api/dist/services/email-auth.js'),
    import('../../apps/api/dist/services/postgres-email-auth.js'),
    import('../../apps/api/dist/services/supabase-auth.js'),
    import('../../apps/api/dist/services/external-erasure.js'),
    import('../../apps/api/dist/card-import/host.js'),
    import('../../apps/api/dist/card-import/service.js'),
    import('../../apps/api/dist/app.js'),
    import('../../apps/api/dist/services/account-export.js'),
  ]);
  await mkdir(config.outputRoot, { recursive: true, mode: 0o700 });
  const output = await mkdtemp(join(config.outputRoot, simulation ? 'simulation-' : 'live-'));
  await chmod(output, 0o700);
  const runId = randomUUID();
  const users = ['normal', 'lost-ack', 'control'].map(label => ({
    id: randomUUID(), email: 'nc-m3-' + runId + '-' + label + '@example.invalid', label,
  }));
  // Planned UUIDs are persisted before POST, including for unknown creation outcomes.
  await writeFile(join(output, 'private-users.json'), JSON.stringify({ runId, projectRef: config.projectRef, users }), { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  const boundary = createAdminBoundary({
    config, runId, users, fetchImpl: simulation ? simulatedAuth() : originalFetch.bind(globalThis),
  });
  globalThis.fetch = boundary.fetch;
  const receipt = {
    task: 'CARD-SUPABASE-ERASURE-LIVE-01', mode: simulation ? 'LOCAL_SIMULATION' : 'LIVE',
    commit: head, tree: git('rev-parse', 'HEAD^{tree}'), cleanCheckout: clean, buildArtifacts,
    status: 'RUNNING', checks: [], requests: [],
    boundary: 'Local email proof/Cookie + restricted real PG + existing Supabase adapter. No Supabase login/OTP test.',
    failureInjection: 'Throw at test adapter after a successful DELETE response; not an observed supplier outage.',
    realModelRequests: 0, remoteCleanup: [], databaseStopped: false,
  };
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  const checkInterrupt = () => { if (interrupted) fail('TEST_INTERRUPTED'); };
  const data = join(output, 'pg');
  const password = randomBytes(32).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const identitySecret = randomBytes(32).toString('hex');
  // No cloud credentials or inherited PG target is passed to subprocesses.
  const pgEnv = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => !/^(PG|DATABASE_URL|ACCOUNT_ERASURE_DATABASE_URL|SUPABASE|NARRATIVE_KEY|CARD_SUPABASE|AUTH_SECRET|AUTH_IDENTITY)/i.test(k)));
  function pg(name, args, allowFailure = false) {
    const r = spawnSync(pgExe(config.pgBin, name), args, {
      env: pgEnv, stdio: 'ignore', timeout: 45_000, windowsHide: true,
    });
    if (!allowFailure && r.status !== 0) fail('TEST_PG_' + name.toUpperCase() + '_FAILED');
    return r.status;
  }
  const pools = [];
  let initialized = false, failure;
  const headers = { apikey: config.secretKey, 'content-type': 'application/json' };
  if (!config.secretKey.startsWith('sb_')) headers.authorization = 'Bearer ' + config.secretKey;
  async function adminRequest(user, method, body) {
    return boundary.fetch(config.origin + '/auth/v1/admin/users' + (method === 'POST' ? '' : '/' + user.id), {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function lookup(user) {
    const r = await adminRequest(user, 'GET');
    if (r.status === 404) {
      const body = await r.json();
      if (body.error_code !== 'user_not_found') fail('UNCONFIRMED_AUTH_404');
      return null;
    }
    if (r.status !== 200) fail('ADMIN_LOOKUP_UNCONFIRMED');
    return r.json();
  }
  async function createRemote(user) {
    if (await lookup(user)) fail('PREEXISTING_USER_REFUSED');
    const r = await adminRequest(user, 'POST', {
      id: user.id, email: user.email, email_confirm: true,
      app_metadata: { purpose, run_id: runId },
    });
    if (!r.ok) fail('ADMIN_CREATE_FAILED');
    if (!await lookup(user)) fail('ADMIN_CREATE_UNCONFIRMED');
  }
  const record = name => { receipt.checks.push({ name, status: 'PASS' }); console.log(name + ': PASS'); };
  try {
    const listener = createServer();
    let port;
    try {
      listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
      port = listener.address().port;
    } finally { if (listener.listening) await new Promise((ok, no) => listener.close(e => e ? no(e) : ok())); }
    await writeFile(join(output, 'pg-password'), password, { mode: 0o600 });
    pg('initdb', ['-D', data, '-U', 'fixture_owner', '-A', 'scram-sha-256', '--encoding=UTF8', '--no-locale', '--pwfile=' + join(output, 'pg-password')]);
    initialized = true;
    pg('pg_ctl', ['-D', data, '-l', join(output, 'postgres.log'), '-o', '-c unix_socket_directories= -h 127.0.0.1 -p ' + port, '-w', 'start']);
    const target = new URL('postgresql://fixture_owner@127.0.0.1:' + port + '/postgres'); target.password = password;
    const pool = user => {
      const u = new URL(target); if (user) u.username = user;
      const p = new Pool({ connectionString: u.href, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
      pools.push(p); return p;
    };
    const maintenance = pool();
    assert.equal(await realpath((await maintenance.query('SHOW data_directory')).rows[0].data_directory), await realpath(data));
    await maintenance.query('CREATE DATABASE jiuxiao_test_m3_live');
    await maintenance.end(); pools.splice(pools.indexOf(maintenance), 1);
    target.pathname = '/jiuxiao_test_m3_live';
    const admin = pool();
    const migrationRoot = join(root, 'packages/db/drizzle');
    // Same formal migration set as the existing card PG fixture; never packages/db/pending.
    for (const name of (await readdir(migrationRoot)).filter(x => /^\d{4}_.*\.sql$/.test(x)).sort())
      await admin.query(await readFile(join(migrationRoot, name), 'utf8'));
    await admin.query('CREATE ROLE jiuxiao_narrative_erasure NOLOGIN');
    for (const role of ['joint_runtime', 'joint_eraser'])
      await admin.query("CREATE ROLE " + role + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "'");
    await admin.query('GRANT jiuxiao_narrative_erasure TO joint_eraser');
    await admin.query('GRANT USAGE ON SCHEMA public TO joint_runtime,joint_eraser; GRANT USAGE ON SCHEMA card_import TO joint_eraser');
    await admin.query('GRANT SELECT ON auth_accounts,auth_sessions,account_operations TO joint_runtime; GRANT UPDATE(last_seen_at) ON auth_accounts TO joint_runtime; GRANT UPDATE(phase) ON account_operations TO joint_runtime');
    await admin.query('GRANT SELECT,DELETE ON auth_accounts,auth_sessions,auth_challenges,cloud_archive_trash,game_saves,entitlement_ledger_entries,entitlement_balances,turn_events,turn_requests,npc_memory_journals,npc_authorized_observation_outbox,npc_memory_observation_supersessions TO joint_eraser');
    await admin.query('GRANT SELECT,INSERT,UPDATE ON account_operations TO joint_eraser; GRANT INSERT ON account_lifecycle_audit TO joint_eraser; GRANT SELECT,DELETE ON account_rate_limits TO joint_eraser; GRANT UPDATE(closed_at) ON auth_accounts TO joint_eraser; GRANT UPDATE(revision) ON game_saves TO joint_eraser');
    await admin.query(await readFile(join(root, 'packages/db/permissions/erasure-delivery.sql'), 'utf8'));
    for (const table of ['model_calls','group_settings','group_messages','group_turns','group_participant_worldbooks','group_participants','requests','session_worldbooks','session_personas','sessions','persona_versions','personas','global_worldbooks','duplicate_requests','links','cards','imports'])
      await admin.query('GRANT SELECT,DELETE ON card_import.' + table + ' TO joint_eraser');
    const runtime = pool('joint_runtime'), erasure = pool('joint_eraser');
    const mail = new Map(), send = async (email, code) => { mail.set(email, code); };
    const issuer = new EmailAuthService(new PostgresEmailAuthRepository(admin, secret), send, secret);
    const resolver = new EmailAuthService(new PostgresEmailAuthRepository(runtime, secret), send, secret);
    const supabase = new SupabaseAuthService(runtime, resolver, {
      url: config.origin, publishableKey: config.publishableKey, adminKey: config.secretKey,
      identitySecret, enabledEmail: true, enabledPhone: false, phoneHookConfigured: false,
      phoneCaptchaConfigured: false, allowedPhonePrefixes: [], phoneBudgetCents: 0, phoneMonthlySegments: 0,
      phoneIpHourlyLimit: 0, phoneIpDailyLimit: 0, phoneOwnerHourlyLimit: 0, phoneOwnerDailyLimit: 0,
    });
    const fixtures = [];
    const cards = new CardImportService(admin);
    for (const user of users) {
      checkInterrupt();
      await issuer.requestCode(user.email);
      const login = await issuer.verify(user.email, mail.get(user.email));
      assert.ok(login);
      const owner = login.session.ownerId, hash = hashToken(login.token);
      const policy = new AccountLifecycle(admin, send, secret, 'm3-test-only', true);
      const op = await policy.begin(owner, hash, 'delete');
      await policy.verify(owner, hash, op.operationId, mail.get(user.email));
      const imported = await cards.preview(owner, 'synthetic.json', 'card', Buffer.from(JSON.stringify({
        name: 'M3 synthetic', description: 'test', personality: 'test', scenario: 'test', first_mes: 'hello', mes_example: 'test',
      })));
      await cards.confirm(owner, { importId: imported.id, parentId: null, source: 'synthetic', notes: '', links: [] });
      const allowance = randomUUID();
      await admin.query('INSERT INTO card_import.model_allowances VALUES($1,$2,0)', [allowance, 'm3-synthetic-no-generation']);
      await admin.query('UPDATE card_import.model_allowances SET used=used+1 WHERE approval_id=$1', [allowance]);
      await admin.query('INSERT INTO card_import.model_calls(approval_id,owner_id,session_id,key) VALUES($1,$2,$3,$4)', [allowance, owner, randomUUID(), randomUUID()]);
      await createRemote(user);
      await admin.query("INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at) VALUES($1,'email',$2,$3,now())",
        [user.id, createHmac('sha256', identitySecret).update('email\0' + user.email).digest('hex'), owner]);
      fixtures.push({ user, owner, hash, operation: op.operationId, allowance, cookie: 'jx_session=' + login.token });
    }
    async function snapshot(f) {
      const rows = [];
      for (const table of ['auth_accounts','auth_sessions','account_operations','auth_external_identities','card_import.imports','card_import.cards','card_import.model_calls'])
        rows.push((await admin.query('SELECT to_jsonb(t) AS value FROM ' + table + ' t WHERE ' + (table === 'auth_accounts' ? 'id' : 'owner_id') + '=$1 ORDER BY to_jsonb(t)::text', [f.owner])).rows);
      rows.push((await admin.query('SELECT * FROM account_erasure_delivery WHERE operation_id=$1 ORDER BY subject_digest', [f.operation])).rows);
      return digest(rows);
    }
    const [normal, lost, control] = fixtures;
    const controlBefore = await snapshot(control);
    let rollback = false, dropAck = false;
    const remote = {
      subjects: (c, owner) => supabase.erasureSubjects(c, owner),
      remove: async id => {
        const f = fixtures.find(x => x.user.id === id); assert.ok(f);
        assert.equal((await admin.query('SELECT 1 FROM auth_accounts WHERE id=$1', [f.owner])).rowCount, 0);
        await lookup(f.user); // Recheck this run's metadata, or a verified Auth user_not_found.
        await supabase.adminDeleteUser(id);
        if (dropAck) { dropAck = false; throw Error('INJECT_AFTER_SUCCESSFUL_REMOTE_DELETE'); }
      },
    };
    const lifecycle = new AccountLifecycle(runtime, send, secret, 'm3-test-only', true, () => true,
      undefined, eraseCardImports, erasure, async () => { if (rollback) fail('INJECT_LOCAL_ROLLBACK'); }, remote);
    let privateHttpError;
    const originalComplete = lifecycle.complete.bind(lifecycle);
    lifecycle.complete = async (...args) => {
      try { return await originalComplete(...args); }
      catch (error) { privateHttpError = error; throw error; }
    };
    const origin = 'https://m3.example.invalid';
    const app = createApp(undefined, undefined, { service: resolver, origin, lifecycle, exporter: new AccountExport(runtime), accountQuota: async () => true });
    app.onError(error => { privateHttpError = error; return json({ code: 'INTERNAL_ERROR' }, 503); });
    const complete = f => app.request('/api/account/operation/complete', {
      method: 'POST', headers: { origin, cookie: f.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: f.operation, confirmation: 'DELETE_ACCOUNT' }),
    });
    async function erased(f) {
      for (const table of ['auth_accounts','auth_sessions','auth_external_identities','card_import.imports','card_import.cards','card_import.model_calls'])
        assert.equal((await admin.query('SELECT 1 FROM ' + table + ' WHERE ' + (table === 'auth_accounts' ? 'id' : 'owner_id') + '=$1', [f.owner])).rowCount, 0);
      assert.equal((await admin.query('SELECT used FROM card_import.model_allowances WHERE approval_id=$1', [f.allowance])).rows[0].used, 1);
      assert.equal((await complete(f)).status, 401);
    }
    assert.equal((await lifecycle.capabilities()).permanentDelete, true);
    await assert.rejects(runtime.query('SELECT * FROM account_erasure_delivery'));
    const response = await complete(normal);
    if (response.status !== 200 && privateHttpError) throw privateHttpError;
    assert.equal(response.status, 200);
    assert.equal((await response.json()).remoteErasure, 'completed');
    await erased(normal); assert.equal(await lookup(normal.user), null);
    record('normal-local-and-cloud-erasure');
    checkInterrupt();
    const before = await snapshot(lost), requestsBefore = boundary.requests.length;
    rollback = true;
    await assert.rejects(lifecycle.complete(lost.owner, lost.hash, lost.operation, 'DELETE_ACCOUNT'), /INJECT_LOCAL_ROLLBACK/);
    rollback = false;
    assert.equal(await snapshot(lost), before);
    assert.equal(boundary.requests.length, requestsBefore);
    assert.ok(await lookup(lost.user));
    record('local-rollback-zero-remote-requests');
    dropAck = true;
    assert.equal((await lifecycle.complete(lost.owner, lost.hash, lost.operation, 'DELETE_ACCOUNT')).remoteErasure, 'pending');
    await erased(lost); assert.equal(await lookup(lost.user), null);
    assert.equal((await admin.query('SELECT state FROM account_erasure_delivery WHERE operation_id=$1', [lost.operation])).rows[0].state, 'unknown');
    record('remote-success-lost-ack-is-pending');
    assert.equal(await deliverExternalErasure(erasure, remote, lost.operation), 'completed');
    const recovered = boundary.requests.length;
    assert.equal(await deliverExternalErasure(erasure, remote, lost.operation), 'completed');
    assert.equal(boundary.requests.length, recovered);
    assert.deepEqual((await admin.query('SELECT state,pending_subject FROM account_erasure_delivery WHERE operation_id=$1', [lost.operation])).rows, [{ state: 'completed', pending_subject: null }]);
    record('same-operation-recovery-and-no-redelivery');
    assert.equal(await snapshot(control), controlBefore); assert.ok(await lookup(control.user));
    record('control-account-and-data-preserved');
    checkInterrupt();
  } catch (error) { failure = error; }
  finally {
    // Only pre-recorded UUIDs whose ownership the boundary verified are deletable.
    for (const user of users) {
      if (!boundary.requests.some(x => x.method === 'POST' && x.label === user.label)) continue;
      try {
        const existing = await lookup(user);
        if (existing) {
          if (!boundary.ownedIds.has(user.id)) fail('CLEANUP_OWNERSHIP_UNCONFIRMED');
          const r = await adminRequest(user, 'DELETE');
          if (r.status !== 200 && r.status !== 204 && r.status !== 404) fail('CLEANUP_DELETE_UNCONFIRMED');
          if (await lookup(user)) fail('CLEANUP_USER_STILL_PRESENT');
        }
        receipt.remoteCleanup.push({ label: user.label, status: 'confirmed_absent' });
      } catch { receipt.remoteCleanup.push({ label: user.label, status: 'UNCONFIRMED' }); failure ??= Error('REMOTE_CLEANUP_UNCONFIRMED'); }
    }
    const closed = await Promise.allSettled(pools.map(p => p.end()));
    if (closed.some(x => x.status === 'rejected')) failure ??= Error('POOL_CLEANUP_FAILED');
    if (initialized) {
      if (pg('pg_ctl', ['-D', data, 'status'], true) === 0) {
        if (pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], true) !== 0)
          pg('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], true);
      }
      receipt.databaseStopped = pg('pg_ctl', ['-D', data, 'status'], true) === 3;
      if (!receipt.databaseStopped) failure ??= Error('DATABASE_CLEANUP_UNCONFIRMED');
    } else receipt.databaseStopped = true;
    receipt.requests = boundary.requests;
    receipt.status = failure ? 'FAIL' : simulation ? 'SIMULATION_PASS' : 'LIMITED_LIVE_PASS';
    receipt.failure = failure ? 'See private-error.txt; no credential or database details emitted.' : null;
    receipt.completedAt = new Date().toISOString();
    globalThis.fetch = originalFetch;
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
    if (failure) await writeFile(join(output, 'private-error.txt'), String(failure.stack ?? failure), { mode: 0o600 });
    await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, receipt: join(output, 'receipt.json'), databaseStopped: receipt.databaseStopped }));
  }
  if (failure) {
    // Test errors are classified, not serialized: DB/network errors can contain secrets.
    if (simulation) console.error('SIMULATION_FAILURE_TYPE=' + failure.constructor.name + '; assertion=' + (failure.code === 'ERR_ASSERTION'));
    fail('M3_ERASURE_VERIFICATION_FAILED');
  }
}

run().catch(error => {
  const safe = /^[A-Z][A-Z0-9_]{2,100}$/.test(error?.message ?? '') ? error.message : 'M3_PREFLIGHT_OR_RUNTIME_FAILED';
  console.error(safe); process.exitCode = 1;
});
