// One-off retained diagnosis of the first scale run; does not rewrite its database.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DiskRecall} from './adapter.ts';
import {dataFor,scope,corpusDigest} from './workload.ts';
const require=createRequire(import.meta.url),{canonical,digest}=require('./store.cjs');
const cfg=JSON.parse(fs.readFileSync(new URL('./.runs/scale-01/complex-1000.json',import.meta.url),'utf8'));
const original=dataFor('complex',1000),recall=new DiskRecall(cfg.file,scope,1000);
const restored=[...recall.sources].sort((a,b)=>a.turnId-b.turnId);
let byteChecks=0;for(let i=0;i<1000;i++){assert.deepEqual(restored[i],original.turns[i]);assert.deepEqual(Buffer.from(restored[i]!.narrative),Buffer.from(original.turns[i]!.narrative));byteChecks++;}
const result={failure:'Corpus digest used JSON insertion order while store canonicalized metadata keys',expectedUnsortedDigest:cfg.writer.root,actualUnsortedDigest:corpusDigest(restored),sources:1000,deepEqualityChecks:1000,byteChecks,canonicalDataMatch:canonical(original.turns)===canonical(restored),canonicalDigest:digest(canonical(restored)),writer:cfg.writer,firstOriginalFactKeys:Object.keys(original.turns[0]!.facts[0]!),firstRestoredFactKeys:Object.keys(restored[0]!.facts[0]!),remedy:'Canonicalize corpus digest, retain scale-01 unchanged, resume same database without rewriting successful records'};
fs.writeFileSync(new URL('./evidence/scale-01/diagnosis.json',import.meta.url),JSON.stringify(result,null,2)+'\n');recall.close();console.log(JSON.stringify(result));
