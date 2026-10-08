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
 *
 * This branch additionally exports `./memory/recall-authorized.js` from
 * `packages/domain/src/index.ts` (the P4 authorised-recall surface), so its
 * bundle digest differs from main's even though the reviewed P1 rule sources
 * are byte-identical. The plugin-source pin below is therefore the
 * cross-branch invariant to compare; the bundle digest is branch-local.
 *
 * TODO(P2/#64): once the semantic-source gate from the server-authoritative
 * branch lands, `semanticSha256` becomes the enforced identity and this digest
 * degrades to a byte diagnostic.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:8aa1ca4c1fb3ebb7e7b3c6b4ca1d4445f4f16402612eec7a5aa80d27969d9f32',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
