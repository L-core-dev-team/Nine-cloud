import {it,expect,vi} from 'vitest';
import {armPageNarrative,pageNarrator} from './page-narrative';
import type {TurnReceipt} from '@jiuxiao/contracts';
const receipt:TurnReceipt={saveId:'fixture',idempotencyKey:'f00a9b36-dff1-4a4d-b810-e28b5eb5d18a',requestFingerprint:`sha256:v1:${'a'.repeat(64)}`,branchId:'root',rulesVersion:'synthetic',clockMinute:0,rng:{seed:null,draws:0},resultingRevision:1,decision:{status:'accepted',outcome:'success',nextRevision:1,events:[{id:'3719acb0-5296-48cd-b806-bc2966110ff7',saveId:'fixture',type:'fixture',branchId:'root',beforeRevision:0,afterRevision:1,occurredAt:'2026-10-01T00:00:00Z',source:'RULES',ruleVersion:'synthetic',payload:{}}]}};
it('consumes only approved saved fields; keeps keys out of prompts/storage and omits deferred drafts',async()=>{
 const config={story:{enabled:true,adapter:'openai-chat' as const,baseUrl:'https://example.invalid/v1',model:'fixture',timeoutSeconds:10,temperature:1.99,maxTokens:99,streaming:true,retryCount:3}};
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  expect(init?.headers).toMatchObject({authorization:'Bearer synthetic-private-key'});
  const body=JSON.parse(String(init?.body));expect(body.max_tokens).toBe(4096);expect(body.stream).toBe(false);expect(body.temperature).toBeUndefined();expect(JSON.stringify(body)).not.toContain('synthetic-private-key');
  return new Response(JSON.stringify({choices:[{message:{content:'已提交事件的叙事'}}],usage:{completion_tokens:7}}));
 }) as unknown as typeof fetch;
 armPageNarrative(config,{story:'synthetic-private-key'});const original=structuredClone(receipt);
 expect(await pageNarrator(fetcher)!(receipt,new AbortController().signal)).toBe('已提交事件的叙事');expect(receipt).toEqual(original);expect(fetcher).toHaveBeenCalledOnce();
 armPageNarrative(config,{});await expect(pageNarrator(fetcher)!(receipt,new AbortController().signal)).rejects.toThrow('NARRATIVE_UNAVAILABLE');expect(fetcher).toHaveBeenCalledOnce();
 armPageNarrative({...config,director:{...config.story}}, {story:'synthetic-private-key'});expect(await pageNarrator(fetcher)!(receipt,new AbortController().signal)).toBe('已提交事件的叙事');
 armPageNarrative({story:{...config.story,enabled:false}},{});expect(pageNarrator()).toBeUndefined();
});
