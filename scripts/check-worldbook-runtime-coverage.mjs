import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [sourceArgument, reviewArgument] = process.argv.slice(2);
if (!sourceArgument || !reviewArgument) {
  throw new Error('Usage: node scripts/check-worldbook-runtime-coverage.mjs <private-source-dir> <private-review-dir>');
}
const sourceDir = resolve(sourceArgument);
const reviewDir = resolve(reviewArgument);
const registry = JSON.parse(await readFile(new URL('../packages/content/src/canon.registry.json', import.meta.url), 'utf8'));
const normalize = value => value
  .replace(/【[^】]+】/g, '').replace(/⟦[^⟧]+⟧/g, '')
  .replace(/\[[^\]]+\]/g, '').replace(/[^\p{Script=Han}0-9]+/gu, '');
const size = 8;
const results = [];
for (let number = 1; number <= 179; number++) {
  const sourceId = `original_${String(number).padStart(3, '0')}`;
  const raw = await readFile(join(sourceDir, `原${String(number).padStart(3, '0')}.txt`), 'utf8');
  const text = normalize(raw);
  const linked = registry.entries.filter(entry => entry.sourceRefs.includes(sourceId));
  const published = normalize(linked.map(entry => entry.content).join('\n'));
  const shingles = new Set();
  for (let position = 0; position <= text.length - size; position++) shingles.add(text.slice(position, position + size));
  const missing = [...shingles].filter(shingle => !published.includes(shingle));
  results.push({ sourceId, citedBy: linked.map(entry => entry.id),
    sourceCharacters: text.length, shingleCount: shingles.size,
    coverage: shingles.size ? Number(((shingles.size - missing.length) / shingles.size).toFixed(3)) : null,
    missingExamples: missing.slice(0, 20) });
}
const report = { schemaVersion: 1,
  method: 'Eight-character source-transcription shingles found in source-linked formal Canon entries. Editorial labels, alternate-version consolidation, OCR errors and intentionally omitted gaps can lower coverage. This is loss triage, not a visual review.',
  results };
await writeFile(join(reviewDir, 'runtime-source-coverage.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ originals: results.length,
  belowHalf: results.filter(item => item.coverage !== null && item.coverage < .5).length,
  belowEightTenths: results.filter(item => item.coverage !== null && item.coverage < .8).length,
  lowest: results.slice().sort((a, b) => (a.coverage ?? 1) - (b.coverage ?? 1)).slice(0, 30) }, null, 2));
