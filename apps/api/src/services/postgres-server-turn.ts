import {assertDataPolicy,checkQuota,type DataPolicy} from './data-policy.js';
import type { Pool } from 'pg';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';
import type { ServerTurnRepository } from './server-turn.js';

/** Host-side adapter only: it does not publish or supply gameplay rules. */
export function createPostgresServerTurnRepository(pool: Pool, requiresLiveAccount = false,policy?:()=>DataPolicy|undefined): ServerTurnRepository {
  const saves = new PostgresCloudSaveRepository(pool);
  const turns = new PostgresNpcMemoryTurnRepository(pool, requiresLiveAccount,policy?async(c,commit)=>{
    const p=policy();assertDataPolicy(p);
    const current=(await c.query('SELECT count(*)::int AS count,coalesce(sum(octet_length(snapshot::text)+coalesce(octet_length(memory_policy::text),0)),0)::text AS bytes FROM game_saves WHERE owner_id=$1',[commit.ownerId])).rows[0];
    const before=(await c.query('SELECT octet_length(snapshot::text)+coalesce(octet_length(memory_policy::text),0) AS bytes FROM game_saves WHERE id=$1 AND owner_id=$2',[commit.save.saveId,commit.ownerId])).rows[0];
    const memoryPolicyJson=commit.save.schemaVersion===1?null:JSON.stringify(commit.save.memoryPolicy);
    const next=Number((await c.query('SELECT octet_length($1::jsonb::text)+coalesce(octet_length($2::jsonb::text),0) AS bytes',[JSON.stringify(commit.save.state),memoryPolicyJson])).rows[0].bytes);
    checkQuota(p,{count:current.count,bytes:Number(current.bytes)},next,Number(before.bytes));
  }:undefined);
  return {
    loadSave: async(owner,id)=>{const save=await saves.getForOwner(owner,id);if(save&&!((await pool.query('SELECT verify_turn_event_chain($1) AS ok',[id])).rows[0].ok))throw new Error('EVENT_INTEGRITY_FAILED');return save;},
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
