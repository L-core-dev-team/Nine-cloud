import { describe, expect, it } from 'vitest';
import { sha256, type SourceEvidence } from './source-register.js';
import { digestCandidate, publishApprovedWorldbook, type CanonCandidate } from './worldbook-publisher.js';

async function fixture() {
  const bytes = new TextEncoder().encode('synthetic image fixture');
  const source: SourceEvidence = { id: 'image-1', sha256: await sha256(bytes), readBytes: async () => bytes };
  const entry: CanonCandidate = {
    id: 'place-1', title: '测试地点', category: 'geography', body: '仅用于审核门禁测试。',
    sourceIds: [source.id], evidence: ['source-confirmed'], status: 'approved', reviews: [],
  };
  const contentSha256 = await digestCandidate(entry, new Map([[source.id, source.sha256]]));
  entry.reviews = [
    { reviewer: 'LYL', decision: 'approved', contentSha256, reviewedAt: '2026-09-25T00:00:00.000Z' },
    { reviewer: 'Bird', decision: 'approved', contentSha256, reviewedAt: '2026-09-25T00:00:00.000Z' },
  ];
  return { source, entry };
}

describe('author-only Canon publisher', () => {
  it('publishes only two-author-reviewed material bound to the original bytes', async () => {
    const { source, entry } = await fixture();
    const draft: CanonCandidate = { ...entry, id: 'draft-2', status: 'pending', reviews: [] };
    const manifest = await publishApprovedWorldbook({ canonVersion: 'review-fixture-v1', candidates: [entry, draft], sources: [source] });
    expect(manifest.entries.map(item => item.id)).toEqual(['place-1']);
    expect(manifest.entries[0]?.contentSha256).toBe(entry.reviews[0]?.contentSha256);
    expect(JSON.stringify(manifest)).not.toContain('synthetic image fixture');
  });

  it('rejects changed source bytes, edited text, missing review and unresolved markers', async () => {
    const { source, entry } = await fixture();
    const publish = (candidate: CanonCandidate, evidence = source) => publishApprovedWorldbook({
      canonVersion: 'review-fixture-v1', candidates: [candidate], sources: [evidence],
    });
    await expect(publish(entry, { ...source, readBytes: async () => new TextEncoder().encode('different') })).rejects.toThrow('Source hash mismatch');
    await expect(publish({ ...entry, body: '已在审批后修改' })).rejects.toThrow('stale LYL review');
    await expect(publish({ ...entry, reviews: entry.reviews.slice(0, 1) })).rejects.toThrow('Bird review');
    await expect(publish({ ...entry, body: '⟦待确认：断口⟧' })).rejects.toThrow('Incomplete approved Canon entry');
  });

  it('refuses duplicate source and Canon IDs', async () => {
    const { source, entry } = await fixture();
    await expect(publishApprovedWorldbook({ canonVersion: 'v1', candidates: [entry], sources: [source, source] })).rejects.toThrow('repeated source ID');
    await expect(publishApprovedWorldbook({ canonVersion: 'v1', candidates: [entry, entry], sources: [source] })).rejects.toThrow('repeated Canon ID');
  });
});
