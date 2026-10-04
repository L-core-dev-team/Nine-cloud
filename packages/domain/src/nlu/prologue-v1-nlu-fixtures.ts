import type { ActionTemplate } from './action-parser.js';

/**
 * Deterministic lexical templates for the accepted P1 prologue corpus.
 * Targets are never embedded here; callers provide the current visible catalog.
 */
export const PROLOGUE_V1_ACTION_TEMPLATES: readonly ActionTemplate[] = [
  { id: 'move-go', kind: 'move', prefix: '去', entitySource: 'knownLocations' },
  { id: 'move-walk-to', kind: 'move', prefix: '走到', entitySource: 'knownLocations' },
  { id: 'observe-target', kind: 'observe', prefix: '观察', entitySource: 'observationTargets', fixedPayload: { method: 'scan' }, labelPrefix: '观察' },
  { id: 'observe-unspecified-target', kind: 'observe', prefix: '我看看', entitySource: 'observationTargets', fixedPayload: { method: 'scan' }, labelPrefix: '观察' },
  { id: 'study-target', kind: 'observe', prefix: '细察', entitySource: 'observationTargets', fixedPayload: { method: 'study' }, labelPrefix: '细察' },
  { id: 'talk-to', kind: 'talk', prefix: '对', entitySource: 'npcPresence', capture: { separator: '说：', slot: 'utterance' } },
  { id: 'use-owned-item', kind: 'use_item', prefix: '使用', entitySource: 'inventory' },
];

/**
 * Author-endorsed parser acceptance samples. Rule-layer expectations for
 * NLU-10/13 are tested separately because an unknown visible target must not
 * be forged into an ActionIntent by the parser.
 */
export const PROLOGUE_V1_NLU_CORPUS = [
  { id: 'NLU-01', text: '去望气台', status: 'ready', kind: 'move', payload: { destinationId: 'loc_wangqitai' } },
  { id: 'NLU-02', text: '走到望气台', status: 'ready', kind: 'move', payload: { destinationId: 'loc_wangqitai' } },
  { id: 'NLU-03', text: '去', status: 'missing', missingSlots: ['destinationId'] },
  { id: 'NLU-04', text: '我看看', status: 'missing', missingSlots: ['targetId'] },
  { id: 'NLU-05', text: '找岑九', status: 'unknown' },
  { id: 'NLU-06', text: '不要去望气台', status: 'unknown' },
  { id: 'NLU-07', text: '如果天没黑就去望气台', status: 'unknown' },
  { id: 'NLU-08', text: '去那边', status: 'unknown' },
  { id: 'NLU-09', text: '找老李', status: 'unknown' },
  { id: 'NLU-10', text: '去洪荒妖林核心', status: 'unknown', ruleReject: { kind: 'move', payload: { destinationId: 'loc_honghuang_yaolin_core' } } },
  { id: 'NLU-11', text: '对岑九说：不要去望气台', status: 'ready', kind: 'talk', payload: { npcId: 'npc_cenjiu', utterance: '不要去望气台' } },
  { id: 'NLU-12', text: '细察渡船', status: 'ready', kind: 'observe', payload: { targetId: 'obj_ferry', method: 'study' } },
  { id: 'NLU-13', text: '使用旧驿符', status: 'unknown', ruleReject: { kind: 'use_item', payload: { itemId: 'item_jiuyifu' } } },
  { id: 'NLU-14', text: '去望气台', status: 'ready', kind: 'move', payload: { destinationId: 'loc_wangqitai' }, clarifies: 'NLU-03' },
] as const;

export const PROLOGUE_V1_NLU_VISIBLE_CATALOG = {
  knownLocations: [
    { id: 'loc_luhuadu', label: '芦花渡' },
    { id: 'loc_wangqitai', label: '望气台' },
  ],
  npcPresence: [{ id: 'npc_cenjiu', label: '岑九' }],
  observationTargets: [{ id: 'obj_ferry', label: '渡船' }],
  clues: [],
  inventory: [{ id: 'item_bishuifu', label: '避水符' }],
} as const;
