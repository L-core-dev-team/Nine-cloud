import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCardAvailability } from './card-availability';

afterEach(() => vi.unstubAllGlobals());
describe('card host capability', () => {
  it('requires the explicit boolean and uses the existing bounded authenticated transport', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ cardImport: true })));
    vi.stubGlobal('fetch', fetcher);
    expect(await readCardAvailability()).toBe(true);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/auth/providers');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', cache: 'no-store', redirect: 'error' });
  });
  it.each([{}, { cardImport: false }, { cardImport: 'true' }, { cardImport: 1 }])('fails closed for absent or malformed capabilities %j', async value => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(value)));
    expect(await readCardAvailability()).toBe(false);
  });
  it.each([401, 404, 503])('fails closed for HTTP %i', async status => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status }));
    expect(await readCardAvailability()).toBe(false);
  });
  it('rejects network failures, oversized/invalid JSON and an aborted late response', async () => {
    vi.stubGlobal('fetch', async () => { throw Error('offline'); });
    expect(await readCardAvailability()).toBe(false);
    for (const body of ['not-json', JSON.stringify({cardImport: true, padding: 'x'.repeat(4096)})]) {
      vi.stubGlobal('fetch', async () => new Response(body));
      expect(await readCardAvailability()).toBe(false);
    }
    const abort = new AbortController();
    vi.stubGlobal('fetch', async () => { abort.abort(); return new Response('{"cardImport":true}'); });
    expect(await readCardAvailability(abort.signal)).toBe(false);
  });
});
