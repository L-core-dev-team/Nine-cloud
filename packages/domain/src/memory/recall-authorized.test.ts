import { describe, expect, it } from 'vitest';
import type { AuthorizedRecallObservation } from './turn-journal.js';
import { recognizeAuthorizedMemoryCue, recallAuthorizedObservations } from './recall-authorized.js';

const SAVE = 'save-memory-test';
const NPC = 'npc-lin-yue';
const POLICY = 'visibility-v1';

function row(input: { eventId: string; revision: number; minute: number; memoryClass: AuthorizedRecallObservation['memoryClass']; summary: string; place?: string; supersessions?: AuthorizedRecallObservation['supersessions'] }): AuthorizedRecallObservation {
  const authorizedFields = input.place === undefined ? ['summary'] : ['summary', 'place'];
  const authorizedFacts = input.place === undefined ? { summary: input.summary } : { summary: input.summary, place: input.place };
  return {
    grantId: [SAVE, 'root', input.eventId, NPC].map(part => `${part.length}:${part}`).join(''),
    saveId: SAVE, branchId: 'root', npcId: NPC, eventId: input.eventId,
    eventRevision: input.revision, observedAtMinute: input.minute, channel: 'witnessed',
    memoryClass: input.memoryClass, authorizationPolicyVersion: POLICY,
    authorizedFields, authorizedFacts, summary: input.summary,
    supersessions: input.supersessions ?? [],
  };
}

describe('authorized NPC memory recall', () => {
  it('recognizes only explicit bounded memory cues', () => {
    expect(recognizeAuthorizedMemoryCue('你还记得中州吗？')).toEqual({ query: '中州吗', slot: 'historical-event' });
    expect(recognizeAuthorizedMemoryCue('你觉得中州如何？')?.slot).toBe('subjective-belief');
    expect(recognizeAuthorizedMemoryCue('中州的天气如何？')).toBeNull();
    expect(recognizeAuthorizedMemoryCue('还记得 ' + '中'.repeat(200))).toBeNull();
  });

  it('retrieves historical facts only from historical observations', () => {
    const history = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 12,
      memoryClass: 'historical-event', summary: '林月曾在中州渡口救下旅人。', place: '中州渡口' });
    const current = row({ eventId: '22222222-2222-4222-8222-222222222222', revision: 2, minute: 20,
      memoryClass: 'current-state', summary: '林月现在住在中州。', place: '中州' });
    expect(recallAuthorizedObservations([history, current], {
      query: '中州渡口', slot: 'historical-event', gameMinute: 20, throughRevision: 2,
    })).toMatchObject({ status: 'complete', grantId: history.grantId, authorizedFacts: { place: '中州渡口' } });
  });

  it('abstains from superseded current-state observations and rejects future invalidation evidence', () => {
    const old = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 12,
      memoryClass: 'current-state', summary: '林月住在中州。', place: '中州', supersessions: [{
        saveId: SAVE, branchId: 'root', npcId: NPC, observationGrantId: [SAVE, 'root', '11111111-1111-4111-8111-111111111111', NPC].map(part => `${part.length}:${part}`).join(''),
        supersededByEventId: '22222222-2222-4222-8222-222222222222', supersededAtRevision: 2,
        kind: 'relation-changed', reason: '规则事件确认住处已变更。', policyVersion: POLICY,
      }] });
    expect(recallAuthorizedObservations([old], { query: '中州', slot: 'current-state', gameMinute: 20, throughRevision: 2 }))
      .toMatchObject({ status: 'abstain', reason: 'stale-only' });
    expect(() => recallAuthorizedObservations([old], { query: '中州', slot: 'current-state', gameMinute: 20, throughRevision: 1 }))
      .toThrow('Memory supersession does not match its authorized observation');
  });

  it('keeps subjective belief separate and ignores unclassified legacy records', () => {
    const belief = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 12,
      memoryClass: 'subjective-belief', summary: '林月认为中州渡口不可信。', place: '中州渡口' });
    const legacy = row({ eventId: '22222222-2222-4222-8222-222222222222', revision: 2, minute: 18,
      memoryClass: 'unclassified', summary: '中州的旧记录没有语义类别。', place: '中州' });
    expect(recallAuthorizedObservations([belief, legacy], { query: '中州渡口', slot: 'subjective-belief', gameMinute: 20, throughRevision: 2 }))
      .toMatchObject({ status: 'complete', memoryClass: 'subjective-belief' });
    expect(recallAuthorizedObservations([legacy], { query: '中州', slot: 'historical-event', gameMinute: 20, throughRevision: 2 }))
      .toMatchObject({ status: 'abstain', reason: 'unclassified-only' });
  });

  it('returns a bounded candidate set when multiple records match', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row({
      eventId: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`, revision: index + 1, minute: index + 1,
      memoryClass: 'historical-event', summary: `林月在中州第${index + 1}次停留。`, place: '中州',
    }));
    const result = recallAuthorizedObservations(rows, { query: '中州', slot: 'historical-event', gameMinute: 30, throughRevision: 20 });
    expect(result).toMatchObject({ status: 'partial', omittedCandidates: 4 });
    if (result.status === 'partial') expect(result.candidates).toHaveLength(16);
  });

  it('rejects evidence beyond the committed game clock or revision', () => {
    const future = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 2, minute: 30,
      memoryClass: 'historical-event', summary: '中州旧事。', place: '中州' });
    expect(() => recallAuthorizedObservations([future], { query: '中州', slot: 'historical-event', gameMinute: 20, throughRevision: 2 }))
      .toThrow('game clock or recall revision');
  });
});
