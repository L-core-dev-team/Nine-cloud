import {setTimeout as sleep} from 'node:timers/promises';
/** GitHub step updates may lag runner execution; never infer success from absence. */
export async function waitForVerifiedSteps(readJobs,required,{attempts=20,delayMs=2000}={}){
 let missing=required;
 for(let attempt=0;attempt<attempts;attempt++){
  const jobs=await readJobs();if(!Array.isArray(jobs))throw Error('CI_JOB_EVIDENCE_INVALID');
  const job=jobs.find(job=>job.name==='verify');
  if(job){
   if(!Array.isArray(job.steps))throw Error('CI_JOB_EVIDENCE_INVALID');
   if(job.steps.some(step=>required.includes(step.name)&&['failure','cancelled','skipped','timed_out'].includes(step.conclusion)))throw Error('CI_REQUIRED_STEP_FAILED');
   missing=required.filter(name=>!job.steps.some(step=>step.name===name&&step.status==='completed'&&step.conclusion==='success'));
   if(!missing.length)return;
  }
  if(attempt+1<attempts)await sleep(delayMs);
 }
 throw Error('CI_REQUIRED_STEPS_NOT_SUCCESSFUL:'+missing.join(','));
}
