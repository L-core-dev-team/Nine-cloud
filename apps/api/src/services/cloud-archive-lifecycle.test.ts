import { describe, expect, it } from 'vitest';
import { archiveDigest } from './cloud-archive-lifecycle.js';
describe('cloud archive backup integrity', () => {
  it('survives PostgreSQL JSONB key ordering while detecting content changes', () => {
    const first = { state: { facts: { nested: { b: 2, a: 1 }, list: ['甲', '乙'] } }, revision: 0 };
    const reordered = { revision: 0, state: { facts: { list: ['甲', '乙'], nested: { a: 1, b: 2 } } } };
    expect(archiveDigest(first)).toBe(archiveDigest(reordered));
    expect(archiveDigest(first)).not.toBe(archiveDigest({ ...first, revision: 1 }));
    expect(archiveDigest(first)).not.toBe(archiveDigest({ ...first, state: { facts: { nested: { b: 2, a: 1 }, list: ['乙', '甲'] } } }));
  });
});
