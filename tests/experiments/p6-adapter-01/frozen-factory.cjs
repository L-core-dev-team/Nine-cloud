'use strict';
// Third test factory: immutable JSON responses, to ensure the suite's fault injection never mutates backend-owned DTOs.
const {createHarness:serialized}=require('./serialized-factory.cjs');
const freeze=v=>{if(v&&typeof v==='object'){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;};
async function createHarness(fixture){const h=await serialized(fixture);const reader={};for(const [key,method] of Object.entries(h.reader))reader[key]=async(...args)=>freeze(await method(...args));return {...h,reader};}
module.exports={createHarness};
