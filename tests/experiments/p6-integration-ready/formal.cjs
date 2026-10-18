'use strict';
// Compile immutable production sources into this experiment only. No policy rewrite.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{createHash}=require('node:crypto'),{createRequire,stripTypeScriptTypes}=require('node:module'),{pathToFileURL}=require('node:url');
const root=__dirname,repo=path.resolve(root,'../../..'),runtime=path.join(root,'.runs/formal');
const hash=b=>createHash('sha256').update(b).digest('hex');
function prepare(){
 const sibling=path.resolve(repo,'../Nine-cloud-P6-main-sync-20261012');
 const depRequire=createRequire(path.join(sibling,'packages/contracts/package.json'));
 const zod=path.dirname(depRequire.resolve('zod/package.json'));
 const base='2647439e0cccc9a136606a81131519f53253f125';
 const source=f=>cp.execFileSync('git',['show',`${base}:${f}`],{cwd:repo,maxBuffer:4*1024*1024});
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only',base,'packages/contracts/src'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts'));
 files.push(...['policy','belief','retrieve','turn-journal','recall-authorized'].map(f=>`packages/domain/src/memory/${f}.ts`),'packages/domain/src/state-delta.ts',...['p1-memory-policy','npc-memory-recall','narrative-memory-context'].map(f=>`apps/api/src/services/${f}.ts`));
 fs.mkdirSync(runtime,{recursive:true});fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({type:'module'}));
 const manifests=[];
 for(const file of files){
   const bytes=source(file),javascript=stripTypeScriptTypes(bytes.toString('utf8'),{mode:'transform'});
   const target=path.join(runtime,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,javascript);manifests.push({file,sha256:hash(bytes)});
 }
 const nodeModules=path.join(runtime,'node_modules');fs.mkdirSync(nodeModules,{recursive:true});
 const zodLink=path.join(nodeModules,'zod');if(!fs.existsSync(zodLink))fs.symlinkSync(zod,zodLink,'junction');
 for(const name of ['contracts','domain']){
   const pkg=path.join(nodeModules,'@jiuxiao',name);fs.mkdirSync(pkg,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({type:'module',exports:'./index.js'}));
   const exports=name==='contracts'?['index']:['memory/policy','memory/belief','memory/retrieve','memory/turn-journal','memory/recall-authorized','state-delta'];
   fs.writeFileSync(path.join(pkg,'index.js'),exports.map(f=>`export * from '../../../packages/${name}/src/${f}.js';`).join('\n')+'\n');
 }
 for(const file of ['p4-recall-policy-v2.json','p4-recall-cues-v1.json']){const bytes=source('packages/domain/src/memory/'+file);manifests.push({file:'packages/domain/src/memory/'+file,sha256:hash(bytes)});}
 return {main:base,sources:manifests,nodeTypeTransformer:'node:module.stripTypeScriptTypes transform, '+process.version,zodSource:'read-only existing circle dependency',runtime:'experiment/.runs/formal'};
}
async function load(){
 const module=p=>import(pathToFileURL(path.join(runtime,p)).href);
 const [contracts,memory,policy,recall,narrative]=await Promise.all([module('packages/contracts/src/index.js'),module('node_modules/@jiuxiao/domain/index.js'),module('apps/api/src/services/p1-memory-policy.js'),module('apps/api/src/services/npc-memory-recall.js'),module('apps/api/src/services/narrative-memory-context.js')]);
 return {contracts,memory,policy,recall,narrative};
}
module.exports={prepare,load};
if(require.main===module)loadAfterPrepare();
async function loadAfterPrepare(){try{const manifest=prepare();await load();fs.mkdirSync(path.join(root,'evidence'),{recursive:true});const file=path.join(root,'evidence/formal-source-manifest.json');if(fs.existsSync(file))throw Error('Refuse overwrite formal manifest');fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({loaded:true,main:manifest.main,sourceFiles:manifest.sources.length}));}catch(e){console.error(e.message);process.exitCode=1;}}
