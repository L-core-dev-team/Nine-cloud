import type {IntegrationPorts,NarrativePublication,ServerReadBoundary,SearchQuery,PublishResult,EvidenceResult} from './contracts.js';
import {IntegrationBridge} from './bridge.cjs';
import type {MemoryMode,SaveMemoryPolicy} from '../../../packages/contracts/src/save.js';
import type {AuthorizedRecallObservation} from '../../../packages/domain/src/memory/turn-journal.js';
export function check(ports:IntegrationPorts,b:ServerReadBoundary,p:NarrativePublication,q:SearchQuery,bridge:IntegrationBridge){
 const policy:SaveMemoryPolicy=b.policy.memoryPolicy;const mode:MemoryMode=b.policy.memoryMode;
 const refs:readonly {eventId:string;field:string}[]=p.ruleFactRefs;
 const publication:Promise<PublishResult>=bridge.publish({},p);const answer:Promise<EvidenceResult>=bridge.search({},q);
 const rows:Promise<AuthorizedRecallObservation[]|undefined>=ports.readAuthorizedSegments(b,q.text).then(r=>r?.observations);
 return {policy,mode,refs,publication,answer,rows};
}
// Required implementation fields must not silently become optional.
// @ts-expect-error Publication lacks ruleFactRefs.
const badPublication:NarrativePublication={sourceId:'s',receiptKey:'k',attemptId:'a',generationVersion:'v',generatorSource:'model',text:'x',state:'generating'};
// @ts-expect-error Boundary lacks the authoritative policy envelope.
const badBoundary:ServerReadBoundary={ownerId:'o',saveId:'s',branchId:'root',revision:1,asOfRevision:1,gameMinute:0,visibilityEpoch:'v',memoryPolicyHash:'h',forgettingEpoch:'f',audience:{kind:'player'},policySurface:'p4-explicit-recall'};
void badPublication;void badBoundary;
