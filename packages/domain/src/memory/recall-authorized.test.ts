import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AuthorizedRecallObservation } from './turn-journal.js';
import { AUTHORIZED_RECALL_DECAY, observationAccessibility, recognizeAuthorizedMemoryCue, recallAuthorizedObservations } from './recall-authorized.js';

const SAVE = 'save-memory-test';
const NPC = 'npc-lin-yue';
const POLICY = 'visibility-v1';

function row(input: { eventId: string; revision: number; minute: number; memoryClass: AuthorizedRecallObservation['memoryClass']; summary: string; place?: string; supersessions?: AuthorizedRecallObservation['supersessions'] }): AuthorizedRecallObservation {
  const authorizedFields = input.place === undefined ? ['summary'] : ['summary', 'place'];
  const authorizedFacts = input.place === undefined ? { summary: input.summary } : { summary: input.summary, place: input.place };
  return {
    grantId: [SAVE, 'root', input.eventId, NPC].map(part => `${part.length}:${part}`).join(''),
    grantIdVersion: 1 as const,
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

describe('P4 v2 decay-gated authorized recall (plan B, 2026-10-10)', () => {
  it('reuses the reviewed narrative forgetting curve with deterministic vectors', () => {
    expect(observationAccessibility(0, 0)).toBe(1);
    expect(observationAccessibility(10_080, 0)).toBe(0.5);
    expect(observationAccessibility(0, 16)).toBe(0.5);
    expect(observationAccessibility(5_040, 8)).toBe(0.5);
    expect(observationAccessibility(10_080, 16)).toBe(0.25);
    expect(observationAccessibility(30_240, 32)).toBe(0.03125);
  });

  it('splits evidence from forgetting exactly at the pinned 0.35 floor', () => {
    // later dimension: 2^-(24/16) ≈ 0.3536 stays; 2^-(25/16) ≈ 0.3398 falls.
    expect(observationAccessibility(0, 24)).toBeGreaterThan(AUTHORIZED_RECALL_DECAY.accessibilityFloor);
    expect(observationAccessibility(0, 25)).toBeLessThan(AUTHORIZED_RECALL_DECAY.accessibilityFloor);
    // elapsed dimension around the same floor.
    expect(observationAccessibility(15_266, 0)).toBeGreaterThan(AUTHORIZED_RECALL_DECAY.accessibilityFloor);
    expect(observationAccessibility(15_267, 0)).toBeLessThan(AUTHORIZED_RECALL_DECAY.accessibilityFloor);
    // The pinned floor is the single narrative-layer threshold, not a new value.
    expect(AUTHORIZED_RECALL_DECAY).toEqual({ halfLifeGameMinutes: 10_080, halfLifeObservations: 16, accessibilityFloor: 0.35 });
  });

  it('rejects invalid decay inputs', () => {
    expect(() => observationAccessibility(-1, 0)).toThrow('Invalid forgetting decay inputs');
    expect(() => observationAccessibility(0, 1.5)).toThrow('Invalid forgetting decay inputs');
    expect(() => observationAccessibility(Number.NaN, 0)).toThrow('Invalid forgetting decay inputs');
  });

  it('answers with the deterministic forgotten template when every candidate decayed', () => {
    const decayed = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 18,
      memoryClass: 'historical-event', summary: '林月曾在中州渡口救下旅人。', place: '中州渡口' });
    expect(recallAuthorizedObservations([decayed], {
      query: '中州渡口', slot: 'historical-event', gameMinute: 20_000, throughRevision: 1, forgetting: true,
    })).toEqual({ status: 'forgotten', query: '中州渡口', slot: 'historical-event', message: '我不太记得了。' });
    // Without the decay gate the same evidence still answers: only v2 forgetting saves change.
    expect(recallAuthorizedObservations([decayed], {
      query: '中州渡口', slot: 'historical-event', gameMinute: 20_000, throughRevision: 1,
    })).toMatchObject({ status: 'complete', grantId: decayed.grantId });
  });

  it('keeps accessible evidence while decaying only the forgotten observations', () => {
    const fresh = row({ eventId: '22222222-2222-4222-8222-222222222222', revision: 2, minute: 19_990,
      memoryClass: 'historical-event', summary: '林月在中州渡口救下旅人。', place: '中州渡口' });
    const decayed = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 18,
      memoryClass: 'historical-event', summary: '林月在中州渡口送别故人。', place: '中州渡口' });
    const result = recallAuthorizedObservations([decayed, fresh], {
      query: '中州渡口', slot: 'historical-event', gameMinute: 20_000, throughRevision: 2, forgetting: true,
    });
    expect(result).toMatchObject({ status: 'complete', grantId: fresh.grantId });
    // The decayed row still counts as a later observation for the fresh one (2^-10/10080 alone stays above the floor).
    expect(observationAccessibility(10, 1)).toBeGreaterThan(AUTHORIZED_RECALL_DECAY.accessibilityFloor);
  });

  it('never reports forgotten for queries that never matched anything', () => {
    const unrelated = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 18,
      memoryClass: 'historical-event', summary: '林月曾在青云涧采药。', place: '青云涧' });
    const result = recallAuthorizedObservations([unrelated], {
      query: '中州渡口', slot: 'historical-event', gameMinute: 20_000, throughRevision: 1, forgetting: true,
    });
    expect(result).toMatchObject({ status: 'abstain', reason: 'no-match' });
  });

  it('keeps the superseded current-state time-qualified answer and the unclassified discipline outside the decay gate', () => {
    const old = row({ eventId: '11111111-1111-4111-8111-111111111111', revision: 1, minute: 18,
      memoryClass: 'current-state', summary: '林月住在中州。', place: '中州', supersessions: [{
        saveId: SAVE, branchId: 'root', npcId: NPC,
        observationGrantId: [SAVE, 'root', '11111111-1111-4111-8111-111111111111', NPC].map(part => `${part.length}:${part}`).join(''),
        supersededByEventId: '22222222-2222-4222-8222-222222222222', supersededAtRevision: 2,
        kind: 'relation-changed', reason: '规则事件确认住处已变更。', policyVersion: POLICY,
      }] });
    expect(recallAuthorizedObservations([old], {
      query: '中州', slot: 'current-state', gameMinute: 20_000, throughRevision: 2, forgetting: true,
    })).toMatchObject({ status: 'abstain', reason: 'stale-only' });
    const legacy = row({ eventId: '33333333-3333-4333-8333-333333333333', revision: 1, minute: 18,
      memoryClass: 'unclassified', summary: '中州的旧记录没有语义类别。', place: '中州' });
    expect(recallAuthorizedObservations([legacy], {
      query: '中州', slot: 'historical-event', gameMinute: 20_000, throughRevision: 1, forgetting: true,
    })).toMatchObject({ status: 'abstain', reason: 'unclassified-only' });
  });

  it('pins the v2 artifact to the reviewed decay constants', () => {
    const v2Policy = JSON.parse(readFileSync(new URL('./p4-recall-policy-v2.json', import.meta.url), 'utf8')) as {
      version: string; forgettingMode: string; forgettingDecay: Record<string, unknown>;
    };
    expect(v2Policy.version).toBe('authorized-cue-recall-v2');
    expect(v2Policy.forgettingMode).toContain('Decay-gated');
    expect(v2Policy.forgettingDecay).toEqual({
      ...AUTHORIZED_RECALL_DECAY,
      formula: '2^-(elapsedGameMinutes/halfLifeGameMinutes + laterAuthorizedObservations/halfLifeObservations)',
    });
  });
});
