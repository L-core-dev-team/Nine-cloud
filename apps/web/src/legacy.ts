import { LegacySaveFileSchema, type LegacySavePayload } from '@jiuxiao/contracts';
import { createSaveId, isLocalSave, nonNegativeInteger, type LocalSave } from './storage';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** SEC-09: imported save ids must be safe for /game/<id> routes, storage keys and cloud paths. */
const SAVE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
function sanitizeLegacySaveId(value: unknown): string {
  const candidate = textOrFallback(value, '');
  return SAVE_ID_PATTERN.test(candidate) ? candidate : createSaveId();
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

type ParsedLegacyPayload = { payload: LegacySavePayload; sourceFormat: string; sourceVersion: number | null };

function payloadFromText(file: File, text: string): ParsedLegacyPayload {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  if (parsed !== undefined) {
    const result = LegacySaveFileSchema.safeParse(parsed);
    if (!result.success) throw new Error('JSON legacy save failed schema validation');
    const value = result.data as unknown as Record<string, unknown>;
    if (isRecord(value.save)) return { payload: value.save as LegacySavePayload, sourceFormat: 'JIUXIAO_SAVE', sourceVersion: typeof value.version === 'number' ? value.version : null };
    return { payload: value as LegacySavePayload, sourceFormat: 'JIUXIAO_LEGACY_JSON', sourceVersion: null };
  }
  if (/\.json$/i.test(file.name)) throw new Error('JSON legacy save is malformed');
  const plain = extractPlainText(text);
  if (!plain) throw new Error('Legacy file has no readable text');
  return { payload: { name: file.name.replace(/\.(html?|txt)$/i, '') || '导入旧局', messages: [plain] }, sourceFormat: 'JIUXIAO_LEGACY_TEXT', sourceVersion: null };
}

export function parseLegacySave(file: File, text: string): LocalSave {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Legacy file exceeds 20 MiB import limit');
  const parsed = payloadFromText(file, text);
  const raw = parsed.payload;
  const now = new Date().toISOString();
  if (parsed.sourceFormat === 'JIUXIAO_SAVE' && parsed.sourceVersion === 1 && raw.revision !== undefined
    && (!Number.isSafeInteger(raw.revision) || raw.revision < 0)) throw new Error('Invalid native save revision');
  if (parsed.sourceFormat === 'JIUXIAO_SAVE' && parsed.sourceVersion === 1 && isLocalSave(raw)) {
    // SEC-09: a legacy saveId must not carry route/storage meta-characters; an
    // invalid one is replaced with a freshly generated client-side id.
    const saveId = typeof raw.saveId === 'string' && SAVE_ID_PATTERN.test(raw.saveId) ? raw.saveId : createSaveId();
    return {
      schemaVersion: 1, saveId, name: raw.name, createdAt: raw.createdAt,
      updatedAt: now, revision: raw.revision,
      canonVersion: 'legacy-unverified', ruleVersion: 'rules-not-signed',
      memoryPolicyVersion: 'legacy-unknown', character: raw.character,
      location: raw.location, status: 'pending_rules', messages: raw.messages,
      ...(raw.pending === undefined ? {} : { pending: raw.pending }),
      ...(raw.pendingQueue === undefined ? {} : { pendingQueue: raw.pendingQueue }),
      ...(raw.legacySupplement === undefined ? {} : { legacySupplement: raw.legacySupplement }),
      legacyArchive: raw.legacyArchive ?? {
        sourceFormat: 'JIUXIAO_SAVE',
        sourceVersion: 1,
        payload: raw as unknown as Record<string, unknown>,
      },
    };
  }
  const character = isRecord(raw.character) ? raw.character : isRecord(raw.player) ? raw.player : {};
  const world = isRecord(raw.world) ? raw.world : {};
  const id = sanitizeLegacySaveId(raw.saveId ?? raw.id);
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
    ...(raw.pending === undefined ? {} : { pending: raw.pending }),
    legacyArchive: { sourceFormat: parsed.sourceFormat, sourceVersion: parsed.sourceVersion, payload: raw as Record<string, unknown> },
  };
  const supplement = supplementOf(raw);
  if (supplement) save.legacySupplement = supplement;
  return save;
}

export function migrateLegacyLibraryText(text: string): LocalSave[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Legacy library is not JSON'); }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.saves)) {
    throw new Error('Legacy library shape is unsupported');
  }
  return parsed.saves.map((entry, index) => {
    const source = JSON.stringify(entry);
    return parseLegacySave(new File([source], `legacy-save-${index}.json`, { type: 'application/json' }), source);
  });
}
