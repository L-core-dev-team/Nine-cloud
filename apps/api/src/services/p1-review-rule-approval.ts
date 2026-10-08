/**
 * Exact author-approved candidate identity for non-production P1 verification only.
 *
 * `bundleSha256` binds the candidate bundle produced by
 * `scripts/p1-rule-candidate-digest.mjs`, which includes `pnpm-lock.yaml`.
 * The lockfile changes legitimately through Dependabot and dependency merges,
 * so this digest must be recomputed whenever the lockfile moves — it does NOT
 * mean the author-approved rules changed. Verify with:
 *
 *   node scripts/p1-rule-candidate-digest.mjs
 *
 * When only the lockfile moved, `pluginSourceSha256` below stays identical,
 * which is the signal that the reviewed rule text itself is untouched.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:8490fde4efb019e1cc70352046cee51690ce2d836ebef34d886e50bcb3f4a62c',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
