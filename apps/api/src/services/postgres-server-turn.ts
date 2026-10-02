import type { Pool } from 'pg';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';
import type { ServerTurnRepository } from './server-turn.js';

/** Host-side adapter only: it does not publish or supply gameplay rules. */
export function createPostgresServerTurnRepository(pool: Pool, requiresLiveAccount = false): ServerTurnRepository {
  const saves = new PostgresCloudSaveRepository(pool);
  const turns = new PostgresNpcMemoryTurnRepository(pool, requiresLiveAccount);
  return {
    loadSave: (owner, id) => saves.getForOwner(owner, id),
    getReceiptForOwner: (owner, id, key) => turns.getReceiptForOwner(owner, id, key),
    getForOwner: (owner, id) => turns.getForOwner(owner, id),
    commitAcceptedTurn: input => turns.commitAcceptedTurn(input),
    recordNarrativeStatus: async(owner,id,key,attempt,status)=>{
      // A late earlier attempt cannot overwrite the status of a newer retry.
      await pool.query(`UPDATE turn_requests r SET narrative_attempt_id=$4,narrative_status=$5,narrative_updated_at=now()
        FROM game_saves s WHERE r.save_id=s.id AND s.id=$2 AND s.owner_id=$1 AND r.idempotency_key=$3 AND r.result IS NOT NULL
        AND ($5='generating' OR r.narrative_attempt_id=$4)`,[owner,id,key,attempt,status]);
    },
  };
}
