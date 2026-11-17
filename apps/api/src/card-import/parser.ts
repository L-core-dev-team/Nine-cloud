import { createHash } from 'node:crypto';
import { DomainEventSchema } from '@jiuxiao/contracts';

export const FILE_LIMIT = 8 * 1024 * 1024;
export const JSON_LIMIT = 256_000;
export class CardError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
export function json(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.length > JSON_LIMIT) throw new CardError('JSON_TOO_LARGE', 413);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new CardError('INVALID_JSON'); }
  // Reuse the existing generic JSON depth/node/size guard exposed on payload.
  // This validates data only; no DomainEvent is created or accepted here.
  if (!record(value) || !DomainEventSchema.shape.payload.safeParse(value).success) throw new CardError('JSON_BOUNDS');
  // PostgreSQL JSONB cannot represent NUL or unpaired surrogates. Keep raw bytes,
  // but reject their parsed projection explicitly rather than failing persistence.
  const pending: unknown[] = [value];
  while (pending.length) {
    const v = pending.pop();
    if (typeof v === 'string' && (v.includes('\0') || Buffer.from(v).toString('utf8') !== v)) throw new CardError('UNSUPPORTED_JSON_TEXT');
    if (Array.isArray(v)) pending.push(...v);
    else if (record(v)) pending.push(...Object.keys(v), ...Object.values(v));
  }
  return value;
}
export function base64(text: string, limit = FILE_LIMIT): Buffer {
  if (text.length > Math.ceil(limit / 3) * 4 || text.length % 4 || /[^A-Za-z0-9+/=]/.test(text)) throw new CardError('INVALID_BASE64');
  const out = Buffer.from(text, 'base64');
  if (out.length > limit || out.toString('base64') !== text) throw new CardError('INVALID_BASE64');
  return out;
}
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export type ParsedFile = { kind: 'card' | 'worldbook' | 'attachment'; format: string; document: Record<string, unknown> | null; name: string; warnings: string[]; assetRefs: string[] };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function pngDocument(bytes: Buffer): Record<string, unknown> {
  if (!bytes.subarray(0, 8).equals(signature)) throw new CardError('INVALID_PNG');
  let offset = 8, chunks = 0, ended = false, imageData = false;
  const cards = new Map<string, Buffer>();
  while (offset < bytes.length) {
    if (++chunks > 2048 || offset + 12 > bytes.length) throw new CardError('INVALID_PNG');
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length) throw new CardError('INVALID_PNG');
    const type = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new CardError('PNG_CRC');
    if (chunks === 1 && (type !== 'IHDR' || size !== 13 || data.readUInt32BE(0) === 0 || data.readUInt32BE(4) === 0)) throw new CardError('INVALID_PNG');
    if (type === 'IDAT') imageData = true;
    if (type === 'tEXt') {
      const separator = data.indexOf(0), key = data.subarray(0, separator).toString('latin1');
      if (separator > 0 && (key === 'chara' || key === 'ccv3')) {
        if (cards.has(key)) throw new CardError('DUPLICATE_CARD_CHUNK');
        cards.set(key, base64(data.subarray(separator + 1).toString('latin1'), JSON_LIMIT));
      }
    }
    offset = end;
    if (type === 'IEND') { if (size || offset !== bytes.length) throw new CardError('INVALID_PNG'); ended = true; break; }
  }
  if (!ended || !imageData) throw new CardError('INVALID_PNG');
  const content = cards.get('ccv3') ?? cards.get('chara');
  if (!content) throw new CardError('PNG_CARD_METADATA_NOT_SUPPORTED');
  const parsed = json(content);
  if (cards.has('ccv3') && parsed.spec !== 'chara_card_v3') throw new CardError('PNG_VERSION_MISMATCH');
  return parsed;
}
export function parseFile(bytes: Buffer, kind: ParsedFile['kind']): ParsedFile {
  if (!bytes.length || bytes.length > FILE_LIMIT) throw new CardError('FILE_SIZE', 413);
  if (kind === 'attachment') return { kind, format: 'opaque', document: null, name: '', warnings: ['DOWNLOAD_ONLY_NO_EXECUTION'], assetRefs: [] };
  const doc = bytes.subarray(0, 8).equals(signature) ? pngDocument(bytes) : json(bytes);
  if (kind === 'worldbook') {
    if (!(Array.isArray(doc.entries) || record(doc.entries))) throw new CardError('UNSUPPORTED_WORLDBOOK');
    return { kind, format: 'worldbook-json', document: doc, name: typeof doc.name === 'string' ? doc.name : '', warnings: ['UNTRUSTED_EXTERNAL_CONTENT'], assetRefs: [] };
  }
  let data = doc, format = 'v1';
  if (doc.spec !== undefined) {
    if (!((doc.spec === 'chara_card_v2' && doc.spec_version === '2.0') || (doc.spec === 'chara_card_v3' && doc.spec_version === '3.0'))) throw new CardError('UNSUPPORTED_CARD_VERSION');
    if (!record(doc.data)) throw new CardError('INVALID_CARD');
    data = doc.data; format = doc.spec === 'chara_card_v3' ? 'v3' : 'v2';
  }
  for (const key of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example']) if (typeof data[key] !== 'string') throw new CardError('INVALID_CARD_FIELDS');
  if (!(data.name as string).trim() || (data.name as string).length > 256) throw new CardError('INVALID_CARD_NAME');
  const refs: string[] = [];
  if (Array.isArray(data.assets)) for (const asset of data.assets) if (record(asset) && typeof asset.uri === 'string') refs.push(asset.uri);
  return { kind, format, document: doc, name: data.name as string, warnings: ['UNTRUSTED_EXTERNAL_CONTENT', 'EXTENSIONS_RETAINED_NOT_EXECUTED', ...(refs.length ? ['ASSETS_REQUIRE_EXPLICIT_BINDING'] : [])], assetRefs: refs };
}
