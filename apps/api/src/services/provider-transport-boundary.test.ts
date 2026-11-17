import {expect,it,vi} from 'vitest';
import {createProviderTransport} from '@jiuxiao/domain/provider-narrative';
const config={protocol:'openai-chat' as const,baseUrl:'https://fixture.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY'};
const input={mode:'legacy' as const,prompt:'test',maxOutputTokens:10};
it('fails closed on large responses, broken JSON, HTTP errors and malformed usage',async()=>{
 for(const response of [new Response('x'.repeat(1_000_001)),new Response('{'),new Response('private',{status:500}),Response.json({choices:[{message:{content:'x'}}],usage:{completion_tokens:11}})]) {
  const transport=createProviderTransport(config,{NARRATIVE_KEY_STORY:'synthetic'},vi.fn<typeof fetch>().mockResolvedValue(response));
  await expect(transport(input,new AbortController().signal)).rejects.toThrow('PROVIDER_UNAVAILABLE');
 }
});
it('passes cancellation to fetch and redacts errors',async()=>{
 const controller=new AbortController();
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_url,options)=>{expect(options?.signal).toBe(controller.signal);controller.abort();throw new Error('synthetic-secret');});
 const transport=createProviderTransport(config,{NARRATIVE_KEY_STORY:'synthetic'},fetcher);
 await expect(transport(input,controller.signal)).rejects.toThrow('PROVIDER_CANCELLED');
});
