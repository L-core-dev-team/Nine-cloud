/** Author inputs, not bundled gameplay constants. Null means settlement must stay closed. */
export type ActionRulesVersion = string & { readonly actionRulesVersion: unique symbol };
export type CombatRulesVersion = string & { readonly combatRulesVersion: unique symbol };
export type AuthorRulesGate = {
  ActionRulesVersion: ActionRulesVersion | null;
  CombatRulesVersion: CombatRulesVersion | null;
  status: 'BLOCKED_BY_OWNER';
  requiredActions: readonly ['move', 'cultivate', 'item', 'talk', 'combat', 'quest'];
  requiredEvidence: readonly string[];
};
export const AUTHOR_RULES_GATE: AuthorRulesGate = {
  ActionRulesVersion: null, CombatRulesVersion: null, status: 'BLOCKED_BY_OWNER',
  requiredActions: ['move', 'cultivate', 'item', 'talk', 'combat', 'quest'],
  requiredEvidence: ['versioned-preconditions-costs-deltas-failures-boundaries-counterexamples', 'author-approval-on-exact-rules-digest'],
};
