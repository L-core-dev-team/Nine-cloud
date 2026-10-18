import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { TurnReceiptSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import { buildP1NarrativeHints } from './p1-narrative-hints.js';
import type { NarrativeContext } from './narrative-scheduler.js';

export type NarrativeSeed = {
  format: 'authority-context-v1'; policySurface: 'p5-narrative';
  receipt: TurnReceipt; hints: Pick<NarrativeContext, 'playerConditionLines' | 'npcUtterances'>;
  rendererVersion: string;
};
export type Publication = { sourceId: string; publicationId: string; requestKey: string;
  revision: number; version: number; bodySha: string; text: string; generatorSource: 'deterministic' };
export type Presentation = { settlement: 'accepted'; generation: string;
  publication: 'published' | 'pending' | 'failed' | 'legacy-body-unavailable' | 'not_requested' | 'ownership_unknown';
  source: Publication | null; legacyBody?: {text:string;bodySha:string} };
export type NarrativeLease = { generationId: string; attemptId: string; leaseEpoch: number; ownerId: string;
  saveId: string; requestKey: string; context: NarrativeSeed };
export type BodyLimits = { maxUtf16: number; maxUtf8: number };
/** Isolated-test proposal. Hosts must explicitly supply approved limits before production activation. */
export const TEST_BODY_LIMITS: BodyLimits = { maxUtf16: 100_000, maxUtf8: 200_000 };
export function finalBody(text: string, limits: BodyLimits) {
  if (!Number.isSafeInteger(limits.maxUtf16) || !Number.isSafeInteger(limits.maxUtf8)
    || limits.maxUtf16 < 1 || limits.maxUtf8 < 1) throw Error('NARRATIVE_LIMITS_REQUIRED');
  if (typeof text !== 'string' || !text.trim()) throw Error('NARRATIVE_BODY_INVALID');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.toString('utf8') !== text) throw Error('NARRATIVE_BODY_INVALID');
  if (text.length > limits.maxUtf16 || bytes.length > limits.maxUtf8) throw Error('NARRATIVE_BODY_LIMIT');
  return { bytes, sha: createHash('sha256').update(bytes).digest('hex'), utf16Length: text.length };
}

/** Called only inside the existing accepted-turn transaction, after state/events/journal writes.
 * No original action or chat is persisted. Never call this for historical backfill. */
export async function seedNarrativeInTransaction(c: PoolClient, input: {
  ownerId: string; receipt: TurnReceipt; save: SaveEnvelope; rendererVersion: string;
}): Promise<string> {
  const receipt = TurnReceiptSchema.parse(input.receipt);
  if (receipt.decision.status !== 'accepted' || input.save.saveId !== receipt.saveId
    || input.save.revision !== receipt.resultingRevision || !input.rendererVersion.trim()) throw Error('NARRATIVE_CONTEXT_INVALID');
  const context: NarrativeSeed = { format: 'authority-context-v1', policySurface: 'p5-narrative', receipt,
    hints: buildP1NarrativeHints(receipt, input.save), rendererVersion: input.rendererVersion };
  const contextId = randomUUID(), generationId = randomUUID();
  await c.query(`INSERT INTO narrative_context_snapshots(id,save_id,request_key,owner_id,branch_id,receipt_sha,context,context_sha)
    SELECT $1,$2,$3,$4,'root',encode(sha256(convert_to(r.result::text,'UTF8')),'hex'),$5::jsonb,
      encode(sha256(convert_to($5::jsonb::text,'UTF8')),'hex')
    FROM turn_requests r WHERE r.save_id=$2 AND r.idempotency_key=$3`,
    [contextId, receipt.saveId, receipt.idempotencyKey, input.ownerId, JSON.stringify(context)]);
  await c.query(`INSERT INTO narrative_generation_requests(id,context_id,save_id,request_key,generation_key,publication_key)
    VALUES($1,$2,$3,$4,'initial-v1','initial-v1')`, [generationId, contextId, receipt.saveId, receipt.idempotencyKey]);
  await c.query(`INSERT INTO narrative_outbox(id,generation_id,kind) VALUES($1,$2,'generate')`, [randomUUID(), generationId]);
  return generationId;
}

/** Lock order: account → save → generation → attempt. Account erasure uses the same prefix. */
export class NarrativePublicationRepository {
  constructor(private readonly pool: Pool, private readonly limits?: BodyLimits, private readonly v2?: { maxAttempts:number; leaseMs:number }) {}
  private async transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  private async lockOwner(c: PoolClient, owner: string, save: string) {
    const account = await c.query('SELECT id FROM auth_accounts WHERE id=$1 AND closed_at IS NULL FOR SHARE', [owner]);
    if (!account.rowCount) return false;
    return Boolean((await c.query(`SELECT id FROM game_saves s WHERE id=$1 AND owner_id=$2
      AND NOT EXISTS(SELECT 1 FROM cloud_archive_trash t WHERE t.save_id=s.id) FOR SHARE`, [save, owner])).rowCount);
  }
  async claim(owner: string, save: string, key: string, leaseMs = 30_000): Promise<NarrativeLease | null> {
    if (this.v2) leaseMs=this.v2.leaseMs;
    if (!Number.isInteger(leaseMs) || leaseMs < 1 || leaseMs > 180_000) throw Error('INVALID_LEASE');
    const outcome = await this.transaction<NarrativeLease | null | { failure: string }>(async c => {
      if (!await this.lockOwner(c, owner, save)) return null;
      const g = (await c.query(`SELECT g.*,c.context,
        c.context_sha=encode(sha256(convert_to(c.context::text,'UTF8')),'hex')
        AND c.receipt_sha=encode(sha256(convert_to(r.result::text,'UTF8')),'hex') AS intact
        FROM narrative_generation_requests g LEFT JOIN narrative_context_snapshots c ON c.id=g.context_id
        LEFT JOIN turn_requests r ON r.save_id=g.save_id AND r.idempotency_key=g.request_key
        WHERE g.save_id=$1 AND g.request_key=$2 FOR UPDATE OF g`, [save, key])).rows[0];
      if (!g || g.state === 'published' || g.state === 'failed') return null;
      if (this.v2) {
        await this.requireV2Ownership(c,owner,save,key,g.id);
        if (!Number.isInteger(this.v2.maxAttempts) || this.v2.maxAttempts<1 || this.v2.maxAttempts>3)
          throw Error('NARRATIVE_RECOVERY_BUDGET_INVALID');
      }
      let failure: string | undefined;
      if (!g.context) failure = 'NARRATIVE_CONTEXT_MISSING';
      else if (!g.intact || g.context.ownerId || g.context.format !== 'authority-context-v1'
        || g.context.policySurface !== 'p5-narrative' || typeof g.context.rendererVersion !== 'string'
        || !g.context.rendererVersion.trim() || !g.context.hints || typeof g.context.hints !== 'object'
        || Array.isArray(g.context.hints) || !TurnReceiptSchema.safeParse(g.context.receipt).success) failure = 'NARRATIVE_CONTEXT_CORRUPT';
      if (failure) {
        // Commit a safe terminal state before raising; throwing inside the transaction would undo it.
        await c.query("UPDATE narrative_generation_requests SET state='failed' WHERE id=$1", [g.id]);
        await c.query("UPDATE narrative_outbox SET state='done' WHERE generation_id=$1 AND kind='generate' AND state='pending'", [g.id]);
        return { failure };
      }
      const live = await c.query(`SELECT id FROM narrative_attempts WHERE generation_id=$1 AND state='running' AND lease_until>clock_timestamp()`, [g.id]);
      if (live.rowCount) return null;
      if (this.v2 && g.lease_epoch >= this.v2.maxAttempts) {
        await c.query("UPDATE narrative_attempts SET state='expired' WHERE generation_id=$1 AND state='running'",[g.id]);
        await c.query("UPDATE narrative_generation_requests SET state='failed' WHERE id=$1",[g.id]);
        await c.query("UPDATE narrative_outbox SET state='done' WHERE generation_id=$1 AND kind='generate'",[g.id]);
        return null;
      }
      await c.query(`UPDATE narrative_attempts SET state='expired' WHERE generation_id=$1 AND state='running'`, [g.id]);
      const epoch = g.lease_epoch + 1, attempt = randomUUID();
      await c.query(`UPDATE narrative_generation_requests SET state='running',lease_epoch=$2 WHERE id=$1`, [g.id, epoch]);
      await c.query(`INSERT INTO narrative_attempts(id,generation_id,lease_epoch,lease_until,state)
        VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 millisecond','running')`, [attempt, g.id, epoch, leaseMs]);
      const context = g.context as NarrativeSeed; TurnReceiptSchema.parse(context.receipt);
      return { generationId: g.id, attemptId: attempt, leaseEpoch: epoch, ownerId: owner, saveId: save, requestKey: key, context };
    });
    if (outcome && 'failure' in outcome) throw Error(outcome.failure);
    return outcome;
  }
  async publish(lease: NarrativeLease, text: string): Promise<Publication> {
    if (!this.limits) throw Error('NARRATIVE_LIMITS_REQUIRED');
    const body = finalBody(text, this.limits);
    return this.transaction(async c => {
      if (!await this.lockOwner(c, lease.ownerId, lease.saveId)) throw Error('NARRATIVE_NOT_FOUND');
      const g = (await c.query(`SELECT * FROM narrative_generation_requests WHERE id=$1 AND save_id=$2 AND request_key=$3 FOR UPDATE`,
        [lease.generationId, lease.saveId, lease.requestKey])).rows[0];
      if (!g) throw Error('NARRATIVE_NOT_FOUND');
      if (this.v2) await this.requireV2Ownership(c,lease.ownerId,lease.saveId,lease.requestKey,g.id);
      const a = (await c.query(`SELECT *,lease_until>clock_timestamp() AS live FROM narrative_attempts
        WHERE id=$1 AND generation_id=$2 AND lease_epoch=$3 FOR UPDATE`, [lease.attemptId, g.id, lease.leaseEpoch])).rows[0];
      if (!a || g.lease_epoch !== lease.leaseEpoch) throw Error('NARRATIVE_STALE_ATTEMPT');
      const stored = (await c.query(`SELECT context,context_sha=encode(sha256(convert_to(context::text,'UTF8')),'hex') AS intact
        FROM narrative_context_snapshots WHERE id=$1`, [g.context_id])).rows[0];
      if (!stored?.intact) throw Error('NARRATIVE_CONTEXT_CORRUPT');
      const receipt = TurnReceiptSchema.parse(stored.context.receipt);
      if (receipt.decision.status !== 'accepted') throw Error('NARRATIVE_RECEIPT_INVALID');
      const prior = (await c.query(`SELECT p.*,s.body,s.body_sha,s.utf16_length,s.utf8_length,s.attempt_id FROM narrative_publications p
        JOIN narrative_sources s ON s.id=p.source_id WHERE p.generation_id=$1`, [g.id])).rows[0];
      if (prior) {
        if (a.state !== 'published' || prior.attempt_id !== lease.attemptId) throw Error('NARRATIVE_STALE_ATTEMPT');
        if (prior.body_sha !== body.sha || !prior.body.equals(body.bytes)) throw Error('NARRATIVE_PUBLICATION_CONFLICT');
        return this.decode(prior, receipt.resultingRevision);
      }
      if (g.state !== 'running' || a.state !== 'running' || !a.live) throw Error('NARRATIVE_STALE_ATTEMPT');
      const sourceId = randomUUID(), publicationId = randomUUID();
      await c.query(`INSERT INTO narrative_sources(id,generation_id,attempt_id,body,body_sha,utf16_length,utf8_length,generator_source)
        VALUES($1,$2,$3,$4,$5,$6,$7,'deterministic')`, [sourceId, g.id, a.id, body.bytes, body.sha, body.utf16Length, body.bytes.length]);
      await c.query(`INSERT INTO narrative_publications(id,generation_id,source_id,save_id,request_key,publication_key,version,is_default)
        VALUES($1,$2,$3,$4,$5,$6,1,true)`, [publicationId, g.id, sourceId, g.save_id, g.request_key, g.publication_key]);
      await c.query(`INSERT INTO narrative_segments(source_id,segment_id,start_utf16,end_utf16,segment_sha,audience)
        VALUES($1,0,0,$2,$3,'player_only')`, [sourceId, body.utf16Length, body.sha]);
      for (const event of receipt.decision.events) await c.query(`INSERT INTO source_event_links(id,source_id,segment_id,save_id,event_id,kind)
        VALUES($1,$2,0,$3,$4,'provenance_only')`, [randomUUID(), sourceId, g.save_id, event.id]);
      await c.query(`INSERT INTO narrative_outbox(id,generation_id,source_id,kind) VALUES($1,$2,$3,'index')`, [randomUUID(), g.id, sourceId]);
      await c.query(`UPDATE narrative_outbox SET state='done' WHERE generation_id=$1 AND kind='generate'`, [g.id]);
      await c.query(`UPDATE narrative_attempts SET state='published' WHERE id=$1`, [a.id]);
      await c.query(`UPDATE narrative_generation_requests SET state='published' WHERE id=$1`, [g.id]);
      return { sourceId, publicationId, requestKey: g.request_key, revision: receipt.resultingRevision, version: 1, bodySha: body.sha, text, generatorSource: 'deterministic' };
    });
  }
  async fail(lease: NarrativeLease): Promise<void> {
    await this.transaction(async c => {
      if (!await this.lockOwner(c, lease.ownerId, lease.saveId)) return;
      const g = await c.query(`SELECT id FROM narrative_generation_requests WHERE id=$1 AND save_id=$2 AND request_key=$3
        AND lease_epoch=$4 AND state='running' FOR UPDATE`, [lease.generationId, lease.saveId, lease.requestKey, lease.leaseEpoch]);
      if (!g.rowCount) return;
      const a = await c.query(`UPDATE narrative_attempts SET state='failed' WHERE id=$1 AND generation_id=$2
        AND lease_epoch=$3 AND state='running' AND lease_until>clock_timestamp()`, [lease.attemptId, lease.generationId, lease.leaseEpoch]);
      if (a.rowCount) await c.query(`UPDATE narrative_generation_requests SET state='failed' WHERE id=$1`, [lease.generationId]);
    });
  }
  private async requireV2Ownership(c:PoolClient,owner:string,save:string,key:string,generation:string) {
    const gate=await c.query(`SELECT protocol_version FROM public.lock_narrative_writer_fence_v2(
      (SELECT renderer_version FROM narrative_receipt_ownership
        WHERE owner_id=$1 AND save_id=$2 AND request_key=$3 AND generation_id=$4))`,[owner,save,key,generation]);
    const row=await c.query(`SELECT o.generation_id FROM narrative_receipt_ownership o
      JOIN turn_requests r ON r.save_id=o.save_id AND r.idempotency_key=o.request_key
      JOIN narrative_generation_requests g ON g.id=o.generation_id
      JOIN narrative_context_snapshots c ON c.id=g.context_id
      WHERE o.owner_id=$1 AND o.save_id=$2 AND o.request_key=$3 AND o.generation_id=$4
      AND o.ownership='managed' AND o.protocol_version=2 AND o.request_narrative
      AND o.receipt_sha=encode(sha256(convert_to(r.result::text,'UTF8')),'hex')
      AND c.owner_id=o.owner_id AND c.receipt_sha=o.receipt_sha AND c.branch_id=o.branch_id
      AND c.context->>'rendererVersion'=o.renderer_version AND c.context->>'format'=o.context_version`,[owner,save,key,generation]);
    if (!gate.rowCount || !row.rowCount) throw Error('NARRATIVE_WRITER_OWNERSHIP_UNPROVEN');
  }
  private decode(row: Record<string, any>, revision: number): Publication {
    const bytes = row.body as Buffer;
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (createHash('sha256').update(bytes).digest('hex') !== row.body_sha || bytes.length !== row.utf8_length
      || text.length !== row.utf16_length || !Buffer.from(text).equals(bytes)) throw Error('NARRATIVE_BODY_CORRUPT');
    return { sourceId: row.source_id, publicationId: row.id, requestKey: row.request_key,
      revision, version: row.version, bodySha: row.body_sha, text, generatorSource: 'deterministic' };
  }
  async presentation(owner: string, save: string, key: string): Promise<Presentation | null> {
    return this.transaction(async c => {
      if (!await this.lockOwner(c, owner, save)) return null;
      return this.presentationInTransaction(c,owner,save,key);
    });
  }
  private async presentationInTransaction(c:PoolClient,owner:string,save:string,key:string):Promise<Presentation|null> {
      const r = (await c.query(`SELECT result FROM turn_requests WHERE save_id=$1 AND idempotency_key=$2`, [save, key])).rows[0];
      if (!r || r.result?.decision?.status !== 'accepted') return null;
      const receipt = TurnReceiptSchema.parse(r.result);
      const g = (await c.query('SELECT id,state FROM narrative_generation_requests WHERE save_id=$1 AND request_key=$2', [save, key])).rows[0];
      if (this.v2) {
        const o=(await c.query(`SELECT o.*,o.receipt_sha=encode(sha256(convert_to(r.result::text,'UTF8')),'hex') AS intact
          FROM narrative_receipt_ownership o JOIN turn_requests r ON r.save_id=o.save_id AND r.idempotency_key=o.request_key
          WHERE o.owner_id=$1 AND o.save_id=$2 AND o.request_key=$3`,[owner,save,key])).rows[0];
        if (!o) return {settlement:'accepted',generation:'unknown',publication:'ownership_unknown',source:null};
        if (!o.intact || o.branch_id!=='root') throw Error('NARRATIVE_OWNERSHIP_CORRUPT');
        if (o.ownership==='suppressed') {
          if(g)throw Error('NARRATIVE_SUPPRESSED_INTEGRITY_FAILURE');
          return {settlement:'accepted',generation:'not_requested',publication:'not_requested',source:null};
        }
        if(o.ownership==='legacy') {
          if(g || !o.legacy_inventory_sha)throw Error('NARRATIVE_LEGACY_INTEGRITY_FAILURE');
          const result:Presentation={settlement:'accepted',generation:'legacy',publication:'legacy-body-unavailable',source:null};
          if(o.legacy_body) {
            const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(o.legacy_body);
            if(createHash('sha256').update(o.legacy_body).digest('hex')!==o.legacy_body_sha
              || !Buffer.from(text).equals(o.legacy_body))throw Error('NARRATIVE_BODY_CORRUPT');
            result.publication='published';result.legacyBody={text,bodySha:o.legacy_body_sha};
          }
          return result;
        }
        if(o.ownership!=='managed' || o.protocol_version!==2 || !g || g.id!==o.generation_id)
          throw Error('NARRATIVE_MANAGED_INTEGRITY_FAILURE');
        if(!(await c.query(`SELECT id FROM narrative_context_snapshots WHERE id=(SELECT context_id
          FROM narrative_generation_requests WHERE id=$1) AND owner_id=$2 AND receipt_sha=$3
          AND context->>'rendererVersion'=$4 AND context->>'format'=$5
          AND context_sha=encode(sha256(convert_to(context::text,'UTF8')),'hex')`,
          [g.id,owner,o.receipt_sha,o.renderer_version,o.context_version])).rowCount)
          throw Error('NARRATIVE_MANAGED_INTEGRITY_FAILURE');
      }
      if (!g) return { settlement: 'accepted', generation: 'not_recorded', publication: 'legacy-body-unavailable', source: null };
      const p = (await c.query(`SELECT p.*,s.body,s.body_sha,s.utf16_length,s.utf8_length FROM narrative_publications p
        JOIN narrative_sources s ON s.id=p.source_id WHERE p.generation_id=$1`, [g.id])).rows[0];
      if (p) return { settlement: 'accepted', generation: 'published', publication: 'published', source: this.decode(p, receipt.resultingRevision) };
      return { settlement: 'accepted', generation: g.state, publication: g.state === 'failed' ? 'failed' : 'pending', source: null };
  }
  async source(owner: string, save: string, source: string): Promise<Publication | null> {
    // Ownership is checked before any source lookup; presentation rechecks under account/save locks.
    const row = (await this.pool.query(`SELECT p.request_key FROM narrative_publications p JOIN game_saves s ON s.id=p.save_id
      WHERE p.source_id::text=$1 AND p.save_id=$2 AND s.owner_id=$3`, [source, save, owner])).rows[0];
    if (!row) return null;
    const result = await this.presentation(owner, save, row.request_key);
    return result?.source?.sourceId === source ? result.source : null;
  }
  async history(owner: string, save: string, beforeRevision?: number) {
    if (beforeRevision !== undefined && (!Number.isSafeInteger(beforeRevision) || beforeRevision < 0)) throw Error('INVALID_CURSOR');
    return this.transaction(async c => {
      if (!await this.lockOwner(c, owner, save)) return null;
      const rows = (await c.query(`SELECT r.result,g.state AS generation_state,g.id AS generation_id,
        p.id,p.source_id,p.request_key,p.version,s.body,s.body_sha,s.utf16_length,s.utf8_length
        FROM turn_requests r LEFT JOIN narrative_generation_requests g ON g.save_id=r.save_id AND g.request_key=r.idempotency_key
        LEFT JOIN narrative_publications p ON p.generation_id=g.id LEFT JOIN narrative_sources s ON s.id=p.source_id
        WHERE r.save_id=$1 AND r.result->'decision'->>'status'='accepted'
        AND ($2::integer IS NULL OR (r.result->>'resultingRevision')::integer<$2)
        ORDER BY (r.result->>'resultingRevision')::integer DESC LIMIT 11`, [save, beforeRevision ?? null])).rows;
      const selected=rows.slice(0,10);
      const items=await Promise.all(selected.map(async row=>{
        const receipt=TurnReceiptSchema.parse(row.result);
        if(this.v2) {
          const presentation=await this.presentationInTransaction(c,owner,save,receipt.idempotencyKey);
          if(!presentation)throw Error('NARRATIVE_NOT_FOUND');
          return {receipt,presentation};
        }
        const source=row.source_id?this.decode(row,receipt.resultingRevision):null;
        const presentation:Presentation={settlement:'accepted',generation:row.generation_state??'not_recorded',
          publication:source?'published':!row.generation_id?'legacy-body-unavailable':row.generation_state==='failed'?'failed':'pending',source};
        return {receipt,presentation};
      }));
      return {items:items.reverse(),nextBeforeRevision:rows.length>10?Number(selected.at(-1)?.result.resultingRevision):null};
    });
  }
  /** Internal dispatch hint only; claim() is the actual lease authority. Failed tasks require internal review. */
  async queued(limit=20):Promise<{ownerId:string;saveId:string;requestKey:string}[]> {
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_BATCH');
    const rows=(await this.pool.query(`SELECT s.owner_id,g.save_id,g.request_key FROM narrative_outbox o
      JOIN narrative_generation_requests g ON g.id=o.generation_id JOIN game_saves s ON s.id=g.save_id
      JOIN auth_accounts a ON a.id=s.owner_id AND a.closed_at IS NULL
      WHERE o.kind='generate' AND o.state='pending' AND g.state IN ('pending','running')
      AND NOT EXISTS(SELECT 1 FROM cloud_archive_trash t WHERE t.save_id=g.save_id)
      AND NOT EXISTS(SELECT 1 FROM narrative_attempts active WHERE active.generation_id=g.id
        AND active.state='running' AND active.lease_until>clock_timestamp())
      ORDER BY g.created_at,g.id LIMIT $1`,[limit])).rows;
    return rows.map(row=>({ownerId:row.owner_id,saveId:row.save_id,requestKey:row.request_key}));
  }
}

/** Caller must already hold the existing authorized erasure proof and account/save locks. */
export async function eraseNarrativeForOwner(c: PoolClient, owner: string) {
  // A new table may not be deployed yet. Existing 0022 lifecycle remains usable.
  if ((await c.query("SELECT to_regclass('public.narrative_receipt_ownership') AS relation")).rows[0].relation)
    await c.query('DELETE FROM narrative_receipt_ownership WHERE owner_id=$1',[owner]);
  await c.query(`DELETE FROM source_event_links l USING narrative_sources s,narrative_generation_requests g,game_saves v
    WHERE l.source_id=s.id AND s.generation_id=g.id AND g.save_id=v.id AND v.owner_id=$1`, [owner]);
  await c.query(`DELETE FROM narrative_segments l USING narrative_sources s,narrative_generation_requests g,game_saves v
    WHERE l.source_id=s.id AND s.generation_id=g.id AND g.save_id=v.id AND v.owner_id=$1`, [owner]);
  for (const table of ['narrative_publications','narrative_outbox','narrative_sources','narrative_attempts'])
    await c.query(`DELETE FROM ${table} t USING narrative_generation_requests g,game_saves s WHERE t.generation_id=g.id AND g.save_id=s.id AND s.owner_id=$1`, [owner]);
  for (const table of ['narrative_generation_requests','narrative_context_snapshots'])
    await c.query(`DELETE FROM ${table} t USING game_saves s WHERE t.save_id=s.id AND s.owner_id=$1`, [owner]);
}
