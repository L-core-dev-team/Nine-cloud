import { describe, expect, it } from 'vitest';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';
import { LEGACY_PREVIEW_APPROVAL_SCOPE, PREVIEW_APPROVAL_V2_FORMAT, PREVIEW_APPROVAL_V2_SCOPE, validatePreviewRuleApproval } from './preview-rule-approval.js';

const now = Date.parse('2026-11-27T00:00:00Z');
const plugin = `sha256:${'a'.repeat(64)}`;
const legacy = () => ({
  scope: LEGACY_PREVIEW_APPROVAL_SCOPE, approvedBy: ['LYL', 'Bird'], authorizationSource: 'host record',
  expiresAt: '2027-01-01T00:00:00Z', semanticSha256: P1_REVIEW_RULE_APPROVAL.semanticSha256, pluginSha256: plugin,
});
const v2 = (): Record<string, unknown> => ({
  format: PREVIEW_APPROVAL_V2_FORMAT, scope: PREVIEW_APPROVAL_V2_SCOPE,
  ruleVersion: P1_REVIEW_RULE_APPROVAL.ruleVersion, canonVersion: P1_REVIEW_RULE_APPROVAL.canonVersion,
  memoryPolicyVersion: P1_REVIEW_RULE_APPROVAL.memoryPolicyVersion,
  semanticSha256: P1_REVIEW_RULE_APPROVAL.semanticSha256, pluginSha256: plugin,
  authorization: { owner: 'LYL', source: 'https://github.com/L-core-dev-team/Nine-cloud/pull/124#issuecomment-7196351027', grantedAt: '2026-11-26T15:29:55Z' },
  issuedBy: 'JX-VISION-02 execution session', issuedAt: '2026-11-26T20:00:00Z', expiresAt: '2027-05-26T00:00:00Z',
});
const check = (value: unknown) => validatePreviewRuleApproval(value, P1_REVIEW_RULE_APPROVAL, now);

describe('preview-1 rule approval', () => {
  it('keeps accepting the installed dual-signed legacy file', () => {
    expect(check(legacy())).toMatchObject({ kind: 'legacy-dual', scope: LEGACY_PREVIEW_APPROVAL_SCOPE });
  });

  it('legacy file still needs both historical signers and an authorization source', () => {
    expect(() => check({ ...legacy(), approvedBy: ['LYL'] })).toThrow('PREVIEW_RULE_APPROVAL_INVALID');
    expect(() => check({ ...legacy(), authorizationSource: ' ' })).toThrow('PREVIEW_RULE_APPROVAL_INVALID');
  });

  it('accepts an owner-authorized v2 file that cites a real repository comment', () => {
    expect(check(v2())).toMatchObject({ kind: 'owner-v2', authorization: { owner: 'LYL' } });
  });

  it('v2 rejects a co-signer list, a foreign authorization source, or another owner', () => {
    expect(() => check({ ...v2(), approvedBy: ['LYL', 'Bird'] })).toThrow('PREVIEW_RULE_APPROVAL_INVALID');
    expect(() => check({ ...v2(), authorization: { ...(v2().authorization as object), source: 'https://example.com/approval' } })).toThrow();
    expect(() => check({ ...v2(), authorization: { ...(v2().authorization as object), source: 'https://github.com/someone/fork/pull/1#issuecomment-1' } })).toThrow();
    expect(() => check({ ...v2(), authorization: { ...(v2().authorization as object), owner: 'Bird' } })).toThrow();
    expect(() => check({ ...v2(), issuedBy: '' })).toThrow();
  });

  it('both formats bind the pinned semantic digest, plugin hash shape and expiry', () => {
    for (const make of [legacy, v2] as Array<() => Record<string, unknown>>) {
      expect(() => check({ ...make(), semanticSha256: `sha256:${'0'.repeat(64)}` })).toThrow();
      expect(() => check({ ...make(), pluginSha256: 'not-a-hash' })).toThrow();
      expect(() => check({ ...make(), expiresAt: '2026-11-26T00:00:00Z' })).toThrow();
    }
  });

  it('v2 binds rule identity and bounds its own lifetime', () => {
    expect(() => check({ ...v2(), ruleVersion: 'prologue-v1.1' })).toThrow();
    expect(() => check({ ...v2(), memoryPolicyVersion: 'other' })).toThrow();
    expect(() => check({ ...v2(), expiresAt: '2028-06-01T00:00:00Z' })).toThrow();
    expect(() => check({ ...v2(), issuedAt: '2026-11-25T00:00:00Z' })).toThrow();
    expect(() => check({ ...v2(), issuedAt: '2026-12-31T00:00:00Z' })).toThrow();
    expect(() => check({ ...v2(), scope: LEGACY_PREVIEW_APPROVAL_SCOPE })).toThrow();
  });

  it('rejects non-objects', () => {
    for (const value of [null, [], 'approval', 1]) expect(() => check(value)).toThrow('PREVIEW_RULE_APPROVAL_INVALID');
  });
});
