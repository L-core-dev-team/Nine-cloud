'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.argv[2]||''),mode=process.argv[3],out=__dirname;
const expectedRoot='C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-p3-p6-handover-01-20261014';
assert.equal(root.toLowerCase(),path.resolve(expectedRoot).toLowerCase());
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:48*1024*1024});
const sha=b=>createHash('sha256').update(b).digest('hex'),read=f=>fs.readFileSync(path.join(root,f));
const json=(f,v)=>fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2),{flag:'wx'});
const baseline='dbae068d86e5f9cd188d6196e403ce6dd701a1de';
const auditPath='docs/integration/handover-01/byte-audit-resume-01/summary.json',audit=JSON.parse(read(auditPath));
assert.equal(audit.baseline,baseline);assert.equal(audit.records.length,47);assert.equal(audit.proposedByteRestorationOnly.length,44);
const targets=audit.proposedByteRestorationOnly;assert.equal(new Set(targets.map(r=>r.path)).size,44);
const inventory=()=>git(['ls-files','-z']).toString().split('\0').filter(Boolean).map(file=>({path:file,sha256:sha(read(file))}));
const config=key=>{const r=cp.spawnSync('git',['config','--local','--get',key],{cwd:root,encoding:'utf8'});if(r.status!==0&&r.status!==1)throw Error('CONFIG_READ_FAILED');return r.status===1?null:r.stdout.trim();};
async function main(){
 if(mode==='restore'){
  assert.equal(git(['rev-parse','HEAD']).toString().trim(),'9587d05da09171e3bc75de309a8f65b8d601b8a6');
  assert.equal(git(['status','--porcelain=v1','--untracked-files=all']).toString().trim(),'','UNCOMMITTED_WORK_PRESENT');
  assert.equal(path.resolve(git(['rev-parse','--show-toplevel']).toString().trim()).toLowerCase(),root.toLowerCase());
  assert.equal(git(['rev-parse','--git-dir']).toString().trim(),'.git','NOT_INDEPENDENT_GIT_DIRECTORY');
  const prepared=targets.map(item=>{
   const full=path.resolve(root,item.path);assert.ok(full.startsWith(root+path.sep));assert.ok(fs.lstatSync(full).isFile()&&!fs.lstatSync(full).isSymbolicLink());
   const current=read(item.path),blob=git(['show',baseline+':'+item.path]),prior=audit.records.find(r=>r.path===item.path);
   assert.equal(sha(current),item.from,'CURRENT_SHA_CHANGED '+item.path);assert.equal(sha(blob),item.to,'BASELINE_BLOB_CHANGED '+item.path);
   assert.equal(item.to,prior.baselineBlobSha);assert.equal(item.from,prior.candidateSha);
   const decode=b=>{const s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);assert.ok(Buffer.from(s).equals(b),'NON_ROUNDTRIP_UTF8');return s;};
   assert.equal(decode(current).replaceAll('\r\n','\n'),decode(blob).replaceAll('\r\n','\n'),'NOT_ONLY_CRLF '+item.path);
   const attrs=git(['check-attr','text','eol','filter','--',item.path]).toString();assert.ok(!/: eol: crlf\s/.test(attrs),'EXPLICIT_CRLF_ATTRIBUTE');assert.ok(!/: filter: (?!unspecified|unset)/.test(attrs),'CUSTOM_FILTER');
   return {item,current,blob,attrs,blobObject:git(['rev-parse',baseline+':'+item.path]).toString().trim()};
  });
  // All 44 pass before any source write. Backups and their manifest precede configuration and restoration.
  const backupDir=path.join(out,'before-bytes');fs.mkdirSync(backupDir);
  const files=prepared.map(({item,current,blobObject,attrs})=>{const backup=path.join(backupDir,item.path);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,current,{flag:'wx'});assert.equal(sha(fs.readFileSync(backup)),item.from);return {...item,blobObject,attributes:attrs,backupSha256:sha(current)};});
  const before={baseline,head:git(['rev-parse','HEAD']).toString().trim(),auditSha256:sha(read(auditPath)),initialStatus:'clean',config:{autocrlf:config('core.autocrlf'),eol:config('core.eol')},files,trackedInventory:inventory()};
  json('before-manifest.json',before);
  git(['config','--local','core.autocrlf','false']);git(['config','--local','core.eol','lf']);
  const restored=[];for(const {item,current,blob} of prepared){assert.equal(sha(read(item.path)),sha(current),'FILE_CHANGED_DURING_RESTORE '+item.path);fs.writeFileSync(path.join(root,item.path),blob);assert.equal(sha(read(item.path)),item.to,'RESTORED_SHA_MISMATCH '+item.path);restored.push({path:item.path,sha256:item.to});}
  const allowed=new Set(targets.map(r=>r.path));for(const item of before.trackedInventory)if(!allowed.has(item.path))assert.equal(sha(read(item.path)),item.sha256,'NON_TARGET_CHANGED '+item.path);
  json('restored.json',{status:'PASS',restored,onlyAllowed44Restored:true,nonTargetsUnchanged:true,localConfig:{autocrlf:config('core.autocrlf'),eol:config('core.eol')},gitStatus:git(['status','--porcelain=v1','--untracked-files=all']).toString()});
  console.log(JSON.stringify({status:'PASS',restored:restored.length,allOtherTrackedFilesUnchanged:true,localAutocrlf:config('core.autocrlf'),localEol:config('core.eol')}));return;
 }
 if(mode==='audit'){
  const before=JSON.parse(fs.readFileSync(path.join(out,'before-manifest.json'))),allowed=new Set(targets.map(r=>r.path));
  const records=audit.records.map(r=>{const current=read(r.path),blob=git(['show',baseline+':'+r.path]);assert.ok(current.equals(blob),'NOT_EXACT_BASELINE '+r.path);if(r.pinnedSha)assert.equal(sha(current),r.pinnedSha,'PIN_MISMATCH '+r.path);return {path:r.path,sha256:sha(current),baselineBlobSha256:sha(blob),matchesBaseline:true,pinnedSha:r.pinnedSha,pinMatches:r.pinnedSha?true:undefined};});
  const bundle=JSON.parse(read('scripts/p1-rule-candidate-bundle.files.json'));
  const bundleSha='sha256:'+sha(Buffer.from(bundle.format+'\n'+bundle.files.slice().sort().map(file=>file+'\0'+sha(read(file))).join('\n')+'\n'));
  assert.equal(bundleSha,audit.bundleBaselineBlob);assert.equal(bundleSha,'sha256:468a26ad109c64c6cf2a7224b0e895fd7614241e15c5b468842295d91dcddbce');
  const {computeRuleSemanticSourceDigest}=await import(pathToFileURL(path.join(root,'scripts/p1-rule-semantic-source-digest.mjs')).href),semantic=computeRuleSemanticSourceDigest();
  assert.equal(semantic.sha256,'sha256:73580596f25c530d9ad33170282955187eb281e5927872607feef9e2aae83f42');
  const unchanged=before.trackedInventory.filter(r=>!allowed.has(r.path));for(const item of unchanged)assert.equal(sha(read(item.path)),item.sha256,'NON_TARGET_CHANGED '+item.path);
  assert.equal(config('core.autocrlf'),'false');assert.equal(config('core.eol'),'lf');
  const failedBefore=audit.pinnedMismatches;assert.equal(failedBefore.length,8);
  json('after-audit.json',{status:'PASS',baseline,exactBaselineFiles:records.length,restoredFiles:44,records,previouslyFailingPins:failedBefore.map(file=>({path:file,nowMatchesPin:true})),allExplicitPins:records.filter(r=>r.pinMatches).length,bundleSha256:bundleSha,semanticSha256:semantic.sha256,signedAstFiles:semantic.files.length,nonTargetTrackedFilesUnchanged:unchanged.length,sharedSigningPolicyChanged:false,T1Applied:false});
  json('after-semantic-digest.json',semantic);console.log(JSON.stringify({status:'PASS',exactBaselineFiles:47,previouslyFailingPinsNowPass:8,bundleSha256:bundleSha,semanticSha256:semantic.sha256,nonTargetsUnchanged:unchanged.length}));return;
 }
 throw Error('restore or audit required');
}
main().catch(error=>{const file=path.join(out,'failure-'+Date.now()+'.log');fs.writeFileSync(file,error.stack,{flag:'wx'});console.error(error);process.exitCode=1;});
