import { describe,it,expect,vi } from 'vitest';
import { createProviderTransport } from '@jiuxiao/domain/provider-narrative';
import { createCardModel } from './card-model-provider.js';
import { CARD_MODELS,cardInputTokens,cardFitsBudget } from './model-budget.js';
import { validateLocalProvider } from './local-provider.js';
const input=(content:string)=>({instructions:'trusted',character:{},worldbooks:[],history:[],action:content,messages:[{role:'system' as const,content:'trusted'},{role:'user' as const,content}]});
describe('fixed local text budget',()=>{
 it('counts final role/content framing, including Unicode and special-token-looking untrusted text',()=>{
  expect(cardInputTokens(input('hello'))).toBeGreaterThan(5);
  expect(cardInputTokens(input('中文 😀 <|endoftext|>'))).toBeGreaterThan(cardInputTokens(input('hello')));
 });
 it('bounds reserved output + conservative margin, not characters/4',()=>{
  const x=input('hello'),n=cardInputTokens(x);
  expect(cardFitsBudget(x,n+1024+100,100)).toBe(true);
  expect(cardFitsBudget(x,n+1024+99,100)).toBe(false);
  expect(cardFitsBudget(input('长'.repeat(4000)),2048,128)).toBe(false);
 });
 it('counts adjacent messages exactly as protocol joins them',()=>{
  const a=input('a');a.messages.push({role:'user',content:'b'});
  expect(cardInputTokens(a)).toBe(cardInputTokens(input('a\n\n---\n\nb')));
 });
 it('binds explicit snapshots and rejects unknown settings on otherwise valid configs',()=>{
  const config={version:1, approvalId:'unit-test-only', approved:false, expiresAt:'2020-01-01T00:00:00Z', allowedOwners:[],
   protocol:'openai-chat', model:'gpt-6-luna', baseUrl:'https://api.openai.com/v1', keyEnv:'NARRATIVE_KEY_CARD_LOCAL',
   contextWindow:65536, maxOutputTokens:4096, maxCalls:0, maxConcurrent:1};
  expect(validateLocalProvider(config).model).toBe('gpt-6-luna');
  expect(validateLocalProvider({...config,model:'gpt-4o-2024-08-06'}).model).toBe('gpt-4o-2024-08-06');
  for(const change of [{model:'auto'},{model:'constructor'},{url:'https://example.invalid'},
    {maxOutputTokens:CARD_MODELS['gpt-6-luna'].output+1},{contextWindow:CARD_MODELS['gpt-6-luna'].context+1}]) {
   expect(()=>validateLocalProvider({...config,...change})).toThrow('MODEL_CONFIG_INVALID');
  }
 });
 it('counts Luna wire roles, UTF-8 bytes and completion reservation at the admission boundary',()=>{
  const turn=input('😀中');
  const expected=16+2*16+Buffer.byteLength('developertrusteduser😀中');
  expect(cardInputTokens(turn,'gpt-6-luna')).toBe(expected);
  expect(cardFitsBudget(turn,expected+1024+128,128,'gpt-6-luna')).toBe(true);
  expect(cardFitsBudget(turn,expected+1024+127,128,'gpt-6-luna')).toBe(false);
  turn.messages.push({role:'user',content:'next'});
  expect(cardInputTokens(turn,'gpt-6-luna')).toBe(cardInputTokens(input('😀中\n\n---\n\nnext'),'gpt-6-luna'));
 });
 it('keeps trusted framing and uses a single completion-token cap on Luna Chat requests',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:'story'}}],usage:{completion_tokens:42}}));
  const send=createCardModel(createProviderTransport({protocol:'openai-chat',model:'gpt-6-luna',baseUrl:'https://api.openai.com/v1',keyEnv:'NARRATIVE_KEY_TEST'},{NARRATIVE_KEY_TEST:'synthetic-only'},fetcher),64);
  expect(await send(input('untrusted card text'),new AbortController().signal)).toBe('story');
  const [url,options]=fetcher.mock.calls[0]!;
  expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
  expect(JSON.parse(String(options?.body))).toEqual({model:'gpt-6-luna',store:false,stream:false,
   messages:[{role:'developer',content:'trusted'},{role:'user',content:'untrusted card text'}],
   reasoning_effort:'none',max_completion_tokens:64});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each(['length','content_filter','tool_calls'])('rejects incomplete or non-text Luna results (%s)',async reason=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{finish_reason:reason,message:{content:'unfinished'}}]}));
  const send=createCardModel(createProviderTransport({protocol:'openai-chat',model:'gpt-6-luna',baseUrl:'https://api.openai.com/v1',keyEnv:'NARRATIVE_KEY_TEST'},{NARRATIVE_KEY_TEST:'synthetic-only'},fetcher),64);
  await expect(send(input('turn'),new AbortController().signal)).rejects.toThrow('PROVIDER_UNAVAILABLE');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('rejects ungrounded models, endpoint overrides and extra credential fields',()=>{
  for(const config of [{},{model:'guess-100k'},{apiKey:'synthetic'},{baseUrl:'https://127.0.0.1'}])expect(()=>validateLocalProvider(config)).toThrow('MODEL_CONFIG_INVALID');
 });
});
