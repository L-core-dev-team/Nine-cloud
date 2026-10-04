import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { assertCanonReceiptsComplete } from '../../../scripts/build/canon-receipts.mjs';

const parseJson = async url => JSON.parse(await readFile(url, 'utf8'));

describe('current Canon digest manifest', () => {
  it('matches every confirmed registry entry and the pending receipt skeleton', async () => {
    const [registry, digestManifest, receipts] = await Promise.all([
      parseJson(new URL('./canon.registry.json', import.meta.url)),
      parseJson(new URL('../../../canon-content-digests.json', import.meta.url)),
      parseJson(new URL('./canon-receipts.json', import.meta.url)),
    ]);
    const actual = registry.entries.filter(item => item.status === 'confirmed')
      .map(item => ({
        id: item.id,
        contentSha256: createHash('sha256').update(item.content, 'utf8').digest('hex'),
      }))
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const sortEntries = entries => [...entries]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

    expect(digestManifest.canonVersion).toBe(registry.activeVersion);
    expect(digestManifest.count).toBe(actual.length);
    expect(sortEntries(digestManifest.entries)).toEqual(actual);
    expect(receipts.canonVersion).toBe(registry.activeVersion);
    expect(sortEntries(receipts.entries)).toEqual(actual.map(item => ({ ...item, reviews: [] })));
  });
});

const entry = { id: 'canon-1', content: '原文' };
const digest = 'a'.repeat(64);
const approved = reviewer => ({ reviewer, decision: 'approved', contentSha256: digest, reviewedAt: '2026-10-04T00:00:00.000Z' });
const receipt = reviews => ({ canonVersion: '1.0', entries: [{ id: entry.id, contentSha256: digest, reviews }] });
const digestForEntry = value => value.content === '原文' ? digest : 'b'.repeat(64);

describe('Canon dual-review receipt gate', () => {
  it.each([
    ['LYL', [approved('Bird')]],
    ['Bird', [approved('LYL')]],
  ])('fails closed when the %s receipt is missing', (_reviewer, reviews) => {
    expect(() => assertCanonReceiptsComplete([entry], receipt(reviews), '1.0', digestForEntry))
      .toThrow(/CANON_RECEIPTS_PENDING/);
  });

  it('fails closed when a receipt digest differs from the source content', () => {
    const mismatched = { ...approved('LYL'), contentSha256: 'c'.repeat(64) };
    expect(() => assertCanonReceiptsComplete([entry], receipt([mismatched, approved('Bird')]), '1.0', digestForEntry))
      .toThrow(/CANON_RECEIPTS_PENDING/);
  });

  it('accepts exactly one current approval from each reviewer', () => {
    expect(() => assertCanonReceiptsComplete([entry], receipt([approved('LYL'), approved('Bird')]), '1.0', digestForEntry))
      .not.toThrow();
  });
});
