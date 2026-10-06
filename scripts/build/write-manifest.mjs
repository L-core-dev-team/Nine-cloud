#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SAVE_SCHEMA_VERSION } from '../../packages/contracts/dist/save.js';

const root = resolve(import.meta.dirname, '../..');
const stageIndex = process.argv.indexOf('--stage');
const stage = stageIndex >= 0 ? process.argv[stageIndex + 1] : process.env.JIUXIAO_BUILD_STAGE ?? 'unclassified';
if (!stage || !/^(S[0-8]|unclassified)$/.test(stage)) throw new Error('Expected --stage S0..S8 or unclassified');
if (!Number.isSafeInteger(SAVE_SCHEMA_VERSION) || SAVE_SCHEMA_VERSION < 1) throw new Error('Invalid save schema version');
const commit = process.env.GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'],
  { cwd: root, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Expected a full Git commit SHA');
const gitStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'],
  { cwd: root, encoding: 'utf8' }).trim();
const dirtyPathCount = gitStatus ? gitStatus.split(/\r?\n/).filter(Boolean).length : 0;
const sourceTree = dirtyPathCount === 0 ? 'clean' : 'dirty';
// This identifies the exact source bytes only. It is not an author signature,
// a receipt-completeness claim, or publication authorization.
const canonRuntimeBytes = readFileSync(resolve(root, 'packages/content/src/canon-runtime.json'));
const canonArtifactHash = `sha256:${createHash('sha256').update(canonRuntimeBytes).digest('hex')}`;

cpSync(resolve(root, 'packages/db/drizzle'), resolve(root, 'packages/db/dist/drizzle'),
  { recursive: true, force: true });

for (const [kind, target] of [
  ['web', 'apps/web/dist/build-manifest.json'],
  ['api', 'apps/api/dist/build-manifest.json'],
  ['migration-schema', 'packages/db/dist/build-manifest.json'],
]) {
  const path = resolve(root, target);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ product: 'jiuxiao', stage, kind,
    commit, sourceTree, dirtyPathCount, saveSchemaVersion: SAVE_SCHEMA_VERSION, canonArtifactHash }, null, 2)}\n`);
}
console.log(`Built web, API and schema at ${commit} (${sourceTree} worktree; ${dirtyPathCount} changed paths)`);
