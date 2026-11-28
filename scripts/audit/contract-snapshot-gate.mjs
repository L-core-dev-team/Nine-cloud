#!/usr/bin/env node
// Contract snapshot pairing gate (governance §5.1). The vitest snapshot test in
// packages/contracts fails whenever the exported zod schemas drift from
// packages/contracts/contract-schema.snapshot.json. This gate covers the other half:
// a commit range that updates the snapshot must also add or change an ADR or a
// migration note, so the compatibility decision is written down next to the change.
//
//   node scripts/audit/contract-snapshot-gate.mjs [--base <ref>] [--head <ref>]
//
// Base defaults to CONTRACT_GATE_BASE or origin/main. An all-zero base (new ref)
// compares against the head commit's first parent.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SNAPSHOT_PATH = 'packages/contracts/contract-schema.snapshot.json';
export const DECISION_PATTERNS = [
  /^docs\/adr\/[^/]+\.md$/,
  /^docs\/execution\/JX-VISION-02\/migrations\/[^/]+\.md$/,
  /^packages\/db\/drizzle\/[^/]+\.sql$/,
];

export function evaluateChangedFiles(files, { snapshotExistedAtBase = true } = {}) {
  if (!files.includes(SNAPSHOT_PATH)) return { ok: true, reason: 'contract snapshot unchanged' };
  // The range that first introduces the snapshot has no earlier contract to stay compatible with.
  if (!snapshotExistedAtBase) return { ok: true, reason: 'contract snapshot introduced' };
  const decisions = files.filter(file => DECISION_PATTERNS.some(pattern => pattern.test(file)));
  if (decisions.length > 0) return { ok: true, reason: `contract snapshot changed with ${decisions.join(', ')}` };
  return {
    ok: false,
    reason: `${SNAPSHOT_PATH} changed without an ADR (docs/adr/*.md) or migration note (docs/execution/JX-VISION-02/migrations/*.md, packages/db/drizzle/*.sql) in the same range`,
  };
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../..');
  const args = process.argv.slice(2);
  const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  try {
    const head = git(root, 'rev-parse', '--verify', `${option('--head') ?? process.env.CONTRACT_GATE_HEAD ?? 'HEAD'}^{commit}`);
    const requested = option('--base') ?? process.env.CONTRACT_GATE_BASE ?? 'origin/main';
    const base = !requested || /^0+$/.test(requested)
      ? git(root, 'rev-parse', '--verify', `${head}~1^{commit}`)
      : git(root, 'merge-base', git(root, 'rev-parse', '--verify', `${requested}^{commit}`), head);
    const files = git(root, 'diff', '--name-only', '--no-renames', `${base}..${head}`).split('\n').filter(Boolean);
    const existed = spawnSync('git', ['cat-file', '-e', `${base}:${SNAPSHOT_PATH}`], { cwd: root }).status === 0;
    const result = evaluateChangedFiles(files, { snapshotExistedAtBase: existed });
    if (!result.ok) {
      console.error(`Contract snapshot gate failed: ${result.reason}.`);
      process.exitCode = 1;
    } else {
      console.log(`Contract snapshot gate passed (${base.slice(0, 12)}..${head.slice(0, 12)}): ${result.reason}.`);
    }
  } catch (error) {
    // Fail closed: an unresolvable range must not silently skip the pairing rule.
    console.error(`Contract snapshot gate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
