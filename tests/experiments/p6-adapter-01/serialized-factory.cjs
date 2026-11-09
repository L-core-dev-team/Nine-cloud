'use strict';
// A second test double exercises plain JSON payload copying across asynchronous calls. It is not PostgreSQL.
const {syntheticFactory}=require('./fixture-factory.cjs');
const json=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
async function createHarness(fixture){const h=await syntheticFactory(fixture);const reader={};for(const method of Object.keys(h.reader)){const base=h.reader[method].bind(h.reader);reader[method]=async(...args)=>{const options=args.pop();const mapped=args.map((v,i)=>i===0&&['beginRead','finishRead'].includes(method)?v:json(v));await new Promise(resolve=>queueMicrotask(resolve));return json(await base(...mapped,options));};}return {...h,reader};}
module.exports={createHarness};
