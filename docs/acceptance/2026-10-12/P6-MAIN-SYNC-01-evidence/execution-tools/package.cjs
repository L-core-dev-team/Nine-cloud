const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{gzipSync,gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'../../项目/Nine-cloud-P6-main-sync-20261012');
const out=path.join(root,'docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const compressed=[];
for(const file of fs.readdirSync(path.join(out,'p6-01')).filter(n=>n.endsWith('.json'))){
 const target=path.join(out,'p6-01',file),raw=fs.readFileSync(target);
 if(raw.length<100000)continue;
 const archive=target+'.gz',zip=gzipSync(raw);assert.equal(hash(gunzipSync(zip)),hash(raw));fs.writeFileSync(archive,zip);assert.equal(hash(gunzipSync(fs.readFileSync(archive))),hash(raw));
 // Only these newly generated, verified copies are removed; source evidence is untouched.
 assert.ok(target.startsWith(path.join(out,'p6-01')+path.sep));fs.unlinkSync(target);compressed.push({file:'p6-01/'+file+'.gz',rawBytes:raw.length,rawSha256:hash(raw),gzipBytes:zip.length});
}
fs.writeFileSync(path.join(out,'lossless-compression.json'),JSON.stringify(compressed,null,2)+'\n');
const tools=path.join(out,'execution-tools');fs.mkdirSync(tools,{recursive:true});
for(const file of fs.readdirSync(__dirname).filter(n=>/\.(cjs|ts)$/.test(n)))fs.copyFileSync(path.join(__dirname,file),path.join(tools,file));
fs.writeFileSync(path.join(out,'.gitattributes'),'* -text\n');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=walk(out).filter(f=>!f.endsWith('delivery-evidence-manifest.json')).map(file=>{const b=fs.readFileSync(file);return {path:path.relative(out,file).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)};});
fs.writeFileSync(path.join(out,'delivery-evidence-manifest.json'),JSON.stringify({testedMergeSha:'4d71ddd024a06cec44e752f6e0ff0be84e633c25',files},null,2)+'\n');
console.log(JSON.stringify({compressed:compressed.length,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0)}));
