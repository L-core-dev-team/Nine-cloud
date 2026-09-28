import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [sourceArgument, reviewArgument] = process.argv.slice(2);
if (!sourceArgument || !reviewArgument) throw new Error('Usage: node scripts/check-worldbook-text-coverage.mjs <private-source-dir> <private-review-dir>');
const sourceDir = resolve(sourceArgument);
const reviewDir = resolve(reviewArgument);
const audit = JSON.parse(await readFile(join(reviewDir, 'source-audit.json'), 'utf8'));
const draft = await readFile(join(reviewDir, '世界书_拼接修订候选.md'), 'utf8');
const normalize = text => text.replace(/【[^】]+】/g, '')
  .replace(/⟦[^⟧]+⟧/g, '').replace(/\[[^\]]+\]/g, '')
  .replace(/[^\p{Script=Han}0-9]+/gu, '');
const normalizedDraft = normalize(draft);
const size = 8;
const results = [];
for (const item of audit.originals) {
  const raw = await readFile(join(sourceDir, item.textName), 'utf8');
  const text = normalize(raw);
  const shingles = new Set();
  for (let i = 0; i <= text.length - size; i++) shingles.add(text.slice(i, i + size));
  const present = [...shingles].filter(shingle => normalizedDraft.includes(shingle));
  const missing = [...shingles].filter(shingle => !normalizedDraft.includes(shingle));
  results.push({ number: item.number, count: shingles.size,
    matched: present.length, coverage: shingles.size ? Number((present.length / shingles.size).toFixed(3)) : null,
    missingExamples: missing.slice(0, 8) });
}
results.sort((a, b) => (a.coverage ?? 1) - (b.coverage ?? 1));
const report = { schemaVersion: 1, method: 'Normalized unique 8-Han/numeric-character shingles from each transcription present anywhere in stitched candidate; OCR/layout differences may cause false alarms. Not a visual source review.',
  results };
await writeFile(join(reviewDir, 'text-coverage.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ count: results.length, belowHalf: results.filter(item => item.coverage < .5).length,
  belowEightTenths: results.filter(item => item.coverage < .8).length,
  lowest: results.slice(0, 25) }, null, 2));
