import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudRequest, CloudHttpError } from './cloud-sync';
import { serializeJsonWithCredentialRedaction } from './export-save';
import { createServer, type Server } from 'node:http';

afterEach(() => vi.unstubAllGlobals());

describe('cloud transport failure boundaries', () => {
  it.each([401, 403, 409, 429, 503])('retains HTTP %s when the error body is interrupted', async status => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('private upstream diagnostic')); } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status })));
    const error = await cloudRequest('/api/auth/session').catch(error => error);
    expect(error).toBeInstanceOf(CloudHttpError);
    expect(error.status).toBe(status);
    expect(error.message).not.toContain('private upstream diagnostic');
  });

  it('retains HTTP status when cancelling an oversized error body rejects', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(4097)); },
      cancel() { throw new Error('private cancel diagnostic'); },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 503 })));
    await expect(cloudRequest('/api/auth/session')).rejects.toMatchObject({ status: 503 });
  });

  it('refuses redirects for requests containing session identity and cloud archives', async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', transport);
    await cloudRequest('/api/saves', 'POST', { privateArchive: 'synthetic-story' }, 'owner-test');
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'include' });
  });

  it('never forwards an archive or owner header to a redirect destination', async () => {
    const originalFetch = globalThis.fetch;
    let destinationRequests = 0;
    const destination = createServer((_request, response) => { destinationRequests++; response.end('{}'); });
    const listen = (server: Server) => new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') { reject(new Error('Missing test server port')); return; }
        resolve(address.port);
      });
    });
    const close = (server: Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
    let origin: Server | undefined;
    try {
      const targetPort = await listen(destination);
      origin = createServer((_request, response) => { response.writeHead(307, { location: `http://127.0.0.1:${targetPort}/collect` }); response.end(); });
      const originPort = await listen(origin);
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => originalFetch(new URL(String(input), `http://127.0.0.1:${originPort}`), init));
      await expect(cloudRequest('/api/saves', 'POST', { privateArchive: 'synthetic-story' }, 'owner-test')).rejects.toThrow();
      expect(destinationRequests).toBe(0);
    } finally {
      if (origin) await close(origin);
      await close(destination);
    }
  });

  it.each(['<html>proxy fallback</html>', '[1,2]', 'null'])('classifies malformed successful responses as invalid data: %s', async text => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(text)));
    await expect(cloudRequest('/api/saves')).rejects.toThrow('INVALID_CLOUD_RESPONSE');
  });

  it('classifies invalid UTF-8 as invalid response, rather than network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]))));
    await expect(cloudRequest('/api/saves')).rejects.toThrow('INVALID_CLOUD_RESPONSE');
  });
});

describe('structured credential export', () => {
  it('redacts session tokens and authentication cookie headers without changing game items', () => {
    const source = { provider: { session_token: 'private-session', headers: { Cookie: 'private-cookie', 'Set-Cookie': 'private-set-cookie' } }, inventory: { cookie: '桂花酥', token: '信物' } };
    const serialized = serializeJsonWithCredentialRedaction(source);
    expect(serialized).not.toContain('private-session');
    expect(serialized).not.toContain('private-cookie');
    expect(serialized).not.toContain('private-set-cookie');
    expect(JSON.parse(serialized).inventory).toEqual(source.inventory);
    expect(source.provider.session_token).toBe('private-session');
  });

  it('redacts OAuth credentials in URL fragments and preserves ordinary anchors', () => {
    const source = { provider: { endpoint: 'https://api.example.invalid/#access_token=private-fragment&view=map', url: 'https://api.example.invalid/#scene-one' } };
    const output = JSON.parse(serializeJsonWithCredentialRedaction(source));
    expect(output.provider.endpoint).not.toContain('private-fragment');
    const fragment = new URLSearchParams(new URL(output.provider.endpoint).hash.slice(1));
    expect(fragment.get('access_token')).toBe('[已移除密钥]');
    expect(fragment.get('view')).toBe('map');
    expect(output.provider.url).toBe(source.provider.url);
    expect(JSON.parse(serializeJsonWithCredentialRedaction({ endpoint: 'https://api.example.invalid/#token' })).endpoint)
      .toBe('https://api.example.invalid/#token');
  });
});
