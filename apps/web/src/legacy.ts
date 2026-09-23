import { LegacySaveFileSchema, type LegacySavePayload } from '@jiuxiao/contracts';
import { createSaveId, nonNegativeInteger, type LocalSave } from './storage';

export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function extractPlainText(text: string): string {
  return text.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
}

function supplementOf(raw: LegacySavePayload): Record<string, unknown> | undefined {
  const keys = ['status', 'intel', 'memory', 'facts', 'items', 'npcs', 'events', 'actions', 'stm', 'ltm', 'pending'];
  const supplement = Object.fromEntries(keys.filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
  return Object.keys(supplement).length ? supplement : undefined;
}

function payloadFromText(file: File, text: string): LegacySavePayload {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  if (parsed !== undefined) {
    const result = LegacySaveFileSchema.safeParse(parsed);
    if (!result.success) throw new Error('JSON legacy save failed schema validation');
    const value = result.data as unknown as Record<string, unknown>;
    return isRecord(value.save) ? value.save as LegacySavePayload : value as LegacySavePayload;
  }
  const plain = extractPlainText(text);
  if (!plain) throw new Error('Legacy file has no readable text');
  return { name: file.name.replace(/\.(html?|txt)$/i, '') || '导入旧局', messages: [plain] };
}

export function parseLegacySave(file: File, text: string): LocalSave {
  const raw = payloadFromText(file, text);
  const now = new Date().toISOString();
  const character = isRecord(raw.character) ? raw.character : isRecord(raw.player) ? raw.player : {};
  const world = isRecord(raw.world) ? raw.world : {};
  const id = textOrFallback(raw.saveId ?? raw.id, createSaveId());
  const name = textOrFallback(raw.name ?? character.name ?? character['姓名'], '导入旧局');
  const location = textOrFallback(raw.location ?? world.location, '中州天枢域');
  const save: LocalSave = {
    schemaVersion: 1,
    saveId: id,
    name,
    createdAt: textOrFallback(raw.createdAt ?? raw.created, now),
    updatedAt: now,
    revision: nonNegativeInteger(raw.revision ?? raw.turn),
    canonVersion: 'legacy-unverified',
    ruleVersion: 'rules-not-signed',
    memoryPolicyVersion: 'legacy-unknown',
    character,
    location,
    status: 'pending_rules',
    messages: Array.isArray(raw.messages) ? raw.messages : [],
  };
  const supplement = supplementOf(raw);
  if (supplement) save.legacySupplement = supplement;
  return save;
}
