const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),z=require('node:zlib'),assert=require('node:assert/strict');
const root=__dirname,out=path.join(root,'evidence/regression-final');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...args)=>cp.execFileSync('git',['-c','core.quotepath=false',...args],{encoding:'utf8'}).trim();
const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));
let priorPass=0,regressed=0,improved=0,unsupportedAdded=0;
for(const run of summary.runs.filter(r=>r.engine==='lexical')){
 const read=engine=>JSON.parse(z.gunzipSync(fs.readFileSync(path.join(out,`${run.set}-${engine}-${run.budget}.json.gz`)))).records;
 const before=read('p603'),after=read('lexical');assert.equal(before.length,after.length);
 for(let i=0;i<before.length;i++){
  const a=before[i],b=after[i];assert.equal(a.questionId,b.questionId);
  if(a.pass)priorPass++;if(a.pass&&!b.pass)regressed++;if(!a.pass&&b.pass)improved++;
  if(b.selectedCount-b.supportedCount>a.selectedCount-a.supportedCount)unsupportedAdded++;
 }
 for(const key of ['npcLeaks','futureLeaks','wrongFactStatus','misattribution','negativeFalsePositive'])assert.equal(run.metrics[key],0);
}
assert.equal(regressed,0);assert.equal(unsupportedAdded,0);
const protectedPaths=['apps','packages','scripts','deployment','package.json','pnpm-lock.yaml'];
assert.equal(git('diff','--name-only','origin/main','--',...protectedPaths),'');
assert.equal(git('diff','--name-only','5e08cadb9d80711018780e26d35ac98912907ab8','--','tests/experiments/p6-longmem','tests/experiments/p6-longmem-hardening','tests/experiments/p6-longmem-prose','docs/acceptance/2026-10-11','docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence'),'');
for(const folder of ['p6-longmem-hardening','p6-longmem-prose']){
 const fixtures=path.resolve(root,'..',folder,'fixtures'),lock=JSON.parse(fs.readFileSync(path.join(fixtures,'freeze-manifest.json')));
 for(const f of lock.files)assert.equal(hash(fs.readFileSync(path.join(fixtures,f.name))),f.sha256);
}
const testPath='tests/experiments/p6-longmem-lexical/lexical.test.ts';
const before=git('show','4bfd071086d93ab5b07e5248480acaf436a05e40:'+testPath);
const current=fs.readFileSync(path.join(root,'lexical.test.ts'),'utf8').replaceAll('\r\n','\n').trim();
assert.equal(current,before.replace("import {ProseIndex as LexicalIndex} from '../p6-longmem-prose/retrieval.ts';","import {LexicalIndex} from './retrieval.ts';"),'New expectations changed');
const result={main:git('rev-parse','origin/main'),testedSourceSha:summary.testedSourceSha,newExpectationsFixedBeforeImplementation:true,priorPass,regressed,improved,queriesAddingUnsupportedSources:unsupportedAdded,queries:summary.queries,originalSpanChecks:summary.spanChecks,oldArtifactsUnchanged:true,productionMatchesMain:true};
fs.writeFileSync(path.join(root,'evidence/verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
