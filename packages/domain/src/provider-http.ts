/** HTTP mechanics only. The caller owns destination authorization and error policy. */
export async function providerHttp(fetcher: typeof fetch, endpoint: URL, headers: Record<string,string>, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetcher(endpoint, {method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error',credentials:'omit'});
  if (!response.ok) { await response.body?.cancel(); throw new Error('PROVIDER_UNAVAILABLE'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('INVALID_PROVIDER_OUTPUT');
  let text=''; let size=0; const decoder=new TextDecoder('utf-8',{fatal:true});
  try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>1_000_000){await reader.cancel();throw new Error('PROVIDER_RESPONSE_TOO_LARGE');} text+=decoder.decode(value,{stream:true}); } text+=decoder.decode(); }
  finally { reader.releaseLock(); }
  return JSON.parse(text) as unknown;
}
