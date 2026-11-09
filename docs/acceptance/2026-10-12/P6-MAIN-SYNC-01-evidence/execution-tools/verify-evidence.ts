import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { goldQuestions } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/gold.ts';
import { generateDataset, validateDataset } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/dataset.ts';
import type { runEvaluation } from 'file:///C:/Users/11954/Desktop/%E6%B0%B4%E9%BE%99%E5%90%9F%E4%B8%93%E7%94%A8/%E9%A1%B9%E7%9B%AE/Nine-cloud-P6-main-sync-20261012/tests/experiments/p6-longmem/evaluate.ts';

const root = resolve('docs/acceptance/2026-10-11/P6-LONGMEM-01-evidence');
const review = join(root, 'review');
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const previous = readJson(join(root, 'checks-and-manifest.json')) as { files: { name: string; bytes: number; sha256: string }[]; goldSha256: string };
for (const file of previous.files) {
  const bytes = readFileSync(join(root, file.name));
  assert.equal(bytes.length, file.bytes, file.name);
  assert.equal(sha(bytes), file.sha256, file.name);
}
const goldBytes = JSON.stringify(goldQuestions, null, 2) + '\n';
assert.equal(sha(goldBytes), previous.goldSha256, 'Frozen 60-question oracle changed');
assert.equal(sha(readFileSync(join(review, 'gold-questions.json'))), previous.goldSha256);
for (const size of [200, 500, 1000]) {
  const history = readJson(join(review, `history-${size}.json`));
  validateDataset(history);
  assert.deepEqual(history, generateDataset(size));
}
validateDataset(readJson(join(review, 'adversarial-history-200.json')));
const evaluation = readJson(join(review, 'evaluation.json')) as { runs: ReturnType<typeof runEvaluation>[]; reproducibility: { goldSha256: string } };
assert.equal(evaluation.runs.length, 24);
assert.equal(evaluation.reproducibility.goldSha256, previous.goldSha256);
for (const run of evaluation.runs) {
  assert.equal(run.records.length, 60);
  assert.equal(run.metrics.unauthorizedSourceLeakCount, 0);
  assert.equal(run.metrics.futureSourceLeakCount, 0);
  assert.ok(run.records.every(r => r.estimatedTokens <= run.budget));
}
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(directory, item.name)) : [join(directory, item.name)]);
}
const manifestPath = join(review, 'verification.json');
const inputs = [...files(root), ...files(resolve('tests/experiments/p6-longmem'))]
  .filter(path => path !== manifestPath && !path.includes(join('p6-longmem', 'results'))).sort();
const manifest = {
  testedSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, frozenGoldSha256: previous.goldSha256,
  previousEvidenceFilesVerified: previous.files.length,
  finalQueriesVerified: evaluation.runs.reduce((count, run) => count + run.records.length, 0),
  checks: { tests: '22/22 PASS; see tests.log', typecheck: 'PASS', strictQuality: 'FAIL expected: 512/1024 insufficient evidence; see strict.log' },
  files: inputs.map(path => ({ path: relative(process.cwd(), path).replaceAll('\\', '/'), bytes: readFileSync(path).length, sha256: sha(readFileSync(path)) })),
};
writeFileSync("C:\\Users\\11954\\Desktop\\水龙吟专用\\项目\\Nine-cloud-P6-main-sync-20261012\\docs\\acceptance\\2026-10-12\\P6-MAIN-SYNC-01-evidence\\p6-01-original-verification.json", JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ...manifest, files: undefined, runs200: evaluation.runs.filter(r => r.turns === 200).map(r => ({ budget: r.budget, strategy: r.strategy, ...r.metrics })) }, null, 2));
