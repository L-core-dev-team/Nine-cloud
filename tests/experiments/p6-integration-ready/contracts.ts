import type {MemoryMode, SaveMemoryPolicy} from '../../../packages/contracts/src/save.js';
import type {AuthorizedRecallObservation} from '../../../packages/domain/src/memory/turn-journal.js';
/** P6 request for cross-system review, not an approved P3 API or migration. */
export type Scope={ownerId:string;saveId:string;branchId:string};
export type PublicationState='not-requested'|'generating'|'failed'|'received-not-persisted'|'persisted'|'unknown';
export type UnknownReason='receipt-unconfirmed'|'identity-unavailable'|'policy-unavailable'|'segment-binding-unavailable'|'archive-incomplete'|'authority-unconfirmed'|'version-unavailable';
export type ServerReadBoundary=Scope & {revision:number;asOfRevision:number;gameMinute:number;visibilityEpoch:string;memoryPolicyHash:string;forgettingEpoch:string;audience:{kind:'player'}|{kind:'npc';npcId:string};policySurface:'p4-explicit-recall'|'p5-narrative'|'unresolved';policy:{memoryMode:MemoryMode;memoryPolicyVersion:string;memoryPolicy:SaveMemoryPolicy}};
export type NarrativePublication={sourceId:string;receiptKey:string;attemptId:string;generationVersion:string;generatorSource:'model'|'deterministic';text:string;state:PublicationState;ruleFactRefs:{eventId:string;field:string}[]};
export type SourceLink=Scope & {sourceId:string;receiptKey:string;receiptSha256:string;eventIds:string[];resultingRevision:number;attemptId:string;generationVersion:string;generatorSource:'model'|'deterministic';sha256:string};
export type AuthorizedSegment={sourceId:string;sourceSha256:string;segmentId:string;startUtf16:number;endUtf16:number;grantId:string;grantField:string;grantEventId:string;observedAtRevision:number;visibilityEpoch:string;memoryPolicyHash:string;forgettingEpoch:string};
export type Evidence={sourceId:string;segmentId:string;sourceType:'original-narrative';revision:number;asOfRevision:number;startUtf16:number;endUtf16:number;text:string;sourceSha256:string;receiptKey:string;receiptSha256:string;attemptId:string;generationVersion:string;generatorSource:'model'|'deterministic';authority:{narrative:'original-prose-only'|'unverified-claim';confirmedRuleFacts:Readonly<{eventId:string;eventType:string;field:string;value:unknown}>[];unknownFields:string[]};authorization:{status:'allowed';npcId?:string;grantId?:string;visibilityEpoch:string;memoryPolicyHash:string;forgettingEpoch:string;policySurface:'p4-explicit-recall'|'p5-narrative'}};
export type EvidenceResult={status:'evidence'|'insufficient'|'unknown'|'conflict'|'forgotten'|'blocked';reason:string;items:Evidence[];generatedAnswer:null;estimatedTokens:number;authorityUnknown:boolean};
/** Only server-owned ports may implement these. Client-supplied ACLs do not implement authorization. */
export interface IntegrationPorts {
 verifySaveSession(session:unknown):Promise<Scope|undefined>;
 readConfirmedReceipt(scope:Scope,requestKey:string):Promise<{status:'confirmed';receipt:unknown}|{status:'unknown'}>;
 readBoundary(scope:Scope,audience:ServerReadBoundary['audience']):Promise<ServerReadBoundary|undefined>;
 readAuthorizedSegments(boundary:ServerReadBoundary,query:string):Promise<{complete:boolean;segments:AuthorizedSegment[];observations:AuthorizedRecallObservation[]} | undefined>;
}

export type SearchQuery={text:string;budget:number;audience:ServerReadBoundary['audience'];asOfRevision?:number;generationVersion?:string;sourceId?:string;slot?:'current-state'|'historical-event'|'subjective-belief'};
export type PublishResult=EvidenceResult|{status:'persisted'|'duplicate';sourceId:string;sha256:string;actionSettled:true;narrativeState:'persisted';npcMayRead:'unknown';descriptionRuleConfirmed:false};
export type LifecycleResult={actionSettled:boolean|'unknown';narrativeState:PublicationState;bodyPersisted:boolean|'unknown';npcMayRead:'unknown';descriptionRuleConfirmed:boolean|'unknown'};
