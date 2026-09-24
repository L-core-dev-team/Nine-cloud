import { readIndexedSaves, replaceIndexedSaves } from './idb';

export const SAVE_STORE = 'jiuxiao_1_local_saves';
export const LEGACY_LIBRARY_STORE = 'jiuxiao_v1_library';
export const CHARACTER_DRAFT_STORE = 'jiuxiao_1_character_draft';

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
  pending?: unknown;
  legacySupplement?: Record<string, unknown>;
  /** Lossless parsed copy of a legacy record. Never treated as authoritative rules state. */
  legacyArchive?: { sourceFormat: string; sourceVersion: number | null; payload: Record<string, unknown> };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocalSave(value: unknown): value is LocalSave {
  if (!isRecord(value)) return false;
  const valid = value.schemaVersion === 1 && typeof value.saveId === 'string' && value.saveId.length > 0
    && typeof value.name === 'string' && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string' && typeof value.revision === 'number'
    && Number.isInteger(value.revision) && value.revision >= 0
    && typeof value.canonVersion === 'string' && typeof value.ruleVersion === 'string'
    && typeof value.memoryPolicyVersion === 'string' && isRecord(value.character)
    && typeof value.location === 'string' && value.status === 'pending_rules'
    && Array.isArray(value.messages);
  if (!valid) return false;
  if (value.legacySupplement !== undefined && !isRecord(value.legacySupplement)) return false;
  if (value.legacyArchive !== undefined) {
    if (!isRecord(value.legacyArchive) || typeof value.legacyArchive.sourceFormat !== 'string' || !isRecord(value.legacyArchive.payload)) return false;
    const version = value.legacyArchive.sourceVersion;
    if (version !== null && (!Number.isSafeInteger(version) || (version as number) < 0)) return false;
  }
  return true;
}

export function readSaves(): LocalSave[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVE_STORE) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isLocalSave) : [];
  } catch {
    return [];
  }
}

export function writeSaves(saves: LocalSave[]): boolean {
  try {
    localStorage.setItem(SAVE_STORE, JSON.stringify(saves));
    void replaceIndexedSaves(saves).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export async function hydrateSaves(): Promise<{ saves: LocalSave[]; indexedDb: boolean }> {
  try {
    const localRaw = localStorage.getItem(SAVE_STORE);
    const local = readSaves();
    const indexed = (await readIndexedSaves()).filter(isLocalSave);
    // localStorage is the compatibility source for the current slice. It is
    // written before the IndexedDB mirror, so it must win when both exist.
    // IndexedDB is used as a recovery source only when the compatibility key
    // is empty; this avoids resurrecting an intentionally cleared local key.
    if (local.length || localRaw !== null) {
      await replaceIndexedSaves(local);
      return { saves: local, indexedDb: true };
    }
    return { saves: indexed, indexedDb: true };
  } catch {
    return { saves: readSaves(), indexedDb: false };
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

export function nonNegativeInteger(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}
