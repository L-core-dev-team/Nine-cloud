import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import canonRuntime from './canon-runtime.json' with { type: 'json' };
import { canonRuntimeEntries, getCanonRuntimeEntry, searchCanonRuntime } from './worldbook.js';
import { formatCanonArtifactHash } from './canon-artifact.js';

describe('public Canon runtime', () => {
  it('computes an identity from exact source bytes and reports signed receipts separately', () => {
    // Resolve the source artifact from both src/ and emitted dist/ tests.
    const sourcePath = fileURLToPath(new URL('../src/canon-runtime.json', import.meta.url));
    const bytes = readFileSync(sourcePath);
    const sourceRuntime = JSON.parse(bytes.toString('utf8')) as unknown;
    // TypeScript may reformat JSON when it emits the package dist file. The
    // runtime object must still be semantically identical to the signed source.
    expect(canonRuntime).toEqual(sourceRuntime);
    const hash = formatCanonArtifactHash(new Uint8Array(createHash('sha256').update(bytes).digest()));
    expect(hash).toBe(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
    expect(formatCanonArtifactHash(new Uint8Array(createHash('sha256').update(Buffer.concat([bytes, Buffer.from('\n')])).digest())))
      .not.toBe(hash);
    expect((sourceRuntime as { receiptsComplete?: boolean }).receiptsComplete).toBe(true);
  });

  it('exposes every active public entry and excludes author-only source fields', () => {
    expect(canonRuntimeEntries).toHaveLength(34);
    expect(canonRuntimeEntries.map(entry => entry.id)).toEqual(canonRuntime.entries.map(entry => entry.id));
    expect(canonRuntimeEntries.every(entry => entry.status === 'confirmed'
      && entry.canonVersion === canonRuntime.activeVersion)).toBe(true);
    expect(canonRuntimeEntries.every(entry => !('sourceRefs' in entry)
      && !('reviews' in entry) && !('reviewNote' in entry))).toBe(true);
    expect(canonRuntimeEntries.flatMap(entry => entry.sections ?? [])
      .every(section => Object.keys(section).every(key => key === 'title' || key === 'content'))).toBe(true);
    const scriptPath = fileURLToPath(new URL('../../../scripts/build-canon-runtime.mjs', import.meta.url));
    // 2026-10-06：LYL 与 Bird 已对 34 条 confirmed 条目完成双方签署，
    // receiptsComplete 因此为 true，未带 --allow-pending-receipts 的调用必须成功而非失败关闭。
    expect(execFileSync(process.execPath, [scriptPath, '--check'], { encoding: 'utf8' }))
      .toContain('Verified public Canon runtime 1.0: 34 confirmed entries');
    expect((canonRuntime as { receiptsComplete?: boolean }).receiptsComplete).toBe(true);
    // 仍需保留 fail-closed 通道：显式要求 pending 时该开关必须继续可用。
    expect(execFileSync(process.execPath, [scriptPath, '--check', '--allow-pending-receipts'], { encoding: 'utf8' }))
      .toContain('Verified public Canon runtime 1.0: 34 confirmed entries');
  });

  it('searches published factions and systems, including section text', () => {
    expect(searchCanonRuntime('天工阁').some(entry => entry.id === 'faction_tiangong_ge')).toBe(true);
    expect(searchCanonRuntime('黄阶上品').some(entry => entry.id === 'system_prices')).toBe(true);
    expect(getCanonRuntimeEntry('faction_tiangong_ge')?.title).toBe('天工阁');
  });

  it('does not expose author-only OCR draft terms in player search', () => {
    expect(searchCanonRuntime('OCR待校')).toEqual([]);
    expect(searchCanonRuntime('审核修正版')).toEqual([]);
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

    const scriptPath = fileURLToPath(new URL('../../../scripts/audit/build-worldbook-draft-index.mjs', import.meta.url));
    expect(execFileSync(process.execPath, [scriptPath, '--check'], { encoding: 'utf8' })).toContain('Verified 172 draft headings');
  });
});
