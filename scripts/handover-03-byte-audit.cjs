'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),{createHash}=require('crypto');
const root=path.resolve(__dirname,'..'),base='dbae068d86e5f9cd188d6196e403ce6dd701a1de';
const sha=b=>createHash('sha256').update(b).digest('hex'),normalize=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
const audit=JSON.parse(fs.readFileSync(path.join(root,'docs/integration/handover-01/byte-audit-resume-01/summary.json')));
const backup=path.resolve(root,'../../交接/INTEGRATION-HANDOVER-01/BYTEFIX-20261015-01/before-bytes');
const records=audit.records.map(r=>{
 const current=fs.readFileSync(path.join(root,r.path)),blob=cp.execFileSync('git',['show',base+':'+r.path],{cwd:root,maxBuffer:32*1024*1024});
 const proposed=audit.proposedByteRestorationOnly.find(p=>p.path===r.path),old=proposed?fs.readFileSync(path.join(backup,r.path)):null;
 const row={path:r.path,currentSha256:sha(current),baselineBlobSha256:sha(blob),currentNormalizedSha256:sha(normalize(current)),baselineNormalizedSha256:sha(normalize(blob)),
  exactMatch:current.equals(blob),normalizedMatch:normalize(current).equals(normalize(blob)),pin:r.pinnedSha??null,pinMatch:r.pinnedSha?sha(current)===r.pinnedSha:null,
  historicalBackupSha256:old?sha(old):null,historicalBackupNormalizedMatch:old?normalize(old).equals(normalize(blob)):null,
  historicalBackupMatchesOriginalFrom:old?sha(old)===proposed.from:null,restoredThisTask:false};
 assert.ok(row.exactMatch&&row.normalizedMatch,r.path);if(row.pin)assert.ok(row.pinMatch,r.path);if(old)assert.ok(row.historicalBackupNormalizedMatch&&row.historicalBackupMatchesOriginalFrom,r.path);
 return row;
});
const result={status:'PASS',head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),baseline:base,files:records.length,pins:records.filter(r=>r.pin).length,restoredThisTask:0,records};
fs.writeFileSync(path.join(root,'docs/integration/handover-03/byte-audit-current.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({status:'PASS',files:result.files,pins:result.pins,restoredThisTask:0}));
