import { describe,it,expect } from 'vitest';
import { cardInputTokens,cardFitsBudget } from './model-budget.js';
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
 it('rejects ungrounded models, endpoint overrides and extra credential fields',()=>{
  for(const config of [{},{model:'guess-100k'},{apiKey:'synthetic'},{baseUrl:'https://127.0.0.1'}])expect(()=>validateLocalProvider(config)).toThrow('MODEL_CONFIG_INVALID');
 });
});
