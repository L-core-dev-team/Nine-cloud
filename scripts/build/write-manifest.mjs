#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const stageIndex = process.argv.indexOf('--stage');
const stage = stageIndex >= 0 ? process.argv[stageIndex + 1] : process.env.JIUXIAO_BUILD_STAGE ?? 'unclassified';
if (!stage || !/^(S[0-8]|unclassified)$/.test(stage)) throw new Error('Expected --stage S0..S8 or unclassified');
const commit = process.env.GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'],
  { cwd: root, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Expected a full Git commit SHA');

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
    commit, saveSchemaVersion: 1 }, null, 2)}\n`);
}
console.log(`Built web, API and schema from ${commit}`);
