import {assertDataPolicy,checkQuota,type DataPolicy} from './data-policy.js';
import type { Pool } from 'pg';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';
import type { ServerTurnRepository } from './server-turn.js';

/**
 * Every 64th integrity check of a save re-hashes its whole event chain (full audit). The
 * other checks re-hash only the recorded verified head and the rows appended after it,
 * and fail when that head vanished or changed (0030_turn_event_chain_checkpoint.sql).
 * The first check of a save in each API process is also a full audit.
 */
export const EVENT_CHAIN_FULL_AUDIT_EVERY = 64;
const MAX_PROCESS_AUDITED_SAVES = 10_000;
export interface EventChainVerification { ok: boolean; fullAudit: boolean; hashedEvents: number; headSequence: number }
/** fullAuditEvery=1 forces a full audit; verify_turn_event_chain remains the stateless full check. */
export async function verifyTurnEventChain(db: Pick<Pool, 'query'>, saveId: string, fullAuditEvery = EVENT_CHAIN_FULL_AUDIT_EVERY): Promise<EventChainVerification> {
  const row = (await db.query('SELECT ok,full_audit,hashed_events,head_sequence FROM verify_turn_event_chain_incremental($1,$2)', [saveId, fullAuditEvery])).rows[0];
  return { ok: row?.ok === true, fullAudit: row?.full_audit === true, hashedEvents: Number(row?.hashed_events ?? 0), headSequence: Number(row?.head_sequence ?? -1) };
}

/** Host-side adapter only: it does not publish or supply gameplay rules. */
export function createPostgresServerTurnRepository(pool: Pool, requiresLiveAccount = false,policy?:()=>DataPolicy|undefined): ServerTurnRepository {
  const saves = new PostgresCloudSaveRepository(pool);
  const auditedInProcess = new Set<string>();
  const turns = new PostgresNpcMemoryTurnRepository(pool, requiresLiveAccount,policy?async(c,commit)=>{
    const p=policy();assertDataPolicy(p);
    const current=(await c.query('SELECT count(*)::int AS count,coalesce(sum(octet_length(snapshot::text)+coalesce(octet_length(memory_policy::text),0)+coalesce(octet_length(character_profile::text),0)),0)::text AS bytes FROM game_saves WHERE owner_id=$1',[commit.ownerId])).rows[0];
    // The profile stays on the row. Account usage already includes it, so replace only the mutable bytes below.
    const before=(await c.query(`SELECT octet_length(snapshot::text)+coalesce(octet_length(memory_policy::text),0) AS bytes,
      character_profile IS NOT NULL AND
      octet_length(character_profile::text)+octet_length($3::jsonb::text)+coalesce(octet_length($4::jsonb::text),0)>$5 AS profile_over_limit
      FROM game_saves WHERE id=$1 AND owner_id=$2`,[commit.save.saveId,commit.ownerId,JSON.stringify(commit.save.state),
      commit.save.schemaVersion===1?null:JSON.stringify(commit.save.memoryPolicy),p.perSaveBytes])).rows[0];
    if(before.profile_over_limit)throw new Error('CLOUD_QUOTA_EXCEEDED');
    const memoryPolicyJson=commit.save.schemaVersion===1?null:JSON.stringify(commit.save.memoryPolicy);
    const next=Number((await c.query('SELECT octet_length($1::jsonb::text)+coalesce(octet_length($2::jsonb::text),0) AS bytes',[JSON.stringify(commit.save.state),memoryPolicyJson])).rows[0].bytes);
    checkQuota(p,{count:current.count,bytes:Number(current.bytes)},next,Number(before.bytes));
  }:undefined);
  return {
    loadSave: async(owner,id)=>{
      const save=await saves.getForOwner(owner,id);if(!save)return save;
      const verified=await verifyTurnEventChain(pool,id,auditedInProcess.has(id)?EVENT_CHAIN_FULL_AUDIT_EVERY:1);
      if(!verified.ok)throw new Error('EVENT_INTEGRITY_FAILED');
      if(auditedInProcess.size>=MAX_PROCESS_AUDITED_SAVES)auditedInProcess.clear();
      auditedInProcess.add(id);return save;
    },
    getReceiptForOwner: (owner, id, key) => turns.getReceiptForOwner(owner, id, key),
    getForOwner: (owner, id) => turns.getForOwner(owner, id),
    getAuthorizedObservationPage: (owner, id, npcId, cursor, limit) => turns.getAuthorizedObservationPage(owner, id, npcId, cursor, limit),
    recallObservationPage: (owner, id, npcId, cursor, limit, throughRevision) => turns.getAuthorizedObservationPage(owner, id, npcId, cursor, limit, throughRevision),
    recordNonAcceptedDecision: input => turns.recordNonAcceptedDecision(input),
    commitAcceptedTurn: input => turns.commitAcceptedTurn(input),
    recordNarrativeStatus: async(owner,id,key,attempt,status)=>{
      // A late earlier attempt cannot overwrite the status of a newer retry.
      await pool.query(`UPDATE turn_requests r SET narrative_attempt_id=$4,narrative_status=$5,narrative_updated_at=now()
        FROM game_saves s WHERE r.save_id=s.id AND s.id=$2 AND s.owner_id=$1 AND r.idempotency_key=$3 AND r.result IS NOT NULL
        AND ($5='generating' OR r.narrative_attempt_id=$4)`,[owner,id,key,attempt,status]);
    },
  };
}
