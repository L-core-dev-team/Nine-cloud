'use strict';
const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=__dirname,repo=path.resolve(root,'../../..'),circle='C:/Users/11954/Desktop/水龙吟专用',original=path.join(circle,'项目/Nine-cloud-P6-longmem-06-20261014');
const name=process.argv[2]??'audit-01',regressionName=process.argv[3]??'frozen-01';if(!/^[a-z0-9-]+$/.test(name)||!/^[a-z0-9-]+$/.test(regressionName))throw Error('Safe new run names required');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const git=(args,cwd=repo)=>execFileSync('git',args,{cwd,maxBuffer:16*1024*1024}).toString().trim();
const inherited=[];for(const label of ['p6-longmem-05c','p6-longmem-06']){const base=path.resolve(root,'../'+label),m=read(path.join(base,'file-manifest.json'));for(const e of m.entries){if(sha(fs.readFileSync(path.join(base,e.path)))!==e.sha256)throw Error('Inherited hash mismatch: '+label+'/'+e.path);const originalFile=path.join(original,'tests/experiments',label,e.path);if(sha(fs.readFileSync(originalFile))!==e.sha256)throw Error('Original hash mismatch: '+e.path);}inherited.push({label,unchanged:m.entries.length});}
const before=git(['status','--porcelain'],original);if(before)throw Error('Original 06 is dirty');
const originalHead=git(['rev-parse','HEAD'],original);if(originalHead!=='8b06d0606a665b06b8d2a23c78e888bde2d78265')throw Error('Original moved');
const base=path.resolve(root,'../p6-longmem-05c/fixtures/holdout-10000-'),gun=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p)));
const d=gun(base+'dataset.json.gz'),qs=gun(base+'questions.json.gz'),s=d.turns.find(s=>s.sourceId==='long:2:6'),q=qs.find(q=>q.questionId==='holdout:2:consumed:52');
const span=q.expectedSpans[0];if(s.narrative.slice(span.start,span.end)!==span.text||sha(s.narrative)!==span.sha256)throw Error('Frozen source/UTF16 mismatch');
const regression=read(path.join(root,'evidence',regressionName,'comparison.json'));if(regression.differing)throw Error('Baseline behavior changed');
const summary={status:'PASS',baseline:originalHead,original06Clean:true,inherited,sourceSha256:sha(s.narrative),frozenEvidence:{start:span.start,end:span.end,text:span.text},openQuote:s.narrative.indexOf('“'),bindingsAvailable:!!d.evidenceBindings?.[s.facts[0].id],comparedQueries:regression.compared,differing:regression.differing,targetStrictPass:regression.target.filter(r=>r.pass).length,targetCount:regression.target.length,algorithmDiffFiles:git(['diff','--name-only','HEAD','--','tests/experiments/p6-longmem-06']).split('\n').filter(Boolean),environment:{node:process.version,platform:process.platform,arch:process.arch,git:git(['--version'])}};
if(summary.algorithmDiffFiles.length)throw Error('Unexpected algorithm edit');
const out=path.join(root,'evidence',name);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(out,'target-frozen-evidence.json'),JSON.stringify({source:s,question:q,actual:regression.target},null,2));console.log(JSON.stringify(summary));
