import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const registry = await readJson('../packages/content/src/canon.registry.json');
const runtime = await readJson('../packages/content/src/canon-runtime.json');
const sourceIds = new Set(registry.sourceRegistry.map(source => source.id));
const entryIds = new Set(registry.entries.map(entry => entry.id));

assert.equal(registry.activeVersion, '1.0');
assert.equal(registry.reviewSummary.legacyRecordsReconciled, 182);
assert.equal(registry.reviewSummary.originalImagesAndTranscriptionsPaired, 179);
assert.equal(registry.reviewSummary.userExcludedLegacyRecords, 3);
assert.equal(registry.reviewSummary.imageByImageVisualVerificationComplete, false);
assert.equal(registry.entries.length, 33);
assert.equal(runtime.entries.length, registry.entries.length);
assert.equal(entryIds.size, registry.entries.length);
assert.equal(sourceIds.size, registry.sourceRegistry.length);
assert.equal(registry.reviewQueue.length, 0, 'all legacy records have an author-side disposition');
assert.ok(registry.entries.every(entry => entry.status === 'confirmed' &&
  entry.canonVersion === registry.activeVersion && entry.content.trim() &&
  entry.sourceRefs.length && entry.sourceRefs.every(id => sourceIds.has(id)) &&
  (!entry.parentId || entryIds.has(entry.parentId))));
const citedSources = new Set([
  ...registry.documentOutlineSourceRefs,
  ...registry.entries.flatMap(entry => entry.sourceRefs),
]);
assert.ok(registry.sourceRegistry.filter(source => source.id.startsWith('original_')).every(source => citedSources.has(source.id)));
assert.deepEqual(runtime.entries.map(entry => entry.id), registry.entries.slice()
  .sort((a, b) => a.sortOrder - b.sortOrder).map(entry => entry.id));
assert.ok(runtime.entries.every(entry => !('sourceRefs' in entry)));
const text = runtime.entries.map(entry => entry.content).join('\n');
for (const expected of ['万兽洪荒经', '圣火教', '资质决定论', '法器：各类修仙武器', '上古血脉之力融入己身']) {
  assert.ok(text.includes(expected), `missing key source content: ${expected}`);
}
assert.ok(!/⟦|【来源：|\[看不清|本章开头|小节标题缺失|C:[\\/]/.test(text));
assert.ok(!/C:[\\/]|imageSha256|transcriptionSha256|originalId|legacyOcrId/.test(JSON.stringify(runtime)));
console.log('Worldbook Canon coverage, runtime isolation and source-grounded content checks passed.');
