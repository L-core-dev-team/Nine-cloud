'use strict';
const {isolatedPool,services}=require('./handover-test-support.cjs');
(async()=>{const pool=await isolatedPool();try{const s=await services(),repo=new s.NarrativePublicationRepository(pool,s.TEST_BODY_LIMITS),[mode,owner,save,key]=process.argv.slice(2);
 if(mode==='claim-and-wait'){const lease=await repo.claim(owner,save,key,500);if(!lease)throw Error('EXPECTED_LEASE');process.send?.({stage:'claimed',attempt:lease.attemptId,epoch:lease.leaseEpoch});await new Promise(()=>{});}
 else if(mode==='publish'){const worker=new s.NarrativeOutboxWorker(repo,new Map([['handover-fixture-v1',()=> '真实进程恢复后的合成正文。']]));const result=await worker.run(owner,save,key);process.send?.({stage:'published',result});}
 else throw Error('INVALID_WORKER_MODE');
 }finally{await pool.end();}})().then(()=>process.disconnect?.()).catch(e=>{console.error(e);process.exitCode=1;process.disconnect?.();});
