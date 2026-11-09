/** Same offline whole-source boundary for ALL compared engines; never a production authorization service. */
import type {Source,Query} from '../p6-longmem/types.ts';import type {BoundDataset} from './evidence.ts';
export type PolicyDataset=BoundDataset&{knowledgeWindows?:Record<string,Record<string,{since:number;until?:number;forgetAt?:number}>>};
export function project(data:PolicyDataset,q:Query):PolicyDataset{
 if(q.audience.kind!=='npc')return data;const npc=q.audience.npcId;
 const turns=data.turns.map(s=>{const grant=data.knowledgeWindows?.[s.sourceId]?.[npc];const known=s.authorizedNpcIds.includes(npc)&&(!grant||q.asOfTurn>=grant.since&&(grant.until===undefined||q.asOfTurn<grant.until)&&(grant.forgetAt===undefined||q.asOfTurn<grant.forgetAt));
  if(known)return s;return {sourceId:`@hidden:${s.turnId}`,turnId:s.turnId,gameMinute:0,gameTime:'',participants:[],location:'',items:[],narrative:'',eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:[]} satisfies Source;
 });return {...data,turns};
}
