import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { assertCanonPublisherBinding, inspectCanonPublisherBinding } from '../../../scripts/build/canon-signoff-binding.mjs';

const load = async path => readFile(new URL(path, import.meta.url), 'utf8');
async function inputs() {
  return {
    registryText: await load('./canon.registry.json'),
    runtimeText: await load('./canon-runtime.json'),
    evidence: {
      receipt: await load('../../../docs/acceptance/2026-10-04/P1-author-signed-evidence/G04a-回执-已签署.md'),
      digests: await load('../../../docs/acceptance/2026-10-04/P1-author-signed-evidence/canon-digests.json'),
      entries: await load('../../../docs/acceptance/2026-10-04/P1-author-signed-evidence/canon-entry-digests.csv'),
    },
  };
}

describe('G-04a publisher binding', () => {
  it('matches the signed rows but refuses changed whole-file scope', async () => {
    const binding = inspectCanonPublisherBinding(await inputs());
    expect(binding).toMatchObject({
      signedCommit: '61ca62e096fe9456f2e46c356a62284bde31f628',
      registryHashMatch: false,
      runtimeHashMatch: true,
      rowCountsMatch: true,
      rowDigestMatch: true,
      publisherBound: false,
    });
    expect(() => assertCanonPublisherBinding(binding)).toThrow(/CANON_RECEIPTS_PENDING/);
  });

  it('rejects an edited pinned author-evidence file', async () => {
    const input = await inputs();
    input.evidence.entries += 'tampered';
    expect(() => inspectCanonPublisherBinding(input)).toThrow(/CANON_SIGNED_EVIDENCE_TAMPERED/);
  });

  it('does not bind a modified runtime even when signed entry rows still match', async () => {
    const input = await inputs();
    input.runtimeText = '{}';
    const binding = inspectCanonPublisherBinding(input);
    expect(binding.rowDigestMatch).toBe(true);
    expect(binding.publisherBound).toBe(false);
  });

  it('keeps a runtime marked complete outside the signed scope pending', async () => {
    const input = await inputs();
    const runtime = JSON.parse(input.runtimeText);
    runtime.receiptsComplete = true;
    input.runtimeText = JSON.stringify(runtime, null, 2) + '\n';
    const binding = inspectCanonPublisherBinding(input);
    expect(binding.runtimeHashMatch).toBe(false);
    expect(() => assertCanonPublisherBinding(binding)).toThrow(/CANON_RECEIPTS_PENDING/);
  });
});
