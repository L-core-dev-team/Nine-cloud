import { readFile } from 'node:fs/promises';
import { deliverExternalErasure } from './external-erasure.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { AccountLifecycle } from './account-lifecycle.js';
import { EmailAuthService, hashToken } from './email-auth.js';
import { SupabaseAuthService } from './supabase-auth.js';
import { PostgresEmailAuthRepository } from './postgres-email-auth.js';
import { AccountExport } from './account-export.js';
import { eraseCardImports } from '../card-import/host.js';
import { CardImportService } from '../card-import/service.js';
import { createApp } from '../app.js';
import { assertLocalCardDatabase } from '../card-import/local-runtime.js';

const url = process.env.MAIN_COMPOSITION_TEST_DATABASE_URL;
if (url) assertLocalCardDatabase(url, /^\/jiuxiao_test_main[0-9]+$/);
describe.skipIf(!url)('new main + cards + opt-in erasure pool', () => {
  const admin = new Pool({ connectionString: url });
  const connection = (user: string) => { const u = new URL(url!); u.username = user; u.password = process.env.MAIN_COMPOSITION_TEST_ROLE_PASSWORD || ''; return u.href; };
  const runtime = new Pool({ connectionString: url ? connection('joint_runtime') : undefined });
  const erasure = new Pool({ connectionString: url ? connection('joint_eraser') : undefined });
  const secret = 'synthetic-main-integration-session-secret-0000';
  const mail = new Map<string, string>();
  const send = async (email: string, code: string) => { mail.set(email, code); };
  const issuer = new EmailAuthService(new PostgresEmailAuthRepository(admin, secret), send, secret);
  const resolver = new EmailAuthService(new PostgresEmailAuthRepository(runtime, secret), send, secret);
  const supabase = new SupabaseAuthService(runtime, resolver, {
    url: 'https://project.supabase.co', publishableKey: 'sb_publishable_synthetic_only',
    adminKey: 'sb_secret_' + 's'.repeat(32), identitySecret: secret,
    enabledEmail: true, enabledPhone: false, phoneHookConfigured: false, phoneCaptchaConfigured: false,
    allowedPhonePrefixes: [], phoneBudgetCents: 0, phoneMonthlySegments: 0,
    phoneIpHourlyLimit: 0, phoneIpDailyLimit: 0, phoneOwnerHourlyLimit: 0, phoneOwnerDailyLimit: 0,
  });
  const origin = 'https://integration.example.invalid';
  const tracked: { user: string; pid: number }[] = [];
  let fail = false;
  const lifecycle = new AccountLifecycle(runtime, send, secret, 'test-only', true, () => true, undefined, async (c, owner) => {
    tracked.push((await c.query('SELECT session_user AS user,pg_backend_pid() AS pid')).rows[0]);
    await eraseCardImports(c, owner);
    if (fail) throw Error('INJECT_AFTER_CARD_DELETE');
  }, erasure);
  const app = createApp(undefined, undefined, { service: resolver, origin, lifecycle, exporter: new AccountExport(runtime), accountQuota: async () => true });
  const call = (cookie: string, body: unknown) => app.request('/api/account/operation/complete', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  async function fixture() {
    const email = `joint-${randomUUID()}@example.invalid`;
    await issuer.requestCode(email); const f = await issuer.verify(email, mail.get(email)!); if (!f) throw Error('LOGIN_FAILED');
    const owner = f.session.ownerId, hash = hashToken(f.token);
    const original = new AccountLifecycle(admin, send, secret, 'test-only', true);
    const op = await original.begin(owner, hash, 'delete'); await original.verify(owner, hash, op.operationId, mail.get(email));
    const cards = new CardImportService(admin);
    const raw = Buffer.from(JSON.stringify({ name: '合成角色', description: 'fixture', personality: 'kind', scenario: 'fixture', first_mes: 'hello', mes_example: 'example' }));
    const imported = await cards.preview(owner, 'fixture.json', 'card', raw);
    await cards.confirm(owner, { importId: imported.id, parentId: null, source: 'synthetic', notes: '', links: [] });
    return { owner, hash, cookie: `jx_session=${f.token}`, id: op.operationId };
  }
  async function snapshot(owner: string) {
    const out: unknown[] = [];
    for (const table of ['auth_accounts', 'auth_sessions', 'account_operations', 'card_import.imports', 'card_import.cards']) {
      const column = table === 'auth_accounts' ? 'id' : 'owner_id';
      out.push((await admin.query(`SELECT to_jsonb(t) AS value FROM ${table} t WHERE ${column}=$1 ORDER BY to_jsonb(t)::text`, [owner])).rows);
    }
    out.push((await admin.query('SELECT * FROM account_lifecycle_audit WHERE owner_digest=$1 ORDER BY id', [createHash('sha256').update(owner).digest('hex')])).rows);
    return createHash('sha256').update(JSON.stringify(out)).digest('hex');
  }
  beforeAll(async () => {
    // Disposable fixture grants only. No production ACL installation or ALL TABLES.
    await admin.query('GRANT USAGE ON SCHEMA public TO joint_runtime,joint_eraser; GRANT USAGE ON SCHEMA card_import TO joint_eraser');
    await admin.query('GRANT SELECT ON auth_accounts,auth_sessions,account_operations TO joint_runtime; GRANT UPDATE(last_seen_at) ON auth_accounts TO joint_runtime; GRANT UPDATE(phase) ON account_operations TO joint_runtime');
    await admin.query('GRANT SELECT,DELETE ON auth_accounts,auth_sessions,auth_challenges,cloud_archive_trash,game_saves,entitlement_ledger_entries,entitlement_balances,turn_events,turn_requests,npc_memory_journals,npc_authorized_observation_outbox,npc_memory_observation_supersessions TO joint_eraser');
    await admin.query('GRANT SELECT,INSERT,UPDATE ON account_operations TO joint_eraser; GRANT INSERT ON account_lifecycle_audit TO joint_eraser; GRANT SELECT,DELETE ON account_rate_limits TO joint_eraser; GRANT UPDATE(closed_at) ON auth_accounts TO joint_eraser; GRANT UPDATE(revision) ON game_saves TO joint_eraser');
    await admin.query(await readFile(new URL('../../../../packages/db/permissions/erasure-delivery.sql', import.meta.url),'utf8'));
    for (const table of ['model_calls','group_settings','group_messages','group_turns','group_participant_worldbooks','group_participants','requests','session_worldbooks','session_personas','sessions','persona_versions','personas','global_worldbooks','duplicate_requests','links','cards','imports']) await admin.query(`GRANT SELECT,DELETE ON card_import.${table} TO joint_eraser`);
  });
  afterAll(async () => { await Promise.all([runtime.end(), erasure.end(), admin.end()]); });
  it('uses real restricted session and dedicated session_user; rollback restores record and audit hashes', async () => {
    const f = await fixture(); const before = await snapshot(f.owner);
    fail = true;
    expect((await call(f.cookie, { operationId: f.id, confirmation: 'DELETE_ACCOUNT' })).status).toBe(503);
    expect(await snapshot(f.owner)).toBe(before); expect(tracked.at(-1)?.user).toBe('joint_eraser');
    fail = false;
    expect((await call(f.cookie, { operationId: f.id, confirmation: 'DELETE_ACCOUNT' })).status).toBe(200);
    expect((await admin.query('SELECT 1 FROM auth_accounts WHERE id=$1', [f.owner])).rowCount).toBe(0);
    expect((await admin.query('SELECT 1 FROM card_import.imports WHERE owner_id=$1', [f.owner])).rowCount).toBe(0);
    expect((await admin.query('SELECT 1 FROM account_lifecycle_audit WHERE owner_digest=$1', [createHash('sha256').update(f.owner).digest('hex')])).rowCount).toBe(1);
    expect((await call(f.cookie, { operationId: f.id, confirmation: 'DELETE_ACCOUNT' })).status).toBe(401);
  });
  it('durably separates local erasure, remote uncertainty and acknowledgement recovery', async () => {
    const a=await fixture(), b=await fixture(), subject=randomUUID(), approval=randomUUID();
    const insertIdentity=(owner:string)=>admin.query("INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at) VALUES($1,'email',$2,$3,now())",[subject,'d'.repeat(64),owner]);
    await insertIdentity(a.owner);
    await admin.query('INSERT INTO card_import.model_allowances VALUES($1,$2,0)',[approval,'synthetic-binding']);
    await admin.query('UPDATE card_import.model_allowances SET used=used+1 WHERE approval_id=$1',[approval]);
    await admin.query('INSERT INTO card_import.model_calls(approval_id,owner_id,session_id,key) VALUES($1,$2,$3,$4)',[approval,a.owner,randomUUID(),randomUUID()]);
    const contacted:string[]=[];
    let timeout=true;
    const remote={subjects:(client:PoolClient,owner:string)=>supabase.erasureSubjects(client,owner),remove:async(id:string)=>{contacted.push(id);if(timeout)throw Error('unknown');}};
    await expect(admin.query('DELETE FROM auth_accounts WHERE id=$1',[a.owner])).rejects.toThrow('CARD_ERASURE_REQUIRED');
    let abortLocal=true;
    const composed=new AccountLifecycle(runtime,send,secret,'synthetic-retention',true,()=>true,undefined,eraseCardImports,erasure,
      async()=>{if(abortLocal)throw Error('LOCAL_ROLLBACK');},remote);
    await expect(composed.complete(a.owner,a.hash,a.id,'DELETE_ACCOUNT')).rejects.toThrow('LOCAL_ROLLBACK');
    expect(contacted).toEqual([]);
    expect((await admin.query('SELECT owner_id FROM card_import.model_calls WHERE approval_id=$1',[approval])).rows).toEqual([{owner_id:a.owner}]);
    abortLocal=false;
    expect(await composed.complete(a.owner,a.hash,a.id,'DELETE_ACCOUNT')).toMatchObject({localErasure:'completed',remoteErasure:'pending'});
    expect((await admin.query('SELECT used FROM card_import.model_allowances WHERE approval_id=$1',[approval])).rows[0].used).toBe(1);
    expect((await admin.query('SELECT 1 FROM card_import.model_calls WHERE approval_id=$1',[approval])).rowCount).toBe(0);
    expect((await admin.query('SELECT 1 FROM auth_accounts WHERE id=$1',[b.owner])).rowCount).toBe(1);
    await expect(insertIdentity(b.owner)).rejects.toThrow('IDENTITY_ERASURE_IN_PROGRESS');
    await expect(composed.complete(a.owner,a.hash,a.id,'DELETE_ACCOUNT')).rejects.toThrow();
    timeout=false;
    await admin.query(`CREATE FUNCTION public.joint_test_delivery_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.operation_id='${a.id}' THEN RAISE EXCEPTION 'ACK_LOST'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER joint_test_delivery_ack BEFORE UPDATE ON account_erasure_delivery FOR EACH ROW EXECUTE FUNCTION public.joint_test_delivery_ack()`);
    try{await expect(deliverExternalErasure(erasure,remote,a.id)).rejects.toThrow('ACK_LOST');}
    finally{await admin.query('DROP TRIGGER joint_test_delivery_ack ON account_erasure_delivery; DROP FUNCTION joint_test_delivery_ack()');}
    expect(await deliverExternalErasure(erasure,remote,a.id)).toBe('completed');
    expect(await deliverExternalErasure(erasure,remote,a.id)).toBe('completed');
    expect(contacted).toEqual([subject,subject,subject]);
    expect((await admin.query('SELECT state,pending_subject FROM account_erasure_delivery WHERE operation_id=$1',[a.id])).rows).toEqual([{state:'completed',pending_subject:null}]);
    await expect(runtime.query('SELECT * FROM account_erasure_delivery')).rejects.toThrow();
    expect((await admin.query("SELECT finish_erasure_retention('synthetic-retention',now()) AS n")).rows[0].n).toBe(1);
  });
  it('reads real Supabase erasure mappings with column-only privileges and rejects shared subjects', async () => {
    const a = await fixture(), b = await fixture(), subject = randomUUID();
    const digest = (kind: string) => createHash('sha256').update(`${subject}:${kind}`).digest('hex');
    await admin.query("INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at) VALUES($1,'email',$2,$3,now())", [subject, digest('email'), a.owner]);
    const client = await erasure.connect();
    try {
      expect((await client.query('SELECT session_user AS identity')).rows[0].identity).toBe('joint_eraser');
      expect(await supabase.erasureSubjects(client, a.owner)).toEqual([subject]);
      await admin.query("INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at) VALUES($1,'phone',$2,$3,now())", [subject, digest('phone'), b.owner]);
      await expect(supabase.erasureSubjects(client, a.owner)).rejects.toThrow('SUPABASE_IDENTITY_SHARED');
      await expect(client.query('SELECT identifier_digest FROM auth_external_identities WHERE provider_subject=$1', [subject])).rejects.toMatchObject({ code: '42501' });
      await expect(client.query('UPDATE auth_external_identities SET owner_id=$2 WHERE provider_subject=$1', [subject, a.owner])).rejects.toMatchObject({ code: '42501' });
      await expect(client.query('DELETE FROM auth_external_identities WHERE provider_subject=$1', [subject])).rejects.toMatchObject({ code: '42501' });
    } finally { client.release(); }
    await expect(runtime.query('SELECT provider_subject,owner_id FROM auth_external_identities WHERE provider_subject=$1', [subject])).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('SET ROLE jiuxiao_narrative_erasure')).rejects.toMatchObject({ code: '42501' });
    expect((await admin.query('SELECT owner_id FROM auth_external_identities WHERE provider_subject=$1 ORDER BY owner_id', [subject])).rows.map(row => row.owner_id).sort()).toEqual([a.owner, b.owner].sort());
  });
  it('denies cross-owner, wrong confirmation and disabled/invalid erasure identity without fallback', async () => {
    const a = await fixture(), b = await fixture();
    expect((await call(b.cookie, { operationId: a.id, confirmation: 'DELETE_ACCOUNT' })).status).toBe(400);
    expect((await call(a.cookie, { operationId: a.id, confirmation: 'WRONG' })).status).toBe(400);
    for (const pool of [null, runtime]) {
      const disabled = new AccountLifecycle(runtime, send, secret, 'test-only', true, () => true, undefined, undefined, pool);
      expect((await disabled.capabilities()).permanentDelete).toBe(false);
      await expect(disabled.complete(a.owner, a.hash, a.id, 'DELETE_ACCOUNT')).rejects.toThrow('ERASURE_UNAVAILABLE');
    }
    expect((await runtime.query("SELECT pg_has_role(session_user,'jiuxiao_narrative_erasure','MEMBER') AS allowed")).rows[0].allowed).toBe(false);
    await expect(runtime.query("SET ROLE jiuxiao_narrative_erasure")).rejects.toThrow();
    expect((await admin.query('SELECT 1 FROM auth_accounts WHERE id=$1',[a.owner])).rowCount).toBe(1);
  });
  it('rolls back account, card and audit data when the final audit insert fails', async () => {
    const f = await fixture(), before = await snapshot(f.owner);
    const digest = createHash('sha256').update(f.owner).digest('hex');
    // Synthetic failure fixture only; remove it even when the assertion fails.
    await admin.query(`CREATE FUNCTION public.joint_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.owner_digest='${digest}' THEN RAISE EXCEPTION 'INJECT_FINAL_AUDIT'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER joint_test_audit_failure BEFORE INSERT ON account_lifecycle_audit FOR EACH ROW EXECUTE FUNCTION public.joint_test_audit_failure()`);
    try {
      expect((await call(f.cookie, { operationId: f.id, confirmation: 'DELETE_ACCOUNT' })).status).toBe(503);
      expect(await snapshot(f.owner)).toBe(before);
      expect(tracked.at(-1)?.user).toBe('joint_eraser');
    } finally {
      await admin.query('DROP TRIGGER joint_test_audit_failure ON account_lifecycle_audit; DROP FUNCTION public.joint_test_audit_failure()');
    }
  });
  it('uses the same dedicated identity for scheduled expiry and fails closed on connection loss', async () => {
    const f = await fixture(); await admin.query("UPDATE auth_accounts SET closed_at=now()-interval '31 days' WHERE id=$1", [f.owner]);
    const result = await lifecycle.expireClosed(true);
    expect(result.erased).toBe(1); expect(tracked.at(-1)?.user).toBe('joint_eraser');
    expect((await admin.query('SELECT 1 FROM card_import.cards WHERE owner_id=$1', [f.owner])).rowCount).toBe(0);
    expect((await admin.query('SELECT operation FROM account_lifecycle_audit WHERE owner_digest=$1', [createHash('sha256').update(f.owner).digest('hex')])).rows).toEqual([{ operation: 'expired_erasure' }]);
    const closed = new Pool({ connectionString: connection('joint_eraser') }); await closed.end();
    const unavailable = new AccountLifecycle(runtime, send, secret, 'test-only', true, () => true, undefined, undefined, closed);
    expect((await unavailable.capabilities()).permanentDelete).toBe(false);
    await expect(unavailable.expireClosed(true)).rejects.toThrow();
  });
});
