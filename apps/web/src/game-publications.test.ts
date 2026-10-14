import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readPublishedGameHistory } from './game-publications';
import { cloudRequest } from './cloud-sync';
vi.mock('./cloud-sync',async()=>({...await vi.importActual('./cloud-sync'),cloudRequest:vi.fn()}));
const scope={apiBase:'https://fixture.invalid/api',ownerId:'owner',saveId:'save'};
const key='00000000-0000-4000-8000-000000000001';
const receipt={saveId:'save',idempotencyKey:key,requestFingerprint:'sha256:v1:'+'a'.repeat(64),resultingRevision:1,
 decision:{status:'accepted',nextRevision:1,events:[{id:'00000000-0000-4000-8000-000000000002',saveId:'save',type:'fixture',source:'RULES',ruleVersion:'fixture',
  beforeRevision:0,afterRevision:1,occurredAt:'2026-10-13T00:00:00.000Z',payload:{}}]}};
function response(text='\ufeff中文😀\r\n正文') {return {items:[{receipt,presentation:{settlement:'accepted',publication:'published',generation:'published',source:{
 requestKey:key,sourceId:'source',publicationId:'publication',revision:1,version:1,generatorSource:'deterministic',text,bodySha:createHash('sha256').update(text).digest('hex')}}}],nextBeforeRevision:null};}
beforeEach(()=>vi.clearAllMocks());
describe('published game history verification',()=>{
 it('recovers exact Unicode text through the authenticated read-only owner endpoint',async()=>{
  vi.mocked(cloudRequest).mockResolvedValue(response());const controller=new AbortController();
  const rows=await readPublishedGameHistory(scope,controller.signal);expect(rows?.[0]?.text).toBe('\ufeff中文😀\r\n正文');
  expect(cloudRequest).toHaveBeenCalledWith('/api/games/save/presentations','GET',undefined,'owner',controller.signal);
 });
 it('refuses corrupted text instead of regenerating',async()=>{const r=response();r.items[0]!.presentation.source.text+='changed';vi.mocked(cloudRequest).mockResolvedValue(r);
  await expect(readPublishedGameHistory(scope,new AbortController().signal)).rejects.toThrow('NARRATIVE_BODY_CORRUPT');});
 it.each(['requestKey','revision','version','generatorSource'])('refuses a different %s',async field=>{const r=response();(r.items[0]!.presentation.source as Record<string,unknown>)[field]='different';vi.mocked(cloudRequest).mockResolvedValue(r);
  await expect(readPublishedGameHistory(scope,new AbortController().signal)).rejects.toThrow('INVALID_PUBLICATION_SOURCE');});
 it('refuses cross-save receipts',async()=>{const r=response();r.items[0]!.receipt={...receipt,saveId:'other',decision:{...receipt.decision,events:receipt.decision.events.map(e=>({...e,saveId:'other'}))}};vi.mocked(cloudRequest).mockResolvedValue(r);
  await expect(readPublishedGameHistory(scope,new AbortController().signal)).rejects.toThrow('INVALID_PUBLICATION_SCOPE');});
 it.each(['pending','failed','legacy-body-unavailable'])('keeps settled rules distinct from %s body',async publication=>{
  vi.mocked(cloudRequest).mockResolvedValue({items:[{receipt,presentation:{settlement:'accepted',publication,source:null}}]});
  expect((await readPublishedGameHistory(scope,new AbortController().signal))?.[0]?.text).toContain('规则已结算');
 });
});
