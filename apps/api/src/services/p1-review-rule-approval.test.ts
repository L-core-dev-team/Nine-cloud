import { describe, expect, it, vi } from 'vitest';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';
import { evaluateP1ReviewSemanticGate } from './p1-review-semantic-gate.js';
import { loadTurnPlugin } from './turn-runtime.js';
import { fileURLToPath } from 'node:url';
import p1ProloguePlugin, { P1_RULE_SEMANTIC_INPUTS } from './p1-prologue-plugin.js';

describe('P1 semantic review approval gate', () => {
  it('preserves the two historical byte pins exactly', () => {
    expect(P1_REVIEW_RULE_APPROVAL.bundleSha256)
      .toBe('sha256:a4b8fbf7e612084007112ed3fac52d711deb461f652788a71fd791ce05ebc0e2');
    expect(P1_REVIEW_RULE_APPROVAL.pluginSourceSha256)
      .toBe('sha256:94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735');
  });

  it('accepts the co-signed semantic candidate when only historical byte pins drift', async () => {
    const path = fileURLToPath(new URL('./p1-prologue-plugin.js', import.meta.url));
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const plugin = await loadTurnPlugin(path);
      expect(plugin).toBeDefined();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('P1_REVIEW_RULE_BYTE_DRIFT_SEMANTICS_MATCH'));
    } finally {
      log.mockRestore();
    }
  });

  it('fails closed with a semantic-specific diagnostic when the semantic digest changes', () => {
    const result = evaluateP1ReviewSemanticGate(
      `sha256:${'0'.repeat(64)}`,
      `sha256:${'1'.repeat(64)}`,
      { bundleMatches: false, pluginSourceMatches: false },
    );
    expect(result.status).toBe('semantic_mismatch');
    if (result.status === 'semantic_mismatch') {
      expect(result.error).toContain('P1_REVIEW_RULE_SEMANTIC_MISMATCH');
      expect(result.error).toContain('expected=sha256:');
      expect(result.error).toContain('actual=sha256:');
    }
  });

  it('rejects a changed semantic payload through the real review-plugin loader', async () => {
    const path = fileURLToPath(new URL('./p1-prologue-plugin.js', import.meta.url));
    const changedInputs = {
      ...P1_RULE_SEMANTIC_INPUTS,
      rulebook: { ...P1_RULE_SEMANTIC_INPUTS.rulebook, ruleVersion: 'semantically-changed' },
    };
    await expect(loadTurnPlugin(path, async () => ({
      default: p1ProloguePlugin,
      P1_RULE_SEMANTIC_INPUTS: changedInputs,
    }))).rejects.toThrow(/P1_REVIEW_RULE_SEMANTIC_MISMATCH/);
  });

  it('distinguishes byte-only drift from semantic mismatch without blocking', () => {
    expect(evaluateP1ReviewSemanticGate(
      `sha256:${'1'.repeat(64)}`,
      `sha256:${'1'.repeat(64)}`,
      { bundleMatches: false, pluginSourceMatches: false },
    )).toEqual({ status: 'approved_with_byte_drift', diagnostic: 'P1_REVIEW_RULE_BYTE_DRIFT_SEMANTICS_MATCH' });
  });

  it('does not let an approval metadata edit substitute for the computed semantic pin', () => {
    expect(p1ProloguePlugin.reviewApproval?.semanticSha256).toBe(P1_REVIEW_RULE_APPROVAL.semanticSha256);
  });
});
