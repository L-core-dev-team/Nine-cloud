import type { Pool, PoolClient } from 'pg';
import type { TurnReceipt } from '@jiuxiao/contracts';
import type { AcceptedTurnCommitInput } from './npc-memory-turn-transaction.js';
import type { NarrativeResult } from './server-turn.js';
import { NarrativePublicationRepository, seedNarrativeInTransaction, type BodyLimits } from './narrative-publication-repository.js';
import { NarrativeOutboxWorker, type DeterministicRenderer } from './narrative-outbox-worker.js';

/** Prepared integration port, NOT installed in the signed rule pipeline. See pending review patch. */
export function createNarrativeTurnHooks(pool:Pool,rendererVersion:string,render:DeterministicRenderer,limits:BodyLimits) {
  const repository=new NarrativePublicationRepository(pool,limits);
  const worker=new NarrativeOutboxWorker(repository,new Map([[rendererVersion,render]]));
  return {
    repository,worker,
    seedAcceptedTurn:async(c:PoolClient,commit:AcceptedTurnCommitInput)=>{
      await seedNarrativeInTransaction(c,{ownerId:commit.ownerId,receipt:commit.receipt,save:commit.save,rendererVersion});
    },
    managedNarrative:async(owner:string,receipt:TurnReceipt):Promise<NarrativeResult>=>{
      const source=await worker.run(owner,receipt.saveId,receipt.idempotencyKey);
      return source?{status:'received',text:source.text,source:'deterministic'}:{status:'failed',code:'NARRATIVE_UNAVAILABLE'};
    },
  };
}
