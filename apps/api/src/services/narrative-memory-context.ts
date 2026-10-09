import type { TurnReceipt, SaveEnvelopeV2, SaveEnvelopeV3 } from '@jiuxiao/contracts';
import {
  createNpcMemory,
  retrieveNpcMemories,
  type AuthorizedObservationOutboxRecord,
} from '@jiuxiao/domain';
import type { NarrativeContext } from './narrative-scheduler.js';
import { assertP1SaveMemoryPolicy } from './p1-memory-policy.js';

export type AuthorizedObservationPageReader = (ownerId: string, saveId: string, npcId: string, cursor?: {
  eventRevision: number; grantId: string;
}, limit?: number) => Promise<{
  items: AuthorizedObservationOutboxRecord[];
  nextCursor: { eventRevision: number; grantId: string } | null;
}>;

const PAGE_SIZE = 100;
const MAX_NPC_OBSERVATIONS = 10_000;
const NARRATIVE_RECALL_LIMIT = 12;
const FORGETTING_MIN_ACCESSIBILITY = 0.35;

/**
 * Builds a presentation-only recall from immutable, NPC-authorized outbox rows.
 * The bounded journal is deliberately not the source of truth for retrieval.
 */
export async function buildNarrativeMemoryContext(input: {
  ownerId: string;
  receipt: TurnReceipt;
  save: SaveEnvelopeV2 | SaveEnvelopeV3;
  readAuthorizedPage?: AuthorizedObservationPageReader;
}): Promise<NarrativeContext> {
  const { receipt, save, readAuthorizedPage } = input;
  if (receipt.decision.status !== 'accepted' || !('clockMinute' in receipt)) {
    return { npcMemories: [] };
  }
  const mode = assertP1SaveMemoryPolicy(save);

  const speakers = new Map<string, string>();
  for (const event of receipt.decision.events) {
    if (event.type !== 'talk.occurred') continue;
    const npcId = event.payload.npcId;
    const topicTag = event.payload.topicTag;
    if (typeof npcId === 'string' && npcId.trim() && typeof topicTag === 'string'
      && /^[a-z][a-z0-9_]{0,63}$/.test(topicTag)) {
      speakers.set(npcId, topicTag);
    }
  }
  if (speakers.size > 0 && !readAuthorizedPage) throw new Error('AUTHORIZED_OBSERVATION_READER_UNAVAILABLE');

  const npcMemories: NarrativeContext['npcMemories'][number][] = [];
  for (const [npcId, topicTag] of speakers) {
    const allRows: AuthorizedObservationOutboxRecord[] = [];
    let cursor: { eventRevision: number; grantId: string } | undefined;
    do {
      const page = await readAuthorizedPage!(input.ownerId, save.saveId, npcId, cursor, PAGE_SIZE);
      if (page.items.length > PAGE_SIZE || (page.nextCursor && page.items.length === 0)) {
        throw new Error('INVALID_AUTHORIZED_OBSERVATION_PAGE');
      }
      allRows.push(...page.items);
      if (allRows.length > MAX_NPC_OBSERVATIONS) throw new Error('NARRATIVE_MEMORY_LIMIT_EXCEEDED');
      const next = page.nextCursor ?? undefined;
      if (next && cursor && (next.eventRevision < cursor.eventRevision
        || (next.eventRevision === cursor.eventRevision && next.grantId <= cursor.grantId))) {
        throw new Error('INVALID_AUTHORIZED_OBSERVATION_CURSOR');
      }
      cursor = next;
    } while (cursor);

    // The grant outbox is append-only. Exclude later revisions when narrating a
    // retry of an older receipt, then order ties deterministically by event ID.
    const observations = allRows
      .filter(row => row.saveId === save.saveId && row.npcId === npcId && row.branchId === 'root'
        && row.eventRevision <= receipt.resultingRevision && row.observedAtMinute <= receipt.clockMinute)
      .sort((left, right) => left.eventRevision - right.eventRevision
        || (left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0))
      .map(row => ({
        npcId: row.npcId,
        eventId: row.eventId,
        eventRevision: row.eventRevision,
        observedAtMinute: row.observedAtMinute,
        channel: row.channel,
        summary: row.summary,
      }));

    const memory = {
      ...createNpcMemory(npcId, mode === 'forgetting' ? 'forgetting-v1' : 'continue-v1'),
      observations,
    };
    const recalls = retrieveNpcMemories(memory, {
      nowMinute: receipt.clockMinute,
      query: topicTag === 'unmatched' ? '' : topicTag,
      limit: NARRATIVE_RECALL_LIMIT,
      minAccessibility: mode === 'forgetting' ? FORGETTING_MIN_ACCESSIBILITY : 0,
    });
    if (recalls.length > 0) {
      npcMemories.push({
        npcId,
        observations: recalls.map(({ observation, accessibility }) => ({
          summary: observation.summary,
          accessibility,
        })),
      });
    }
  }
  return { npcMemories };
}
