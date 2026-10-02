#!/usr/bin/env node
// Produced from the tested clean review build; never invents author approval or live-provider acceptance.
import { readFileSync, writeFileSync } from 'node:fs';
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
writeFileSync(resolve(out,'S7ScopeGate.json'),JSON.stringify({kind:'S7ScopeGate',commit:build.commit,feature_flags:{billing:false,community:false},status:'OWNER_DECISION_PENDING',engineering_work:'deferred_pending_LYL_scope',release_scope_approved:false,receipts:[]},null,2)+'\n');
