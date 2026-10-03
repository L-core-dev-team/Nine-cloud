import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForVerifiedSteps} from './ci-evidence.mjs';
const step=(status,conclusion)=>[{name:'verify',steps:[{name:'tests',status,conclusion}]}];
test('waits for delayed actual step success, rather than treating in-progress as passed',async()=>{
 let calls=0;await waitForVerifiedSteps(async()=>step(++calls===1?'in_progress':'completed',calls===1?null:'success'),['tests'],{attempts:2,delayMs:0});assert.equal(calls,2);
});
test('missing, failed and malformed evidence stay closed',async()=>{
 await assert.rejects(waitForVerifiedSteps(async()=>[],['tests'],{attempts:2,delayMs:0}),/NOT_SUCCESSFUL/);
 await assert.rejects(waitForVerifiedSteps(async()=>step('completed','failure'),['tests'],{attempts:2,delayMs:0}),/STEP_FAILED/);
 await assert.rejects(waitForVerifiedSteps(async()=>null,['tests'],{attempts:2,delayMs:0}),/INVALID/);
});
