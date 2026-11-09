// Offline optimization shim over the unchanged frozen whole-source engine, NOT a production authorization cache.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {DiskRecall,type Scope} from '../p6-longmem-reliability/adapter.ts';
import {corpusDigest} from '../p6-longmem-reliability/workload.ts';import type {Query} from '../p6-longmem/types.ts';
const require=createRequire(import.meta.url),{canonical}=require('../p6-longmem-reliability/store.cjs');
export class RetainedRecall {
 private inner:DiskRecall;private legacyViews:Map<string,any>;private retained=new Map<string,{index:any;estimatedBytes:number}>();private retainedBytes=0;
 private counters={hits:0,misses:0,evictions:0,maxEntries:0,maxEstimatedBytes:0};
 private frozenRoot:string;private maxEntries:number;private maxEstimatedBytes:number;
 constructor(file:string,scope:Scope,revision:number,frozenRoot:string,maxEntries=32,maxEstimatedBytes=96*1024*1024){
  this.frozenRoot=frozenRoot;this.maxEntries=maxEntries;this.maxEstimatedBytes=maxEstimatedBytes;
  assert.ok(maxEntries>0&&maxEstimatedBytes>0);this.inner=new DiskRecall(file,scope,revision);
  try{assert.equal(corpusDigest(this.inner.sources),frozenRoot,'Frozen corpus root changed');
   // Version-specific compatibility shim: access the old TS-private Map without replacing its view/policy construction.
   const views=(this.inner as unknown as {views:unknown}).views;assert.ok(views instanceof Map,'Legacy view-cache layout changed');this.legacyViews=views;
  }catch(e){this.inner.close();throw e;}
 }
 private keys(q:Query){return {old:canonical({audience:q.audience,asOfTurn:q.asOfTurn}),retained:canonical({root:this.frozenRoot,scope:this.inner.scope,revision:this.inner.revision,audience:q.audience,asOfTurn:q.asOfTurn})};}
 private prime(q:Query){const key=this.keys(q),saved=this.retained.get(key.retained);if(saved){this.counters.hits++;this.retained.delete(key.retained);this.retained.set(key.retained,saved);if(!this.legacyViews.has(key.old)){if(this.legacyViews.size>=4)this.legacyViews.delete(this.legacyViews.keys().next().value!);this.legacyViews.set(key.old,saved.index);}}else this.counters.misses++;return key;}
 private remember(key:{old:string;retained:string}){if(this.retained.has(key.retained))return;const index=this.legacyViews.get(key.old);if(!index)return;const estimatedBytes=Buffer.byteLength(JSON.stringify(index.data));if(estimatedBytes>this.maxEstimatedBytes)return;
  while(this.retained.size>=this.maxEntries||this.retainedBytes+estimatedBytes>this.maxEstimatedBytes){const first=this.retained.keys().next().value!;this.retainedBytes-=this.retained.get(first)!.estimatedBytes;this.retained.delete(first);this.counters.evictions++;}
  this.retained.set(key.retained,{index,estimatedBytes});this.retainedBytes+=estimatedBytes;this.counters.maxEntries=Math.max(this.counters.maxEntries,this.retained.size);this.counters.maxEstimatedBytes=Math.max(this.counters.maxEstimatedBytes,this.retainedBytes);
 }
 search(q:Query,budget=2048){const key=this.prime(q);const result=this.inner.search(q,budget);this.remember(key);return structuredClone(result);}
 original(sourceId:string,q:Query){const key=this.prime(q);const result=this.inner.original(sourceId,q);this.remember(key);return result;}
 invalidate(){this.retained.clear();this.retainedBytes=0;this.legacyViews.clear();}
 measurements(){return this.inner.measurements();}
 stats(){return {...this.counters,currentEntries:this.retained.size,currentEstimatedBytes:this.retainedBytes,entryLimit:this.maxEntries,estimatedByteLimit:this.maxEstimatedBytes,limitation:'Estimated serialized payload bound is not a heap bound; scopes and snapshot are frozen. No dynamic production authorization is claimed.'};}
 close(){this.invalidate();this.inner.close();}
}
