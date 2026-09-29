import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitSaves, hydrateSaves, type LocalSave } from './storage';

const indexed = vi.hoisted(() => ({
  readIndexedSnapshot: vi.fn(),
  commitIndexedSaves: vi.fn(),
  initializeIndexedSaves: vi.fn(),
  restoreLocalMirror: vi.fn(),
}));

vi.mock('./idb', () => ({
  readIndexedSnapshot: indexed.readIndexedSnapshot,
  commitIndexedSaves: indexed.commitIndexedSaves,
  initializeIndexedSaves: indexed.initializeIndexedSaves,
  restoreLocalMirror: indexed.restoreLocalMirror,
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

function stubLocalStorage(entries: Array<[string, string]> = []): void {
  const values = new Map(entries);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage);
}

describe('local save commit boundary', () => {
  beforeEach(() => {
    indexed.readIndexedSnapshot.mockReset();
    indexed.commitIndexedSaves.mockReset();
    indexed.initializeIndexedSaves.mockReset();
    indexed.restoreLocalMirror.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('does not initialize an empty database from a stale legacy array when the v2 mirror is damaged', async () => {
    const damagedMirror = '{damaged-v2';
    const legacyCopy = JSON.stringify([validSave]);
    stubLocalStorage([
      ['jiuxiao_1_local_saves_v2', damagedMirror],
      ['jiuxiao_1_local_saves', legacyCopy],
    ]);
    indexed.readIndexedSnapshot.mockResolvedValue({ saves: [], revision: 0, initialized: false });

    const hydrated = await hydrateSaves();
    expect(hydrated.indexedDb).toBe(false);
    expect(hydrated.saves).toEqual([validSave]);
    expect(hydrated.warning).toMatch(/未初始化数据库/);
    expect(indexed.initializeIndexedSaves).not.toHaveBeenCalled();
    expect(localStorage.getItem('jiuxiao_1_local_saves_v2')).toBe(damagedMirror);
    expect(localStorage.getItem('jiuxiao_1_local_saves')).toBe(legacyCopy);

    const attemptedCommit = await commitSaves([validSave], [{ ...validSave, updatedAt: '2026-09-28T00:00:00.000Z' }]);
    expect(attemptedCommit.ok).toBe(false);
    if (!attemptedCommit.ok) expect(attemptedCommit.reason).toBe('unavailable');
    expect(indexed.initializeIndexedSaves).not.toHaveBeenCalled();
    expect(indexed.commitIndexedSaves).not.toHaveBeenCalled();
  });

  it('still imports the legacy array when no v2 mirror exists', async () => {
    stubLocalStorage([['jiuxiao_1_local_saves', JSON.stringify([validSave])]]);
    const uninitialized = { saves: [], revision: 0, initialized: false };
    const initialized = { saves: [validSave], revision: 0, initialized: true };
    indexed.readIndexedSnapshot.mockResolvedValueOnce(uninitialized).mockResolvedValueOnce(initialized);
    indexed.initializeIndexedSaves.mockResolvedValue(initialized);
    indexed.restoreLocalMirror.mockReturnValue(true);

    const hydrated = await hydrateSaves();

    expect(hydrated).toEqual({ saves: [validSave], indexedDb: true });
    expect(indexed.initializeIndexedSaves).toHaveBeenCalledWith([validSave]);
  });
  it('keeps the durable IndexedDB snapshot available when the compatibility mirror hits quota', async () => {
    const mirrorKey = 'jiuxiao_1_local_saves_v2';
    const existingMirror = JSON.stringify({ revision: 1, saves: [validSave] });
    const durableSave: LocalSave = { ...validSave, revision: 2, updatedAt: '2026-09-29T00:00:00.000Z' };
    stubLocalStorage([[mirrorKey, existingMirror]]);
    const storage = globalThis.localStorage;
    vi.stubGlobal('localStorage', {
      ...storage,
      setItem: () => { throw Object.assign(new Error('Storage quota exceeded'), { name: 'QuotaExceededError' }); },
    } as Storage);
    indexed.readIndexedSnapshot.mockResolvedValue({ saves: [durableSave], revision: 2, initialized: true });
    indexed.restoreLocalMirror.mockImplementation((saves: LocalSave[], revision: number) => {
      try {
        localStorage.setItem(mirrorKey, JSON.stringify({ revision, saves }));
        return true;
      } catch {
        return false;
      }
    });

    const hydrated = await hydrateSaves();

    expect(hydrated.saves).toEqual([durableSave]);
    expect(hydrated.indexedDb).toBe(true);
    expect(hydrated.warning).toMatch(/数据库仍保有存档/);
    expect(localStorage.getItem(mirrorKey)).toBe(existingMirror);
    expect(indexed.initializeIndexedSaves).not.toHaveBeenCalled();
  });

});
