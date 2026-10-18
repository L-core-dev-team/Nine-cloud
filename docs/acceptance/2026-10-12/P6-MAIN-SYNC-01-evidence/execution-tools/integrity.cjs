const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'../../项目/Nine-cloud-P6-main-sync-20261012');
const out=path.join(root,'docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence');
const main='8b698845810144bb8e78cc7e2120fc8ee1b013d5',p6='d6c2f15c08b622b08910ac41b68bf4b72ff5453a',p601='67e4692bf14bb483885a8c764a83aa3a4e115310';
const git=(...args)=>execFileSync('git',['-c','core.quotepath=false',...args],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}).trim();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const p6Paths=git('diff','--name-only',main+'...'+p6).split('\n');
const mainPaths=git('diff','--name-only',p6+'...'+main).split('\n');
assert.equal(p6Paths.filter(p=>mainPaths.includes(p)).length,0);
git('merge-base','--is-ancestor',main,'HEAD');git('merge-base','--is-ancestor',p6,'HEAD');git('merge-base','--is-ancestor',p601,p6);
const manifest=[],checkoutNewlineDifferences=[];
for(const p of p6Paths){
 const bytes=fs.readFileSync(path.join(root,p));
 const sourceBytes=fs.readFileSync(path.resolve(root,'../Nine-cloud-P6-longmem-hardening-20261011',p));
 if(hash(bytes)!==hash(sourceBytes)) {
   assert.equal(bytes.toString('utf8').replaceAll('\r\n','\n'),sourceBytes.toString('utf8').replaceAll('\r\n','\n'),'Non-newline P6 working change: '+p);
   checkoutNewlineDifferences.push({path:p,candidate:hash(bytes),sourceWorking:hash(sourceBytes)});
 }
 assert.equal(git('rev-parse','HEAD:'+p),git('rev-parse',p6+':'+p),'P6 Git blob changed: '+p);
 manifest.push({path:p,bytes:bytes.length,sha256:hash(bytes)});
}
for(const p of mainPaths)assert.equal(git('rev-parse','HEAD:'+p),git('rev-parse',main+':'+p),'main blob changed: '+p);
const prior01=JSON.parse(fs.readFileSync(path.join(root,'docs/acceptance/2026-10-11/P6-LONGMEM-01-evidence/review/evaluation.json')));
const next01=JSON.parse(fs.readFileSync(path.join(out,'p6-01/evaluation.json')));
const omitTimes=v=>{if(Array.isArray(v))return v.map(omitTimes);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!/elapsed|latency|indexBuild|testedSource|generatedAt|createdAt|nodeVersion/i.test(k)).map(([k,x])=>[k,omitTimes(x)]));return v;};
assert.deepEqual(omitTimes(next01.runs),omitTimes(prior01.runs),'P6-01 quality regression');
const old02=JSON.parse(fs.readFileSync(path.join(root,'tests/experiments/p6-longmem-hardening/evidence/final/summary.json')));
const new02=JSON.parse(fs.readFileSync(path.join(out,'p6-02/summary.json')));
assert.deepEqual(omitTimes(new02.runs),omitTimes(old02.runs),'P6-02 quality regression');
let checked=0;
for(const file of fs.readdirSync(path.join(out,'p6-02')).filter(n=>n.endsWith('.json.gz')&&!n.includes('-failures'))){
 const fresh=JSON.parse(gunzipSync(fs.readFileSync(path.join(out,'p6-02',file))));
 const prior=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'tests/experiments/p6-longmem-hardening/evidence/final',file))));
 assert.deepEqual(omitTimes(fresh.records),omitTimes(prior.records),file+' query drift');checked+=fresh.records.length;
}
const sourceTrees=['Nine-cloud-P6-longmem-20261011','Nine-cloud-P6-longmem-hardening-20261011'].map(name=>{const directory=path.resolve(root,'..',name);const status=execFileSync('git',['status','--short'],{cwd:directory,encoding:'utf8'}).trim();assert.equal(status,'');return {directory,head:execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim(),status:'clean'};});
const result={main,p601,p602:p6,mergeSha:git('rev-parse','HEAD'),overlappingPaths:[],p6FileCount:manifest.length,mainPathsPreserved:mainPaths,p6GitBlobsUnchanged:true,checkoutNewlineDifferences,p601QualityUnchanged:true,p602QualityAndRawRecordsUnchanged:true,p602QueriesCompared:checked,sourceTrees,files:manifest};
fs.writeFileSync(path.join(out,'integrity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,files:undefined,mainPathsPreserved:mainPaths.length}));
