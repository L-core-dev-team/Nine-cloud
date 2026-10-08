import { describe, expect, it } from 'vitest';
import {
  acceptableSpdxExpression,
  findUnreviewed,
  isReviewed,
  reviewedPackages,
} from './license-check.mjs';

describe('license-check policy', () => {
  it('accepts the permissive licences the workspace already relies on', () => {
    for (const license of ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'CC0-1.0', '0BSD']) {
      expect(acceptableSpdxExpression(license)).toBe(true);
    }
  });

  it('accepts an OR expression when at least one branch is permissive', () => {
    expect(acceptableSpdxExpression('MIT OR Apache-2.0')).toBe(true);
    expect(acceptableSpdxExpression('(MIT OR Apache-2.0)')).toBe(true);
    expect(acceptableSpdxExpression('Apache-2.0 OR GPL-3.0-or-later')).toBe(true);
  });

  it('rejects an AND expression because every branch would have to be permissive', () => {
    expect(acceptableSpdxExpression('Apache-2.0 AND LGPL-3.0-or-later')).toBe(false);
    expect(acceptableSpdxExpression('MIT AND GPL-3.0-only')).toBe(false);
  });

  it('rejects a bare copyleft licence that has not been individually reviewed', () => {
    expect(acceptableSpdxExpression('LGPL-3.0-or-later')).toBe(false);
    expect(acceptableSpdxExpression('GPL-3.0-only')).toBe(false);
    expect(acceptableSpdxExpression('AGPL-3.0-only')).toBe(false);
    expect(acceptableSpdxExpression('SSPL-1.0')).toBe(false);
  });

  it('rejects non-string and unknown licences', () => {
    expect(acceptableSpdxExpression(undefined)).toBe(false);
    expect(acceptableSpdxExpression(null)).toBe(false);
    expect(acceptableSpdxExpression('WTFPL')).toBe(false);
  });

  it('only excuses a reviewed package when the reported licence matches exactly', () => {
    expect(isReviewed('@img/sharp-win32-x64', 'Apache-2.0 AND LGPL-3.0-or-later')).toBe(true);
    // A silent licence CHANGE must fail the gate rather than inherit the older review.
    expect(isReviewed('@img/sharp-win32-x64', 'Apache-2.0 AND LGPL-4.0-or-later')).toBe(false);
    expect(isReviewed('@img/sharp-win32-x64', 'GPL-3.0-only')).toBe(false);
    // Unrelated packages never inherit an exemption.
    expect(isReviewed('some-other-package', 'LGPL-3.0-or-later')).toBe(false);
  });

  it('records review evidence for every exempted package', () => {
    for (const [name, entry] of reviewedPackages) {
      expect(entry.evidence, `${name} must cite evidence`).toBeTruthy();
      expect(entry.license, `${name} must record the exact licence`).toBeTruthy();
    }
  });

  it('flags an unreviewed copyleft dependency so the gate fails closed', () => {
    const groups = {
      MIT: [{ name: 'fine', versions: ['1.0.0'] }],
      'LGPL-3.0-or-later': [{ name: 'brand-new-lgpl-dep', versions: ['2.0.0'] }],
    };
    expect(findUnreviewed(groups)).toEqual(['brand-new-lgpl-dep@2.0.0 (LGPL-3.0-or-later)']);
  });

  it('passes the current reviewed set without flagging anything', () => {
    const groups = {
      'MIT OR Apache-2.0': [
        { name: '@cloudflare/kv-asset-handler', versions: ['0.5.0'] },
        { name: 'wrangler', versions: ['4.147.0'] },
      ],
      'Apache-2.0 AND LGPL-3.0-or-later': [{ name: '@img/sharp-win32-x64', versions: ['0.35.4'] }],
      'LGPL-3.0-or-later': [{ name: '@img/sharp-libvips-linux-x64', versions: ['1.3.3'] }],
      'CC0-1.0': [{ name: '@speed-highlight/core', versions: ['1.2.24'] }],
    };
    expect(findUnreviewed(groups)).toEqual([]);
  });
});
