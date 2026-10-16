import type { Pool, PoolClient } from 'pg';
import type { TurnReceipt } from '@jiuxiao/contracts';
import type { AcceptedTurnCommitInput } from './npc-memory-turn-transaction.js';
import { seedNarrativeInTransaction, NarrativePublicationRepository } from './narrative-publication-repository.js';
import type { NarrativeResult } from './server-turn.js';

/** REVIEW DRAFT. SQL proposal must be separately approved and installed. No historical inference. */
export const NARRATIVE_V2_BUDGET = Object.freeze({
  httpWaitMs: 20_000, workerExecutionMs: 120_000, leaseMs: 150_000,
  maxAttempts: 3, contextVersion: 'authority-context-v1', protocolVersion: 2,
});
export interface NarrativeV2Port {
  register(c: PoolClient, commit: AcceptedTurnCommitInput): Promise<void>;
  read(owner: string, receipt: TurnReceipt, cancellation?: AbortSignal): Promise<NarrativeResult>;
}

/** Rechecked under a shared DB lock by each T1/claim/publish, never a process-global switch.
 * Attestation is issued only after inventory, traffic fence, role revocation and old writer drain.
 * Heartbeats alone are NOT proof that all instances are compatible. */
export async function requireWriterFence(c: PoolClient,rendererVersion:string) {
  const gate = (await c.query(`SELECT protocol_version FROM narrative_writer_fence
    WHERE singleton=true AND phase='managed' AND protocol_version=2
    AND old_writer_drained AND old_role_revoked AND fleet_manifest_sha ~ '^[a-f0-9]{64}$'
    AND renderer_version=$1 AND valid_until>clock_timestamp() FOR SHARE`,[rendererVersion])).rows[0];
  if (!gate) throw Error('NARRATIVE_WRITER_FENCE_UNPROVEN');
}

export function createNarrativeV2Port(pool: Pool, rendererVersion: string,
  repository: NarrativePublicationRepository): NarrativeV2Port {
  if (!rendererVersion.trim()) throw Error('NARRATIVE_RENDERER_VERSION_REQUIRED');
  return {
    async register(c, commit) {
      await requireWriterFence(c,rendererVersion);
      if (commit.cancellation?.aborted) throw Error('TURN_CANCELLED_BEFORE_COMMIT');
      const branch = commit.save.schemaVersion === 3 ? commit.save.branchId : 'root';
      if (branch !== 'root') throw Error('NARRATIVE_BRANCH_NOT_SUPPORTED');
      // No ON CONFLICT: a duplicate must have returned the original receipt before this callback.
      const row = (await c.query(`INSERT INTO narrative_receipt_ownership
        (owner_id,save_id,request_key,receipt_sha,protocol_version,ownership,request_narrative,
         renderer_version,context_version,branch_id)
        SELECT $1,$2,$3,encode(sha256(convert_to(result::text,'UTF8')),'hex'),2,$4,$5,$6,$7,'root'
        FROM turn_requests WHERE save_id=$2 AND idempotency_key=$3
        RETURNING receipt_sha`, [commit.ownerId, commit.save.saveId, commit.receipt.idempotencyKey,
        commit.requestNarrative === true ? 'managed' : 'suppressed', commit.requestNarrative === true,
        rendererVersion, NARRATIVE_V2_BUDGET.contextVersion])).rows[0];
      if (!row) throw Error('NARRATIVE_RECEIPT_MISSING');
      if (commit.requestNarrative === true) {
        const generation = await seedNarrativeInTransaction(c, { ownerId: commit.ownerId,
          receipt: commit.receipt, save: commit.save, rendererVersion });
        await c.query(`UPDATE narrative_receipt_ownership SET generation_id=$4
          WHERE owner_id=$1 AND save_id=$2 AND request_key=$3`,
        [commit.ownerId, commit.save.saveId, commit.receipt.idempotencyKey, generation]);
      }
      // A deferred constraint validates managed->G, suppressed->no G at COMMIT.
    },
    async read(owner, receipt, cancellation) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        // Same lifecycle lock prefix as T1/T3. Never accepts an owner supplied in receipt JSON.
        if (!(await c.query('SELECT id FROM auth_accounts WHERE id=$1 AND closed_at IS NULL FOR SHARE',[owner])).rowCount)
          throw Error('NARRATIVE_NOT_FOUND');
        if (!(await c.query(`SELECT id FROM game_saves s WHERE id=$1 AND owner_id=$2
          AND NOT EXISTS(SELECT 1 FROM cloud_archive_trash t WHERE t.save_id=s.id) FOR SHARE`,[receipt.saveId,owner])).rowCount)
          throw Error('NARRATIVE_NOT_FOUND');
        const stored = (await c.query(`SELECT result,encode(sha256(convert_to(result::text,'UTF8')),'hex') AS sha
          FROM turn_requests WHERE save_id=$1 AND idempotency_key=$2`,[receipt.saveId,receipt.idempotencyKey])).rows[0];
        if (!stored || stored.result.requestFingerprint !== receipt.requestFingerprint
          || stored.result.resultingRevision !== receipt.resultingRevision) throw Error('NARRATIVE_RECEIPT_MISMATCH');
        const o = (await c.query(`SELECT * FROM narrative_receipt_ownership
          WHERE owner_id=$1 AND save_id=$2 AND request_key=$3`,[owner,receipt.saveId,receipt.idempotencyKey])).rows[0];
        if (!o) { await c.query('COMMIT'); return {status:'ownership_unknown'}; }
        if (o.receipt_sha !== stored.sha || o.branch_id !== 'root') throw Error('NARRATIVE_OWNERSHIP_CORRUPT');
        if (o.ownership === 'suppressed') {
          if((await c.query('SELECT id FROM narrative_generation_requests WHERE save_id=$1 AND request_key=$2',
            [receipt.saveId,receipt.idempotencyKey])).rowCount) throw Error('NARRATIVE_SUPPRESSED_INTEGRITY_FAILURE');
          await c.query('COMMIT'); return {status:'not_requested'};
        }
        if (o.ownership === 'legacy') {
          // Only pre-cutover inventory with server-side byte evidence may populate this row.
          if(o.protocol_version!==1 || !o.legacy_inventory_sha || o.generation_id
            || (await c.query('SELECT id FROM narrative_generation_requests WHERE save_id=$1 AND request_key=$2',
              [receipt.saveId,receipt.idempotencyKey])).rowCount)throw Error('NARRATIVE_LEGACY_INTEGRITY_FAILURE');
          if (!o.legacy_body) { await c.query('COMMIT'); return {status:'legacy_body_unavailable'}; }
          const body = Buffer.from(o.legacy_body);
          const {createHash}=await import('node:crypto');
          const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);
          if (createHash('sha256').update(body).digest('hex')!==o.legacy_body_sha || !Buffer.from(text).equals(body))
            throw Error('NARRATIVE_LEGACY_BODY_CORRUPT');
          if(!['model','deterministic'].includes(o.legacy_generator_source))throw Error('NARRATIVE_LEGACY_BODY_CORRUPT');
          await c.query('COMMIT'); return {status:'received',text,source:o.legacy_generator_source};
        }
        const g = (await c.query(`SELECT g.id,c."rendererVersion" FROM narrative_generation_requests g
          JOIN LATERAL (SELECT context->>'rendererVersion' AS "rendererVersion",receipt_sha,context_sha,context
            FROM narrative_context_snapshots WHERE id=g.context_id AND owner_id=$4) c ON true
          WHERE g.id=$1 AND g.save_id=$2 AND g.request_key=$3 AND c.receipt_sha=$5
          AND c.context_sha=encode(sha256(convert_to(c.context::text,'UTF8')),'hex')`,
          [o.generation_id,receipt.saveId,receipt.idempotencyKey,owner,stored.sha])).rows[0];
        if (o.ownership !== 'managed' || o.protocol_version !== 2 || !g
          || g.rendererVersion !== o.renderer_version || o.context_version !== 'authority-context-v1')
          throw Error('NARRATIVE_MANAGED_INTEGRITY_FAILURE');
        await c.query('COMMIT');
      } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e; }
      finally { c.release(); }
      // Read-only: no run/claim on action duplicate, query or ordinary polling.
      const end=Date.now()+NARRATIVE_V2_BUDGET.httpWaitMs;
      for(;;) {
        const value = await repository.presentation(owner,receipt.saveId,receipt.idempotencyKey);
        if (!value || value.generation === 'not_recorded') throw Error('NARRATIVE_MANAGED_INTEGRITY_FAILURE');
        if (value.source) return {status:'received',text:value.source.text,source:value.source.generatorSource};
        if (value.generation === 'failed') return {status:'failed',code:'NARRATIVE_UNAVAILABLE'};
        const state=value.generation === 'running' ? 'running' as const : 'pending' as const;
        if(cancellation?.aborted)return {status:state,wait:'cancelled'};
        if(Date.now()>=end)return {status:state,wait:'timeout'};
        // Waiting only. Ordinary reads cannot claim, seed, render or clear a failed state.
        await new Promise<void>(resolve=>{
          const done=()=>{clearTimeout(timer);cancellation?.removeEventListener('abort',done);resolve();};
          const timer=setTimeout(done,Math.min(200,end-Date.now()));
          cancellation?.addEventListener('abort',done,{once:true});
          if(cancellation?.aborted)done();
        });
      }
    },
  };
}
