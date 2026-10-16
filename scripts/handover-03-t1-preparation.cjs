'use strict';
// Preparation only. Preserves the official matrix verbatim; never calls the action API.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createHash}=require('crypto');
const source=path.resolve(__dirname,'../docs/integration/handover-03/review-sources/正式玩法16项验收矩阵.md');
const bytes=fs.readFileSync(source),text=bytes.toString('utf8');
const cases=text.split(/\r?\n/).filter(l=>/^\|T\d{2} /.test(l)).map(l=>{
 const columns=l.slice(1,-1).split('|');assert.equal(columns.length,5);
 return{id:columns[0].match(/^T\d{2}/)[0],title:columns[0],inputAndFault:columns[1],databaseAssertions:columns[2],
  expectedAndForbidden:columns[3],evidenceAndPassGate:columns[4],status:'BLOCKED',reason:'Formal T1 V2 diff and aggregate not signed; entry not authorized or applied',executed:0};
});
assert.deepEqual(cases.map(c=>c.id),Array.from({length:16},(_,i)=>'T'+String(i+1).padStart(2,'0')));
const result={kind:'official-matrix-preparation-only',sourceSha256:createHash('sha256').update(bytes).digest('hex'),
 pass:0,fail:0,skip:0,blocked:16,executed:0,cases};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({sourceSha256:result.sourceSha256,pass:0,blocked:16,executed:0}));
