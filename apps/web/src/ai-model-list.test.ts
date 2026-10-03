import { describe, it, expect, vi } from 'vitest';
import { fetchAvailableModels, modelListRequest, parseModelList } from './ai-model-list';

describe('explicit credential-scoped model discovery', () => {
  it('stops oversized streams by bytes before reading the remaining provider body', async () => {
    const cancel = vi.fn(); let reads = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(1_000_001)); }, cancel,
    }, { highWaterMark: 0 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expect(fetchAvailableModels('openai-chat','https://api.example.test','',new AbortController().signal,fetcher)).rejects.toThrow('响应过大');
    expect(reads).toBe(2); expect(cancel).toHaveBeenCalledOnce();
  });
  it('decodes multibyte names split across streamed chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({data:[{id:'test',display_name:'九霄'}]}));
    const split = bytes.findIndex(value=>value>=0x80)+1;
    const stream = new ReadableStream<Uint8Array>({start(c){c.enqueue(bytes.slice(0,split));c.enqueue(bytes.slice(split));c.close();}});
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    expect(await fetchAvailableModels('openai-chat','https://api.example.test','',new AbortController().signal,fetcher)).toEqual([{id:'test',name:'九霄'}]);
  });
  it('builds native headers and paths without putting credentials in URLs', () => {
    for (const protocol of ['openai-chat', 'openai-responses', 'anthropic-messages', 'gemini-content'] as const) {
      const request = modelListRequest(protocol, 'https://api.example.test/v1', 'fixture-key');
      expect(request.url).not.toContain('fixture-key');
      expect(new URL(request.url).pathname).toBe(protocol === 'gemini-content' ? '/v1beta/models' : '/v1/models');
      expect(Object.values(request.headers)).toContain(protocol.startsWith('openai') ? 'Bearer fixture-key' : 'fixture-key');
    }
    expect(modelListRequest('openai-chat', 'https://api.example.test/v1/chat/completions', '').url).toBe('https://api.example.test/v1/models');
  });
  it('rejects remote plain HTTP, URL credentials and secret query parameters', () => {
    for (const address of ['http://api.example.test', 'https://u:p@api.example.test', 'https://api.example.test?key=secret', 'https://api.example.test/#key']) expect(() => modelListRequest('openai-chat', address, '')).toThrow();
    expect(modelListRequest('openai-chat', 'http://127.0.0.1:1234/v1', '').url).toContain('/v1/models');
  });
  it('filters non-generative Gemini models and rejects false success envelopes', () => {
    expect(parseModelList('gemini-content', { models: [{ name: 'models/chat', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }).models.map(item => item.id)).toEqual(['chat']);
    expect(() => parseModelList('openai-chat', { error: { message: 'private' }, data: [] })).toThrow();
    expect(() => parseModelList('anthropic-messages', { data: [], has_more: true })).toThrow('游标');
  });
  it('follows only opaque cursors on the configured host; de-duplicates IDs', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'a' }], has_more: true, last_id: 'a', next_url: 'https://evil.test' })));
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }], has_more: false })));
    expect((await fetchAvailableModels('anthropic-messages', 'https://api.example.test', 'fixture-key', new AbortController().signal, fetcher)).map(item => item.id)).toEqual(['a', 'b']);
    expect(fetcher.mock.calls[1]![0]).toBe('https://api.example.test/v1/models?limit=100&after_id=a');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
  });
  it('rejects repeated cursors and keeps provider error bodies private', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ models: [{ name: 'models/a' }], nextPageToken: 'same' })));
    await expect(fetchAvailableModels('gemini-content', 'https://api.example.test', '', new AbortController().signal, fetcher)).rejects.toThrow('重复');
    const failing = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret body', { status: 401 }));
    await expect(fetchAvailableModels('openai-chat', 'https://api.example.test', '', new AbortController().signal, failing)).rejects.toThrow('HTTP 401');
  });
});
