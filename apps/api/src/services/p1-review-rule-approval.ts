/** Semantic author approval for non-production P1 review; byte pins remain historical diagnostics. */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:a4b8fbf7e612084007112ed3fac52d711deb461f652788a71fd791ce05ebc0e2',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  semanticSha256: 'sha256:ce6453589d24027653d4f6673d608a74fa8b604486db0cf7a630e9f1be25304e',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
