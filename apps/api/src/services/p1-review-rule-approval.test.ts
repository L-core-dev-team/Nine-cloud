import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';

describe('P1 review rule approval pin', () => {
  it('matches the normalized review plugin source exactly', () => {
    const source = readFileSync(new URL('./p1-prologue-plugin.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const digest = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
    expect(digest).toBe(P1_REVIEW_RULE_APPROVAL.pluginSourceSha256);
  });

  it('matches the exact current 39-file candidate bundle digest', () => {
    const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    const result = spawnSync(process.execPath, ['scripts/p1-rule-candidate-digest.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const manifest = JSON.parse(result.stdout) as { sha256?: unknown };
    expect(manifest.sha256).toBe(P1_REVIEW_RULE_APPROVAL.bundleSha256.replace(/^sha256:/, ''));
  });
});
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
