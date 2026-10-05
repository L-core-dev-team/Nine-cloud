import { describe, expect, it, vi } from 'vitest';
import type { TurnReceipt } from '@jiuxiao/contracts';
import { NarrativeScheduler, narrativeRoles, type RoleAdapter, type RoleSlot } from './narrative-scheduler.js';
const receipt: TurnReceipt = { idempotencyKey: 'f00a9b36-dff1-4a4d-b810-e28b5eb5d18a', saveId:'fixture', requestFingerprint:`sha256:v1:${'a'.repeat(64)}`, resultingRevision:1,
 decision:{status:'accepted',nextRevision:1,events:[{id:'3719acb0-5296-48cd-b806-bc2966110ff7',saveId:'fixture',type:'fixture',beforeRevision:0,afterRevision:1,occurredAt:'2026-10-01T00:00:00.000Z',source:'RULES',ruleVersion:'fixture-only',payload:{}}]} };
const slot = (primary: RoleAdapter, extra: Partial<RoleSlot> = {}): RoleSlot => ({enabled:true,timeoutMs:50,maxOutputTokens:10,retries:0,primary,...extra});
describe('five existing narrative roles, synthetic adapters only', () => {
 it('runs in order, hands cloned candidates forward and cannot mutate committed receipts', async () => {
  const order: string[] = []; const before = structuredClone(receipt);
  const adapter: RoleAdapter = async input => { order.push(input.role); if (input.role === 'story') expect(input.candidates.director).toBe('director'); input.receipt.resultingRevision = 999; return {text: input.role,outputTokens:5}; };
  const scheduler = new NarrativeScheduler(Object.fromEntries(narrativeRoles.map(role => [role,slot(adapter)])),50);
  const result = await scheduler.run(receipt, new AbortController().signal);
  expect(order).toEqual(narrativeRoles); expect(result.text).toBe('story'); expect(result.reservedOutputTokens).toBe(50); expect(receipt).toEqual(before);
 });
 it('passes only bounded authorized recall as a cloned presentation context', async () => {
  const context={npcMemories:[{npcId:'npc_cenjiu',observations:[{summary:'topicTag=obstacle_rockslide;outcome=refuse',accessibility:0.35}]}]};
  const adapter:RoleAdapter=vi.fn(async input=>{expect(input.context).toEqual(context);return {text:'story',outputTokens:1};});
  await new NarrativeScheduler({story:slot(adapter)},20).run(receipt,new AbortController().signal,context);
  expect(adapter).toHaveBeenCalledOnce();
 await expect(new NarrativeScheduler({story:slot(adapter)},20).run(receipt,new AbortController().signal,
   {npcMemories:[{npcId:'npc_cenjiu',observations:[{summary:'x',accessibility:2}]}]})).rejects.toThrow('INVALID_NARRATIVE_CONTEXT');
 });
 it('passes bounded state-derived cues and speaker-bound authored utterances',async()=>{
  const context={npcMemories:[],playerConditionLines:['手在抖'],npcUtterances:[{npcId:'npc_cenjiu',line:'肩上怎么了'}]};
  const adapter:RoleAdapter=vi.fn(async input=>{expect(input.context).toEqual(context);return {text:'story',outputTokens:1};});
  await new NarrativeScheduler({story:slot(adapter)},20).run(receipt,new AbortController().signal,context);
  await expect(new NarrativeScheduler({story:slot(adapter)},20).run(receipt,new AbortController().signal,
   {npcMemories:[],playerConditionLines:['x'.repeat(241)]})).rejects.toThrow('INVALID_NARRATIVE_CONTEXT');
 });
 it('times out an uncooperative provider, reserves its budget and uses bounded fallback', async () => {
  const never: RoleAdapter = vi.fn(async () => new Promise(() => {})); const fallback: RoleAdapter = vi.fn(async () => ({text:'fallback story',outputTokens:2}));
  const result = await new NarrativeScheduler({story:slot(never,{timeoutMs:5,fallback})},20).run(receipt,new AbortController().signal);
  expect(result.text).toBe('fallback story'); expect(result.trace.find(row=>row.role==='story')).toMatchObject({attempts:2,reservedOutputTokens:20});
 });
 it('refuses budget overflow before dispatch and never presents director text as story', async () => {
  const story = vi.fn(async () => ({text:'story',outputTokens:2}));
  await expect(new NarrativeScheduler({director:slot(async()=>({text:'candidate',outputTokens:1})),story:slot(story)},10).run(receipt,new AbortController().signal)).rejects.toThrow('NARRATIVE_BUDGET_EXHAUSTED'); expect(story).not.toHaveBeenCalled();
 });
 it('cancels without dispatching later roles or retrying, with bounded retries on ordinary failure', async () => {
  const abort = new AbortController(); const story = vi.fn(async()=>({text:'story',outputTokens:1}));
  await expect(new NarrativeScheduler({director:slot(async()=>{abort.abort(); throw new Error('secret');}),story:slot(story)},30).run(receipt,abort.signal)).rejects.toThrow('NARRATIVE_CANCELLED'); expect(story).not.toHaveBeenCalled();
  let attempts=0; const result=await new NarrativeScheduler({story:slot(async()=>{if(++attempts===1) throw new Error('private provider error'); return {text:'retry',outputTokens:1};},{retries:1})},20).run(receipt,new AbortController().signal);
  expect(result.text).toBe('retry'); expect(JSON.stringify(result.trace)).not.toContain('private'); expect(attempts).toBe(2);
 });
 it('refuses uncommitted receipts and malformed token usage', async () => {
  const scheduler=new NarrativeScheduler({story:slot(async()=>({text:'bad',outputTokens:11}))},10);
  await expect(scheduler.run(receipt,new AbortController().signal)).rejects.toThrow('NARRATIVE_UNAVAILABLE');
  await expect(scheduler.run({...receipt,resultingRevision:0,decision:{status:'rejected',code:'fixture',message:'fixture',revision:0}},new AbortController().signal)).rejects.toThrow('TURN_NOT_COMMITTED');
 });
 it('requires earlier successful dependencies and treats diagnostics as non-authoritative',async()=>{
  const call=vi.fn(async()=>({text:'story',outputTokens:1}));
  expect(()=>new NarrativeScheduler({story:slot(call,{dependencies:['archive']})},20)).toThrow('Invalid role dependency');
  await expect(new NarrativeScheduler({story:slot(call,{dependencies:['director']})},20).run(receipt,new AbortController().signal)).rejects.toThrow('NARRATIVE_DEPENDENCY_UNAVAILABLE');expect(call).not.toHaveBeenCalled();
  await expect(new NarrativeScheduler({director:slot(async()=>{throw new Error('no');},{required:true}),story:slot(call)},20).run(receipt,new AbortController().signal)).rejects.toThrow('NARRATIVE_UNAVAILABLE');expect(call).not.toHaveBeenCalled();
  const result=await new NarrativeScheduler({story:slot(call)},20,()=>{throw new Error('log failure');}).run(receipt,new AbortController().signal);expect(result.text).toBe('story');
 });
});
