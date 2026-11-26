import { describe, expect, it } from 'vitest';
import { canonParagraphs } from './RealmSeal';

describe('境界图 · Canon 段落', () => {
  it('joins ○ items after their heading without rewriting the words', () => {
    expect(canonParagraphs('• 特点： ○ 纯粹的物理力量。 ○ 身法迅捷 ○ 五感敏锐。 • 寿元: 最高120年。')).toEqual(['特点：纯粹的物理力量。身法迅捷；五感敏锐。', '寿元: 最高120年。']);
  });
  it('keeps plain text as one paragraph', () => {
    expect(canonParagraphs('没有分项的一段。')).toEqual(['没有分项的一段。']);
  });
});
