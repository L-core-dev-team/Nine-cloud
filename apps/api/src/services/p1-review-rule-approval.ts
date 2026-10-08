/**
 * Exact author-approved candidate identity for non-production P1 verification only.
 *
 * `bundleSha256` binds the reviewed candidate bundle defined by
 * `scripts/p1-rule-candidate-bundle.files.json` and materialised by
 * `scripts/p1-rule-candidate-digest.mjs`:
 *
 *   node scripts/p1-rule-candidate-digest.mjs
 *
 * The bundle intentionally excludes `pnpm-lock.yaml`. The lockfile moves through
 * ordinary dependency maintenance (Dependabot, pnpm overrides, upstream merges)
 * and is already guarded by `pnpm install --frozen-lockfile` and the license
 * gate, so binding it here only forced a manual re-pin without protecting any
 * reviewed rule text — a dependency bump must never be able to masquerade as an
 * author-approved rule change. `pluginSourceSha256` below independently pins the
 * normalised plugin bytes, so the two digests together still fail closed on any
 * real edit to the reviewed gameplay sources.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:a8867bd61cde945a57cdc73d74bc781e97bba4ecb69699b84eff75a7d97d0753',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
