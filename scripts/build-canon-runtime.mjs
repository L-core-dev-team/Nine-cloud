import { readFile, writeFile } from 'node:fs/promises';
import { assertCanonReceiptsComplete } from './build/canon-receipts.mjs';
import { assertCanonPublisherBinding, inspectCanonPublisherBinding } from './build/canon-signoff-binding.mjs';

const registryUrl = new URL('../packages/content/src/canon.registry.json', import.meta.url);
const runtimeUrl = new URL('../packages/content/src/canon-runtime.json', import.meta.url);
const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
const statuses = new Set(['confirmed', 'pending_review', 'conflict', 'deprecated']);
const sourceIds = new Set((registry.sourceRegistry ?? []).map(source => source.id));
const seen = new Set();

if (!registry.activeVersion || !Array.isArray(registry.entries) || !Array.isArray(registry.reviewQueue) || !Array.isArray(registry.sourceRegistry)) {
  throw new Error('Canon registry is missing required version, entry, review queue, or source registry data');
}
if (sourceIds.size !== registry.sourceRegistry.length) throw new Error('Source registry IDs are missing or duplicated');
for (const entry of registry.entries) {
  if (!entry.id || seen.has(entry.id)) throw new Error(`Canon entry ID is missing or duplicated: ${entry.id}`);
  seen.add(entry.id);
  if (!statuses.has(entry.status)) throw new Error(`Invalid Canon status on ${entry.id}: ${entry.status}`);
  if (!entry.title?.trim() || !entry.category?.trim() || !entry.canonVersion?.trim() || !entry.content?.trim()) {
    throw new Error(`Canon entry is incomplete: ${entry.id}`);
  }
  if (!Array.isArray(entry.sourceRefs) || entry.sourceRefs.some(sourceId => !sourceIds.has(sourceId))) {
    throw new Error(`Canon source reference is unresolved: ${entry.id}`);
  }
}
for (const item of registry.reviewQueue) {
  if (!statuses.has(item.status) || item.status === 'confirmed' || item.status === 'deprecated') {
    throw new Error(`Review queue item has a publishable or invalid status: ${item.id}`);
  }
  if (!item.id || !item.sourceId || !sourceIds.has(item.sourceId)) throw new Error(`Review item has no valid source reference: ${item.id}`);
}

const entries = registry.entries
  .filter(entry => entry.status === 'confirmed' && entry.canonVersion === registry.activeVersion)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(({ id, title, category, parentId, status, canonVersion, content, sections, aliases, tags, origin, publicSourceNote, sortOrder }) => ({
    id, title, category, ...(parentId ? { parentId } : {}), status, canonVersion, content,
    ...(sections ? {
      sections: sections.map(({ title: sectionTitle, content: sectionContent }) => ({
        title: sectionTitle,
        content: sectionContent,
      })),
    } : {}),
    aliases: aliases ?? [], tags: tags ?? [],
    ...(origin ? { origin } : {}),
    ...(publicSourceNote ? { publicSourceNote } : {}), sortOrder,
  }));

// SEC-03: fail-closed dual-review receipts. Every confirmed entry must carry a
// matching LYL and Bird receipt from packages/content/src/canon-receipts.json
// (content-only digest). Without that manifest the build refuses to run unless
// --allow-pending-receipts is passed explicitly, which stamps the emitted
// runtime with receiptsComplete:false instead of silently skipping the gate.
const { createHash } = await import('node:crypto');
const entryDigest = entry => createHash('sha256').update(entry.content).digest('hex');
const receiptsUrl = new URL('../packages/content/src/canon-receipts.json', import.meta.url);
let receiptManifest = null;
try { receiptManifest = JSON.parse(await readFile(receiptsUrl, 'utf8')); } catch { receiptManifest = null; }
const evidenceRoot = new URL('../docs/acceptance/2026-10-04/P1-author-signed-evidence/', import.meta.url);
const [signedReceipt, signedDigests, signedEntries] = await Promise.all([
  readFile(new URL('G04a-回执-已签署.md', evidenceRoot), 'utf8'),
  readFile(new URL('canon-digests.json', evidenceRoot), 'utf8'),
  readFile(new URL('canon-entry-digests.csv', evidenceRoot), 'utf8'),
]);
const signedEvidence = { receipt: signedReceipt, digests: signedDigests, entries: signedEntries };
// Signed artifacts are always authenticated; the pending flag can only permit
// a development runtime to remain explicitly incomplete. It cannot waive a
// modified/forged author receipt or promote a row match to whole-file approval.
const signedBindingForCurrentFiles = inspectCanonPublisherBinding({
  registryText: await readFile(registryUrl, 'utf8'),
  runtimeText: await readFile(runtimeUrl, 'utf8'),
  evidence: signedEvidence,
});
const allowPendingReceipts = process.argv.includes('--allow-pending-receipts');
let receiptsComplete = false;
try {
  assertCanonPublisherBinding(signedBindingForCurrentFiles);
  assertCanonReceiptsComplete(entries, receiptManifest, registry.activeVersion, entryDigest);
  const approvedRuntime = JSON.stringify({ schemaVersion: registry.schemaVersion, activeVersion: registry.activeVersion,
    receiptsComplete: true, entries }, null, 2) + '\n';
  assertCanonPublisherBinding(inspectCanonPublisherBinding({ registryText: await readFile(registryUrl, 'utf8'),
    runtimeText: approvedRuntime, evidence: signedEvidence }));
  receiptsComplete = true;
} catch (error) {
  if (!allowPendingReceipts || !(error instanceof Error)
    || !error.message.startsWith('CANON_RECEIPTS_PENDING:')) throw error;
}

const runtime = { schemaVersion: registry.schemaVersion, activeVersion: registry.activeVersion, receiptsComplete, entries };
const serialized = `${JSON.stringify(runtime, null, 2)}\n`;
if (process.argv.slice(2).some(argument => argument !== '--check' && argument !== '--write' && argument !== '--allow-pending-receipts')
  || process.argv.includes('--check') && process.argv.includes('--write')) {
  throw new Error('Usage: node scripts/build-canon-runtime.mjs [--check|--write] [--allow-pending-receipts]');
}

if (process.argv.includes('--check')) {
  const current = await readFile(runtimeUrl, 'utf8');
  if (current.replace(/\r\n/g,'\n') !== serialized) throw new Error('Public Canon runtime is stale; run `pnpm worldbook:runtime:write` and review the generated diff.');
  console.log(`Verified public Canon runtime ${runtime.activeVersion}: ${entries.length} confirmed entries; receiptsComplete=${receiptsComplete}; private source metadata excluded.`);
} else {
  await writeFile(runtimeUrl, serialized, 'utf8');
  console.log(`Built public Canon runtime ${runtime.activeVersion}: ${entries.length} confirmed entries; receiptsComplete=${receiptsComplete}; pending/conflict/deprecated and private source metadata excluded.`);
}
