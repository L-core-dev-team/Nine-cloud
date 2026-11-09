import type {IntegrationPorts,NarrativePublication,PublicationState,SearchQuery,EvidenceResult,PublishResult,LifecycleResult} from './contracts.js';
/** Checked consumer surface; runtime compatibility is independently probed, not implied by this declaration. */
export class IntegrationBridge {
 constructor(file:string,formal:unknown,ports:IntegrationPorts,options?:{cache?:boolean});
 publish(session:unknown,publication:NarrativePublication):Promise<PublishResult>;
 search(session:unknown,query:SearchQuery):Promise<EvidenceResult>;
 lifecycle(session:unknown,key:string,sourceId:string|undefined,state:PublicationState):Promise<LifecycleResult>;
 close():void;
}
