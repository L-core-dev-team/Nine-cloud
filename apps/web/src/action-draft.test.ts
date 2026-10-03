import {it,expect} from 'vitest';
import {buildActionDraft} from './action-draft';
const base={saveId:'save',actorId:'player',expectedRevision:0,idempotencyKey:'f00a9b36-dff1-4a4d-b810-e28b5eb5d18a'};
it('constructs all authored action categories without inferring outcomes',()=>{
 for(const kind of ['move','cultivate','acquire_item','use_item','talk','combat','quest','free_text'] as const){const intent=buildActionDraft(base,kind,{text:'intent',target:'target',secondary:'choice',amount:1});expect(intent.kind).toBe(kind);expect(Object.keys(intent)).not.toContain('stateDelta');}
 expect(()=>buildActionDraft(base,'cultivate',{text:'',target:'x',secondary:'',amount:0})).toThrow();
 expect(()=>buildActionDraft(base,'quest',{text:'',target:'x',secondary:'',amount:1})).toThrow();
});
