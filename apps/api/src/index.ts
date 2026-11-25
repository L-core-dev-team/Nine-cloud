import { localCardOptions, verifyLocalCardSchema } from './card-import/local-runtime.js';
import { eraseCardImports } from './card-import/host.js';
import { nativeTurnService } from './services/native-story-host.js';
import { StoryArchive } from './services/story-archive.js';
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
import { createPostgresServerTurnRepository } from './services/postgres-server-turn.js';
import { prepareTurnRuntime } from './services/turn-runtime.js';
import { loadConfiguredTurnPlugin } from './services/preview-release-runtime.js';
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

if(process.env.NODE_ENV==='production'&&process.env.STORY_ARCHIVE_ENABLED==='true')throw new Error('STORY_ARCHIVE_REQUIRES_SEPARATE_PRODUCTION_APPROVAL');
const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3_000 });
configureAccountQuota(pool);
pool.on('error', () => { console.error('Database connection unavailable.'); });
const cards = localCardOptions(pool, process.env);
const erasureUrl = process.env.ACCOUNT_ERASURE_DATABASE_URL;
if (erasureUrl) {
  if (!['test', 'development'].includes(process.env.NODE_ENV ?? '')) throw Error('LOCAL_ERASURE_HOST_REQUIRED');
  const runtimeTarget = new URL(databaseUrl), deleteTarget = new URL(erasureUrl);
  if (!['postgres:', 'postgresql:'].includes(deleteTarget.protocol) || !['127.0.0.1', '[::1]'].includes(deleteTarget.hostname)
      || deleteTarget.hostname !== runtimeTarget.hostname || (deleteTarget.port || '5432') !== (runtimeTarget.port || '5432')
      || deleteTarget.pathname !== runtimeTarget.pathname || deleteTarget.pathname.length < 2
      || deleteTarget.search || runtimeTarget.search || !deleteTarget.username || deleteTarget.username === runtimeTarget.username) {
    throw Error('LOCAL_ERASURE_DATABASE_IDENTITY_REQUIRED');
  }
}
const erasurePool = erasureUrl ? new Pool({connectionString: erasureUrl, max: 2, connectionTimeoutMillis: 3000}) : undefined;
erasurePool?.on('error', () => { console.error('Erasure connection unavailable.'); });
const emailAuth = createEmailAuthRuntime(pool, process.env, {
  ...(cards ? {beforeDelete: eraseCardImports} : {}), ...(erasurePool ? {erasurePool} : {}),
});
if (cards) {
  if (!emailAuth) throw new Error('CARD_AUTH_REQUIRED');
  await verifyLocalCardSchema(pool);
}
if(process.env.AUTH_MAIL_PREFLIGHT==='true')await emailAuth?.verifyMail();
const plugin=emailAuth?await loadConfiguredTurnPlugin(process.env):undefined;
const preparedRuntime=plugin?prepareTurnRuntime(plugin,await loadNarrativeSlots(process.env.NARRATIVE_CONFIG_PATH,process.env),Number(process.env.NARRATIVE_OUTPUT_BUDGET||32768)):undefined;
const runtime=preparedRuntime&&plugin?await connectActionTextRuntime(preparedRuntime,plugin):undefined;
const dataPolicy=process.env.NODE_ENV==='production'?loadDataPolicy(process.env.ACCOUNT_DATA_POLICY_PATH):undefined;
const cloudRepository=process.env.NODE_ENV==='production'?new PolicyCloudSaveRepository(pool,dataPolicy):new PostgresCloudSaveRepository(pool,true);
const turnRepository=createPostgresServerTurnRepository(pool, true,process.env.NODE_ENV==='production'?()=>dataPolicy:undefined);
const storyArchive=process.env.STORY_ARCHIVE_ENABLED==='true'?new StoryArchive(pool):undefined;
if(storyArchive)await pool.query('SELECT narrative_text FROM story_narratives LIMIT 0');
const app = createApp({ query: sql => pool.query(sql) }, emailAuth ? {
  service: new CloudSaveService(cloudRepository, true, true),
  archive: new CloudArchiveLifecycle(pool, true),
  auth: { resolveOwnerId: async request => (await emailAuth.service.resolve(sessionToken(request)))?.ownerId || null },
} : undefined, emailAuth, emailAuth ? {
  // No author rules are bundled: absent host plugin remains fail closed.
  service: nativeTurnService(pool,turnRepository,runtime,storyArchive),
  readReceipt: (owner,saveId,key)=>turnRepository.getReceiptForOwner(owner,saveId,key),
  games: new AuthoritativeGameService(cloudRepository,runtime),
  ...(storyArchive?{storyArchive}:{}),
  auth: { resolveOwnerId: async request => (await emailAuth.service.resolve(sessionToken(request)))?.ownerId || null },
  memoryRecall: turnRepository.recallObservationPage ? { reader: turnRepository.recallObservationPage } : undefined,
} : undefined, cards);

const server = serve({ fetch: app.fetch, port, hostname });
console.log(`jiuxiao-api listening on ${hostname}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => {
    void Promise.all([pool.end(), erasurePool?.end()]).then(
      () => process.exit(0),
      () => {
        console.error('Failed to close the database pool cleanly.');
        process.exit(1);
      },
    );
  }));
}
