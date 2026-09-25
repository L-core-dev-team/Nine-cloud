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
  .map(({ id, title, category, parentId, status, canonVersion, content, sections, aliases, tags, publicSourceNote, sortOrder }) => ({
    id, title, category, ...(parentId ? { parentId } : {}), status, canonVersion, content,
    ...(sections ? { sections } : {}), aliases: aliases ?? [], tags: tags ?? [],
    ...(publicSourceNote ? { publicSourceNote } : {}), sortOrder,
  }));

const runtime = { schemaVersion: registry.schemaVersion, activeVersion: registry.activeVersion, entries };
await writeFile(runtimeUrl, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
console.log(`Built public Canon runtime ${runtime.activeVersion}: ${entries.length} confirmed entries; pending/conflict/deprecated and private source metadata excluded.`);
