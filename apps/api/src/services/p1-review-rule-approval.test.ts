import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';

/**
 * The bundle digest is defined by the shared manifest
 * `scripts/p1-rule-candidate-bundle.files.json`: each listed file contributes
 * `<relative path>\0<sha256 of its bytes>`, all lines are joined by `\n`,
 * prefixed with the format marker, and the whole buffer is hashed. This test
 * re-implements that definition in-process rather than shelling out, so it
 * cannot be defeated by a machine that refuses to spawn a child process
 * (`spawnSync ... EBUSY` on some Windows setups). The manifest is the single
 * source of truth, and the assertion below pins the list length so a silent
 * addition or removal still fails.
 */
const BUNDLE_FILE_COUNT = 38;

describe('P1 review rule approval pin', () => {
  it('matches the normalized review plugin source exactly', () => {
    const source = readFileSync(new URL('./p1-prologue-plugin.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const digest = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
    expect(digest).toBe(P1_REVIEW_RULE_APPROVAL.pluginSourceSha256);
  });

  it('matches the exact current candidate bundle digest', () => {
    const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    const manifestPath = resolve(repositoryRoot, 'scripts/p1-rule-candidate-bundle.files.json');
    const definition = JSON.parse(readFileSync(manifestPath, 'utf8')) as { format: string; files: string[] };

    // The reviewed set must stay dependency-independent: a lockfile bump is not
    // an author ruling, so it must not be able to move this digest.
    expect(definition.files).not.toContain('pnpm-lock.yaml');
    expect(definition.files).toHaveLength(BUNDLE_FILE_COUNT);

    const files = [...definition.files].sort();
    const manifest = files.map(path => ({
      path,
      sha256: createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex'),
    }));
    const digestInput = `${definition.format}\n${manifest.map(({ path, sha256 }) => `${path}\0${sha256}`).join('\n')}\n`;
    const sha256 = createHash('sha256').update(digestInput, 'utf8').digest('hex');

    expect(sha256).toBe(P1_REVIEW_RULE_APPROVAL.bundleSha256.replace(/^sha256:/, ''));
  });
});
