import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getReviewedWorldbookEntry, reviewedWorldbook, searchReviewedWorldbook } from './worldbook.js';

describe('reviewed geography canon', () => {
  it('publishes exactly the entries represented by the recorded seven-image review batch', () => {
    expect(reviewedWorldbook).toHaveLength(7);
    expect(reviewedWorldbook.every(entry => entry.reviewStatus === 'reviewed' && entry.sourceIds.length > 0)).toBe(true);
    expect(new Set(reviewedWorldbook.map(entry => entry.id)).size).toBe(7);
  });

  it('searches reviewed text without importing pending OCR into results', () => {
    expect(searchReviewedWorldbook('音波功').map(entry => entry.id)).toEqual(['geography-east']);
    expect(searchReviewedWorldbook(' OCR待校 ')).toEqual([]);
  });

  it('keeps context restoration and owner-authorized completion visible in provenance', () => {
    expect(getReviewedWorldbookEntry('geography-central')?.evidence).toContain('context-restored');
    expect(getReviewedWorldbookEntry('geography-south')?.evidence).toContain('authorized-completion');
    expect(getReviewedWorldbookEntry('geography-forest')?.reviewNote).toContain('未补写');
  });

  it('keeps the author-only draft index source-bound and outside player search', () => {
    const indexPath = new URL('../../../docs/sources/worldbook-draft-index.json', import.meta.url);
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      artifact: string;
      source: { sha256: string; publishable: boolean; status: string };
      scan: { headingCount: number; sourceMarkerOccurrences: number; reviewMarkerOccurrences: Record<string, number> };
      sections: Array<{ id: string; startLine: number; endLine: number; title: string }>;
    };
    expect(index.artifact).toBe('author-only-worldbook-draft-index');
    expect(index.source).toMatchObject({
      sha256: '1d871057163f7f0b439c135b3af943e948b2401bb284ab077622ed95450d35d2',
      status: 'unreviewed-source-material',
      publishable: false,
    });
    expect(index.scan).toMatchObject({ headingCount: 172, sourceMarkerOccurrences: 219,
      reviewMarkerOccurrences: { suspectedMissing: 155, confirmationNeeded: 20, unreadable: 47, unassigned: 4 } });
    expect(new Set(index.sections.map(section => section.id)).size).toBe(index.sections.length);
    expect(index.sections.every(section => section.startLine > 0 && section.endLine >= section.startLine)).toBe(true);
    expect(searchReviewedWorldbook('审核修正版')).toEqual([]);

    const scriptPath = fileURLToPath(new URL('../../../scripts/audit/build-worldbook-draft-index.mjs', import.meta.url));
    expect(execFileSync(process.execPath, [scriptPath, '--check'], { encoding: 'utf8' })).toContain('Verified 172 draft headings');
  });
});
