/**
 * Host-installed approval that lets the preview-1 API load the frozen P1 rules.
 *
 * Two formats are accepted:
 *
 * - `legacy-dual` (scope `jiuxiao-preview-1-20261014`): the original file signed by
 *   LYL and the Bird review agent. Kept unchanged so the file already installed on
 *   the host keeps working until the pinned semantic digest moves.
 * - `owner-v2` (`format: jiuxiao-preview-rule-approval-v2`): dual sign-off was retired
 *   on 2026-11-07 and not restored on 2026-11-26 (ADR 0010). The file cites the owner's
 *   real, standing authorization record and names who issued the file. It never claims
 *   a co-signature that did not happen.
 *
 * Both formats bind the exact semantic digest, plugin bytes and expiry; the loader
 * still recomputes the semantic digest from source and fails closed on mismatch.
 */
export const LEGACY_PREVIEW_APPROVAL_SCOPE = 'jiuxiao-preview-1-20261014';
export const PREVIEW_APPROVAL_V2_FORMAT = 'jiuxiao-preview-rule-approval-v2';
export const PREVIEW_APPROVAL_V2_SCOPE = 'jiuxiao-preview-1';
export const PREVIEW_APPROVAL_OWNER = 'LYL';
/** Authorization records must be comments on this repository's issues or pull requests. */
const AUTHORIZATION_SOURCE = /^https:\/\/github\.com\/L-core-dev-team\/Nine-cloud\/(?:pull|issues)\/\d{1,7}#issuecomment-\d{1,15}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
/** A v2 approval must be renewed at least once a year. */
const MAX_V2_LIFETIME_MS = 400 * 24 * 60 * 60 * 1000;

export interface PinnedRuleIdentity {
  semanticSha256: string;
  ruleVersion: string;
  canonVersion: string;
  memoryPolicyVersion: string;
}

export type PreviewRuleApproval =
  | { kind: 'legacy-dual'; scope: string; semanticSha256: string; pluginSha256: string; expiresAt: string }
  | { kind: 'owner-v2'; scope: string; semanticSha256: string; pluginSha256: string; expiresAt: string;
      authorization: { owner: string; source: string; grantedAt: string }; issuedBy: string; issuedAt: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 512 && !/[\r\n\0]/.test(value);
const isoTime = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Returns the validated approval, or throws `PREVIEW_RULE_APPROVAL_INVALID` without saying which field failed. */
export function validatePreviewRuleApproval(value: unknown, pinned: PinnedRuleIdentity, now: number): PreviewRuleApproval {
  const fail = (): never => { throw new Error('PREVIEW_RULE_APPROVAL_INVALID'); };
  if (!isRecord(value)) return fail();
  const expires = isoTime(value.expiresAt) ?? (typeof value.expiresAt === 'string' ? Date.parse(value.expiresAt) : NaN);
  if (!(expires > now)) return fail();
  if (value.semanticSha256 !== pinned.semanticSha256 || typeof value.pluginSha256 !== 'string' || !SHA256.test(value.pluginSha256)) return fail();

  if (value.format === undefined && value.scope === LEGACY_PREVIEW_APPROVAL_SCOPE) {
    if (!Array.isArray(value.approvedBy) || !['LYL', 'Bird'].every(name => (value.approvedBy as unknown[]).includes(name))) return fail();
    if (!nonEmpty(value.authorizationSource)) return fail();
    return { kind: 'legacy-dual', scope: value.scope, semanticSha256: value.semanticSha256 as string, pluginSha256: value.pluginSha256, expiresAt: value.expiresAt as string };
  }

  if (value.format !== PREVIEW_APPROVAL_V2_FORMAT || value.scope !== PREVIEW_APPROVAL_V2_SCOPE) return fail();
  if (value.ruleVersion !== pinned.ruleVersion || value.canonVersion !== pinned.canonVersion || value.memoryPolicyVersion !== pinned.memoryPolicyVersion) return fail();
  // A v2 file has no co-signer list; carrying one would imply a sign-off that no longer exists.
  if ('approvedBy' in value) return fail();
  const authorization = value.authorization;
  if (!isRecord(authorization) || authorization.owner !== PREVIEW_APPROVAL_OWNER
    || typeof authorization.source !== 'string' || !AUTHORIZATION_SOURCE.test(authorization.source)) return fail();
  const granted = isoTime(authorization.grantedAt), issued = isoTime(value.issuedAt), v2Expires = isoTime(value.expiresAt);
  if (granted === null || issued === null || v2Expires === null || !nonEmpty(value.issuedBy)) return fail();
  if (granted > issued || issued > now + 5 * 60 * 1000 || v2Expires - issued > MAX_V2_LIFETIME_MS) return fail();
  return {
    kind: 'owner-v2', scope: value.scope, semanticSha256: value.semanticSha256 as string, pluginSha256: value.pluginSha256,
    expiresAt: value.expiresAt as string, issuedBy: value.issuedBy as string, issuedAt: value.issuedAt as string,
    authorization: { owner: authorization.owner, source: authorization.source, grantedAt: authorization.grantedAt as string },
  };
}
