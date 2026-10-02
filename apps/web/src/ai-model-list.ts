import type { ProtocolId } from './ai-protocols';

export type AvailableModel = { id: string; name: string };
// Requests stay on the explicitly entered host; neither a redirect nor a response
// next_url may receive the user's credential.
export function modelListRequest(protocol: ProtocolId, baseUrl: string, apiKey: string, cursor?: string) {
  const url = new URL(baseUrl.trim());
  if (url.username || url.password || url.search || url.hash ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('请填写无查询参数的 HTTPS API 地址；本机服务可使用 HTTP。');
  }
  let path = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|responses|messages)$/i, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (protocol === 'gemini-content') {
    path = path.replace(/\/v1(beta)?$/i, '') + '/v1beta/models';
    if (apiKey) headers['x-goog-api-key'] = apiKey;
    url.searchParams.set('pageSize', '100');
    if (cursor) url.searchParams.set('pageToken', cursor);
  } else {
    if (!/\/v\d+(beta)?$/i.test(path)) path += '/v1';
    path += '/models';
    if (protocol === 'anthropic-messages') {
      if (apiKey) headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('after_id', cursor);
    } else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  }
  url.pathname = path;
  return { url: url.toString(), headers };
}

export function parseModelList(protocol: ProtocolId, payload: unknown): { models: AvailableModel[]; cursor: string | null } {
  if (!payload || typeof payload !== 'object') throw new Error('型号列表格式无法识别。');
  const body = payload as Record<string, unknown>;
  if (body.error) throw new Error('服务返回错误，未读取型号列表。');
  const rows = protocol === 'gemini-content' ? body.models : body.data;
  if (!Array.isArray(rows)) throw new Error('此接口没有返回支持的型号列表；仍可手动填写 Model ID。');
  if (rows.length > 1000) throw new Error('型号列表过大，读取已中止。');
  const models: AvailableModel[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (protocol === 'gemini-content' && Array.isArray(record.supportedGenerationMethods) && !record.supportedGenerationMethods.includes('generateContent')) continue;
    const rawId = protocol === 'gemini-content' ? record.name : record.id;
    if (typeof rawId !== 'string' || !rawId.trim() || rawId.length > 200 || /[\r\n\x00-\x1f]/.test(rawId)) continue;
    const id = protocol === 'gemini-content' ? rawId.replace(/^models\//, '') : rawId;
    if (!id.trim()) continue;
    const display = record.display_name ?? record.displayName;
    models.push({ id, name: typeof display === 'string' ? display.slice(0, 200) : id });
  }
  const rawCursor = protocol === 'gemini-content' ? body.nextPageToken : protocol === 'anthropic-messages' && body.has_more === true ? body.last_id : null;
  if (protocol === 'anthropic-messages' && body.has_more === true && !rawCursor) throw new Error('分页游标缺失，列表不完整。');
  if (rawCursor != null && (typeof rawCursor !== 'string' || !rawCursor || rawCursor.length > 2048)) throw new Error('分页游标无效。');
  return { models, cursor: typeof rawCursor === 'string' ? rawCursor : null };
}

async function readModelResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('型号列表响应为空。');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0; let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new Error('型号列表响应过大，读取已中止。');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function fetchAvailableModels(protocol: ProtocolId, baseUrl: string, apiKey: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const found = new Map<string, AvailableModel>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const request = modelListRequest(protocol, baseUrl, apiKey, cursor);
    const response = await fetcher(request.url, { headers: request.headers, signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`型号列表返回 HTTP ${response.status}；请检查账号权限或手动填写。`);
    const text = await readModelResponse(response);
    const result = parseModelList(protocol, JSON.parse(text));
    for (const model of result.models) found.set(model.id, model);
    if (found.size > 1000) throw new Error('型号列表超过 1000 项，未将部分列表标为完整。');
    if (!result.cursor) return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (seen.has(result.cursor)) throw new Error('服务重复返回分页游标，读取已中止。');
    seen.add(result.cursor); cursor = result.cursor;
  }
  throw new Error('型号列表超过分页上限，未将部分列表标为完整。');
}
