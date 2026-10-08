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
 *
 * TODO(P2/#64): once the semantic-source gate from the server-authoritative
 * branch lands, `semanticSha256` becomes the enforced identity and this digest
 * degrades to a byte diagnostic, so lockfile drift stops requiring a manual
 * recompute. Until then every dependency merge on this branch rebinds it.
 */
export const P1_REVIEW_RULE_APPROVAL = Object.freeze({
  scope: 'p1-review-candidate-v1',
  bundleSha256: 'sha256:5c83233988f9736fec69699032431f76b90bf8b211bcb4852adf33c9abefc429',
  pluginSourceSha256: 'sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735',
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  actionRulesVersion: 'p1-actions-a4b8fbf7e6120840',
  combatRulesVersion: 'p1-combat-a4b8fbf7e6120840',
  memoryPolicyVersion: 'p1-memory-policy-v1',
} as const);

export type P1ReviewRuleApproval = typeof P1_REVIEW_RULE_APPROVAL;
