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
 *
 * This branch additionally exports `./memory/recall-authorized.js` from
 * `packages/domain/src/index.ts` (the P4 authorised-recall surface), so its
 * bundle digest differs from main's even though the reviewed P1 rule sources
 * are byte-identical. The plugin-source pin below is therefore the
 * cross-branch invariant to compare; the bundle digest is branch-local.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:dbde08ec5dbabfa1b740cd121995be0c6376276a783a054e00908951376ad6b3',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
