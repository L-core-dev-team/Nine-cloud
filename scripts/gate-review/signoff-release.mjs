import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=path.resolve(root,'../../交接/T1-V2-SIGNOFF-PREFLIGHT'),evidence=path.join(root,'docs/integration/t1-v2-signoff-preflight');
const historical=path.resolve(root,'../../交接/INTEGRATION-HANDOVER-03'),previous=path.resolve(root,'../../交接/T1-V2-GATE-REVIEW-01'),stable=path.resolve(root,'../Nine-cloud-p3-p6-handover-01-20261014');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(args,cwd=root,env=process.env)=>cp.execFileSync('git',args,{cwd,env,maxBuffer:128*1024*1024,windowsHide:true});
const write=(dir,name,data)=>fs.writeFileSync(path.join(dir,name),typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2),{flag:'wx'});
const text=file=>{const b=fs.readFileSync(file);return b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8').replace(/^\uFEFF/,'');};
const filesFrom=b=>b.toString('utf8').split('\0').filter(Boolean);
const oldManifest=JSON.parse(fs.readFileSync(path.join(historical,'draft-review/patch-manifest.json')));
const product=[...oldManifest.minimalFiles,'packages/db/src/narrative-v2-schema.ts'];
const readJson=file=>JSON.parse(text(file));
const mode=process.argv[2];
if(mode==='prepare'){
 const beforeProtection=readJson(path.join(out,'恢复保护-20261017/protection-manifest.json'));
 const changedProtected=beforeProtection.filter(f=>sha(fs.readFileSync(path.join(root,f.path)))!==f.sha256).map(f=>f.path).sort();
 assert.deepEqual(changedProtected,['apps/api/src/services/narrative-v2-runtime-draft.ts','docs/integration/pending/0023_narrative_ownership_v2.sql','scripts/gate-review/migration.cjs']);
 const listed=[...new Set([...filesFrom(git(['diff','--name-only','-z','HEAD'])),...filesFrom(git(['ls-files','--others','--exclude-standard','-z']))])];
 const syntax=[],inventory=[];
 for(const f of listed){assert.ok(product.includes(f)||f.startsWith('docs/integration/t1-v2-gate-review-01/')||f.startsWith('docs/integration/t1-v2-signoff-preflight/')||f.startsWith('scripts/gate-review/'),'UNEXPECTED_PATH '+f);
  const bytes=fs.readFileSync(path.join(root,f)),extension=path.extname(f);
  if(extension==='.json')JSON.parse(text(path.join(root,f)));
  if(extension==='.cjs'||extension==='.mjs'){const r=cp.spawnSync(process.execPath,['--check',f],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);syntax.push(f);}
  inventory.push({path:f,bytes:bytes.length,sha256:sha(bytes),kind:product.includes(f)?'product':f.endsWith('.dump')?'synthetic-test-pg-dump':f.includes('isolated-migration-bundle')?'isolated-sql-snapshot':f.startsWith('scripts/')?'review-tool':'evidence-or-report'});
 }
 assert.equal(git(['diff','--name-only','--diff-filter=D']).length,0);
 const {computeRuleSemanticSourceDigest}=await import(pathToFileURL(path.join(stable,'scripts/p1-rule-semantic-source-digest.mjs')));
 const before=computeRuleSemanticSourceDigest(stable),after=computeRuleSemanticSourceDigest(root);
 const {P1_RULE_SEMANTIC_INPUTS}=await import(pathToFileURL(path.join(stable,'apps/api/dist/services/p1-prologue-plugin.js')));
 const {createP1RuleSemanticDependencies}=await import(pathToFileURL(path.join(stable,'apps/api/dist/services/p1-rule-semantic-functions.js')));
 const {computeRuleSemanticDigest}=await import(pathToFileURL(path.join(stable,'apps/api/dist/services/rule-semantic-fingerprint.js')));
 const oldInputs=createP1RuleSemanticDependencies({...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:before.sha256}),newInputs=createP1RuleSemanticDependencies({...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:after.sha256});
 const oldAggregate=computeRuleSemanticDigest(oldInputs),newAggregate=computeRuleSemanticDigest(newInputs);
 assert.equal(oldAggregate,'sha256:94afe4339c08d982e4cd304f34c905877bdf24fc5863f0bb73079306858310cb');
 assert.equal(after.sha256,'sha256:246dfbbbcd4df69b2a2238577c1472d5ed972bd5a0ea32c54f03451b70adad3c');
 assert.equal(newAggregate,'sha256:c7863f4b0d69f9970f9198818cf992f970b9fe69eade1fff28237486abefa636');
 const changedSigned=after.files.filter(f=>before.files.find(b=>b.path===f.path)?.sha256!==f.sha256);assert.deepEqual(changedSigned.map(f=>f.path).sort(),['apps/api/src/services/npc-memory-turn-transaction.ts','apps/api/src/services/server-turn.ts']);
 const prior=readJson(path.join(previous,'release-identities.json')),productInventory=product.map(f=>({path:f,sha256:sha(fs.readFileSync(path.join(root,f))),bytes:fs.statSync(path.join(root,f)).size}));
 const changedProduct=productInventory.filter(f=>prior.inventory.find(p=>p.path===f.path)?.sha256!==f.sha256).map(f=>f.path).sort();
 assert.deepEqual(changedProduct,['apps/api/src/services/narrative-v2-runtime-draft.ts','docs/integration/pending/0023_narrative_ownership_v2.sql']);
 for(const f of ['packages/db/drizzle/0006_next_the_enforcers.sql','packages/db/drizzle/0022_narrative_publication.sql','packages/db/drizzle/meta/_journal.json','apps/api/src/services/p1-review-rule-approval.ts','scripts/p1-rule-semantic-source-digest.mjs'])assert.ok(fs.readFileSync(path.join(root,f)).equals(git(['show','HEAD:'+f])));
 const audit=readJson(path.join(historical,'byte-audit-current.json')),byteRecords=audit.records.map(r=>({path:r.path,sha256:sha(fs.readFileSync(path.join(stable,r.path))),expected:r.currentSha256}));assert.ok(byteRecords.every(r=>r.sha256===r.expected));
 write(evidence,'semantic-identities.json',{status:'UNAPPROVED_CANDIDATE',historicalEngineeringAnchor:oldManifest.baseline,historicalDraftAnchor:'d83f5317d71a9d0334d676fff14ba21fd635a87c',before,after,oldAggregate,newAggregate,changedSigned,changedProductThisRound:changedProduct,productInventory,officialApprovalUnchanged:true});
 write(evidence,'aggregate-inputs.json',{oldInputs,newInputs});
 write(evidence,'inventory-review.json',{inspectedFiles:inventory.length,changedProtected,syntaxChecked:syntax,allJsonParsed:true,noDeletedFiles:true,inventory,binaryDumps:'Only dedicated jiuxiao_test_gate fixture databases; no production dump',unchangedStableByteFiles:byteRecords.length,stableByteRecords:byteRecords});
 console.log(JSON.stringify({status:'PREPARED',inspectedFiles:inventory.length,changedProduct,implementation:after.sha256,aggregate:newAggregate}));
}else if(mode==='release'){
 assert.equal(git(['status','--porcelain']).toString().trim(),'');
 const head=git(['rev-parse','HEAD']).toString().trim(),branch=git(['branch','--show-current']).toString().trim();assert.equal(branch,'shuilongyin/t1-v2-signoff-preflight-20261017');
 const identities=readJson(path.join(evidence,'semantic-identities.json'));
 for(const f of identities.productInventory){assert.equal(sha(fs.readFileSync(path.join(root,f.path))),f.sha256);assert.equal(sha(git(['show',head+':'+f.path])),f.sha256);}
 assert.match(text(path.join(evidence,'signoff01-real-pg.log')),/pass 8/);assert.match(text(path.join(evidence,'signoff01-regression.log')),/pass 37/);
 assert.equal(readJson(path.join(root,'docs/integration/t1-v2-gate-review-01/signoff01-backup-restore.json')).status,'PASS');
 await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:55463});s.once('connect',()=>{s.destroy();reject(Error('PG_STILL_RUNNING'));});s.once('error',e=>{assert.equal(e.code,'ECONNREFUSED');resolve();});});
 assert.ok(!/^J:/m.test(cp.execFileSync('subst.exe',[],{encoding:'utf8'})));
 const anchor='d83f5317d71a9d0334d676fff14ba21fd635a87c',base=oldManifest.baseline;
 write(out,'final-product.patch',git(['diff','--binary',anchor,head,'--',...product]));
 write(out,'candidate-from-stageB.patch',git(['diff','--binary',base,head,'--',...product]));
 write(out,'complete-from-draft.diff',git(['diff','--binary',anchor,head]));
 write(out,'complete-from-stageB.diff',git(['diff','--binary',base,head]));
 write(out,'final-commit.patch',git(['format-patch','-1','--stdout','--binary',head]));
 const extra=[];for(const f of identities.changedProductThisRound){const r=cp.spawnSync('git',['diff','--no-index','--',path.join(out,'恢复保护-20261017',f),f],{cwd:root,maxBuffer:16*1024*1024});assert.equal(r.status,1);extra.push(r.stdout.toString('utf8').replace(/^diff --git .*$/m,'diff --git a/'+f+' b/'+f).replace(/^--- .*$/m,'--- a/'+f).replace(/^\+\+\+ .*$/m,'+++ b/'+f));}
 write(out,'preflight-only.patch',extra.join(''));
 const checks=[];
 for(const [name,start,file]of [['draft',anchor,'final-product.patch'],['stageB',base,'candidate-from-stageB.patch']]){const index=path.join(out,'final-check-'+name+'.index');assert.ok(!fs.existsSync(index));const env={...process.env,GIT_INDEX_FILE:index};git(['read-tree',start],root,env);git(['apply','--cached','--check',path.join(out,file)],root,env);checks.push({name,base:start,status:'PASS',temporaryIndex:index,realIndexUntouched:true,actuallyApplied:false});}
 write(out,'patch-applicability.json',checks);
 for(const f of ['semantic-identities.json','aggregate-inputs.json','inventory-review.json'])fs.copyFileSync(path.join(evidence,f),path.join(out,f),fs.constants.COPYFILE_EXCL);
 const evidenceCopy=path.join(out,'真实PG证据');fs.mkdirSync(evidenceCopy);fs.cpSync(evidence,path.join(evidenceCopy,'preflight'),{recursive:true,errorOnExist:true,force:false});
 const regression=path.join(evidenceCopy,'regression');fs.mkdirSync(regression);for(const entry of fs.readdirSync(path.join(root,'docs/integration/t1-v2-gate-review-01'))){if(entry.startsWith('signoff01'))fs.cpSync(path.join(root,'docs/integration/t1-v2-gate-review-01',entry),path.join(regression,entry),{recursive:true,errorOnExist:true,force:false});}
 const patches=['final-product.patch','candidate-from-stageB.patch','preflight-only.patch','complete-from-draft.diff','complete-from-stageB.diff','final-commit.patch'].map(f=>({file:f,sha256:sha(fs.readFileSync(path.join(out,f))),bytes:fs.statSync(path.join(out,f)).size}));
 const stableStatus=git(['status','--porcelain'],stable).toString().trim(),original=path.resolve(root,'../Nine-cloud-t1-v2-draft-20261016'),originalStatus=git(['status','--porcelain'],original).toString().trim();assert.equal(stableStatus,'');assert.equal(originalStatus,'');
 const receipt={status:'FINAL_LOCAL_CANDIDATE_FIXED_PENDING_REVIEW',at:new Date().toISOString(),head,branch,worktreeClean:true,parent:git(['rev-parse',head+'^']).toString().trim(),productFiles:product.length,patches,
  implementation:identities.after.sha256,aggregateCandidate:identities.newAggregate,signedFilesChanged:identities.changedSigned.map(f=>f.path),semanticScope:35,
  tests:{preflight:8,realPgRegression:37,unit:8,apiBuild:'PASS',dbBuild:'PASS',webTypecheck:'PASS',backupRestore:'PASS'},
  P01_P06:'BLOCKED',T01_T16:{pass:0,blocked:16,executed:0},goldenBaseline:'REQUIRED_NOT_CONFIRMED',formalT1Started:false,approvalOrPinsChanged:false,
  stable:{head:git(['rev-parse','HEAD'],stable).toString().trim(),status:stableStatus},originalDraft:{head:git(['rev-parse','HEAD'],original).toString().trim(),status:originalStatus},
  pgStopped:true,port55463Closed:true,JMappingRemoved:true,databaseAndEvidenceRetained:true,outsideBoundaryWrites:false,localFilesDeleted:0,pushed:false,PRCreated:false,merged:false,deployed:false};
 write(out,'FINAL-RECEIPT.json',receipt);
 write(out,'T1-V2最终候选固定与剩余阻塞报告.md',text(path.join(evidence,'T1-V2最终候选固定与剩余阻塞报告.md'))+'\n## 最终固定回执\n\n完整提交SHA：`'+head+'`。最终工作树clean。\n\n'+patches.map(p=>'- '+p.file+'：`'+p.sha256+'`').join('\n')+'\n');
 write(out,'git-final.txt',git(['show','--no-patch','--format=fuller',head]).toString()+'\nSTATUS\n'+git(['status','--porcelain']).toString()+'\nFILES\n'+git(['diff','--name-status',anchor,head]).toString());
 const all=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.isFile())all.push(f);}}walk(out);
 write(out,'SHA256-MANIFEST-FINAL.json',all.map(f=>({path:path.relative(out,f).replaceAll('\\','/'),sha256:sha(fs.readFileSync(f)),bytes:fs.statSync(f).size})));
 console.log(JSON.stringify({head,clean:true,patches,implementation:receipt.implementation,aggregate:receipt.aggregateCandidate}));
}else throw Error('prepare or release required');
