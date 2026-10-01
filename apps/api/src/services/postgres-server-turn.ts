import type { Pool } from 'pg';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
import { PostgresNpcMemoryTurnRepository } from './npc-memory-turn-transaction.js';
import type { ServerTurnRepository } from './server-turn.js';

/** Host-side adapter only: it does not publish or supply gameplay rules. */
export function createPostgresServerTurnRepository(pool: Pool): ServerTurnRepository {
  const saves = new PostgresCloudSaveRepository(pool);
  const turns = new PostgresNpcMemoryTurnRepository(pool);
  return {
    loadSave: (owner, id) => saves.getForOwner(owner, id),
    getReceiptForOwner: (owner, id, key) => turns.getReceiptForOwner(owner, id, key),
    getForOwner: (owner, id) => turns.getForOwner(owner, id),
    commitAcceptedTurn: input => turns.commitAcceptedTurn(input),
  };
}
