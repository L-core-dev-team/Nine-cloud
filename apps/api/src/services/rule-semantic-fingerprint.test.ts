import { describe, expect, it } from 'vitest';
import { P1_RULE_SEMANTIC_INPUTS } from './p1-prologue-plugin.js';
import { createP1RuleSemanticDependencies } from './p1-rule-semantic-functions.js';
import {
  canonicalRuleSemanticJson,
  computeRuleSemanticDigest,
} from './rule-semantic-fingerprint.js';
import { normalizeRuleSemanticSource } from '../../../../scripts/p1-rule-semantic-source-digest.mjs';

const implementationFingerprint = `sha256:${'7'.repeat(64)}`;
const base = createP1RuleSemanticDependencies({ ...P1_RULE_SEMANTIC_INPUTS, implementationFingerprint });

const mechanicsFields = [
  'GAME_MINUTES_PER_KEC', 'DAY_KEC_COUNT', 'SAVE_START_GAME_MINUTE', 'DUSK_START_KEC',
  'STAMINA_MAX', 'SPIRIT_MAX', 'CULTIVATION_MAX', 'CULTIVATION_PER_KE', 'CULTIVATION_FATIGUE',
  'FATIGUE_THRESHOLD', 'SLOT_MAX', 'MOVE_COST', 'MOVE_BLOCKED_COST', 'MOVE_BYPASS_COST',
  'OBSERVE_SCAN_COST', 'OBSERVE_STUDY_COST', 'CULTIVATE_COST_PER_KE', 'COMBAT_COST',
  'CLEAR_THRESHOLD', 'RETREAT_SPIRIT',
] as const;

function rulebookLeafPaths(value: unknown, path: readonly (string | number)[] = []): (readonly (string | number)[])[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [path];
    return value.flatMap((item, index) => rulebookLeafPaths(item, [...path, index]));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return [path];
    return entries.flatMap(([key, item]) => rulebookLeafPaths(item, [...path, key]));
  }
  return [path];
}

function changeAtPath(root: unknown, path: readonly (string | number)[]): void {
  if (path.length === 0) throw new Error('Unexpected empty mutation path');
  let parent = root as Record<string | number, unknown> | unknown[];
  for (const segment of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[segment]! as Record<string | number, unknown> | unknown[];
  const key = path[path.length - 1]!;
  const prior = (parent as Record<string | number, unknown>)[key];
  if (Array.isArray(prior) && prior.length === 0) prior.push('__semantic_change__');
  else if (prior !== null && typeof prior === 'object' && Object.keys(prior).length === 0) {
    Object.assign(prior, { semanticChange: true });
  } else if (typeof prior === 'string') (parent as Record<string | number, unknown>)[key] = `${prior}__semantic_change__`;
  else if (typeof prior === 'number') (parent as Record<string | number, unknown>)[key] = prior + 1;
  else if (typeof prior === 'boolean') (parent as Record<string | number, unknown>)[key] = !prior;
  else (parent as Record<string | number, unknown>)[key] = { semanticChange: true };
}

describe('P1 semantic data fingerprint', () => {
  it.each(rulebookLeafPaths(base.rulebook).map(path => [path.join('.'), path] as const))(
    'changes when Rulebook field %s changes', (_label, path) => {
      const changed = structuredClone(base);
      changeAtPath(changed.rulebook, path);
      expect(computeRuleSemanticDigest(changed)).not.toBe(computeRuleSemanticDigest(base));
    },
  );

  it.each(mechanicsFields)('changes when mechanics field %s changes by itself', field => {
    const changed = structuredClone(base);
    const values = changed.mechanics as Record<string, number>;
    values[field] = values[field]! + 1;
    expect(computeRuleSemanticDigest(changed)).not.toBe(computeRuleSemanticDigest(base));
  });

  it('does not hash player-facing rule-message values', () => {
    const changed = { ...base, messages: { INPUT_UNKNOWN_ACTION: '不同文案' } };
    expect(computeRuleSemanticDigest(changed)).toBe(computeRuleSemanticDigest(base));
  });

  it('hashes external limits, parser templates, visible labels, memory artifacts and implementation identity', () => {
    const mutations: ((value: typeof base) => void)[] = [
      value => { (value.externalRuleConstants as Record<string, number>).maxCultivationKesPerAction += 1; },
      value => { (value.externalRuleConstants as Record<string, number>).locationLimit += 1; },
      value => { (value.actionTemplates as unknown[])[0] = { changed: true }; },
      value => { (value.visibleTargetLabels as unknown[])[0] = { id: 'changed', label: 'changed' }; },
      value => { (value.memoryPolicyArtifacts as Record<string, unknown>).continue = { changed: true }; },
      value => { value.implementationFingerprint = `sha256:${'8'.repeat(64)}`; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(base);
      mutate(changed);
      expect(computeRuleSemanticDigest(changed)).not.toBe(computeRuleSemanticDigest(base));
    }
  });

  it('canonicalizes nested object key order while preserving array order', () => {
    expect(canonicalRuleSemanticJson({ z: 1, a: { y: 2, b: [3, 4] } }))
      .toBe(canonicalRuleSemanticJson({ a: { b: [3, 4], y: 2 }, z: 1 }));
    expect(canonicalRuleSemanticJson([1, 2])).not.toBe(canonicalRuleSemanticJson([2, 1]));
    const changed = structuredClone(base);
    changed.actionTemplates = [...changed.actionTemplates].reverse();
    expect(computeRuleSemanticDigest(changed)).not.toBe(computeRuleSemanticDigest(base));
  });

  it('rejects unsupported values instead of hashing ambiguous JSON', () => {
    expect(() => canonicalRuleSemanticJson({ value: undefined })).toThrow('RULE_SEMANTIC_NON_JSON_VALUE');
    expect(() => canonicalRuleSemanticJson({ value: Number.NaN })).toThrow('RULE_SEMANTIC_NON_JSON_NUMBER');
  });
});

describe('TypeScript source semantic normalization', () => {
  it('ignores comments, formatting and erased type annotations', () => {
    const left = normalizeRuleSemanticSource('export const decide = (value: number): number => { // note\n  return value + 1;\n};', 'example.ts');
    const right = normalizeRuleSemanticSource('/* different */ export const decide=(value: string): string=>{return value+1}', 'example.ts');
    expect(left).toBe(right);
  });

  it('keeps decision-logic changes in the source fingerprint', () => {
    const plus = normalizeRuleSemanticSource('export const decide = (value: number) => value + 1;', 'example.ts');
    const minus = normalizeRuleSemanticSource('export const decide = (value: number) => value - 1;', 'example.ts');
    expect(plus).not.toBe(minus);
  });

  it('ignores the presentation text passed through clarification-only outputs', () => {
    const path = 'packages/domain/src/nlu/action-parser.ts';
    const first = normalizeRuleSemanticSource(`function unknownQuestion(){return 'old'}\nfunction parse(){return clarify('unknown', id, 'old question', [], [], 'old display')}`, path);
    const second = normalizeRuleSemanticSource(`function unknownQuestion(){return 'new'}\nfunction parse(){return clarify('unknown', id, 'new question', [], [], 'new display')}`, path);
    expect(first).toBe(second);
  });

  it('ignores rule rejection-code labels but keeps the rejecting condition', () => {
    const path = 'packages/domain/src/prologue-v1-rules.ts';
    const first = normalizeRuleSemanticSource("function decide(ready: boolean) { if (!ready) return reject('INPUT_NO_SUCH_TARGET'); }", path);
    const relabeled = normalizeRuleSemanticSource("function decide(ready: boolean) { if (!ready) return reject('INPUT_TARGET_UNKNOWN'); }", path);
    const changedCondition = normalizeRuleSemanticSource("function decide(ready: boolean) { if (ready) return reject('INPUT_NO_SUCH_TARGET'); }", path);
    expect(first).toBe(relabeled);
    expect(first).not.toBe(changedCondition);
  });

  it('includes candidate-rule wiring but excludes deterministic narrative fallback copy', () => {
    const path = 'apps/api/src/services/p1-prologue-plugin.ts';
    const first = normalizeRuleSemanticSource(`function run() { return 1; }\nconst plugin = { rules, narrativeFallback: () => 'old copy' };`, path);
    const relabeled = normalizeRuleSemanticSource(`function run() { return 2; }\nconst plugin = { rules, narrativeFallback: () => 'new copy' };`, path);
    const displayOnly = normalizeRuleSemanticSource(`function run() { return 1; }\nconst plugin = { rules, narrativeFallback: () => 'new copy' };`, path);
    expect(first).not.toBe(relabeled);
    expect(first).toBe(displayOnly);
  });

  it('excludes messages and validation wording while retaining the rule expressions', () => {
    const rulesPath = 'packages/domain/src/prologue-v1-rules.ts';
    const firstRule = normalizeRuleSemanticSource("const text = messages.INPUT_UNKNOWN_ACTION ?? 'old'; if (facts.stamina === 0) reject('ENV_STAMINA_EMPTY');", rulesPath);
    const relabeledRule = normalizeRuleSemanticSource("const text = messages.INPUT_UNKNOWN_ACTION ?? 'new'; if (facts.stamina === 0) reject('ENV_STAMINA_EMPTY');", rulesPath);
    expect(firstRule).toBe(relabeledRule);

    const contractsPath = 'packages/contracts/src/decision.ts';
    const firstContract = normalizeRuleSemanticSource("const field = z.string().refine(check, { message: 'old wording' });", contractsPath);
    const relabeledContract = normalizeRuleSemanticSource("const field = z.string().refine(check, { message: 'new wording' });", contractsPath);
    const changedContract = normalizeRuleSemanticSource("const field = z.string().max(10).refine(check, { message: 'new wording' });", contractsPath);
    expect(firstContract).toBe(relabeledContract);
    expect(firstContract).not.toBe(changedContract);
  });

  it('excludes Save envelope version compatibility schemas but retains memory-policy schemas', () => {
    const path = 'packages/contracts/src/save.ts';
    const v2 = normalizeRuleSemanticSource("export const SAVE_SCHEMA_VERSION = 2; export const SaveEnvelopeV2Schema = z.literal(2); export const SaveMemoryPolicySchema = z.literal(1);", path);
    const v3 = normalizeRuleSemanticSource("export const SAVE_SCHEMA_VERSION = 3; export const SaveEnvelopeV3Schema = z.literal(3); export const SaveMemoryPolicySchema = z.literal(1);", path);
    const changedPolicy = normalizeRuleSemanticSource("export const SAVE_SCHEMA_VERSION = 3; export const SaveEnvelopeV3Schema = z.literal(3); export const SaveMemoryPolicySchema = z.literal(2);", path);
    expect(v2).toBe(v3);
    expect(v3).not.toBe(changedPolicy);
  });

  it('normalizes Save envelope compatibility guards but retains NPC memory-policy decisions', () => {
    const path = 'apps/api/src/services/p1-prologue-plugin.ts';
    const v2 = normalizeRuleSemanticSource(`
      function decide(save) {
        if (save.schemaVersion !== 2) throw new Error('P1_MEMORY_POLICY_MISMATCH');
        return save.memoryMode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
      }
      function policyForNpc(npcId, save) {
        if (!save || (save.schemaVersion !== 2)) throw new Error('P1_MEMORY_POLICY_MISMATCH');
        return save.memoryMode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
      }
    `, path);
    const v2AndV3 = normalizeRuleSemanticSource(`
      function decide(save) {
        if (save.schemaVersion !== 2 && save.schemaVersion !== 3) throw new Error('P1_MEMORY_POLICY_MISMATCH');
        return save.memoryMode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
      }
      function policyForNpc(npcId, save) {
        if (!save || (save.schemaVersion !== 2 && save.schemaVersion !== 3)) throw new Error('P1_MEMORY_POLICY_MISMATCH');
        return save.memoryMode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
      }
    `, path);
    const changedPolicyDecision = normalizeRuleSemanticSource(`
      function decide(save) {
        if (save.schemaVersion !== 2 && save.schemaVersion !== 3) throw new Error('P1_MEMORY_POLICY_MISMATCH');
        return save.memoryMode === 'continue' ? 'forgetting-v1' : 'continue-v1';
      }
      function policyForNpc(npcId, save) {
        if (!save || (save.schemaVersion !== 2 && save.schemaVersion !== 3)) throw new Error('P1_MEMORY_POLICY_MISMATCH');
        return save.memoryMode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
      }
    `, path);
    expect(v2AndV3).toBe(v2);
    expect(changedPolicyDecision).not.toBe(v2AndV3);
  });
});
