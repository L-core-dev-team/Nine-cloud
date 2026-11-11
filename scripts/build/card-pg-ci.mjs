// Existing suites, distinct disposable databases; no card schema in formal migrations.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Ephemeral GitHub-hosted runner only');
const target=new URL(process.env.TEST_DATABASE_URL||'');
if(!['postgres:','postgresql:'].includes(target.protocol)||!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/jiuxiao_test'||target.search||target.hash)throw Error('Dedicated CI service database required');
target.hostname='127.0.0.1';
const {Pool}=createRequire(join(root,'apps/api/package.json'))('pg');
const admin=new Pool({connectionString:target.href});
const suffix=`${Date.now()}${process.pid}`, host=`jiuxiao_test_card_host_${suffix}`, joint=`jiuxiao_test_joint_${suffix}`, main=`jiuxiao_test_main${suffix}`;
const url=name=>{const u=new URL(target);u.pathname=`/${name}`;return u.href;};
const results=[];
function suite(files,env){
  const r=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run',...files,'--maxWorkers=1'],{cwd:join(root,'apps/api'),env:{...process.env,...env},encoding:'utf8',timeout:180_000});
  const output=String(r.stdout||'')+String(r.stderr||'');process.stdout.write(output);
  results.push({files,exit:r.status??-1});
  if(r.error||r.status!==0)throw Error(`Card PG suite failed (${r.status??r.error?.code})`);
}
try{
  for(const name of [host,joint])await admin.query(`CREATE DATABASE ${name}`);
  suite(['src/card-import/host.integration.test.ts'],{CARD_IMPORT_HOST_TEST_DATABASE_URL:url(host)});
  suite(['src/card-import/joint-host.integration.test.ts'],{JOINT_TEST_DATABASE_URL:url(joint)});
  await admin.query(`CREATE DATABASE ${main} TEMPLATE ${host}`);
  const password=randomBytes(24).toString('hex');
  await admin.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jiuxiao_narrative_erasure') THEN CREATE ROLE jiuxiao_narrative_erasure NOLOGIN; END IF; END $$`);
  // Created only on this disposable runner. No role takeover/ALTER of existing identities.
  await admin.query(`CREATE ROLE joint_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
  await admin.query(`CREATE ROLE joint_eraser LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
  await admin.query('GRANT jiuxiao_narrative_erasure TO joint_eraser');
  suite(['src/services/main-integration-lifecycle.integration.test.ts'],{MAIN_COMPOSITION_TEST_DATABASE_URL:url(main),MAIN_COMPOSITION_TEST_ROLE_PASSWORD:password});
}finally{
  await admin.end();
  await mkdir(join(root,'test-results/card-pg'),{recursive:true});
  await writeFile(join(root,'test-results/card-pg/results.json'),JSON.stringify({scope:'EPHEMERAL_CI_SYNTHETIC',results}));
  // Databases disappear with the CI service. Never issue DROP DATABASE or remove persistent volumes.
}
