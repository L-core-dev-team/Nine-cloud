import { describe, expect, it } from 'vitest';
import { PROLOGUE_V1_ACTION_TEMPLATES } from '@jiuxiao/domain/nlu/prologue-v1-fixtures';
import type { ActionTemplate, VisibleTargetCatalog } from '@jiuxiao/domain/nlu';
import { parseP2CandidateActionText, type P2CandidateActionTemplate, type P2CandidateVisibleCatalog } from './p2-candidate-action-parser.js';

const identity = {
  saveId: 'candidate-save', actorId: 'player-1', branchId: 'root' as const,
  expectedRevision: 4, idempotencyKey: '33333333-3333-4333-8333-333333333333',
};
const p1Visible: VisibleTargetCatalog = {
  knownLocations: [{ id: 'loc_wangqitai', label: '望气台' }],
  npcPresence: [{ id: 'npc_cenjiu', label: '岑九' }],
  observationTargets: [{ id: 'obj_ferry', label: '渡船' }],
  clues: [], inventory: [{ id: 'item_bishuifu', label: '避水符' }],
};
const visible: P2CandidateVisibleCatalog = {
  ...p1Visible,
  sublocations: [{ id: 'subloc_reef', label: '礁脊' }],
  returnLocations: [],
  acquisitionTargets: [{ id: 'item_bishuifu', label: '避水符' }],
  combatTargets: [{ id: 'npc_shuiyuya', label: '水羽鸦' }],
  questTargets: [{ id: 'quest_clearance', label: '首个通行任务' }],
};
const candidateTemplates: readonly P2CandidateActionTemplate[] = [
  { id: 'enter-sublocation', kind: 'move', prefix: '前往', entitySource: 'sublocations' },
  { id: 'acquire-item', kind: 'acquire_item', prefix: '拾取', entitySource: 'acquisitionTargets', fixedPayload: { quantity: 1 } },
  { id: 'use-targeted-item', kind: 'use_item', prefix: '使用', suffix: '对礁脊', entitySource: 'inventory', fixedPayload: { targetId: 'subloc_reef' } },
  { id: 'combat', kind: 'combat', prefix: '与', suffix: '交战', entitySource: 'combatTargets' },
  { id: 'claim', kind: 'quest', prefix: '领取任务奖励：', entitySource: 'questTargets', fixedPayload: { choiceId: 'claim_reward' } },
];

function parse(text: string, options: {
  visible?: P2CandidateVisibleCatalog;
  visibilityRevision?: number;
  p1Templates?: readonly ActionTemplate[];
  candidateTemplates?: readonly P2CandidateActionTemplate[];
} = {}) {
  return parseP2CandidateActionText({ text, identity, visible: options.visible ?? visible,
    visibilityRevision: options.visibilityRevision ?? identity.expectedRevision,
    p1Templates: options.p1Templates ?? PROLOGUE_V1_ACTION_TEMPLATES,
    candidateTemplates: options.candidateTemplates ?? candidateTemplates });
}

describe('P2 DEV candidate parser extension', () => {
  it.each([
    ['前往礁脊', 'move', { destinationId: 'subloc_reef' }],
    ['拾取避水符', 'acquire_item', { itemId: 'item_bishuifu', quantity: 1 }],
    ['使用避水符对礁脊', 'use_item', { itemId: 'item_bishuifu', targetId: 'subloc_reef' }],
    ['与水羽鸦交战', 'combat', { targetId: 'npc_shuiyuya' }],
    ['领取任务奖励：首个通行任务', 'quest', { questId: 'quest_clearance', choiceId: 'claim_reward' }],
  ])('binds exact visible candidate text to %s', (text, kind, payload) => {
    expect(parse(text)).toMatchObject({ status: 'ready', intent: { kind, payload } });
  });

  it('keeps signed P1 parser behavior for original action text', () => {
    expect(parse('去望气台')).toMatchObject({ status: 'ready', intent: { kind: 'move', payload: { destinationId: 'loc_wangqitai' } } });
    expect(parse('对岑九说：不要去望气台')).toMatchObject({ status: 'ready', intent: { kind: 'talk' } });
    expect(parse('我看看')).toMatchObject({ status: 'clarify', classification: 'missing' });
  });

  it('does not bind hidden targets, negated or conditional commands, stale views, or unresolved references', () => {
    for (const text of ['与隐藏妖物交战', '不要与水羽鸦交战', '如果天没黑就与水羽鸦交战', '与那边的水羽鸦交战']) {
      const result = parse(text);
      expect(result).toMatchObject({ status: 'clarify', classification: 'unknown' });
      if (result.status === 'clarify') expect(JSON.stringify(result.decision)).not.toContain(text);
    }
    expect(parse('与水羽鸦交战', { visibilityRevision: 3 })).toMatchObject({ status: 'clarify', classification: 'unknown' });
  });

  it('persists a generic clarification without raw text but keeps a bounded ephemeral presentation echo', () => {
    const text = '穿过时空门前往火星';
    const result = parse(text);
    expect(result.status).toBe('clarify');
    if (result.status !== 'clarify') throw new Error('EXPECTED_CLARIFICATION');
    expect(result.decision.question).not.toContain(text);
    expect(result.presentationQuestion).toContain(text);
    expect(JSON.stringify(result.decision)).not.toContain(text);
  });

  it('returns missing slots for an incomplete candidate action without constructing intent', () => {
    expect(parse('拾取')).toMatchObject({
      status: 'clarify', classification: 'missing', decision: { missingSlots: ['itemId'], candidates: [] },
    });
    expect(parse('与交战')).toMatchObject({
      status: 'clarify', classification: 'missing', decision: { missingSlots: ['targetId'], candidates: [] },
    });
  });

  it('asks the player to disambiguate visible duplicate labels without selecting one implicitly', () => {
    const duplicates = { ...visible, combatTargets: [
      { id: 'npc_a', label: '守门人', disambiguator: '东侧' },
      { id: 'npc_b', label: '守门人', disambiguator: '西侧' },
    ] };
    const templates = [{ id: 'combat', kind: 'combat', prefix: '与', suffix: '交战', entitySource: 'combatTargets' }] as const;
    const result = parse('与守门人交战', { visible: duplicates, candidateTemplates: templates });
    expect(result).toMatchObject({ status: 'clarify', classification: 'ambiguous', decision: { candidates: [
      { kind: 'combat', slots: { targetId: 'npc_a' } }, { kind: 'combat', slots: { targetId: 'npc_b' } },
    ] } });
  });

  it('rejects candidate templates that bind an action kind to a different source', () => {
    const invalid = [{ id: 'hidden-combat', kind: 'combat', prefix: '与', suffix: '交战', entitySource: 'npcPresence' }] as never;
    expect(() => parse('与岑九交战', { candidateTemplates: invalid })).toThrow('P2_CANDIDATE_TEMPLATE_INVALID');
  });
});
