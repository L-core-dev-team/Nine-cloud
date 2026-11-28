#!/usr/bin/env node
/**
 * P1 freeze (ADR 0010).
 *
 * `prologue-v1` is a frozen rule version. Its rule identity is two things:
 *   1. the byte digest of the FROZEN files below (rules, content, constants,
 *      NLU fixtures, P1 plugin and memory policy, and the golden replay file);
 *   2. the golden replay test (packages/domain/src/prologue-v1-frozen-replay.test.ts).
 *
 * Shared contracts and the turn pipeline may evolve. When they do, the AST
 * semantic pin in apps/api/src/services/p1-review-rule-approval.ts moves even
 * though the rules did not. `--repin` recomputes that pin, but only when the
 * frozen files are byte-identical to the lock; the golden replay and the P1
 * e2e journey must also pass in the same CI run. Every re-pin is appended to
 * docs/execution/JX-VISION-02/p1-repin-log.md.
 *
 *   node scripts/p1-frozen-rules.mjs --check     # CI: frozen files unchanged
 *   node scripts/p1-frozen-rules.mjs --semantic  # print actual vs pinned (needs pnpm build)
 *   node scripts/p1-frozen-rules.mjs --repin "reason"  # update the semantic pin and log it
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const lockPath = resolve(root, 'scripts/p1-frozen-rules.lock.json');
const approvalPath = resolve(root, 'apps/api/src/services/p1-review-rule-approval.ts');
const logPath = resolve(root, 'docs/execution/JX-VISION-02/p1-repin-log.md');

export const FROZEN_FILES = [
  'apps/api/src/services/p1-memory-policy.ts',
  'apps/api/src/services/p1-nlu-runtime.ts',
  'apps/api/src/services/p1-prologue-plugin.ts',
  'apps/api/src/services/p1-rule-semantic-functions.ts',
  'packages/content/src/prologue/prologue-v1.rulebook-candidate.ts',
  'packages/content/src/prologue/prologue-v1.ts',
  'packages/content/src/rules/prologue-v1.constants.ts',
  'packages/domain/src/__golden__/prologue-v1-replay.json',
  'packages/domain/src/memory/p4-recall-cues-v1.json',
  'packages/domain/src/memory/p4-recall-policy-v2.json',
  'packages/domain/src/nlu/action-parser.ts',
  'packages/domain/src/nlu/prologue-v1-nlu-fixtures.ts',
  'packages/domain/src/prologue-v1-rules.ts',
  'packages/domain/src/prologue-v1-time.ts',
].sort();

export function frozenDigest() {
  const hash = createHash('sha256');
  const files = {};
  for (const path of FROZEN_FILES) {
    const bytes = readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
    const digest = createHash('sha256').update(bytes, 'utf8').digest('hex');
    files[path] = `sha256:${digest}`;
    hash.update(path).update('\0').update(digest).update('\n');
  }
  return { sha256: `sha256:${hash.digest('hex')}`, files };
}

function readLock() {
  if (!existsSync(lockPath)) throw new Error(`missing ${lockPath}`);
  return JSON.parse(readFileSync(lockPath, 'utf8'));
}

function check() {
  const lock = readLock();
  const actual = frozenDigest();
  const changed = FROZEN_FILES.filter(path => lock.files?.[path] !== actual.files[path]);
  const extra = Object.keys(lock.files ?? {}).filter(path => !FROZEN_FILES.includes(path));
  if (actual.sha256 !== lock.sha256 || changed.length || extra.length) {
    console.error(`prologue-v1 is frozen (ADR 0010). Changed: ${[...changed, ...extra].join(', ') || '(list)'}`);
    console.error('Put rule changes in a new rule version instead of editing prologue-v1.');
    process.exit(1);
  }
  console.log(`prologue-v1 frozen files unchanged (${FROZEN_FILES.length} files, ${actual.sha256}).`);
  return lock;
}

async function semanticDigest() {
  const dist = resolve(root, 'apps/api/dist/services');
  if (!existsSync(resolve(dist, 'p1-prologue-plugin.js'))) throw new Error('Run pnpm build first (apps/api/dist is missing).');
  const plugin = await import(pathToFileURL(resolve(dist, 'p1-prologue-plugin.js')).href);
  const { createP1RuleSemanticDependencies } = await import(pathToFileURL(resolve(dist, 'p1-rule-semantic-functions.js')).href);
  const { computeRuleSemanticDigest } = await import(pathToFileURL(resolve(dist, 'rule-semantic-fingerprint.js')).href);
  const source = spawnSync(process.execPath, [resolve(root, 'scripts/p1-rule-semantic-source-digest.mjs')], { encoding: 'utf8' });
  if (source.status !== 0) throw new Error(`semantic source digest failed: ${source.stderr}`);
  const implementationFingerprint = JSON.parse(source.stdout).sha256;
  const actual = computeRuleSemanticDigest(createP1RuleSemanticDependencies({ ...plugin.P1_RULE_SEMANTIC_INPUTS, implementationFingerprint }));
  const pinned = /semanticSha256: '(sha256:[0-9a-f]{64})'/.exec(readFileSync(approvalPath, 'utf8'))?.[1];
  return { actual, pinned };
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === '--check') {
  check();
} else if (mode === '--write-lock') {
  // Only for creating the lock when the freeze is introduced or a NEW frozen
  // version is added. Never use it to accept an edit to prologue-v1.
  const actual = frozenDigest();
  writeFileSync(lockPath, `${JSON.stringify({
    format: 'jiuxiao-p1-frozen-rules-v1',
    ruleVersion: 'prologue-v1-candidate-20261005',
    adr: 'docs/adr/0010-P1规则冻结与版本化.md',
    sha256: actual.sha256,
    files: actual.files,
  }, null, 2)}\n`);
  console.log(`wrote ${lockPath}: ${actual.sha256}`);
} else if (mode === '--semantic') {
  check();
  const { actual, pinned } = await semanticDigest();
  console.log(JSON.stringify({ actual, pinned, matches: actual === pinned }, null, 2));
} else if (mode === '--repin') {
  const reason = rest.join(' ').trim();
  if (!reason) throw new Error('Give a reason: --repin "what changed outside the frozen rules"');
  const lock = check();
  const { actual, pinned } = await semanticDigest();
  if (actual === pinned) {
    console.log(`semantic pin already current: ${actual}`);
  } else {
    const source = readFileSync(approvalPath, 'utf8');
    writeFileSync(approvalPath, source.replace(`semanticSha256: '${pinned}'`, `semanticSha256: '${actual}'`));
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    appendFileSync(logPath, `| ${new Date().toISOString().slice(0, 10)} | \`${head.slice(0, 12)}\` | \`${pinned}\` | \`${actual}\` | \`${lock.sha256}\` | ${reason.replaceAll('|', '/')} |\n`);
    console.log(`semantic pin moved ${pinned} -> ${actual}; logged in ${logPath}`);
  }
} else {
  console.error('usage: p1-frozen-rules.mjs --check | --semantic | --repin "reason" | --write-lock');
  process.exit(2);
}
