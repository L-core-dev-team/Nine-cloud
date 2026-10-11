import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateDataset, validateDataset } from './dataset.ts';
import { goldQuestions } from './gold.ts';
import { runEvaluation } from './evaluate.ts';
import { HistoryIndex, tokenMethod } from './retrieval.ts';

const args = process.argv.slice(2);
function option(name: string, fallback: string): string { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] ?? fallback; }
const sizes = option('--sizes', '200').split(',').map(Number);
const out = resolve(option('--out', 'tests/experiments/p6-longmem/results'));
mkdirSync(out, { recursive: true });
const pretty = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const runs = [];
const stress = [];
for (const count of sizes) {
  const data = generateDataset(count); validateDataset(data);
  writeFileSync(resolve(out, `history-${count}.json`), pretty(data));
  for (const budget of [512, 1024, 2048, 4096]) for (const strategy of ['recent', 'historical'] as const) {
    const run = runEvaluation(data, goldQuestions, budget, strategy);
    runs.push(run);
    console.log(`${count} ${strategy} ${budget}: PASS ${run.metrics.PASS}, FAIL ${run.metrics.FAIL}; Recall@8 ${run.metrics.recallAt8?.toFixed(3)}; leaks ${run.metrics.unauthorizedSourceLeakCount}`);
  }
  // Capacity stress also moves the query clock to the end of the extended history.
  // This is a separately named experiment, not a mutation of the independently authored oracle.
  if (count > 200) for (const budget of [512, 1024, 2048, 4096]) {
    const index = new HistoryIndex(data);
    const probes = [
      { text: '我第一次遇到那名剑修时，他交给了我什么？', expected: ['s010'] },
      { text: '青玉佩的全部归属变化经过是什么？', expected: ['s028','s060','s120','s190'] },
      { text: '铜铃与铁钥匙的刻痕伏笔如何揭晓？', expected: ['s010','s023','s140'] },
    ];
    for (const strategy of ['recent', 'historical'] as const) for (const probe of probes) {
      const r = index.search({ text: probe.text, asOfTurn: count, audience: { kind: 'player' } }, budget, strategy);
      stress.push({ turns: count, budget, strategy, text: probe.text, expectedSourceIds: probe.expected,
        selectedSourceIds: r.evidence.map(s => s.sourceId), missingImportantSourceIds: probe.expected.filter(id => !r.evidence.some(s => s.sourceId === id)),
        estimatedTokens: r.estimatedTokens, elapsedMs: r.elapsedMs });
    }
  }
}
writeFileSync(resolve(out, 'gold-questions.json'), pretty(goldQuestions));
const result = { schemaVersion: 1, syntheticOnly: true, tokenMethod,
  scope: 'offline prototype; no model, API, database or production integration',
  reproducibility: { node: process.version, goldSha256: hash(pretty(goldQuestions)),
    anchorSha256: hash(readFileSync(new URL('./anchors.json', import.meta.url), 'utf8')) },
  // Timing intentionally varies; quality and evidence selection are deterministic.
  runs, stress,
};
writeFileSync(resolve(out, 'evaluation.json'), pretty(result));
writeFileSync(resolve(out, 'failures.json'), pretty(runs.map(r => ({ turns: r.turns, budget: r.budget, strategy: r.strategy, failures: r.records.filter(q => !q.pass) }))));
const table = ['| Turns | Method | Budget (estimated) | PASS | FAIL | Recall@8 | Source precision | Temporal | Refusal | Early miss | Leaks | Mean tokens | p95 ms |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
const fmt = (n: number | null) => n === null ? 'N/A' : n.toFixed(3);
for (const r of runs) { const m = r.metrics; table.push(`| ${r.turns} | ${r.strategy} | ${r.budget} | ${m.PASS} | ${m.FAIL} | ${fmt(m.recallAt8)} | ${fmt(m.sourcePrecision)} | ${fmt(m.temporalAccuracy)} | ${fmt(m.noEvidenceRefusalRate)} | ${fmt(m.longDistanceForgetRate)} | ${m.unauthorizedSourceLeakCount} | ${fmt(m.estimatedTokenMean)} | ${fmt(m.latencyMs.p95)} |`); }
writeFileSync(resolve(out, 'summary.md'), '# P6-LONGMEM-01 synthetic evaluation\n\n' + tokenMethod + '\n\n' + table.join('\n') + '\n');
// Evaluation misses are research findings, not assertion failures. Always retain them.
// Use --strict-quality to require every history query to pass (baseline excluded).
if (args.includes('--strict-quality') && runs.some(r => r.strategy === 'historical' && r.metrics.FAIL)) process.exitCode = 1;
