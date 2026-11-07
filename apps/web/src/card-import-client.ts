import { apiRequestUrl } from './api-url';

// This transport follows the existing cloud identity and URL boundary. Card routes
// also return arrays, 204 and binary data, so cloudRequest cannot consume them.
export class CardHttpError extends Error {
  constructor(readonly status: number, readonly code?: string) { super(`CARD_HTTP_${status}`); }
}
export type ParsedCardFile = { kind: string; format: string; document: Record<string, unknown> | null; name: string; warnings: string[]; assetRefs: string[] };
export type ImportItem = { id: string; filename: string; kind: string; error: string | null; sha256: string; parsed?: ParsedCardFile | null; duplicate?: boolean };
export type CardItem = { name?: string; id: string; import_id: string; parent_id: string | null; metadata: { source: string; notes: string; links: { importId: string; uri: string }[] }; parsed?: ParsedCardFile };
export type SessionItem = { id: string; card_id: string; revision: number; greeting?: string };
export type PersonaItem = { id: string; version_id: string; name: string; is_default: boolean };
export type RecentRequest = RequestItem & { action: string; expected_revision: number };
export type HistoryItem = { key: string; action: string; narrative: string; resulting_revision: number };
export type RequestItem = { key: string; status: 'unknown' | 'pending' | 'completed' | 'failed'; error?: string | null; narrative?: string | null; resulting_revision?: number | null; expires_at?: string | null };

async function bytesBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) { await reader.cancel(); throw new Error('CARD_RESPONSE_TOO_LARGE'); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export class CardImportClient {
  constructor(readonly owner: string, readonly signal?: AbortSignal) { if (!owner.trim()) throw new Error('AUTH_REQUIRED'); }
  private async request(path: string, method = 'GET', body?: unknown, kind: 'json' | 'empty' | 'binary' = 'json'): Promise<unknown> {
    const deadline = AbortSignal.timeout(35_000);
    const response = await fetch(apiRequestUrl(`/api/card-import${path}`), {
      method, credentials: 'include', cache: 'no-store', signal: this.signal ? AbortSignal.any([deadline, this.signal]) : deadline,
      headers: { 'x-jiuxiao-account': this.owner, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const identity = await fetch(apiRequestUrl('/api/auth/session'), {credentials:'include',cache:'no-store',...(this.signal?{signal:this.signal}:{})});
    const current = identity.ok ? await identity.json() as {account?:{id?:string}} : null;
    if(current?.account?.id !== this.owner) throw new CardHttpError(401,'ACCOUNT_MISMATCH');
    if (!response.ok) {
      let data: unknown; try { data = JSON.parse(new TextDecoder().decode(await bytesBounded(response, 4096))); } catch { data = null; }
      const value = object(data) ? data.error : undefined;
      throw new CardHttpError(response.status, typeof value === 'string' && /^[A-Z_]{1,60}$/.test(value) ? value : undefined);
    }
    if (kind === 'empty') { if (response.status !== 204) throw new Error('INVALID_CARD_RESPONSE'); return; }
    // History can contain 100 long actions and responses. JSON escaping may
    // expand the wire representation beyond the original character counts.
    const bytes = await bytesBounded(response, kind === 'binary' ? 8 * 1024 * 1024 : path.includes('/history?') ? 32_000_000 : 4_000_000);
    if (kind === 'binary') return bytes;
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  }
  private async list<T>(path: string): Promise<T[]> { const value = await this.request(path); if (!Array.isArray(value)) throw new Error('INVALID_CARD_RESPONSE'); return value as T[]; }
  private async item<T>(path: string, method = 'GET', body?: unknown): Promise<T> { const value = await this.request(path, method, body); if (!object(value)) throw new Error('INVALID_CARD_RESPONSE'); return value as T; }
  imports() { return this.list<ImportItem>('/imports'); }
  import(id: string) { return this.item<ImportItem>(`/imports/${encodeURIComponent(id)}`); }
  async upload(file: File, kind: 'card' | 'worldbook' | 'attachment') {
    if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('FILE_SIZE');
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return this.item<ImportItem>('/imports', 'POST', { filename: file.name, kind, bytesBase64: btoa(binary), rightsConfirmed: true });
  }
  cards() { return this.list<CardItem>('/cards'); }
  async library(query:string,after?:string){const params=new URLSearchParams({q:query});if(after)params.set('after',after);const value=await this.item<{items:CardItem[];nextCursor:string|null}>(`/library/page?${params}`);if(!Array.isArray(value.items)||!(value.nextCursor===null||typeof value.nextCursor==='string'))throw new Error('INVALID_CARD_RESPONSE');return value;}
  card(id: string) { return this.item<CardItem>(`/cards/${encodeURIComponent(id)}`); }
  confirm(input: { importId: string; parentId: string | null; source: string; notes: string; links: { importId: string; uri: string }[] }) { return this.item<CardItem>('/cards', 'POST', input); }
  sessions() { return this.list<SessionItem>('/sessions'); }
  personas() { return this.list<PersonaItem>('/personas'); }
  createSession(id: string, cardId: string, options: {personaVersionId?:string|null;greetingIndex:number;recursiveWorldbook:boolean}) { return this.item<SessionItem>('/sessions', 'POST', { id, cardId, ...options }); }
  requests(id:string) { return this.list<RecentRequest>(`/sessions/${encodeURIComponent(id)}/requests`); }
  session(id: string) { return this.item<SessionItem>(`/sessions/${encodeURIComponent(id)}`); }
  history(id: string, after: number) { return this.list<HistoryItem>(`/sessions/${encodeURIComponent(id)}/history?after=${after}`); }
  action(id: string, body: { idempotencyKey: string; expectedRevision: number; action: string }) { return this.item<RequestItem>(`/sessions/${encodeURIComponent(id)}/actions`, 'POST', body); }
  requestStatus(id: string, key: string) { return this.item<RequestItem>(`/sessions/${encodeURIComponent(id)}/requests/${encodeURIComponent(key)}`); }
  recover(id: string, key: string) { return this.item<RequestItem>(`/sessions/${encodeURIComponent(id)}/requests/${encodeURIComponent(key)}/recover`, 'POST'); }
  async remove(type: 'imports' | 'cards' | 'sessions', id: string) { await this.request(`/${type}/${encodeURIComponent(id)}`, 'DELETE', undefined, 'empty'); }
  async original(id: string) { return await this.request(`/imports/${encodeURIComponent(id)}/original`, 'GET', undefined, 'binary') as Uint8Array; }
}

export function cardError(error: unknown): string {
  if (error instanceof CardHttpError) {
    const messages: Record<string, string> = { AUTH_REQUIRED: '请重新登录。', ACCOUNT_MISMATCH: '账号已变化，请重新打开角色卡。', ORIGIN_REJECTED: '请求来源不被允许。', NOT_FOUND: '资料不存在或不属于当前账号。', RESOURCE_IN_USE: '资料仍被其他卡片或版本引用，不能删除。', CONFIRMATION_CONFLICT: '该导入项已有不同的确认结果，请核对已有卡片。', MISSING_OR_DUPLICATE_ASSET: '请为每个资源地址选择对应的导入文件。', ATTACHMENT_NOT_FOUND: '绑定的附件不可用，请重新选择。', MODEL_NOT_CONFIGURED: '角色卡模型尚未配置。', REQUEST_PENDING: '此会话已有待处理请求；如原请求标识已丢失，目前无法在此页面恢复。', REVISION_CONFLICT: '会话已更新，请重新读取历史。', RATE_LIMITED: '请求过于频繁，请稍后再试。', IMPORT_QUOTA: '导入空间已满。', SESSION_QUOTA: '会话数量已达上限。', CARD_NOT_READY: '此文件无法确认为角色卡。' };
    return (error.code && messages[error.code]) || `请求未完成（${error.code || error.status}）。`;
  }
  return error instanceof Error && error.message === 'FILE_SIZE' ? '请选择不超过 8 MiB 的非空文件。' : '请求未完成，请检查网络后核对结果。';
}
