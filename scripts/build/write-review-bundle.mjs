#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirtyPaths = execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' }).trim();
if (dirtyPaths) throw new Error(`Review artifacts require a clean source tree:\n${dirtyPaths}`);
const files = [];
const walk = path => {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const target = resolve(path, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile()) { const bytes = readFileSync(target); files.push({ path: relative(root, target).replaceAll('\\','/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    else throw new Error('Unexpected link in review build');
  }
};
for (const name of ['apps/web/dist','apps/api/dist','packages/db/dist','packages/contracts/dist','packages/domain/dist','packages/content/dist']) walk(resolve(root, name));
for (const name of ['apps/web/dist/build-manifest.json','apps/api/dist/build-manifest.json','packages/db/dist/build-manifest.json']) {
  const manifest = JSON.parse(readFileSync(resolve(root, name), 'utf8'));
  if (manifest.commit !== commit || manifest.sourceTree !== 'clean') throw new Error('Build provenance does not match clean review commit');
}
const output = resolve(root, 'test-results/review-bundle'); mkdirSync(output, { recursive: true });
const json = JSON.stringify({ kind: 'engineering-review-preview', commit, releaseApproved: false,
  note: 'Build outputs require dependencies from the same Git commit; no production credentials or author signatures included.', files }, null, 2) + '\n';
writeFileSync(resolve(output, 'artifact-manifest.json'), json);
writeFileSync(resolve(output, 'artifact-manifest.sha256'), createHash('sha256').update(json).digest('hex') + '  artifact-manifest.json\n');
console.log(`Review build SHA-256 manifest: ${files.length} files at ${commit}; release approval remains separate.`);
