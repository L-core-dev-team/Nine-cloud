/** Author inputs, not bundled gameplay constants. Null means settlement must stay closed. */
export type ActionRulesVersion = string & { readonly actionRulesVersion: unique symbol };
export type CombatRulesVersion = string & { readonly combatRulesVersion: unique symbol };
export type AuthorRulesGate = {
  ActionRulesVersion: ActionRulesVersion | null;
  CombatRulesVersion: CombatRulesVersion | null;
  status: 'BLOCKED_BY_OWNER' | 'APPROVED_BY_OWNER';
  requiredActions: readonly ['move', 'cultivate', 'item', 'talk', 'combat', 'quest'];
  requiredEvidence: readonly string[];
};

/**
 * 门禁开启记录（LYL 与 Bird 于 2026-10-06 确认）
 *
 * 依据材料：
 * 1. Canon 34 条已签署，canon-runtime.json 的 receiptsComplete=true
 *    （node scripts/build-canon-runtime.mjs --check 通过）
 * 2. 规则簿候选的 combatTargets 九个字段均为作者签署值
 *    （packages/content/src/prologue/prologue-v1.rulebook-candidate.ts:111-122）
 * 3. 内容包 unresolvedRuleMappings 已清空
 *    （packages/content/src/prologue/prologue-v1.ts:170）
 * 4. 装配器存在且已被 API 引用
 *    （apps/api/src/services/p1-prologue-plugin.ts:30,38）
 *
 * 版本标识取自规则簿自身的 ruleVersion / canonVersion，
 * 不另造值，使门禁标识与被批准内容保持同一来源。
 */
export const AUTHOR_RULES_GATE: AuthorRulesGate = {
  ActionRulesVersion: 'prologue-v1-candidate-20261005' as ActionRulesVersion,
  CombatRulesVersion: 'prologue-v1-candidate-20261005' as CombatRulesVersion,
  status: 'APPROVED_BY_OWNER',
  requiredActions: ['move', 'cultivate', 'item', 'talk', 'combat', 'quest'],
  requiredEvidence: ['versioned-preconditions-costs-deltas-failures-boundaries-counterexamples', 'author-approval-on-exact-rules-digest'],
};
