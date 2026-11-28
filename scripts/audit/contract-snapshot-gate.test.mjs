import assert from 'node:assert/strict';
import test from 'node:test';
import { SNAPSHOT_PATH, evaluateChangedFiles } from './contract-snapshot-gate.mjs';

test('an unchanged snapshot passes', () => {
  assert.equal(evaluateChangedFiles(['packages/contracts/src/save.ts']).ok, true);
});

test('a changed snapshot needs an ADR or migration note in the same range', () => {
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH, 'packages/contracts/src/save.ts']).ok, false);
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH, 'docs/execution/JX-VISION-02/ci-guards.md']).ok, false);
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH, 'docs/adr/0012-存档格式.md']).ok, true);
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH, 'docs/execution/JX-VISION-02/migrations/0031-x.md']).ok, true);
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH, 'packages/db/drizzle/0031_x.sql']).ok, true);
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH, 'packages/db/drizzle/meta/_journal.json']).ok, false);
});

test('the range that introduces the snapshot passes', () => {
  assert.equal(evaluateChangedFiles([SNAPSHOT_PATH], { snapshotExistedAtBase: false }).ok, true);
});
