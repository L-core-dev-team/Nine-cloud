import { NarrativePublicationRepository } from './services/narrative-publication-repository.js';
import {prepareNarrativeV2RuntimeDraft} from './services/narrative-v2-runtime-draft.js';
import {configureAccountQuota} from './services/account-rate-limit.js';
import {loadDataPolicy} from './services/data-policy-node.js';
import {PolicyCloudSaveRepository} from './services/policy-cloud-save-repository.js';
import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { createEmailAuthRuntime } from './services/auth-runtime.js';
import { CloudSaveService } from './services/cloud-save-service.js';
import { PostgresCloudSaveRepository } from './services/postgres-cloud-save-repository.js';
import { sessionToken } from './routes/auth.js';
import { CloudArchiveLifecycle } from './services/cloud-archive-lifecycle.js';
import { ServerTurnService } from './services/server-turn.js';
import { createPostgresServerTurnRepository } from './services/postgres-server-turn.js';
import { loadTurnPlugin, prepareTurnRuntime } from './services/turn-runtime.js';
import {loadNarrativeSlots} from './services/provider-narrative.js';
import {AuthoritativeGameService} from './services/authoritative-game.js';
import { connectActionTextRuntime } from './services/gameplay-runtime.js';

const port = Number(process.env.API_PORT ?? 8787);
const hostname = process.env.API_HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3_000 });
configureAccountQuota(pool);
pool.on('error', () => { console.error('Database connection unavailable.'); });
const emailAuth = createEmailAuthRuntime(pool, process.env);
if(process.env.AUTH_MAIL_PREFLIGHT==='true')await emailAuth?.verifyMail();
const plugin=emailAuth?await loadTurnPlugin(process.env.TURN_RULES_MODULE):undefined;
const preparedRuntime=plugin?prepareTurnRuntime(plugin,await loadNarrativeSlots(process.env.NARRATIVE_CONFIG_PATH,process.env),Number(process.env.NARRATIVE_OUTPUT_BUDGET||32768)):undefined;
const runtime=preparedRuntime&&plugin?await connectActionTextRuntime(preparedRuntime,plugin):undefined;
const dataPolicy=process.env.NODE_ENV==='production'?loadDataPolicy(process.env.ACCOUNT_DATA_POLICY_PATH):undefined;
const cloudRepository=process.env.NODE_ENV==='production'?new PolicyCloudSaveRepository(pool,dataPolicy):new PostgresCloudSaveRepository(pool,true);
// REVIEW DRAFT. The existing signature loader still pins the original aggregate and fails closed.
const v2Requested=process.env.NARRATIVE_T1_V2_ENABLED==='true';
// A protocol-capable instance cannot start a legacy writer after the durable cutover fence exists.
if(!v2Requested && (await pool.query("SELECT to_regclass('public.narrative_writer_fence') AS t")).rows[0].t
  && (await pool.query('SELECT singleton FROM narrative_writer_fence WHERE singleton=true')).rowCount)
  throw Error('LEGACY_WRITER_DISABLED_BY_DURABLE_FENCE');
if(v2Requested && (!runtime?.rules || !runtime.narrativeFallback || !process.env.NARRATIVE_RENDERER_VERSION
  || process.env.NARRATIVE_PUBLICATION_READS_ENABLED!=='true')) throw Error('T1_V2_PAIRED_RUNTIME_REQUIRED');
const v2=v2Requested && runtime?.rules && runtime.narrativeFallback ? await prepareNarrativeV2RuntimeDraft({pool,
  rules:runtime.rules,render:runtime.narrativeFallback,rendererVersion:process.env.NARRATIVE_RENDERER_VERSION!,
  limits:{maxUtf16:Number(process.env.NARRATIVE_MAX_UTF16),maxUtf8:Number(process.env.NARRATIVE_MAX_UTF8)},
  ...(process.env.NODE_ENV==='production'?{policy:()=>dataPolicy}:{})}) : undefined;
const turnRepository=v2?.turns??createPostgresServerTurnRepository(pool, true,process.env.NODE_ENV==='production'?()=>dataPolicy:undefined);
const app = createApp({ query: sql => pool.query(sql) }, emailAuth ? {
  service: new CloudSaveService(cloudRepository, true, true),
  archive: new CloudArchiveLifecycle(pool, true),
  auth: { resolveOwnerId: async request => (await emailAuth.service.resolve(sessionToken(request)))?.ownerId || null },
} : undefined, emailAuth, emailAuth ? {
  // No author rules are bundled: absent host plugin remains fail closed.
  service: v2?.service??new ServerTurnService(turnRepository,runtime?.rules,runtime?.narrator,120_000,runtime?.narrativeFallback),
  readReceipt: (owner, saveId, key) => turnRepository.getReceiptForOwner(owner, saveId, key),
  games: new AuthoritativeGameService(cloudRepository,runtime),
  auth: { resolveOwnerId: async request => (await emailAuth.service.resolve(sessionToken(request)))?.ownerId || null },
  memoryRecall: turnRepository.recallObservationPage ? { reader: turnRepository.recallObservationPage } : undefined,
} : undefined, emailAuth && process.env.NARRATIVE_PUBLICATION_READS_ENABLED==='true' ? {
  auth:{resolveOwnerId:async request=>(await emailAuth.service.resolve(sessionToken(request)))?.ownerId||null},
  repository:v2?.publication??new NarrativePublicationRepository(pool),
} : undefined);

// Only registered pending/expired jobs are consumed. No worker is called by an action duplicate or GET.
let draining=false;
const dispatch=v2?setInterval(()=>{
  if(draining)return;draining=true;
  void v2.worker.drain(20).catch(()=>{console.error('Narrative worker unavailable.');}).finally(()=>{draining=false;});
},500):undefined;
const server = serve({ fetch: app.fetch, port, hostname });
console.log(`jiuxiao-api listening on ${hostname}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  if(dispatch)process.once(signal,()=>clearInterval(dispatch));
  process.on(signal, () => server.close(() => {
    void pool.end().then(
      () => process.exit(0),
      () => {
        console.error('Failed to close the database pool cleanly.');
        process.exit(1);
      },
    );
  }));
}
