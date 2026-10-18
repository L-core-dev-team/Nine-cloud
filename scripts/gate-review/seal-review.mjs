import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),stable=path.resolve(root,'../Nine-cloud-p3-p6-handover-01-20261014');
const historical=path.resolve(root,'../../交接/INTEGRATION-HANDOVER-03'),out=path.resolve(root,'../../交接/T1-V2-GATE-REVIEW-01');
const evidence=path.join(root,'docs/integration/t1-v2-gate-review-01');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,maxBuffer:64*1024*1024});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2),{flag:'wx'});
fs.mkdirSync(out,{recursive:true});
const old=JSON.parse(fs.readFileSync(path.join(historical,'draft-review/patch-manifest.json')));
const product=[...old.minimalFiles,'packages/db/src/narrative-v2-schema.ts'];
const added=product.filter(f=>{try{git(['cat-file','-e','HEAD:'+f]);return false;}catch{return true;}});
function patch(base){const tracked=product.filter(f=>!added.includes(f));const chunks=[git(['diff','--binary',base,'--',...tracked])];
 for(const f of added){const r=cp.spawnSync('git',['diff','--no-index','--binary','--','/dev/null',f],{cwd:root,maxBuffer:8*1024*1024});assert.equal(r.status,1);assert.ok(r.stdout.length);chunks.push(r.stdout);}
 return Buffer.concat(chunks);}
write('gate-review-minimal.patch',patch('HEAD'));write('candidate-from-stageB.patch',patch(old.baseline));
const inventory=product.map(f=>({path:f,sha256:sha(fs.readFileSync(path.join(root,f))),bytes:fs.statSync(path.join(root,f)).size,
 changedSinceDraft:added.includes(f)||git(['diff','--name-only','HEAD','--',f]).length>0}));
const {computeRuleSemanticSourceDigest}=await import(pathToFileURL(path.join(stable,'scripts/p1-rule-semantic-source-digest.mjs')));
const before=computeRuleSemanticSourceDigest(stable),after=computeRuleSemanticSourceDigest(root);
const {P1_RULE_SEMANTIC_INPUTS}=await import(pathToFileURL(path.join(stable,'apps/api/dist/services/p1-prologue-plugin.js')));
const {createP1RuleSemanticDependencies}=await import(pathToFileURL(path.join(stable,'apps/api/dist/services/p1-rule-semantic-functions.js')));
const {computeRuleSemanticDigest}=await import(pathToFileURL(path.join(stable,'apps/api/dist/services/rule-semantic-fingerprint.js')));
const oldInputs=createP1RuleSemanticDependencies({...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:before.sha256});
const newInputs=createP1RuleSemanticDependencies({...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:after.sha256});
const oldAggregate=computeRuleSemanticDigest(oldInputs),newAggregate=computeRuleSemanticDigest(newInputs);
assert.equal(oldAggregate,'sha256:94afe4339c08d982e4cd304f34c905877bdf24fc5863f0bb73079306858310cb');
const changedSigned=after.files.filter(f=>before.files.find(b=>b.path===f.path)?.sha256!==f.sha256);
assert.deepEqual(changedSigned.map(f=>f.path).sort(),['apps/api/src/services/npc-memory-turn-transaction.ts','apps/api/src/services/server-turn.ts']);
const audit=JSON.parse(fs.readFileSync(path.join(historical,'byte-audit-current.json')));
const auditRecords=audit.records.map(r=>({path:r.path,sha256:sha(fs.readFileSync(path.join(stable,r.path))),expected:r.currentSha256}));
assert.ok(auditRecords.every(r=>r.sha256===r.expected));
for(const f of ['packages/db/drizzle/0022_narrative_publication.sql','packages/db/drizzle/meta/_journal.json','apps/api/src/services/p1-review-rule-approval.ts','scripts/p1-rule-semantic-source-digest.mjs'])assert.ok(fs.readFileSync(path.join(root,f)).equals(git(['show','HEAD:'+f])));
write('release-identities.json',{mode:'ISOLATED_PENDING_REVIEW_NOT_APPROVED',head:git(['rev-parse','HEAD']).toString().trim(),branch:git(['branch','--show-current']).toString().trim(),
 stableHead:git(['rev-parse','HEAD'],stable).toString().trim(),originalDraftHead:git(['rev-parse','HEAD'],path.resolve(root,'../Nine-cloud-t1-v2-draft-20261016')).toString().trim(),
 inventory,patchSha256:sha(fs.readFileSync(path.join(out,'gate-review-minimal.patch'))),cumulativePatchSha256:sha(fs.readFileSync(path.join(out,'candidate-from-stageB.patch'))),
 before,after,oldAggregate,newAggregate,changedSigned,formalAcceptance:{pass:0,blocked:16},approvalOrPinChanged:false,historical0022OrJournalChanged:false});
write('aggregate-inputs.json',{oldInputs,newInputs});write('stable-byte-audit.json',{status:'PASS',files:auditRecords.length,records:auditRecords});
write('git-state.txt',git(['status','--short']).toString()+'\nLOG\n'+git(['log','-6','--format=%H %ai %s']).toString()+'\nREFLOG\n'+git(['reflog','-6','--format=%H %gs']).toString());
const all=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.isFile())all.push(f);}}
walk(evidence);walk(path.join(root,'scripts/gate-review'));
write('evidence-manifest.json',all.map(f=>({path:path.relative(root,f).replaceAll('\\','/'),sha256:sha(fs.readFileSync(f)),bytes:fs.statSync(f).size})));
console.log(JSON.stringify({productFiles:inventory.length,changedSinceDraft:inventory.filter(f=>f.changedSinceDraft).length,implementation:after.sha256,aggregate:newAggregate,patchSha256:sha(fs.readFileSync(path.join(out,'gate-review-minimal.patch'))),cumulativePatchSha256:sha(fs.readFileSync(path.join(out,'candidate-from-stageB.patch')))}));
