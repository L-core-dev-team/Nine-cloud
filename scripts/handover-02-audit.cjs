'use strict';
// Read-only source verification. A new output directory is mandatory.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),name=process.argv[2];if(!/^[a-z0-9-]+$/.test(name??''))throw Error('UNIQUE_NAME_REQUIRED');
const out=path.join(root,'docs/integration/handover-02',name);fs.mkdirSync(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),read=f=>fs.readFileSync(path.join(root,f));
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,maxBuffer:48*1024*1024}).toString();
const base='dbae068d86e5f9cd188d6196e403ce6dd701a1de',original='C:/Users/11954/Documents/Codex/Nine-cloud-p3-p6-stage1-20261013';
(async()=>{
 const audit=JSON.parse(read('docs/integration/handover-01/byte-audit-resume-01/summary.json'));
 const before=JSON.parse(read('docs/integration/handover-01/bytefix-01/before-manifest.json'));
 assert.equal(audit.records.length,47);assert.equal(audit.proposedByteRestorationOnly.length,44);
 const allowed=new Map(audit.proposedByteRestorationOnly.map(r=>[r.path,r.to]));
 const records=audit.records.map(r=>{const current=read(r.path),blob=cp.execFileSync('git',['show',base+':'+r.path],{cwd:root,maxBuffer:32*1024*1024});assert.ok(current.equals(blob),r.path);if(r.pinnedSha)assert.equal(sha(current),r.pinnedSha);return{path:r.path,beforeSha256:r.candidateSha,afterSha256:sha(current),baselineSha256:sha(blob),pin:r.pinnedSha,pinMatches:r.pinnedSha?true:undefined};});
 const backupRoot=path.resolve(root,'../..','交接/INTEGRATION-HANDOVER-01/BYTEFIX-20261015-01');
 for(const r of before.files){assert.equal(sha(fs.readFileSync(path.join(backupRoot,'before-bytes',r.path))),r.from,'BACKUP_CHANGED '+r.path);assert.equal(sha(read(r.path)),r.to);}
 const helperChanges=[];
 for(const r of before.trackedInventory)if(!allowed.has(r.path)){
  if(['scripts/handover-browser.cjs','scripts/handover-test-support.cjs','tests/e2e/cloud-game-shell.cjs'].includes(r.path)){
   const saved=cp.execFileSync('git',['show','0268d905647d06838db73dd609795e4d5544f8e8:'+r.path],{cwd:root});
   assert.ok(sha(saved)===r.sha256||sha(Buffer.from(saved.toString().replace(/\r?\n/g,'\r\n')))===r.sha256,'HELPER_HISTORICAL_BYTES_NOT_EXPLAINED '+r.path);
   helperChanges.push({path:r.path,beforeSha256:r.sha256,currentSha256:sha(read(r.path)),reason:r.path.endsWith('browser.cjs')?'Unique output name and wait for exact persisted page length before existing assertions':r.path.endsWith('shell.cjs')?'Optional unique output name; existing assertions unchanged':'Synthetic fixture optionally omits seed to test genuinely absent legacy generation; default unchanged'});
  }else if(r.path==='docs/integration/handover-01/CHECKPOINT.md'){
   const latest=cp.execFileSync('git',['show','0268d905647d06838db73dd609795e4d5544f8e8:'+r.path],{cwd:root});
   assert.equal(sha(read(r.path)),sha(latest),'SAVED_CHECKPOINT_CHANGED');
   helperChanges.push({path:r.path,beforeSha256:r.sha256,currentSha256:sha(latest),reason:'Historical BYTEFIX commit updated this report after its before-manifest; current bytes equal verified starting HEAD'});
  }else assert.equal(sha(read(r.path)),r.sha256,'NON_TARGET_CHANGED '+r.path);
 }
 const p=JSON.parse(read('docs/integration/handover-01/protection/baseline.json'));
 assert.equal(git(['rev-parse','HEAD'],original).trim(),base);assert.equal(git(['status','--porcelain'],original).trim(),'');
 for(const r of p.files){assert.equal(sha(fs.readFileSync(path.join(original,r.path))),r.sha256);if(p.signedPaths.includes(r.path))assert.equal(sha(read(r.path)),allowed.get(r.path)??r.candidateSha256);}
 for(const r of p.migrationFiles){assert.equal(sha(fs.readFileSync(path.join(original,r.path))),r.sha256);assert.equal(read(r.path).toString().replaceAll('\r\n','\n'),git(['show',base+':'+r.path]).replaceAll('\r\n','\n'));}
 for(const r of p.evidence)assert.equal(sha(read('docs/integration/handover-01/protection/historical-logs/'+r.path)),r.sha256);
 const {computeRuleSemanticSourceDigest}=await import(pathToFileURL(path.join(root,'scripts/p1-rule-semantic-source-digest.mjs')).href),semantic=computeRuleSemanticSourceDigest();
 assert.equal(semantic.sha256,'sha256:73580596f25c530d9ad33170282955187eb281e5927872607feef9e2aae83f42');
 const bundle=JSON.parse(read('scripts/p1-rule-candidate-bundle.files.json')),bundleSha='sha256:'+sha(Buffer.from(bundle.format+'\n'+bundle.files.slice().sort().map(f=>f+'\0'+sha(read(f))).join('\n')+'\n'));assert.equal(bundleSha,audit.bundleBaselineBlob);
 assert.equal(git(['config','--local','--get','core.autocrlf']).trim(),'false');assert.equal(git(['config','--local','--get','core.eol']).trim(),'lf');
 for(const [file,expected] of allowed)assert.equal(sha(cp.execFileSync('git',['cat-file','--filters','--path='+file,base+':'+file],{cwd:root,maxBuffer:32*1024*1024})),expected);
 const patchSha=sha(read('docs/integration/pending/stage1-signed-integration.patch'));assert.equal(patchSha,'a517f0249e12d44b003cf29255e26002489a270c049f8d713c3bc6323912b01e');
 const inheritedRuns=['bytefix-content-01','bytefix-api-01','bytefix-full-test-01','bytefix-typecheck-01','bytefix-build-01'].map(name=>{const prefix='docs/integration/handover-01/runs/'+name+'/',result=JSON.parse(read(prefix+'result.json'));assert.equal(result.exitCode,0);return{...result,logSha256:sha(read(prefix+'run.log')),resultSha256:sha(read(prefix+'result.json'))};});
 const result={status:'PASS',head:git(['rev-parse','HEAD']).trim(),baseline:base,exactBaselineFiles:47,verifiedOriginalBackups:44,explicitPins:records.filter(r=>r.pinMatches).length,records,semanticSha256:semantic.sha256,signedAstFiles:semantic.files.length,bundleSha256:bundleSha,nonTargetTrackedFilesUnchanged:before.trackedInventory.length-44-helperChanges.length,helperChanges,originalClean:true,originalHead:base,originalFiles:p.files.length,migrations:p.migrationFiles.length,historicalLogs:p.evidence.length,T1Applied:false,patchSha256:patchSha,inheritedRuns};
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,records:records.length,inheritedRuns:inheritedRuns.map(r=>({name:r.name,exitCode:r.exitCode}))}));
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.log'),e.stack,{flag:'wx'});console.error(e);process.exitCode=1;});
