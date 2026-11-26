import { describe, expect, it } from 'vitest';
import { chineseNumeral, folioChapters, type FolioTurn } from './Folio';

describe('成卷 · 回目', () => {
  it('writes chapter numbers in Chinese numerals', () => {
    expect([1, 9, 10, 11, 20, 21, 99, 100, 101, 110, 115, 120].map(chineseNumeral)).toEqual(['一', '九', '十', '十一', '二十', '二十一', '九十九', '一百', '一百零一', '一百一十', '一百一十五', '一百二十']);
  });
  it('cuts every ten actions into one 回 and names the action range', () => {
    const turns: FolioTurn[] = Array.from({ length: 23 }, (_, index) => ({ key: String(index), label: index + 3, action: 'a', parts: [{ text: 'b' }] }));
    const chapters = folioChapters(turns);
    expect(chapters.map(chapter => [chapter.title, chapter.range, chapter.turns.length])).toEqual([['第一回', '行动 3–12', 10], ['第二回', '行动 13–22', 10], ['第三回', '行动 23–25', 3]]);
  });
  it('has no chapters without actions and names a single action plainly', () => {
    expect(folioChapters([])).toEqual([]);
    expect(folioChapters([{ key: 'k', label: 7, action: 'a', parts: [] }])[0]?.range).toBe('行动 7');
  });
});
