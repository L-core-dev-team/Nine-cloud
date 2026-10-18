import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.cwd(),base=path.resolve(root,'../Nine-cloud-p3-p6-handover-01-20261014');
const out='docs/integration/pending/t1-v2-review-release';fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const baseline='d8ea49a8a74beb79233b100db71bbc4295db47c3';
const results=[];
for(const [name,args] of [['compile-final',['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json']],
 ['web-typecheck',['node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit']],
 ['unit-final',['--test','scripts/t1-v2-draft-tests.cjs']]]){
 const started=new Date().toISOString();
 const r=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:120000});
 fs.writeFileSync(path.join(out,name+'.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx'});
 results.push({name,command:[process.execPath,...args],started,finished:new Date().toISOString(),exitCode:r.status,
  logSha256:sha(fs.readFileSync(path.join(out,name+'.log'))),kind:'isolated-draft-unit-not-official-gameplay'});
}
const {computeRuleSemanticSourceDigest}=await import(pathToFileURL(path.join(base,'scripts/p1-rule-semantic-source-digest.mjs')));
const before=computeRuleSemanticSourceDigest(base),after=computeRuleSemanticSourceDigest(root);
const {P1_RULE_SEMANTIC_INPUTS}=await import(pathToFileURL(path.join(base,'apps/api/dist/services/p1-prologue-plugin.js')));
const {createP1RuleSemanticDependencies}=await import(pathToFileURL(path.join(base,'apps/api/dist/services/p1-rule-semantic-functions.js')));
const {computeRuleSemanticDigest}=await import(pathToFileURL(path.join(base,'apps/api/dist/services/rule-semantic-fingerprint.js')));
const oldInputs=createP1RuleSemanticDependencies({...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:before.sha256});
const newInputs=createP1RuleSemanticDependencies({...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:after.sha256});
const oldAggregate=computeRuleSemanticDigest(oldInputs),newAggregate=computeRuleSemanticDigest(newInputs);
assert.equal(oldAggregate,'sha256:94afe4339c08d982e4cd304f34c905877bdf24fc5863f0bb73079306858310cb');
const changedSigned=after.files.filter(f=>before.files.find(b=>b.path===f.path)?.sha256!==f.sha256);
assert.deepEqual(changedSigned.map(f=>f.path).sort(),['apps/api/src/services/npc-memory-turn-transaction.ts','apps/api/src/services/server-turn.ts']);
assert.notEqual(after.sha256,'sha256:a5300e8d8a7eb89dd6bb3a970840bb984fee48bf4250d8f031b721670746cf38');
const changed=git(['diff','--name-only','--cached']).trim().split('\n').filter(Boolean);
const inventory=changed.map(f=>({path:f,beforeSha256: (()=>{try{return sha(cp.execFileSync('git',['show',baseline+':'+f],{cwd:root,stdio:['ignore','pipe','pipe']}));}catch{return null;}})(),afterSha256:sha(fs.readFileSync(f))}));
const evidence={mode:'isolated-unapproved-draft',baseline,head:git(['rev-parse','HEAD']).trim(),dirty:git(['status','--porcelain=v1']),
 before,after,oldAggregate,newAggregate,changedSigned,dependencyInventory:inventory,
 approvalFileUnchanged:!changed.includes('apps/api/src/services/p1-review-rule-approval.ts'),migrationExecuted:false,formalT1Enabled:false,results};
fs.writeFileSync(path.join(out,'digest-evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
fs.writeFileSync(path.join(out,'aggregate-inputs.json'),JSON.stringify({oldInputs,newInputs},null,2),{flag:'wx'});
fs.writeFileSync(path.join(out,'validation-results.json'),JSON.stringify(results,null,2),{flag:'wx'});
console.log(JSON.stringify({before:before.sha256,after:after.sha256,oldAggregate,newAggregate,changedSigned:changedSigned.map(f=>f.path),results}));
if(results.some(r=>r.exitCode!==0))process.exitCode=1;
