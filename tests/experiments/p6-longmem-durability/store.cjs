'use strict';
// Local semantic prototype. Caller scope is trusted input, not authentication.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {TextDecoder}=require('node:util');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const inputKeys=['sourceId','saveId','branchId','ownerId','revision','idempotencyKey','narrativeText','generationVersion','visibilitySnapshotId'];
const recordKeys=[...inputKeys,'sha256'];
class NarrativeStoreError extends Error {
 constructor(code,message,cause){super(message,cause?{cause}:undefined);this.name='NarrativeStoreError';this.code=code;}
}
const error=(code,message,cause)=>new NarrativeStoreError(code,message,cause);
function exactKeys(value,keys){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}
function id(value){return typeof value==='string'&&value.length>0&&value.length<=200&&value.isWellFormed();}
function validScope(scope){return exactKeys(scope,['ownerId','saveId','branchId'])&&['ownerId','saveId','branchId'].every(k=>id(scope[k]));}
function validFields(value){
 return ['sourceId','saveId','branchId','ownerId','idempotencyKey','generationVersion'].every(k=>id(value[k]))
  &&Number.isSafeInteger(value.revision)&&value.revision>=0
  &&typeof value.narrativeText==='string'&&value.narrativeText.length>0&&value.narrativeText.isWellFormed()
  &&(value.visibilitySnapshotId===null||id(value.visibilitySnapshotId));
}
// Stable canonical field order makes metadata integrity independent of parsed key order.
function canonical(record){return JSON.stringify(Object.fromEntries(recordKeys.map(k=>[k,record[k]])));}
function scopeOf(record){return {ownerId:record.ownerId,saveId:record.saveId,branchId:record.branchId};}
class NarrativeFileStore {
 constructor(directory){
  if(typeof directory!=='string'||!directory.length)throw error('INVALID_INPUT','Storage directory required.');
  this.directory=path.resolve(directory);
 }
 recordPath(scope,sourceId){
  if(!validScope(scope)||!id(sourceId))throw error('INVALID_INPUT','Invalid scope or source identity.');
  const scopeHash=sha256(JSON.stringify([scope.ownerId,scope.saveId,scope.branchId]));
  // IDs never become literal path components, including IDs containing ../ or slashes.
  return path.join(this.directory,scopeHash,sha256(sourceId)+'.json');
 }
 save(input){
  if(!exactKeys(input,inputKeys)||!validFields(input))throw error('INVALID_INPUT','Invalid narrative record; no data was written.');
  const record=Object.fromEntries(inputKeys.map(k=>[k,input[k]]));
  record.sha256=sha256(Buffer.from(input.narrativeText,'utf8'));
  const scope=scopeOf(record),file=this.recordPath(scope,record.sourceId);
  const bytes=Buffer.from(JSON.stringify({format:'p6-original-narrative-v1',record,recordSha256:sha256(canonical(record))})+'\n','utf8');
  try {
   fs.mkdirSync(path.dirname(file),{recursive:true});
   // Exclusive creation prevents this API from replacing an existing source file.
   // No fsync, atomic publish, multi-record transaction or crash guarantee is claimed.
   fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
   return {status:'saved',record:{...record}};
  }catch(cause){
   if(cause.code!=='EEXIST')throw error('WRITE_FAILED','Could not completely save the source; inspect the file before retry.',cause);
   const previous=this.load(scope,record.sourceId);
   if(!previous)throw error('WRITE_FAILED','Source disappeared during duplicate verification.');
   if(canonical(previous)!==canonical(record))throw error('SOURCE_CONFLICT','Existing source differs in text or provenance; overwrite refused.');
   return {status:'duplicate',record:previous};
  }
 }
 load(scope,sourceId){
  const file=this.recordPath(scope,sourceId);let bytes;
  try{bytes=fs.readFileSync(file);}catch(cause){
   if(cause.code==='ENOENT')return undefined;
   throw error('READ_FAILED','Could not read the source.',cause);
  }
  try{
   const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!exactKeys(envelope,['format','record','recordSha256'])||envelope.format!=='p6-original-narrative-v1')throw Error('Invalid file format');
   const record=envelope.record;
   if(!exactKeys(record,recordKeys)||!validFields(record)||!/^\p{ASCII_Hex_Digit}{64}$/u.test(record.sha256)||!/^\p{ASCII_Hex_Digit}{64}$/u.test(envelope.recordSha256))throw Error('Invalid fields');
   if(record.sourceId!==sourceId||JSON.stringify(scopeOf(record))!==JSON.stringify(scopeOf(scope)))throw Error('Scope or identity mismatch');
   if(sha256(Buffer.from(record.narrativeText,'utf8'))!==record.sha256||sha256(canonical(record))!==envelope.recordSha256)throw Error('Integrity mismatch');
   return {...record};
  }catch(cause){throw error('CORRUPT_RECORD','Source is corrupt, truncated, or mismatched; recovery refused.',cause);}
 }
}
// visibilitySnapshotId is stored only. No NPC read/grant API exists in this prototype.
module.exports={NarrativeFileStore,NarrativeStoreError,sha256};
