/** Proposed read-only integration contract. Not imported by any production module. */
import type {Query,Source} from '../p6-longmem/types.ts';
export type ReadSnapshot={saveId:string;branchId:string;revision:number;asOfTurn:number;visibilitySnapshotId:string};
export interface AuthorizedSourceReader {
  // Upstream production authorization must filter both narrative and metadata before returning.
  readSources(snapshot:ReadSnapshot,audience:Query['audience']):AsyncIterable<Readonly<Source>>;
  readOriginal(sourceId:string,snapshot:ReadSnapshot,audience:Query['audience']):Promise<Readonly<Source>|undefined>;
}
export interface EvidenceTokenizer {modelId:string;version:string;count(text:string):number;exact:boolean;}
export type EvidenceSpan={sourceId:string;turnId:number;startUtf16:number;endUtf16:number;originalText:string;originalSha256:string};
export type ProofDisposition='supported'|'missing-key-source'|'unverified-claim'|'contradictory-claims'|'unauthorized-or-unavailable'|'ambiguous-entity';
