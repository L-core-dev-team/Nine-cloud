import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACTION_DRAFT_PREFIX, clearActionDraft, deleteActionDrafts, readActionDraft, writeActionDraft } from './storage';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(),
  };
}
const save = (saveId: string) => ({ schemaVersion: 1, saveId, name: 'synthetic', createdAt: '', updatedAt: '', revision: 0,
  canonVersion: '', ruleVersion: '', memoryPolicyVersion: '', character: {}, location: '', status: 'pending_rules', messages: [] });
beforeEach(() => {
  vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
  localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify([save('a'), save('b')]));
});
afterEach(() => vi.unstubAllGlobals());

it('survives a new tab session, isolates save IDs and keeps the 4000 character limit', () => {
  writeActionDraft('a', '甲'.repeat(4001)); writeActionDraft('b', '乙');
  vi.stubGlobal('sessionStorage', storage());
  expect(readActionDraft('a').drafts[0]?.text).toBe('甲'.repeat(4000));
  expect(readActionDraft('b').drafts[0]?.text).toBe('乙');
});
it('interleaved editors of a shared predecessor cannot overwrite each other', () => {
  const original = writeActionDraft('a', '原文').draft!;
  const first = writeActionDraft('a', '标签甲', original, 'editor-a').draft!;
  const second = writeActionDraft('a', '标签乙', original, 'editor-b').draft!;
  expect(new Set(readActionDraft('a').drafts.map(draft => draft.text))).toEqual(new Set(['原文', '标签甲', '标签乙']));
  clearActionDraft('a', first);
  expect(readActionDraft('a').drafts.map(draft => draft.key)).toContain(second.key);
  expect(clearActionDraft('b', second)).toBe(false);
});
it('publishes legacy session text without replacing a different durable draft', () => {
  writeActionDraft('a', '新草稿'); sessionStorage.setItem('jiuxiao_1_action_draft_a', '旧草稿');
  const legacy = readActionDraft('a').drafts.find(draft => !draft.key.startsWith(ACTION_DRAFT_PREFIX))!;
  expect(writeActionDraft('a', legacy.text, legacy).ok).toBe(true);
  expect(new Set(readActionDraft('a').drafts.map(draft => draft.text))).toEqual(new Set(['旧草稿', '新草稿']));
  expect(sessionStorage.getItem(legacy.key)).toBeNull();
});
it('quota rejection preserves the predecessor and legacy session text', () => {
  const original = writeActionDraft('a', '已保存').draft!;
  sessionStorage.setItem('jiuxiao_1_action_draft_a', '旧草稿');
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  expect(writeActionDraft('a', '当前输入', original)).toMatchObject({ ok: false, warning: expect.stringContaining('复制备份') });
  expect(readActionDraft('a').drafts.map(draft => draft.text)).toContain('已保存');
  expect(sessionStorage.getItem('jiuxiao_1_action_draft_a')).toBe('旧草稿');
});
it('denied storage safely returns a warning', () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  vi.spyOn(localStorage, 'key').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  expect(readActionDraft('a').warning).toBeTruthy();
  expect(writeActionDraft('a', '输入').ok).toBe(false);
});
it('preserves corrupt bytes, valid drafts and formal save bytes', () => {
  const formal = localStorage.getItem('jiuxiao_1_local_saves');
  const key = `${ACTION_DRAFT_PREFIX}a:broken`;
  localStorage.setItem(key, '{invalid'); writeActionDraft('a', '有效文本');
  expect(readActionDraft('a')).toMatchObject({ warning: expect.stringContaining('损坏') });
  expect(readActionDraft('a').drafts[0]?.text).toBe('有效文本');
  expect(localStorage.getItem(key)).toBe('{invalid');
  expect(localStorage.getItem('jiuxiao_1_local_saves')).toBe(formal);
});
it('clears only the submitted snapshot, retaining a concurrent revision', () => {
  const submitted = writeActionDraft('a', '提交文本', undefined, 'same-editor').draft!;
  const concurrent = writeActionDraft('a', '并发文本', submitted, 'same-editor').draft!;
  expect(clearActionDraft('a', submitted)).toBe(true);
  expect(readActionDraft('a').drafts).toEqual([concurrent]);
});
it('cleans all drafts of a deleted save and rejects stale editors', () => {
  writeActionDraft('a', '甲'); writeActionDraft('a', '乙'); writeActionDraft('b', '其他存档');
  localStorage.setItem(`${ACTION_DRAFT_PREFIX}a:broken`, '{invalid');
  localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify([save('b')]));
  expect(deleteActionDrafts('a')).toBe(true);
  expect(readActionDraft('a').drafts).toEqual([]);
  expect(writeActionDraft('a', '已删除的存档').ok).toBe(false);
  expect(readActionDraft('b').drafts[0]?.text).toBe('其他存档');
});
it('reports cleanup failure without claiming the submitted draft was removed', () => {
  const draft = writeActionDraft('a', '文本').draft!;
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
  expect(clearActionDraft('a', draft)).toBe(false);
  expect(deleteActionDrafts('a')).toBe(false);
});
it('keeps only the newest snapshot during repeated edits by the same owner', () => {
  let draft = writeActionDraft('a', '起点', undefined, 'one-editor').draft!;
  for (let n = 0; n < 100; n++) draft = writeActionDraft('a', `编辑${n}`, draft, 'one-editor').draft!;
  expect(readActionDraft('a').drafts).toEqual([draft]);
});
it('re-entering unchanged restored text does not leave duplicate drafts', () => {
  let draft = writeActionDraft('a', '不变草稿', undefined, 'first-editor').draft!;
  for (let n = 0; n < 20; n++) draft = writeActionDraft('a', '不变草稿', draft, `reopened-${n}`).draft!;
  expect(readActionDraft('a').drafts).toEqual([draft]);
  clearActionDraft('a', draft);
  expect(readActionDraft('a').drafts).toEqual([]);
});
it('an editor recovering another active tab cannot retire its valid text', () => {
  const active = writeActionDraft('a', '甲的有效草稿', undefined, 'editor-a').draft!;
  const recoveredEdit = writeActionDraft('a', '乙的有效草稿', active, 'editor-b').draft!;
  expect(readActionDraft('a').drafts.map(draft => draft.key)).toContain(active.key);
  const nextA = writeActionDraft('a', '甲的新版本', active, 'editor-a').draft!;
  expect(new Set(readActionDraft('a').drafts.map(draft => draft.key))).toEqual(new Set([recoveredEdit.key, nextA.key]));
});
