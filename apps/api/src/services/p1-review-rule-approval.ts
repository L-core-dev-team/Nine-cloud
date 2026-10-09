/**
 * Semantic author approval for non-production P1 review.
 *
 * `semanticSha256` is the enforced identity: it binds the AST-normalised
 * runtime rule sources and is the only pin the loader fails closed on. The two
 * byte digests below are historical diagnostics — `turn-runtime` compares them
 * only to label drift, never to grant or deny a turn.
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
 * normalised plugin bytes, so the digests together still surface any real edit
 * to the reviewed gameplay sources.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:806bba97df8063d1f586053f5c9e238a0f5d0f7b30f81308c2b11dc4c893d0b8',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  semanticSha256: 'sha256:ce6453589d24027653d4f6673d608a74fa8b604486db0cf7a630e9f1be25304e',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
