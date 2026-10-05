import {it,expect,vi} from 'vitest';
import {providerAdapter} from './provider-narrative.js';
import type {RoleAdapter} from './narrative-scheduler.js';
const input={role:'story',receipt:{decision:{status:'accepted'}},candidates:{director:'untrusted hints'},context:{npcMemories:[]},maxOutputTokens:10} as Parameters<RoleAdapter>[0];
it('dispatches four protocols with a whitelist and consumes only presentation output',async()=>{
 for(const protocol of ['openai-chat','openai-responses','anthropic-messages','gemini-content'] as const){
  const payload=protocol==='openai-chat'?{choices:[{message:{content:'story'}}],usage:{completion_tokens:2}}:protocol==='openai-responses'?{output:[{type:'message',content:[{type:'output_text',text:'story'}]}],usage:{output_tokens:2}}:protocol==='anthropic-messages'?{content:[{type:'thinking',text:'private'},{type:'text',text:'story'}],usage:{output_tokens:2}}:{candidates:[{content:{parts:[{thought:true,text:'private'},{text:'story'}]}}],usageMetadata:{candidatesTokenCount:2}};
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
  const adapter=providerAdapter({protocol,baseUrl:'https://provider.example.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY',temperature:0.5,...{unknown:'not transmitted'}},{NARRATIVE_KEY_STORY:'fixture-secret'},fetcher);
  expect(await adapter(input,new AbortController().signal)).toEqual({text:'story',outputTokens:2});
  const call=fetcher.mock.calls[0]!;expect(String(call[0])).not.toContain('fixture-secret');expect(call[1]).toMatchObject({redirect:'error',credentials:'omit'});expect(call[1]?.body).not.toContain('not transmitted');
 }
});
it('sends only the filtered NPC recall context as presentation input',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{message:{content:'story'}}]}));
 const adapter=providerAdapter({protocol:'openai-chat',baseUrl:'https://provider.example.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY'},{NARRATIVE_KEY_STORY:'synthetic'},fetcher);
 const summary='topicTag=obstacle_rockslide;outcome=refuse';
 await adapter({...input,context:{npcMemories:[{npcId:'npc_cenjiu',observations:[{summary,accessibility:0.35}]}],playerConditionLines:['手在抖'],npcUtterances:[{npcId:'npc_cenjiu',line:'肩上怎么了'}]}},new AbortController().signal);
 const body=JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {messages?:{content?:string}[]};
 expect(body.messages?.[0]?.content).toContain(summary);
 expect(body.messages?.[0]?.content).toContain('playerConditionLines');
 expect(body.messages?.[0]?.content).toContain('肩上怎么了');
 expect(body.messages?.[0]?.content).toContain('按 NPC 授权');
});
it('fails closed for missing keys, non-HTTPS endpoints, invalid JSON and invalid usage',async()=>{
 const config={protocol:'openai-chat' as const,baseUrl:'https://provider.example.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY'};
 expect(()=>providerAdapter(config,{})).toThrow('CREDENTIAL');expect(()=>providerAdapter({...config,baseUrl:'http://provider.example.invalid'},{NARRATIVE_KEY_STORY:'x'})).toThrow('HTTPS');
 for(const response of [new Response('invalid JSON'),Response.json({choices:[{message:{content:'story'}}],usage:{completion_tokens:'2'}}),Response.json({error:{message:'private'}})]){
  await expect(providerAdapter(config,{NARRATIVE_KEY_STORY:'x'},vi.fn<typeof fetch>().mockResolvedValue(response))(input,new AbortController().signal)).rejects.toThrow('PROVIDER_UNAVAILABLE');
 }
});

it('keeps missing usage unknown and bounds provider context before dispatch',async()=>{
 const config={protocol:'openai-chat' as const,baseUrl:'https://example.invalid',model:'fixture',keyEnv:'NARRATIVE_KEY_STORY'};
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{message:{content:'story'}}]})),adapter=providerAdapter(config,{NARRATIVE_KEY_STORY:'synthetic'},fetcher);
 expect(await adapter(input,new AbortController().signal)).toEqual({text:'story',outputTokens:null});
 await expect(adapter({...input,candidates:{director:'x'.repeat(100001)}},new AbortController().signal)).rejects.toThrow('CONTEXT_TOO_LARGE');expect(fetcher).toHaveBeenCalledOnce();
});
