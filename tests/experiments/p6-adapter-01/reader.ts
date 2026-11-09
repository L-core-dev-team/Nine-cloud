import type {Scope,EvidenceResult,SearchQuery} from '../p6-integration-ready/contracts.js';
export type ReaderQuery=SearchQuery & {policySurface:'p4-explicit-recall'|'p5-narrative'};
export type ReadSnapshot={contractVersion:'p6-reader-proposal-v1';snapshotId:string;scope:Scope;revision:number;asOfRevision:number;gameMinute:number;audience:ReaderQuery['audience'];policySurface:ReaderQuery['policySurface'];visibilityEpoch:string;memoryPolicyHash:string;forgettingEpoch:string};
export type PublishedOriginal={scope:Scope;publicationId:string;state:'published';sourceId:string;text:string;sha256:string;receiptKey:string;receiptSha256:string;attemptId:string;generationVersion:string;generatorSource:'model'|'deterministic';revision:number;publishedAtRevision:number};
/** Server-owned read interfaces. No policy inference, publishing, authentication or SQL implementation in P6. */
export interface TrustedReader {
 beginRead(session:unknown,query:ReaderQuery,options:{signal:AbortSignal}):Promise<{status:'ready';snapshot:ReadSnapshot}|{status:'denied'|'unavailable'}>;
 readAuthorizedEvidence(snapshot:ReadSnapshot,query:ReaderQuery,options:{signal:AbortSignal}):Promise<{snapshotId:string;complete:boolean;result:EvidenceResult}>;
 readConfirmedReceipt(snapshot:ReadSnapshot,key:string,options:{signal:AbortSignal}):Promise<{status:'confirmed';receipt:unknown}|{status:'unknown'}>;
 readPublishedOriginal(snapshot:ReadSnapshot,sourceId:string,generationVersion:string,options:{signal:AbortSignal}):Promise<PublishedOriginal|undefined>;
 finishRead(session:unknown,snapshot:ReadSnapshot,options:{signal:AbortSignal}):Promise<{status:'unchanged';snapshot:ReadSnapshot}|{status:'changed'|'denied'|'unavailable'}>;
}
export type TestFixture={id:string;[field:string]:unknown};
/** Future PostgreSQL test factory supplies real test-data installation and change hooks, outside P6. */
export interface ReaderHarness {reader:TrustedReader;session:unknown;control(action:string):Promise<void>;metrics():{begin:number;evidence:number;receipt:number;original:number;finish:number;writes:number};close():Promise<void>}
export type ReaderHarnessFactory=(fixture:TestFixture)=>Promise<ReaderHarness>;
