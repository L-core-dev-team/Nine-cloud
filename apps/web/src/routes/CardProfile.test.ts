import { describe, expect, it } from 'vitest';
import { dialogueLines, tiqianTokens } from './CardProfile';

describe('人物志 · 示例对白分行', () => {
  it('splits speaker lines and scene breaks without changing the text', () => {
    const lines = dialogueLines('<START>\n{{user}}: 这份卷宗的日期被改过。\n{{char}}: *他接过去。* 改的人很小心。\n<START>\n{{user}}：你为什么不报上去？');
    expect(lines).toEqual([
      { kind: 'speech', speaker: '{{user}}', text: '这份卷宗的日期被改过。' },
      { kind: 'speech', speaker: '{{char}}', text: '*他接过去。* 改的人很小心。' },
      { kind: 'break' },
      { kind: 'speech', speaker: '{{user}}', text: '你为什么不报上去？' },
    ]);
  });
  it('keeps narration lines as notes', () => {
    expect(dialogueLines('{{user}}: 甲\n（窗外下着雨）\n{{char}}: 乙')?.[1]).toEqual({ kind: 'note', text: '（窗外下着雨）' });
  });
  it('falls back to plain prose when fewer than two speaker lines are found', () => {
    expect(dialogueLines('只是一段描述，没有对白。')).toBeNull();
    expect(dialogueLines('Note: one line only')).toBeNull();
  });
});

describe('人物志 · 题签分字', () => {
  it('stacks CJK one character at a time', () => {
    expect(tiqianTokens('沈砚')).toEqual(['沈', '砚']);
    expect(tiqianTokens('艾琳·冯')).toEqual(['艾', '琳', '·', '冯']);
  });
  it('keeps Latin words and digits together', () => {
    expect(tiqianTokens('Seraphina')).toEqual(['Seraphina']);
    expect(tiqianTokens('K 2号')).toEqual(['K 2', '号']);
  });
});
