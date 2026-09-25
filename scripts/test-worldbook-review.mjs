import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [reviewArgument] = process.argv.slice(2);
if (!reviewArgument) throw new Error('Usage: node scripts/test-worldbook-review.mjs <private-review-dir>');
const reviewDir = resolve(reviewArgument);
const readJson = name => readFile(join(reviewDir, name), 'utf8').then(JSON.parse);
const [audit, ledger, registry, sources, conflicts, decisions, textCoverage, candidate] = await Promise.all([
  readJson('source-audit.json'), readJson('legacy-182-review-ledger.json'),
  readJson('canon-review-registry.json'), readJson('source-registry.json'),
  readJson('canon-conflicts.json'), readJson('author-decisions.json'), readJson('text-coverage.json'),
  readFile(join(reviewDir, '世界书_拼接修订候选.md'), 'utf8'),
]);
assert.deepEqual(audit.summary.issues, []);
assert.equal(audit.originals.length, 179);
assert.equal(audit.originals.filter(item => item.citedInStitchedDraft).length, 179);
assert.equal(audit.supplements.length, 28);
assert.equal(audit.supplements.filter(item => Number(item.number) >= 5 &&
  (item.citedInStitchedDraft || candidate.includes(`补${item.number}`))).length, 24);
assert.equal(audit.aliasMappings.length, 7);
assert.equal(ledger.records.length, 182);
assert.deepEqual(ledger.records.map(item => item.legacy182Number), Array.from({ length: 182 }, (_, i) => i + 1));
assert.equal(ledger.records.filter(item => item.disposition === 'user_excluded').length, 3);
assert.equal(ledger.records.filter(item => item.authorFinalApproval).length, 0);
assert.ok(candidate.includes('##### ▪ 《万兽洪荒经》 - 天阶中品'));
assert.ok(candidate.includes('【来源：120→118】'));
assert.ok(candidate.indexOf('【来源：119】') < candidate.indexOf('【来源：120→118】'));
assert.ok(candidate.includes('上古血脉之力融入己身'));
assert.equal(new Set(registry.entries.map(entry => entry.id)).size, registry.entries.length);
assert.equal(registry.entries.filter(entry => entry.status === 'confirmed').length, 0);
assert.equal(registry.entries.filter(entry => entry.status === 'conflict').length, 2);
assert.equal(new Set(sources.sources.map(source => source.id)).size, sources.sources.length);
const sourceIds = new Set(sources.sources.map(source => source.id));
for (const entry of registry.entries) for (const ref of entry.sourceRefs) assert.ok(sourceIds.has(ref), `${entry.id}:${ref}`);
assert.equal(conflicts.conflicts.length, 2);
assert.equal(decisions.decisions.length, 10);
assert.ok(registry.entries.some(entry => entry.sourceRefs.includes('review_decision_001')));
assert.equal(textCoverage.results.length, 179);
assert.ok(textCoverage.results.every(item => item.coverage >= .5));
assert.equal(textCoverage.results.find(item => item.number === '120').coverage, 1);
assert.ok(!JSON.stringify(registry).includes('C:/Users/'));
console.log('Worldbook author-side coverage, status and isolation checks passed.');
