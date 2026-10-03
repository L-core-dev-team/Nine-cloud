#!/usr/bin/env node
// Produced from the tested clean review build; never invents author approval or live-provider acceptance.
import { readFileSync, writeFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'), out=resolve(root,'test-results/review-bundle');
// This packet reports preceding CI steps. A local invocation must not fabricate
// their success, nor attach an older build to a different checked-out commit.
if (process.env.GITHUB_ACTIONS !== 'true' || !/^\d+$/.test(process.env.GITHUB_RUN_ID || '')) throw new Error('CI_EVIDENCE_REQUIRED');
const build=JSON.parse(readFileSync(resolve(out,'artifact-manifest.json'),'utf8'));
const currentCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if (build.commit !== currentCommit) throw new Error('STALE_BUILD_EVIDENCE');
// SEC-04: bind to GitHub's actual head and completed test steps. This packet
// is generated inside its run, so final success is only knowable after upload.
// Do not require this still-running job to already be completed (circular gate).
const repositorySlug=process.env.GITHUB_REPOSITORY||'';
if (!/^[^/\s]+\/[^/\s]+$/.test(repositorySlug)) throw new Error('CI_REPOSITORY_REQUIRED');
if (!process.env.GITHUB_TOKEN || process.env.GITHUB_JOB !== 'verify') throw new Error('CI_JOB_AUTH_REQUIRED');
const headers={'user-agent':'jiuxiao-closeout',accept:'application/vnd.github+json',authorization:`Bearer ${process.env.GITHUB_TOKEN}`};
const base=`https://api.github.com/repos/${repositorySlug}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const runResponse=await fetch(base,{headers});
if (!runResponse.ok) throw new Error(`CI_RUN_VERIFY_FAILED_HTTP_${runResponse.status}`);
const run=await runResponse.json();
if(run.head_sha!==currentCommit||run.status!=='in_progress'||run.conclusion!==null)throw new Error('CI_RUN_HEAD_OR_STATUS_INVALID');
const required=['Migrate ephemeral test database','Run pnpm license:check','Test fail-closed media publication gate','Run pnpm typecheck','Run pnpm test','Run pnpm build','Prove the release-target build stays fail-closed while media licenses are pending','Build and smoke the production API container','Run PostgreSQL integration tests','Run pnpm test:e2e','Test durable turn UI recovery with synthetic receipts','Test isolated SMTP and cloud browser path','Verify isolated database backup restoration','Bind review artifacts to the tested commit'];
let verified=false;
for(let attempt=0;attempt<5&&!verified;attempt++){
 const jobsResponse=await fetch(`${base}/jobs?per_page=100`,{headers});
 if(!jobsResponse.ok)throw new Error(`CI_JOB_EVIDENCE_UNAVAILABLE_HTTP_${jobsResponse.status}`);
 const jobs=(await jobsResponse.json()).jobs||[];
 const job=jobs.find(candidate=>candidate.name==='verify'&&candidate.status==='in_progress'&&candidate.conclusion===null);
 const steps=job?.steps||[];
 verified=steps.some(step=>step.name==='Generate exact-build G1 and Canon review packets'&&step.status==='in_progress')&&required.every(name=>steps.some(step=>step.name===name&&step.status==='completed'&&step.conclusion==='success'));
 if(!verified&&attempt<4)await new Promise(resolve=>setTimeout(resolve,2000));
}
if(!verified)throw new Error('CI_REQUIRED_STEPS_NOT_SUCCESSFUL');
const digest=createHash('sha256').update(readFileSync(resolve(out,'artifact-manifest.json'))).digest('hex');
const canonBytes=readFileSync(resolve(root,'packages/content/src/canon-runtime.json'));
const canon=JSON.parse(canonBytes);const timestamp=new Date().toISOString();
const packet={kind:'AI_CONFIG_G1_PACKET',commit:build.commit,build_hash:`sha256:${digest}`,timestamp,ci_run_id:process.env.GITHUB_RUN_ID,
 test_results:{source:'GitHub CI preceding this artifact step',unit:'passed',typecheck:'passed',build:'passed',integration:'passed',browser:'passed',real_provider:'NOT_EXECUTED',physical_device:'NOT_EXECUTED'},
 manual_steps:['从本构建进入 AI 设置；确认 commit 和 build hash 相同','仅在内存输入自己的 Key；选择账号和地区可用的型号','执行一次短连接；核对成功/超时/限流提示和脱敏结果，不上传 Key 或完整响应','两位作者对同一 commit/build hash 分别留验收回执'],
 acceptance:{status:'HUMAN_GATE_PENDING',reviewers:['Bird','LYL'],receipts:[]}};
writeFileSync(resolve(out,'AI_CONFIG_G1_PACKET.json'),JSON.stringify(packet,null,2)+'\n');
writeFileSync(resolve(out,'CanonDigest.json'),JSON.stringify({kind:'CanonDigest',canon_version:canon.activeVersion,entry_count:canon.entries.length,hash:`sha256:${createHash('sha256').update(canonBytes).digest('hex')}`,timestamp,commit:build.commit,approval_status:'HUMAN_GATE_PENDING',receipts:[]},null,2)+'\n');
console.log('Generated exact-build AI G1 packet and CanonDigest; human gates remain pending.');
const media=JSON.parse(readFileSync(resolve(root,'apps/web/public/scenes/candidate/asset-manifest.json'),'utf8'));
writeFileSync(resolve(out,'MediaManifest.json'),JSON.stringify({kind:'MediaManifest',commit:build.commit,releaseApproved:false,assets:media.files.map(asset=>({asset_id:asset.sha256,scene:asset.sceneId,type:asset.mimeType,path:asset.path,license:'LICENSE_PENDING',fallback:`procedural:${asset.sceneId}`,sha256:asset.sha256}))},null,2)+'\n');
writeFileSync(resolve(out,'DeviceTestRecord.json'),JSON.stringify({kind:'DeviceTestRecord',commit:build.commit,build_hash:`sha256:${digest}`,status:'DEVICE_TEST_PENDING',device:null,browser:null,quality:null,powerSaving:null,fps:null,memory:null,temperature:null,battery:null,network:null,durationMinutes:null,fallbackEvidence:null,reviewer:null},null,2)+'\n');
writeFileSync(resolve(out,'S7ScopeGate.json'),JSON.stringify({kind:'S7ScopeGate',commit:build.commit,feature_flags:{billing:false,community:false},status:'DEFERRED_BY_DECISION',decision_source:'docs/adr/0004-1.0不含社区与收费.md',scope:'1.0 excludes community and billing'},null,2)+'\n');
const schema=JSON.parse(readFileSync(resolve(root,'packages/db/dist/build-manifest.json'),'utf8'));
const migrations=readdirSync(resolve(root,'packages/db/drizzle')).filter(name=>name.endsWith('.sql')).sort().map(name=>({name,sha256:createHash('sha256').update(readFileSync(resolve(root,'packages/db/drizzle',name))).digest('hex')}));
writeFileSync(resolve(out,'RC_MANIFEST.json'),JSON.stringify({RC_SHA:build.commit,ARTIFACT_HASH:`sha256:${digest}`,CANON_DIGEST:`sha256:${createHash('sha256').update(canonBytes).digest('hex')}`,DB_SCHEMA_VERSION:migrations.at(-1)?.name,DB_SCHEMA:schema,migrations,BUILD_ID:`${build.commit}:${process.env.GITHUB_RUN_ID}`,CI_RUN:process.env.GITHUB_RUN_ID,CI_STATUS_AT_GENERATION:run.status,FINAL_CI_SUCCESS_REQUIRES_RUN_COMPLETION:true,releaseApproved:false},null,2)+'\n');

const gateValues={RC_SHA:build.commit,ARTIFACT_HASH:`sha256:${digest}`,CANON_DIGEST:`sha256:${createHash('sha256').update(canonBytes).digest('hex')}`,DB_SCHEMA_VERSION:migrations.at(-1)?.name,BUILD_ID:`${build.commit}:${process.env.GITHUB_RUN_ID}`,CI_RUN:process.env.GITHUB_RUN_ID};
const gates=readFileSync(resolve(root,'docs/FINAL_HUMAN_GATES.md'),'utf8').replace(/\{\{(\w+)\}\}/g,(_all,key)=>gateValues[key]??'UNKNOWN');
writeFileSync(resolve(out,'FINAL_HUMAN_GATES.md'),gates);
