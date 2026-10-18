'use strict';
// Only development tooling refers to the old circle workspace. Core adapter accepts injected validators.
const path=require('node:path'),{pathToFileURL}=require('node:url');
const old=path.resolve(__dirname,'../../../../Nine-cloud-P6-integration-ready-20261013/tests/experiments/p6-integration-ready');
async function validators(){const formal=await require(path.join(old,'formal.cjs')).load();const {EvidenceResultSchema}=await import(pathToFileURL(path.join(old,'runtime-schema.ts')).href);return {receiptSchema:formal.contracts.TurnReceiptV2Schema,evidenceSchema:EvidenceResultSchema};}
module.exports={validators,old};
