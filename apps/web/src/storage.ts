import { commitIndexedSaves, initializeIndexedSaves, readIndexedSnapshot, restoreLocalMirror, type SaveCommitResult } from './idb';

export const SAVE_STORE = 'jiuxiao_1_local_saves';
const SAVE_MIRROR_STORE = 'jiuxiao_1_local_saves_v2';
export const LEGACY_LIBRARY_STORE = 'jiuxiao_v1_library';
export const CHARACTER_DRAFT_STORE = 'jiuxiao_1_character_draft';
const DAMAGED_BACKUP_SUFFIX = '_damaged_backup';

export type SaveStatus = 'pending_rules';

export type LocalSave = {
  schemaVersion: number;
  saveId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  canonVersion: string;
  ruleVersion: string;
  memoryPolicyVersion: string;
  character: Record<string, unknown>;
  location: string;
  status: SaveStatus;
  messages: unknown[];
  /** Marks a development-only local P2 candidate save; never enables production rules. */
  p2ReviewCandidate?: true;
  pending?: unknown;
  pendingQueue?: unknown[];
  legacySupplement?: Record<string, unknown>;
  /** Lossless parsed copy of a legacy record. Never treated as authoritative rules state. */
  legacyArchive?: { sourceFormat: string; sourceVersion: number | null; payload: Record<string, unknown> };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isLocalSave(value: unknown): value is LocalSave {
  if (!isRecord(value)) return false;
  const valid = value.schemaVersion === 1 && typeof value.saveId === 'string' && value.saveId.length > 0
    && typeof value.name === 'string' && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string' && typeof value.revision === 'number'
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && typeof value.canonVersion === 'string' && typeof value.ruleVersion === 'string'
    && typeof value.memoryPolicyVersion === 'string' && isRecord(value.character)
    && typeof value.location === 'string' && value.status === 'pending_rules'
    && Array.isArray(value.messages);
  if (!valid) return false;
  if (value.p2ReviewCandidate !== undefined && value.p2ReviewCandidate !== true) return false;
  if (value.legacySupplement !== undefined && !isRecord(value.legacySupplement)) return false;
  if (value.pendingQueue !== undefined && !Array.isArray(value.pendingQueue)) return false;
  if (value.legacyArchive !== undefined) {
    if (!isRecord(value.legacyArchive) || typeof value.legacyArchive.sourceFormat !== 'string' || !isRecord(value.legacyArchive.payload)) return false;
    const version = value.legacyArchive.sourceVersion;
    if (version !== null && (!Number.isSafeInteger(version) || (version as number) < 0)) return false;
  }
  return true;
}

type LocalInspection = {
  saves: LocalSave[];
  rawPresent: boolean;
  usable: boolean;
  mirrorRevision: number;
  damagedRaw: Array<[string, string]>;
};

function strictSaveArray(value: unknown): LocalSave[] | null {
  if (!Array.isArray(value) || !value.every(isLocalSave)) return null;
  const saves = value as LocalSave[];
  return new Set(saves.map(save => save.saveId)).size === saves.length ? saves : null;
}

function inspectLocalSaves(): LocalInspection {
  try {
    const mirrorRaw = localStorage.getItem(SAVE_MIRROR_STORE);
    const legacyRaw = localStorage.getItem(SAVE_STORE);
    const damagedRaw: Array<[string, string]> = [];
    let mirrorSaves: LocalSave[] | null = null;
    let mirrorRevision = 0;
    if (mirrorRaw !== null) {
      try {
        const mirror: unknown = JSON.parse(mirrorRaw);
        if (isRecord(mirror) && Number.isSafeInteger(mirror.revision) && (mirror.revision as number) >= 0) {
          mirrorSaves = strictSaveArray(mirror.saves);
          if (mirrorSaves) mirrorRevision = mirror.revision as number;
        }
      } catch { /* Preserve the original bytes below. */ }
      if (!mirrorSaves) damagedRaw.push([SAVE_MIRROR_STORE, mirrorRaw]);
    }
    let legacySaves: LocalSave[] | null = null;
    if (legacyRaw !== null) {
      try { legacySaves = strictSaveArray(JSON.parse(legacyRaw)); }
      catch { /* Preserve the original bytes below. */ }
      if (!legacySaves) damagedRaw.push([SAVE_STORE, legacyRaw]);
    }
    return {
      saves: mirrorSaves ?? legacySaves ?? [],
      rawPresent: mirrorRaw !== null || legacyRaw !== null,
      // The v2 value is the atomic mirror. If present but damaged, never seed an empty DB from the older compatibility array.
      usable: mirrorSaves !== null || (mirrorRaw === null && (legacySaves !== null || legacyRaw === null)),
      mirrorRevision,
      damagedRaw,
    };
  } catch {
    return { saves: [], rawPresent: false, usable: false, mirrorRevision: 0, damagedRaw: [] };
  }
}

function preserveDamagedRaw(entries: LocalInspection['damagedRaw']): boolean {
  try {
    for (const [key, raw] of entries) {
      const backupKey = `${key}${DAMAGED_BACKUP_SUFFIX}`;
      const existing = localStorage.getItem(backupKey);
      if (existing !== null && existing !== raw) return false;
      if (existing === null) localStorage.setItem(backupKey, raw);
    }
    return true;
  } catch { return false; }
}

export function readSaves(): LocalSave[] {
  return inspectLocalSaves().saves;
}

export async function commitSaves(expected: LocalSave[], proposed: LocalSave[]): Promise<SaveCommitResult> {
  if (!strictSaveArray(expected) || !strictSaveArray(proposed)) {
    return { ok: false, reason: 'unavailable', saves: readSaves(), conflictIds: [], revision: 0 };
  }
  try {
    const local = inspectLocalSaves();
    const indexed = await readIndexedSnapshot();
    if (!indexed.initialized && !local.usable) {
      return { ok: false, reason: 'unavailable', saves: local.saves, conflictIds: [], revision: 0 };
    }
    if (indexed.initialized && local.mirrorRevision > indexed.revision) {
      return { ok: false, reason: 'unavailable', saves: local.saves, conflictIds: [], revision: indexed.revision };
    }
    if (!preserveDamagedRaw(local.damagedRaw)) {
      return { ok: false, reason: 'unavailable', saves: indexed.initialized ? indexed.saves : local.saves, conflictIds: [], revision: indexed.revision };
    }
    if (!indexed.initialized) await initializeIndexedSaves(local.saves);
    return await commitIndexedSaves(expected, proposed);
  } catch {
    return { ok: false, reason: 'unavailable', saves: readSaves(), conflictIds: [], revision: 0 };
  }
}

export async function hydrateSaves(): Promise<{ saves: LocalSave[]; indexedDb: boolean; warning?: string }> {
  try {
    const local = inspectLocalSaves();
    let indexed = await readIndexedSnapshot();
    if (!indexed.initialized) {
      if (!local.usable) return { saves: local.saves, indexedDb: false, warning: '检测到受损的本地存档文本或不一致的副本。未初始化数据库，已保留可解析的旧副本；请先导出并核对，不要清除浏览器数据。' };
      await initializeIndexedSaves(local.saves);
      indexed = await readIndexedSnapshot();
    }
    if (!strictSaveArray(indexed.saves)) {
      return { saves: local.saves, indexedDb: false, warning: '数据库中存在无法校验的存档。原数据未被覆盖，请先备份并核对。' };
    }
    if (local.mirrorRevision > indexed.revision) {
      return { saves: local.saves, indexedDb: false, warning: '本地副本的修订号高于数据库。已暂停自动恢复和写入；请导出当前存档并核对。' };
    }
    const preserved = preserveDamagedRaw(local.damagedRaw);
    // IndexedDB commits before its compatibility mirror. If a tab closed
    // between those writes, the higher durable revision is the recovery copy.
    const mirrorRestored = preserved && restoreLocalMirror(indexed.saves, indexed.revision);
    return {
      saves: indexed.saves,
      indexedDb: true,
      ...(!mirrorRestored ? { warning: '本地兼容副本未能写入；数据库仍保有存档。请尽快导出重要存档。' }
        : local.damagedRaw.length ? { warning: '检测到受损的兼容副本，原文已留在受损备份键中，并从数据库恢复。' } : {}),
    };
  } catch {
    return { saves: readSaves(), indexedDb: false, warning: '数据库暂不可用；请先导出当前可见存档，不要清除浏览器数据。' };
  }
}

export function readLegacyLibraryText(): string | null {
  try { return localStorage.getItem(LEGACY_LIBRARY_STORE); } catch { return null; }
}

export function readDraft(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CHARACTER_DRAFT_STORE) || '{}');
    if (!isRecord(parsed)) return { region: '中州天枢域' };
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
  } catch {
    return { region: '中州天枢域' };
  }
}

export function writeDraft(draft: Record<string, string>): boolean {
  try {
    localStorage.setItem(CHARACTER_DRAFT_STORE, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(CHARACTER_DRAFT_STORE); } catch { /* storage may be disabled */ }
}

export function createSaveId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4'; hex[16] = ((parseInt(hex[16] || '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export const ACTION_DRAFT_PREFIX = 'jiuxiao_1_action_drafts_v2_';
export type ActionDraft = { key: string; text: string; updatedAt: number };
export type ActionDraftSnapshot = { drafts: ActionDraft[]; warning: string };
const draftPrefix = (saveId: string) => `${ACTION_DRAFT_PREFIX}${encodeURIComponent(saveId)}:`;
const legacyDraftKey = (saveId: string) => `jiuxiao_1_action_draft_${saveId}`;
const DRAFT_UNAVAILABLE = '草稿未能可靠保存。当前输入仍保留，请复制备份后再关闭页面。';

/** Immutable keys avoid read/modify/write races and duplicated sessionStorage tab identities. */
export function readActionDraft(saveId: string): ActionDraftSnapshot {
  const drafts: ActionDraft[] = [];
  let warning = '';
  try {
    const prefix = draftPrefix(saveId);
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value) || value.version !== 2 || value.saveId !== saveId
          || typeof value.text !== 'string' || !value.text || value.text.length > 4000
          || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) throw new Error('Invalid draft');
        drafts.push({ key, text: value.text, updatedAt: value.updatedAt });
      } catch { warning = '部分草稿记录损坏，原记录已保留；正式存档未受影响。请核对并复制当前输入。'; }
    }
  } catch { warning = DRAFT_UNAVAILABLE; }
  try {
    const text = sessionStorage.getItem(legacyDraftKey(saveId));
    if (text) drafts.push({ key: legacyDraftKey(saveId), text: text.slice(0, 4000), updatedAt: 0 });
  } catch { warning ||= '旧标签页草稿无法读取，请复制当前输入备份。'; }
  return { drafts: drafts.sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key)), warning };
}

/** Publish first, retire only the exact immutable predecessor, never another editor's new key. */
export function writeActionDraft(saveId: string, text: string, previous?: ActionDraft, editorId = createSaveId()): { draft?: ActionDraft; warning: string; ok: boolean } {
  const limited = text.slice(0, 4000);
  let draft: ActionDraft | undefined;
  try {
    if (!readSaves().some(save => save.saveId === saveId)) return { ok: false, warning: '此存档已删除或暂不可读取，草稿未写入。请复制当前输入备份。' };
    if (limited) {
      draft = { key: `${draftPrefix(saveId)}${editorId}:${createSaveId()}`, text: limited, updatedAt: Date.now() };
      localStorage.setItem(draft.key, JSON.stringify({ version: 2, saveId, text: limited, updatedAt: draft.updatedAt }));
    }
  } catch { return { ok: false, warning: DRAFT_UNAVAILABLE }; }
  // A recovered record can still belong to an active editor in another tab.
  const canRetire = previous && (previous.key.startsWith(`${draftPrefix(saveId)}${editorId}:`) || previous.key === legacyDraftKey(saveId));
  const cleared = canRetire ? clearActionDraft(saveId, previous) : true;
  return { ok: true, ...(draft ? { draft } : {}), warning: cleared ? '' : '新草稿已保存，但旧草稿未能清理；恢复时请核对，避免重复提交。' };
}

export function clearActionDraft(saveId: string, draft: ActionDraft): boolean {
  try {
    if (draft.key === legacyDraftKey(saveId)) {
      const current = sessionStorage.getItem(draft.key);
      if (current !== null && current.slice(0, 4000) !== draft.text) return false;
      sessionStorage.removeItem(draft.key);
    } else if (draft.key.startsWith(draftPrefix(saveId))) localStorage.removeItem(draft.key);
    else return false;
    return true;
  } catch { return false; }
}

/** Delete only after the formal save deletion commits. Stale editors refuse new orphan writes. */
export function deleteActionDrafts(saveId: string): boolean {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith(draftPrefix(saveId))) localStorage.removeItem(key);
    sessionStorage.removeItem(legacyDraftKey(saveId));
    return true;
  } catch { return false; }
}

export function nonNegativeInteger(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}
