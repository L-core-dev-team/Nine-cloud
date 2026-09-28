import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commitSaves, type LocalSave } from './storage';

const indexed = vi.hoisted(() => ({
  readIndexedSnapshot: vi.fn(),
  commitIndexedSaves: vi.fn(),
}));

vi.mock('./idb', () => ({
  readIndexedSnapshot: indexed.readIndexedSnapshot,
  commitIndexedSaves: indexed.commitIndexedSaves,
  initializeIndexedSaves: vi.fn(),
  restoreLocalMirror: vi.fn(),
}));

const validSave: LocalSave = {
  schemaVersion: 1,
  saveId: 'save-1',
  name: '测试修士',
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  revision: 0,
  canonVersion: 'legacy-unverified',
  ruleVersion: 'rules-not-signed',
  memoryPolicyVersion: 'legacy-unknown',
  character: {},
  location: '中州天枢域',
  status: 'pending_rules',
  messages: [],
};

describe('local save commit boundary', () => {
  beforeEach(() => {
    indexed.readIndexedSnapshot.mockReset();
    indexed.commitIndexedSaves.mockReset();
  });

  it('rejects malformed proposed or expected saves before touching IndexedDB', async () => {
    const malformed = { ...validSave, revision: -1 };
    const proposedResult = await commitSaves([], [malformed]);
    expect(proposedResult.ok).toBe(false);
    if (!proposedResult.ok) expect(proposedResult.reason).toBe('unavailable');

    const expectedResult = await commitSaves([malformed], [validSave]);
    expect(expectedResult.ok).toBe(false);
    if (!expectedResult.ok) expect(expectedResult.reason).toBe('unavailable');

    expect(indexed.readIndexedSnapshot).not.toHaveBeenCalled();
    expect(indexed.commitIndexedSaves).not.toHaveBeenCalled();
  });

  it('rejects duplicate save IDs before touching IndexedDB', async () => {
    const result = await commitSaves([], [validSave, { ...validSave, name: '同名冲突副本' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unavailable');
    expect(indexed.readIndexedSnapshot).not.toHaveBeenCalled();
    expect(indexed.commitIndexedSaves).not.toHaveBeenCalled();
  });
});
