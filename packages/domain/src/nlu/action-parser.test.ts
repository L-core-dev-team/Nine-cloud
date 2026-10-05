import { describe, expect, it } from 'vitest';
import { parseActionText, type ActionTemplate, type VisibleTargetCatalog } from './action-parser.js';

const identity = {
  saveId: 'save-fixture',
  actorId: 'player-fixture',
  branchId: 'root' as const,
  expectedRevision: 3,
  idempotencyKey: 'f00a9b36-dff1-4a4d-b810-e28b5eb5d18a',
};

const visible: VisibleTargetCatalog = {
  knownLocations: [{ id: 'loc-wangqitai', label: '望气台' }],
  npcPresence: [{ id: 'npc-cenjiu', label: '岑九' }],
  observationTargets: [{ id: 'target-ferry', label: '渡船' }],
  clues: [{ id: 'clue-crow-nest', label: '灰羽鸦' }],
  inventory: [{ id: 'item-bishuifu', label: '避水符' }],
};

const templates: readonly ActionTemplate[] = [
  { id: 'move-to', kind: 'move', prefix: '去', entitySource: 'knownLocations' },
  { id: 'observe-target', kind: 'observe', prefix: '观察', entitySource: 'observationTargets', fixedPayload: { method: 'scan' }, labelPrefix: '观察' },
  { id: 'study-target', kind: 'observe', prefix: '细察', entitySource: 'observationTargets', fixedPayload: { method: 'study' }, labelPrefix: '细察' },
  { id: 'talk-to', kind: 'talk', prefix: '对', entitySource: 'npcPresence', capture: { separator: '说：', slot: 'utterance' } },
  { id: 'use-owned-item', kind: 'use_item', prefix: '使用', entitySource: 'inventory' },
];

function parse(text: string, overrides: Partial<Parameters<typeof parseActionText>[0]> = {}) {
  return parseActionText({ text, identity, visible, visibilityRevision: identity.expectedRevision, templates, ...overrides });
}

describe('P1 deterministic action parser kernel', () => {
  it('builds one complete intent only from one exact visible target match', () => {
    expect(parse('去望气台。')).toEqual({
      status: 'ready',
      intent: { ...identity, kind: 'move', payload: { destinationId: 'loc-wangqitai' } },
    });
  });

  it('binds observation targetId to the authorized observation target, not its containing location', () => {
    expect(parse('细察渡船')).toEqual({
      status: 'ready',
      intent: { ...identity, kind: 'observe', payload: { targetId: 'target-ferry', method: 'study' } },
    });
  });

  it('returns a structured missing slot without constructing an intent', () => {
    const result = parse('去');
    expect(result).toMatchObject({
      status: 'clarify',
      classification: 'missing',
      decision: { status: 'clarify', missingSlots: ['destinationId'], candidates: [], revision: 3 },
    });
    expect(result.status === 'clarify' && result.decision.interactionId).toBe(identity.idempotencyKey);
  });

  it('returns a persistable generic decision and a separate safe echo for display', () => {
    const result = parse('去南边那片白');
    expect(result).toMatchObject({ status: 'clarify', classification: 'unknown', decision: { candidates: [], missingSlots: [] } });
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.question).not.toContain('去南边那片白');
    expect(result.presentationQuestion).toContain('去南边那片白');
    expect(JSON.stringify(result.decision)).not.toContain('去南边那片白');
  });

  it('bounds and sanitizes only the ephemeral echo while keeping raw text out of the decision', () => {
    const raw = `${'外'.repeat(180)}\u0000末尾`;
    const result = parse(raw);
    expect(result.status).toBe('clarify');
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.question).not.toContain('外'.repeat(2));
    expect(Array.from(result.presentationQuestion.match(/「(.*)」/u)?.[1] ?? '')).toHaveLength(160);
    expect(result.presentationQuestion).not.toContain('\u0000');
  });

  it('bounds raw input by UTF-16 code units before normalization', () => {
    expect(parse('😀'.repeat(2001))).toMatchObject({
      status: 'clarify', classification: 'unknown', decision: { question: '这句话太长，请缩短后再试。' },
    });
  });

  it.each(['不要去望气台', '如果天没黑就去望气台', '去那边'])('fails closed on unresolved control language: %s', text => {
    const result = parse(text);
    expect(result).toMatchObject({ status: 'clarify', classification: 'unknown', decision: { candidates: [] } });
  });

  it('uses only caller-provided visible targets when forming clarification candidates', () => {
    const locations = [
      { id: 'loc-east-gate', label: '旧门', disambiguator: '东侧' },
      { id: 'loc-west-gate', label: '旧门', disambiguator: '西侧' },
    ];
    const result = parse('去旧门', { visible: { ...visible, knownLocations: locations } });
    expect(result).toMatchObject({
      status: 'clarify', classification: 'ambiguous',
      decision: { candidates: [
        { kind: 'move', label: '去旧门（东侧）', slots: { destinationId: 'loc-east-gate' } },
        { kind: 'move', label: '去旧门（西侧）', slots: { destinationId: 'loc-west-gate' } },
      ] },
    });
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(JSON.stringify(result.decision.candidates)).not.toContain('loc-wangqitai');
  });

  it('orders multi-action candidates by the contract action order', () => {
    const sameSurfaceTemplates: readonly ActionTemplate[] = [
      { id: 'late-observe', kind: 'observe', prefix: '选择', entitySource: 'observationTargets', fixedPayload: { method: 'scan' }, labelPrefix: '观察 ' },
      { id: 'early-move', kind: 'move', prefix: '选择', entitySource: 'knownLocations', labelPrefix: '前往 ' },
      { id: 'middle-use', kind: 'use_item', prefix: '选择', entitySource: 'inventory', labelPrefix: '使用 ' },
    ];
    const multiVisible: VisibleTargetCatalog = {
      knownLocations: [{ id: 'loc-a', label: '目标' }],
      observationTargets: [{ id: 'target-a', label: '目标' }],
      npcPresence: [], clues: [], inventory: [{ id: 'item-a', label: '目标' }],
    };
    const result = parse('选择目标', { templates: sameSurfaceTemplates, visible: multiVisible });
    expect(result.status).toBe('clarify');
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.candidates.map(candidate => candidate.kind)).toEqual(['move', 'use_item', 'observe']);
  });

  it('does not truncate ambiguity when more than four visible candidates collide', () => {
    const manyTargets = Array.from({ length: 5 }, (_, index) => ({
      id: `loc-${index + 1}`, label: '相同地点', disambiguator: `区域${index + 1}`,
    }));
    const result = parse('去相同地点', { visible: { ...visible, knownLocations: manyTargets } });
    expect(result).toMatchObject({
      status: 'clarify', classification: 'ambiguous', decision: { candidates: [], missingSlots: [] },
    });
    expect(result.status === 'clarify' && result.decision.question).toContain('多个可见目标');
  });

  it('captures direct speech verbatim and does not treat its negation as a player command', () => {
    expect(parse('对岑九说：不要去望气台。')).toEqual({
      status: 'ready',
      intent: { ...identity, kind: 'talk', payload: { npcId: 'npc-cenjiu', utterance: '不要去望气台' } },
    });
  });

  it('returns missing utterance for a known NPC without inventing dialogue', () => {
    expect(parse('对岑九说：')).toMatchObject({
      status: 'clarify', classification: 'missing', decision: { missingSlots: ['utterance'], candidates: [] },
    });
  });

  it('keeps captured dialogue out of durable ambiguous-NPC candidates', () => {
    const sameNameNpcs = [
      { id: 'npc-one', label: '岑九', disambiguator: '渡口' },
      { id: 'npc-two', label: '岑九', disambiguator: '望气台' },
    ];
    const result = parse('对岑九说：这句私密话只留在当前草稿', {
      visible: { ...visible, npcPresence: sameNameNpcs },
    });
    expect(result).toMatchObject({ status: 'clarify', classification: 'ambiguous' });
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.candidates).toEqual([
      { kind: 'talk', label: '与岑九（渡口）交谈', slots: { npcId: 'npc-one' } },
      { kind: 'talk', label: '与岑九（望气台）交谈', slots: { npcId: 'npc-two' } },
    ]);
    expect(JSON.stringify(result.decision)).not.toContain('这句私密话只留在当前草稿');
  });

  it('does not resolve an item the player does not currently carry', () => {
    expect(parse('使用旧驿符')).toMatchObject({ status: 'clarify', classification: 'unknown', decision: { candidates: [] } });
  });

  it('does not turn an undiscovered location into a hidden move target', () => {
    const text = '去洪荒妖林核心';
    const result = parse(text);
    expect(result).toMatchObject({
      status: 'clarify',
      classification: 'unknown',
      decision: { candidates: [], missingSlots: [] },
    });
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.question).not.toContain(text);
    expect(result.presentationQuestion).toContain(text);
  });

  it('does not turn an absent NPC into a hidden talk target', () => {
    const text = '对老李说：你来了';
    const result = parse(text);
    expect(result).toMatchObject({
      status: 'clarify',
      classification: 'unknown',
      decision: { candidates: [], missingSlots: [] },
    });
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.question).not.toContain(text);
    expect(result.presentationQuestion).toContain(text);
  });

  it('links a revised action to the prior clarification without changing world state', () => {
    const clarificationOf = 'f00a9b36-dff1-4a4d-b810-e28b5eb5d18a';
    const nextIdentity = { ...identity, idempotencyKey: '85178f7f-d705-42c5-8b16-85cb1f8e2c4d', clarificationOf };
    expect(parseActionText({
      text: '去望气台', identity: nextIdentity, visible, visibilityRevision: identity.expectedRevision, templates,
    })).toMatchObject({ status: 'ready', intent: { idempotencyKey: nextIdentity.idempotencyKey, clarificationOf } });
  });

  it('does not parse against a visibility snapshot from another revision', () => {
    expect(parse('去望气台', { visibilityRevision: 2 })).toMatchObject({
      status: 'clarify', classification: 'unknown', decision: { candidates: [], revision: 3 },
    });
  });

  it('rejects parser templates that ask for IDs outside their authorized visible source', () => {
    expect(() => parse('做事', { templates: [{
      id: 'forged-location-as-item', kind: 'use_item', prefix: '使用', entitySource: 'knownLocations',
    } as unknown as ActionTemplate] })).toThrow('P1_NLU_TEMPLATE_INVALID');
  });
});
