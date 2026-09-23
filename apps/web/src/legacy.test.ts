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

  it('extracts readable text from HTML and rejects an empty JSON object', () => {
    const html = '<html><script>secret()</script><body><h1>山门</h1><p>流水声。</p></body></html>';
    const htmlSave = parseLegacySave(new File([html], '旧档.html'), html);
    expect(htmlSave.messages).toEqual(['山门 流水声。']);
    expect(() => parseLegacySave(new File(['{}'], 'bad.json'), '{}')).toThrow();
  });
});
