import {describe, expect, it, vi} from 'vitest';
import {providerAdapter} from './provider-narrative.js';
import type {RoleAdapter} from './narrative-scheduler.js';

const input={role:'story',receipt:{decision:{status:'accepted'}},candidates:{director:'hint'},context:{npcMemories:[]},maxOutputTokens:42} as Parameters<RoleAdapter>[0];
const outputs = {
  'openai-chat':{choices:[{message:{content:'hello'}}],usage:{completion_tokens:2}},
  'openai-responses':{output:[{type:'message',content:[{type:'output_text',text:'hello'}]}],usage:{output_tokens:2}},
  'anthropic-messages':{content:[{type:'text',text:'hello'}],usage:{output_tokens:2}},
  'gemini-content':{candidates:[{content:{parts:[{text:'hello'}]}}],usageMetadata:{candidatesTokenCount:2}},
};
describe('original provider golden fixtures',()=>{
  for (const protocol of Object.keys(outputs) as (keyof typeof outputs)[]) {
    it(protocol,async()=>{
      const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(outputs[protocol]));
      const result=await providerAdapter({protocol,baseUrl:'https://fixture.invalid/v1',model:'synthetic-model',keyEnv:'NARRATIVE_KEY_STORY',temperature:0.5,top_p:0.8},{NARRATIVE_KEY_STORY:'synthetic-key'},fetcher)(input,new AbortController().signal);
      const [url, init]=fetcher.mock.calls[0]!;
      expect({url:String(url),headers:init?.headers,body:JSON.parse(String(init?.body)),redirect:init?.redirect,credentials:init?.credentials,result}).toMatchSnapshot();
    });
    it(`${protocol} errors`,async()=>{
      const cfg={protocol,baseUrl:'https://fixture.invalid',model:'synthetic-model',keyEnv:'NARRATIVE_KEY_STORY'};
      const adapter=providerAdapter(cfg,{NARRATIVE_KEY_STORY:'synthetic-key'},vi.fn<typeof fetch>().mockResolvedValue(new Response('failure',{status:503})));
      await expect(adapter(input,new AbortController().signal)).rejects.toThrow('PROVIDER_UNAVAILABLE');
      const controller=new AbortController();controller.abort();
      await expect(adapter(input,controller.signal)).rejects.toThrow('PROVIDER_CANCELLED');
      expect(()=>providerAdapter({...cfg,baseUrl:'http://fixture.invalid'},{NARRATIVE_KEY_STORY:'synthetic-key'})).toThrow('PROVIDER_HTTPS_REQUIRED');
    });
  }
});
