import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardHttpError, CardImportClient, cardError } from './card-import-client';

afterEach(() => vi.unstubAllGlobals());
function stubCards(handler:(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>){const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>String(url).includes('/api/auth/session')?new Response(JSON.stringify({account:{id:'owner-a'}})):handler(url,init));vi.stubGlobal('fetch',fetcher);return fetcher;}
describe('card API transport', () => {
  it('accepts array responses and passes the authenticated account hint', async () => {
    const fetcher = stubCards(async()=>new Response(JSON.stringify([{id:'x'}])));
    expect(await new CardImportClient('owner-a').imports()).toEqual([{ id: 'x' }]);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', cache: 'no-store', headers: { 'x-jiuxiao-account': 'owner-a' } });
  });
  it('accepts 204 and bounded binary originals', async () => {
    let n=0; stubCards(async()=>n++===0?new Response(null,{status:204}):new Response(new Uint8Array([0,1,255])));
    const client = new CardImportClient('owner-a'); await expect(client.remove('sessions', 'x')).resolves.toBeUndefined();
    expect(Array.from(await client.original('x'))).toEqual([0, 1, 255]);
  });
  it('reads the card error field and distinguishes auth, rate and account errors', async () => {
    for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'ACCOUNT_MISMATCH'], [429, 'RATE_LIMITED']] as const) {
      stubCards(async()=>new Response(JSON.stringify({error:code}),{status}));
      let caught: unknown; try { await new CardImportClient('owner-a').cards(); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(CardHttpError); expect(caught).toMatchObject({ status, code }); expect(cardError(caught)).not.toContain(String(status));
    }
  });
  it('rejects oversized or malformed responses and oversized files', async () => {
    let n=0;stubCards(async()=>n++===0?new Response('[]'):new Response(new Uint8Array(8*1024*1024+1)));
    const client = new CardImportClient('owner-a'); await expect(client.card('x')).rejects.toThrow('INVALID_CARD_RESPONSE');
    await expect(client.original('x')).rejects.toThrow('CARD_RESPONSE_TOO_LARGE');
    const file = { size: 8 * 1024 * 1024 + 1 } as File; await expect(client.upload(file, 'card')).rejects.toThrow('FILE_SIZE');
  });
  it('rejects a delayed card response after the active account changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url:RequestInfo|URL)=>String(url).includes('/api/auth/session') ? new Response(JSON.stringify({account:{id:'owner-b'}})) : new Response(JSON.stringify([{id:'private-to-a'}]))));
    await expect(new CardImportClient('owner-a').cards()).rejects.toMatchObject({status:401,code:'ACCOUNT_MISMATCH'});
  });
  it('returns bounded safe error metadata for non-JSON proxy failures', async () => {
    stubCards(async()=>new Response('private proxy details',{status:503}));
    let caught: unknown; try { await new CardImportClient('owner-a').cards(); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ status: 503, code: undefined }); expect(cardError(caught)).not.toContain('private proxy details');
  });
});
