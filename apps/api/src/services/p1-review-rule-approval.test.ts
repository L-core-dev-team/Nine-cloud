import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';
import { evaluateP1ReviewSemanticGate } from './p1-review-semantic-gate.js';
import { loadTurnPlugin } from './turn-runtime.js';
import p1ProloguePlugin, { P1_RULE_SEMANTIC_INPUTS } from './p1-prologue-plugin.js';

describe('P1 semantic review approval gate', () => {
  it('keeps the reviewed bundle independent of the lockfile and drift-labelled as a byte diagnostic', () => {
    const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    const manifestPath = resolve(repositoryRoot, 'scripts/p1-rule-candidate-bundle.files.json');
    const definition = JSON.parse(readFileSync(manifestPath, 'utf8')) as { format: string; files: string[] };

    // Dependency maintenance must not be able to move a reviewed-rule identity.
    expect(definition.files).not.toContain('pnpm-lock.yaml');

    const manifest = [...definition.files].sort().map(path => ({
      path,
      sha256: createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex'),
    }));
    const digestInput = `${definition.format}\n${manifest.map(({ path, sha256 }) => `${path}\0${sha256}`).join('\n')}\n`;
    const bundleSha256 = `sha256:${createHash('sha256').update(digestInput, 'utf8').digest('hex')}`;
    expect(bundleSha256).toBe(P1_REVIEW_RULE_APPROVAL.bundleSha256);

    // semanticSha256 is the enforced pin; the byte diagnostics are only compared
    // to label drift, so a changed plugin source must not silently match them.
    const pluginSource = readFileSync(new URL('./p1-prologue-plugin.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const pluginBytes = `sha256:${createHash('sha256').update(pluginSource, 'utf8').digest('hex')}`;
    expect(pluginBytes).not.toBe(P1_REVIEW_RULE_APPROVAL.pluginSourceSha256);
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
