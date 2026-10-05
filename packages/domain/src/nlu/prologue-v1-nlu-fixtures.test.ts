import { describe, expect, it } from 'vitest';
import { parseActionText } from './action-parser.js';
import {
  PROLOGUE_V1_ACTION_TEMPLATES,
  PROLOGUE_V1_NLU_CORPUS,
  PROLOGUE_V1_NLU_VISIBLE_CATALOG,
} from './prologue-v1-nlu-fixtures.js';

const interactionId = (ordinal: number) => `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const caseById = new Map(PROLOGUE_V1_NLU_CORPUS.map(sample => [sample.id, sample]));

function parseSample(sample: typeof PROLOGUE_V1_NLU_CORPUS[number]) {
  const prior = 'clarifies' in sample ? caseById.get(sample.clarifies) : undefined;
  return parseActionText({
    text: sample.text,
    identity: {
      saveId: 'p1-nlu-fixture-save',
      actorId: 'p1-nlu-fixture-player',
      branchId: 'root',
      expectedRevision: 0,
      idempotencyKey: interactionId(Number(sample.id.slice(-2))),
      ...(prior ? { clarificationOf: interactionId(Number(prior.id.slice(-2))) } : {}),
    },
    visible: PROLOGUE_V1_NLU_VISIBLE_CATALOG,
    visibilityRevision: 0,
    templates: PROLOGUE_V1_ACTION_TEMPLATES,
  });
}

describe('author-endorsed P1 NLU acceptance corpus', () => {
  it('contains the agreed 14 samples across the required parser outcomes', () => {
    expect(PROLOGUE_V1_NLU_CORPUS).toHaveLength(14);
    expect(new Set(PROLOGUE_V1_NLU_CORPUS.map(sample => sample.id)).size).toBe(14);
    expect(PROLOGUE_V1_NLU_CORPUS.filter(sample => sample.status === 'ready')).toHaveLength(5);
    expect(PROLOGUE_V1_NLU_CORPUS.filter(sample => sample.status === 'missing')).toHaveLength(2);
    expect(PROLOGUE_V1_NLU_CORPUS.filter(sample => sample.status === 'unknown')).toHaveLength(7);
  });

  it.each(PROLOGUE_V1_NLU_CORPUS)('$id: $text', sample => {
    const result = parseSample(sample);
    if (sample.status === 'ready') {
      expect(result).toMatchObject({ status: 'ready', intent: { kind: sample.kind, payload: sample.payload } });
      if (sample.id === 'NLU-14' && result.status === 'ready') {
        expect(result.intent).toMatchObject({
          idempotencyKey: interactionId(14),
          clarificationOf: interactionId(3),
        });
      }
      return;
    }

    expect(result.status).toBe('clarify');
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.classification).toBe(sample.status);
    expect(result.decision.interactionId).toBe(interactionId(Number(sample.id.slice(-2))));
    expect(result.decision.candidates).toEqual([]);
    if (sample.status === 'missing') {
      expect(result.decision.missingSlots).toEqual(sample.missingSlots);
    } else {
      expect(result.decision.missingSlots).toEqual([]);
    }
    if (sample.id === 'NLU-10' || sample.id === 'NLU-13') {
      expect(result.presentationQuestion).toContain(sample.text);
      expect(JSON.stringify(result.decision)).not.toContain(sample.text);
    }
  });

  it('does not create ActionIntents for any incomplete, ambiguous, or unknown input', () => {
    for (const sample of PROLOGUE_V1_NLU_CORPUS.filter(sample => sample.status !== 'ready')) {
      expect(parseSample(sample).status, sample.id).toBe('clarify');
    }
  });
});
