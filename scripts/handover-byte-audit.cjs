'use strict';
// Read-only source inspection. Writes a new evidence directory, never source or signing records.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..'),original='C:/Users/11954/Documents/Codex/Nine-cloud-p3-p6-stage1-20261013';
const baseline='dbae068d86e5f9cd188d6196e403ce6dd701a1de',sha=b=>createHash('sha256').update(b).digest('hex'),lf=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
(async()=>{
 const registry=JSON.parse(fs.readFileSync(path.join(root,'packages/content/src/canon.registry.json'))),pins=new Map();
 for(const intake of registry.authorOriginalIntakes){for(const item of [intake.sourceArtifact,intake.approvalRecord,intake.priorSignoffEvidence])if(item)pins.set(item.path,item.sha256);pins.set(intake.candidateDocument,intake.candidateDocumentSha256);}
 const {P1_SAVE_RECALL_ARTIFACT_IDENTITY:p}=await import(pathToFileURL(path.join(root,'apps/api/dist/services/p1-memory-policy.js')).href);
 pins.set('packages/domain/src/memory/p4-recall-policy-v2.json',p.policyArtifactHash.replace('sha256:',''));pins.set('packages/domain/src/memory/p4-recall-cues-v1.json',p.cueDictionaryHash.replace('sha256:',''));
 const bundle=JSON.parse(fs.readFileSync(path.join(root,'scripts/p1-rule-candidate-bundle.files.json')));
 const paths=[...new Set([...pins.keys(),...bundle.files,'docs/sources/世界书_保守补全版.md','docs/sources/worldbook-draft-index.json'])].sort();
 const records=paths.map(file=>{const candidate=fs.readFileSync(path.join(root,file)),source=fs.readFileSync(path.join(original,file)),blob=execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:32*1024*1024});
  return {path:file,pinnedSha:pins.get(file),candidateSha:sha(candidate),baselineBlobSha:sha(blob),originalSha:sha(source),candidateLfSha:sha(lf(candidate)),
   candidateMatchesPin:pins.has(file)?sha(candidate)===pins.get(file):undefined,baselineMatchesPin:pins.has(file)?sha(blob)===pins.get(file):undefined,
   originalMatchesPin:pins.has(file)?sha(source)===pins.get(file):undefined,onlyLineEndingsDiffer:lf(candidate).equals(lf(blob)),candidateEqualsOriginal:candidate.equals(source)};
 });
 const manifest=key=>bundle.files.slice().sort().map(file=>`${file}\0${records.find(r=>r.path===file)[key]}`).join('\n');
 const bundleSha=key=>'sha256:'+sha(Buffer.from(`${bundle.format}\n${manifest(key)}\n`));
 const report={scope:'read-only; no source bytes, pins, canonical registry or semantic digest changed',baseline,records,
  bundleCandidate:bundleSha('candidateSha'),bundleBaselineBlob:bundleSha('baselineBlobSha'),bundleOriginal:bundleSha('originalSha'),
  pinnedMismatches:records.filter(r=>r.candidateMatchesPin===false).map(r=>r.path),allFilesMatchBaselineIgnoringOnlyCrlf:records.every(r=>r.onlyLineEndingsDiffer),
  proposedByteRestorationOnly:records.filter(r=>r.candidateSha!==r.baselineBlobSha).map(r=>({path:r.path,from:r.candidateSha,to:r.baselineBlobSha})),proposedRestorationApplied:false};
 const out=path.join(root,'docs/integration/handover-01/byte-audit-resume-01');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,records:records.length,proposedByteRestorationOnly:report.proposedByteRestorationOnly.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
