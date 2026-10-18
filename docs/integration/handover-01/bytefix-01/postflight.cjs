'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');const root=path.resolve(process.argv[2]),out=__dirname,sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(root.toLowerCase(),path.resolve('C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-p3-p6-handover-01-20261014').toLowerCase());
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,maxBuffer:48*1024*1024}),read=f=>fs.readFileSync(path.join(root,f)),baseline='dbae068d86e5f9cd188d6196e403ce6dd701a1de';
const before=JSON.parse(fs.readFileSync(path.join(out,'before-manifest.json'))),old=JSON.parse(read('docs/integration/handover-01/byte-audit-resume-01/summary.json'));
const allowed=new Map(old.proposedByteRestorationOnly.map(r=>[r.path,r.to]));
(async()=>{
 const records=old.records.map(r=>{const b=read(r.path),blob=git(['show',baseline+':'+r.path]);assert.ok(b.equals(blob),'POST_TEST_BASELINE_MISMATCH '+r.path);if(r.pinnedSha)assert.equal(sha(b),r.pinnedSha);return{path:r.path,sha256:sha(b),matchesBaseline:true,pinMatches:r.pinnedSha?true:undefined};});
 const checkout=[];for(const [file,expected] of allowed){const simulated=git(['cat-file','--filters','--path='+file,baseline+':'+file]);assert.equal(sha(simulated),expected,'CHECKOUT_WOULD_CONVERT '+file);checkout.push({path:file,sha256:sha(simulated),checkoutWouldPreserveOriginalBytes:true});}
 for(const item of before.trackedInventory)if(!allowed.has(item.path))assert.equal(sha(read(item.path)),item.sha256,'NON_TARGET_CHANGED '+item.path);
 const p=JSON.parse(read('docs/integration/handover-01/protection/baseline.json')),original='C:/Users/11954/Documents/Codex/Nine-cloud-p3-p6-stage1-20261013';
 assert.equal(git(['rev-parse','HEAD'],original).toString().trim(),baseline);assert.equal(git(['status','--porcelain'],original).toString().trim(),'');
 for(const item of p.files){assert.equal(sha(fs.readFileSync(path.join(original,item.path))),item.sha256,'ORIGINAL_CHANGED '+item.path);if(p.signedPaths.includes(item.path))assert.equal(sha(read(item.path)),allowed.get(item.path)??item.candidateSha256,'SIGNED_CHANGE_OUTSIDE_BYTEFIX '+item.path);}
 for(const item of p.migrationFiles){const current=read(item.path).toString().replaceAll('\r\n','\n'),base=git(['show',baseline+':'+item.path]).toString().replaceAll('\r\n','\n');assert.equal(current,base,'MIGRATION_CHANGED');}
 for(const item of p.evidence)assert.equal(sha(read('docs/integration/handover-01/protection/historical-logs/'+item.path)),item.sha256,'OLD_LOG_CHANGED');
 const {computeRuleSemanticSourceDigest}=await import(pathToFileURL(path.join(root,'scripts/p1-rule-semantic-source-digest.mjs')).href);const semantic=computeRuleSemanticSourceDigest();assert.equal(semantic.sha256,'sha256:73580596f25c530d9ad33170282955187eb281e5927872607feef9e2aae83f42');
 const bundle=JSON.parse(read('scripts/p1-rule-candidate-bundle.files.json')),bundleSha='sha256:'+sha(Buffer.from(bundle.format+'\n'+bundle.files.slice().sort().map(file=>file+'\0'+sha(read(file))).join('\n')+'\n'));assert.equal(bundleSha,old.bundleBaselineBlob);
 // Refresh only stat entries for the allowed paths. Staging must not change any tree object.
 assert.equal(git(['diff','--cached','--name-only']).toString().trim(),'');git(['add','--',...allowed.keys()]);assert.equal(git(['diff','--cached','--name-only']).toString().trim(),'','RESTORATION_CHANGED_GIT_TREE');
 assert.equal(git(['diff','--name-only']).toString().trim(),'','UNEXPECTED_SOURCE_DIFF');
 const result={status:'PASS',baseline,head:git(['rev-parse','HEAD']).toString().trim(),exactBaselineFiles:records.length,records,previouslyFailingPinsNowPass:old.pinnedMismatches.length,allExplicitPins:records.filter(r=>r.pinMatches).length,
  bundleSha256:bundleSha,semanticSha256:semantic.sha256,signedAstFiles:semantic.files.length,onlyAllowed44BytesRestored:true,nonTargetTrackedFilesUnchanged:before.trackedInventory.length-allowed.size,
  originalHead:baseline,originalClean:true,originalFilesUnchanged:p.files.length,protectedFilesVerifiedWithExplicit44PathException:p.signedPaths.length,migrationsUnchanged:p.migrationFiles.length,historicalLogsUnchanged:p.evidence.length,
  T1PatchRawSha256:sha(read('docs/integration/pending/stage1-signed-integration.patch')),T1PatchUnchanged:true,T1Applied:false,sourceTreeDiffEmpty:true,checkoutSimulation:checkout,localConfig:{autocrlf:git(['config','--local','--get','core.autocrlf']).toString().trim(),eol:git(['config','--local','--get','core.eol']).toString().trim()}};
 fs.writeFileSync(path.join(out,'postflight-audit.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,records:records.length,checkoutSimulation:checkout.length}));
})().catch(e=>{fs.writeFileSync(path.join(out,'postflight-failure-'+Date.now()+'.log'),e.stack,{flag:'wx'});console.error(e);process.exitCode=1;});
