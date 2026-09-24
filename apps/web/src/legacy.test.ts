import { describe, expect, it } from 'vitest';
import { parseLegacySave } from './legacy.js';

describe('legacy save importer', () => {
  it('maps the native envelope without stringifying message objects', async () => {
    const file = new File([JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: {
      id: 'native-1', name: '测试修士', turn: 3,
      messages: [{ role: 'assistant', content: '守门弟子示意登记。' }],
      player: { 姓名: '测试修士' }, world: { location: '山门' },
    } })], 'native.json');
    const save = parseLegacySave(file, await file.text());
    expect(save.saveId).toBe('native-1');
    expect(save.revision).toBe(3);
    expect(save.messages).toEqual([{ role: 'assistant', content: '守门弟子示意登记。' }]);
    expect(save.location).toBe('山门');
  });

  it('keeps legacy supplementary fields separate from authoritative state', () => {
    const text = JSON.stringify({ messages: [], status: '姓名：测试修士', intel: '地点：山门', memory: '初到山门' });
    const save = parseLegacySave(new File([text], 'legacy-chat.json'), text);
    expect(save.legacySupplement).toEqual({ status: '姓名：测试修士', intel: '地点：山门', memory: '初到山门' });
    expect(save.ruleVersion).toBe('rules-not-signed');
  });

  it('retains every imported field in a separate recoverable archive', () => {
    const payload = {
      id: 'full-archive-1', turn: 9, messages: [{ role: 'assistant', content: '叙事' }],
      player: { 姓名: '旧修士' }, world: { location: '旧地域' }, npcs: [{ id: 'npc-1' }],
      items: [{ id: 'item-1', count: 2 }], events: [{ id: 'event-1' }], stm: ['短记忆'],
      ltm: ['长记忆'], facts: ['事实候选'], actions: ['行动候选'], supplements: [{ name: '补充.txt', text: '原文' }],
      pending: { id: 'pending-1', text: '未完成行动' }, extensionFromOldVersion: { opaque: [1, 2, 3] },
    };
    const text = JSON.stringify(payload);
    const imported = parseLegacySave(new File([text], 'complete.json'), text);
    expect(imported.messages).toEqual(payload.messages);
    expect(imported.pending).toEqual(payload.pending);
    expect(imported.legacyArchive?.payload).toEqual(payload);
    expect(imported.legacyArchive?.payload.extensionFromOldVersion).toEqual({ opaque: [1, 2, 3] });
  });

  it('extracts readable text from HTML and rejects an empty JSON object', () => {
    const html = '<html><script>secret()</script><body><h1>山门</h1><p>流水声。</p></body></html>';
    const htmlSave = parseLegacySave(new File([html], '旧档.html'), html);
    expect(htmlSave.messages).toEqual(['山门 流水声。']);
    expect(() => parseLegacySave(new File(['{}'], 'bad.json'), '{}')).toThrow();
  });
});
