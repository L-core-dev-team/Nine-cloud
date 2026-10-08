import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';

/**
 * The bundle digest is defined by `scripts/p1-rule-candidate-digest.mjs`:
 * each listed file contributes `<relative path>\0<sha256 of its bytes>`, all
 * lines are joined by `\n`, prefixed with the format marker, and the whole
 * buffer is hashed. This test re-implements that definition in-process rather
 * than shelling out, so it cannot be defeated by a machine that refuses to
 * spawn a child process (`spawnSync ... EBUSY` on some Windows setups). The
 * script itself remains the single source of truth for the file list; the
 * assertion below pins the list length so a silent edit still fails.
 */
const BUNDLE_FILE_COUNT = 39;

describe('P1 review rule approval pin', () => {
  it('matches the normalized review plugin source exactly', () => {
    const source = readFileSync(new URL('./p1-prologue-plugin.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const digest = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
    expect(digest).toBe(P1_REVIEW_RULE_APPROVAL.pluginSourceSha256);
  });

  it('matches the exact current 39-file candidate bundle digest', () => {
    const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    const scriptPath = resolve(repositoryRoot, 'scripts/p1-rule-candidate-digest.mjs');
    const scriptText = readFileSync(scriptPath, 'utf8');

    // Recover the authoritative file list and format marker from the script so
    // this test cannot drift from the real definition.
    const format = /const format = '([^']+)'/.exec(scriptText)?.[1];
    const block = /const files = \[([\s\S]*?)\]\.sort\(\);/.exec(scriptText)?.[1];
    if (!format || !block) throw new Error('could not parse the bundle definition from the digest script');
    const files = [...block.matchAll(/'([^']+)'/gu)].map(match => match[1]).sort();

    expect(files).toHaveLength(BUNDLE_FILE_COUNT);
    const manifest = files.map(path => ({
      path,
      sha256: createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex'),
    }));
    const digestInput = `${format}\n${manifest.map(({ path, sha256 }) => `${path}\0${sha256}`).join('\n')}\n`;
    const sha256 = createHash('sha256').update(digestInput, 'utf8').digest('hex');

    expect(sha256).toBe(P1_REVIEW_RULE_APPROVAL.bundleSha256.replace(/^sha256:/, ''));
  });
});
