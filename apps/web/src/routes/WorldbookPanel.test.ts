import { describe, expect, it } from 'vitest';
import { bookEntries } from './WorldbookPanel';

describe('世界书工作台 · 条目预览', () => {
  it('reads SillyTavern world-info entries keyed by uid', () => {
    expect(bookEntries({ entries: { 0: { key: ['档房', ' '], comment: '档房', content: ' 三间矮屋 ' }, 1: { key: ['闰月'], content: '七月', disable: true } } })).toEqual([
      { keys: ['档房'], title: '档房', content: '三间矮屋', off: false },
      { keys: ['闰月'], title: '', content: '七月', off: true },
    ]);
  });
  it('reads character-book entries in an array', () => {
    expect(bookEntries({ entries: [{ keys: ['月'], name: '月', content: '旧书内容', enabled: false }] })).toEqual([{ keys: ['月'], title: '月', content: '旧书内容', off: true }]);
  });
  it('returns nothing for missing or malformed entries', () => {
    expect(bookEntries(undefined)).toEqual([]);
    expect(bookEntries({ entries: 'x' })).toEqual([]);
    expect(bookEntries({ entries: [null, 1, 'a'] })).toEqual([]);
  });
});
