import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, parseLegacySave } from './legacy.js';

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

  it('roundtrips native saves without losing queued actions or nesting the original archive', () => {
    const originalArchive = {
      sourceFormat: 'JIUXIAO_LEGACY_JSON',
      sourceVersion: null,
      payload: { messages: ['旧故事'], extension: { clue: '石阶剑痕' } },
    };
    const native = {
      schemaVersion: 1, saveId: 'roundtrip-1', name: '往返修士',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
      revision: 4, canonVersion: 'legacy-unverified', ruleVersion: 'rules-not-signed',
      memoryPolicyVersion: 'legacy-unknown', character: { name: '往返修士' },
      location: '山门', status: 'pending_rules',
      messages: [{ role: 'assistant', content: '旧故事' }],
      pendingQueue: [{ id: 'intent-1', text: '观察山门' }],
      legacyArchive: originalArchive,
    };
    const firstText = JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: native });
    const once = parseLegacySave(new File([firstText], 'first.json'), firstText);
    const secondText = JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: once });
    const twice = parseLegacySave(new File([secondText], 'second.json'), secondText);
    expect(once.pendingQueue).toEqual(native.pendingQueue);
    expect(twice.pendingQueue).toEqual(native.pendingQueue);
    expect(once.legacyArchive).toEqual(originalArchive);
    expect(twice.legacyArchive).toEqual(originalArchive);
    expect(twice.ruleVersion).toBe('rules-not-signed');
  });

  it('archives a native save without an existing archive only once', () => {
    const native = {
      schemaVersion: 1, saveId: 'roundtrip-2', name: '新局修士',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
      revision: 0, canonVersion: 'legacy-unverified', ruleVersion: 'rules-not-signed',
      memoryPolicyVersion: 'legacy-unknown', character: {},
      location: '山门', status: 'pending_rules', messages: [], pendingQueue: [],
    };
    const firstText = JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: native });
    const once = parseLegacySave(new File([firstText], 'first.json'), firstText);
    const secondText = JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: once });
    const twice = parseLegacySave(new File([secondText], 'second.json'), secondText);
    expect(once.legacyArchive?.payload).toEqual(native);
    expect(twice.legacyArchive?.payload).toEqual(native);
    expect(twice.legacyArchive?.payload.legacyArchive).toBeUndefined();
  });

  it('keeps unknown native fields only in the recoverable archive and rejects unsafe revisions', () => {
    const native = { schemaVersion: 1, saveId: 'native-safe', name: '旧档', createdAt: '2026-09-01',
      updatedAt: '2026-09-01', revision: 3, canonVersion: 'old', ruleVersion: 'old',
      memoryPolicyVersion: 'old', character: {}, location: '山门', status: 'pending_rules', messages: [],
      unexpectedState: { authority: 'forged' } };
    const text = JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: native });
    const imported = parseLegacySave(new File([text], 'native.json'), text);
    expect('unexpectedState' in imported).toBe(false);
    expect(imported.legacyArchive?.payload.unexpectedState).toEqual(native.unexpectedState);
    const unsafe = JSON.stringify({ format: 'JIUXIAO_SAVE', version: 1, save: { ...native, revision: Number.MAX_SAFE_INTEGER + 1 } });
    expect(() => parseLegacySave(new File([unsafe], 'unsafe.json'), unsafe)).toThrow();
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

  it('rejects oversized files at the parser boundary before parsing their contents', () => {
    const file = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'oversized.txt');
    expect(() => parseLegacySave(file, 'small placeholder')).toThrow('Legacy file exceeds 20 MiB import limit');
  });

  it('extracts readable text from HTML and rejects invalid JSON imports', () => {
    const html = '<html><script>secret()</script><body><h1>山门</h1><p>流水声。</p></body></html>';
    const htmlSave = parseLegacySave(new File([html], '旧档.html'), html);
    expect(htmlSave.messages).toEqual(['山门 流水声。']);
    expect(() => parseLegacySave(new File(['{}'], 'empty.json'), '{}')).toThrow();
    expect(() => parseLegacySave(new File(['{"messages":'], 'broken.json'), '{"messages":')).toThrow('JSON legacy save is malformed');
  });
});
