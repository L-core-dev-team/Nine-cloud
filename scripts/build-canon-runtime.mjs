import { readFile, writeFile } from 'node:fs/promises';

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
const allowPendingReceipts = process.argv.includes('--allow-pending-receipts');
const receiptsUsable = Boolean(receiptManifest && Array.isArray(receiptManifest.entries)
  && receiptManifest.canonVersion === registry.activeVersion);
let receiptsComplete = false;
if (receiptsUsable) {
  const byId = new Map(receiptManifest.entries.map(item => [item.id, item]));
  receiptsComplete = entries.length > 0 && entries.every(entry => {
    const digest = entryDigest(entry);
    const reviews = byId.get(entry.id)?.reviews ?? [];
    return ['LYL', 'Bird'].every(reviewer => reviews.some(item =>
      item.reviewer === reviewer && item.decision === 'approved'
      && item.contentSha256 === digest && Number.isFinite(Date.parse(item.reviewedAt))));
  });
}
if (!receiptsComplete && !allowPendingReceipts) {
  throw new Error('CANON_RECEIPTS_PENDING: confirmed entries lack matching LYL+Bird review receipts; provide packages/content/src/canon-receipts.json or pass --allow-pending-receipts to stamp the runtime as pending.');
}

const runtime = { schemaVersion: registry.schemaVersion, activeVersion: registry.activeVersion, receiptsComplete, entries };
const serialized = `${JSON.stringify(runtime, null, 2)}\n`;
if (process.argv.slice(2).some(argument => argument !== '--check' && argument !== '--write' && argument !== '--allow-pending-receipts')
  || process.argv.includes('--check') && process.argv.includes('--write')) {
  throw new Error('Usage: node scripts/build-canon-runtime.mjs [--check|--write] [--allow-pending-receipts]');
}

if (process.argv.includes('--check')) {
  const current = await readFile(runtimeUrl, 'utf8');
  if (current !== serialized) throw new Error('Public Canon runtime is stale; run `pnpm worldbook:runtime:write` and review the generated diff.');
  console.log(`Verified public Canon runtime ${runtime.activeVersion}: ${entries.length} confirmed entries; receiptsComplete=${receiptsComplete}; private source metadata excluded.`);
} else {
  await writeFile(runtimeUrl, serialized, 'utf8');
  console.log(`Built public Canon runtime ${runtime.activeVersion}: ${entries.length} confirmed entries; receiptsComplete=${receiptsComplete}; pending/conflict/deprecated and private source metadata excluded.`);
}
