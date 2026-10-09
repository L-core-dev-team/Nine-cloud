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
 * normalised plugin bytes, so the two digests together still fail closed on any
 * real edit to the reviewed gameplay sources.
 *
 * This merge additionally exports `./memory/recall-authorized.js` from
 * `packages/domain/src/index.ts` (the P4 authorised-recall surface), so the
 * bundle digest differs from the pre-merge value even though the reviewed P1
 * rule sources are byte-identical. The plugin-source pin below is therefore
 * the cross-branch invariant to compare; the bundle digest is tree-local.
 *
 * The semantic-source gate from the server-authoritative branch (PR #64) has
 * landed: `semanticSha256` below is the enforced identity and this digest
 * degrades to a byte diagnostic.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:468a26ad109c64c6cf2a7224b0e895fd7614241e15c5b468842295d91dcddbce',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  semanticSha256: 'sha256:bde3e25b591380614aabea49b9e6273a0cac3c39aa20994c3cf5e80baca21193',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
