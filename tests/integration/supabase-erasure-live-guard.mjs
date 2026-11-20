// Test-only boundary for a dedicated Supabase tenant and three generated users.
// Never import this module from an application or a production maintenance job.
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const PURPOSE = 'NINE-CLOUD-M3-SUPABASE-LIVE';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT = /^[a-z]{20}$/;
const validSecretKey = key => typeof key === 'string' && (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)
  || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key));
class BoundaryError extends Error {}
const fail = code => { throw new BoundaryError(`SUPABASE_LIVE_${code}`); };

function outside(child, parent) {
  const part = relative(parent, child);
  return part !== '' && (part === '..' || part.startsWith('..' + sep) || isAbsolute(part));
}

// Resolve existing ancestors too: a new output directory under a symlink must
// not turn an apparently external path into a directory inside the checkout.
function canonicalFutureDirectory(value) {
  let current = resolve(value);
  const suffix = [];
  while (!existsSync(current)) {
    const next = dirname(current);
    if (next === current) fail('OUTPUT_UNAVAILABLE');
    suffix.unshift(current.slice(next.length + (next.endsWith(sep) ? 0 : 1)));
    current = next;
  }
  if (!statSync(current).isDirectory()) fail('OUTPUT_UNAVAILABLE');
  return join(realpathSync(current), ...suffix);
}

export function validateLiveConfig(env, repoRoot) {
  if (!env || typeof env !== 'object') fail('CONFIG_REQUIRED');
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'production') fail('NONPRODUCTION_REQUIRED');
  if (env.CARD_SUPABASE_LIVE_CONFIRM !== 'SYNTHETIC_USERS_ONLY') fail('SYNTHETIC_CONFIRMATION_REQUIRED');
  const projectRef = env.CARD_SUPABASE_LIVE_PROJECT_REF;
  if (typeof projectRef !== 'string' || !PROJECT.test(projectRef)) fail('PROJECT_REF_REQUIRED');
  const origin = `https://${projectRef}.supabase.co`;
  if (env.SUPABASE_URL !== origin) fail('PROJECT_ORIGIN_MISMATCH');
  const secretKey = env.SUPABASE_SECRET_KEY;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (typeof secretKey !== 'string' || !secretKey.trim() || secretKey !== secretKey.trim()) fail('SECRET_KEY_REQUIRED');
  if (!validSecretKey(secretKey)) fail('SECRET_KEY_INVALID');
  if (typeof publishableKey !== 'string' || !publishableKey.trim() || publishableKey !== publishableKey.trim()) fail('PUBLISHABLE_KEY_REQUIRED');
  const pgBin = env.CARD_TEST_PG_BIN;
  if (typeof pgBin !== 'string' || !pgBin.trim()) fail('PG_BIN_REQUIRED');
  const expectedCommit = env.CARD_SUPABASE_LIVE_COMMIT;
  if (typeof expectedCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(expectedCommit)) fail('COMMIT_REQUIRED');
  const output = env.CARD_SUPABASE_LIVE_OUTPUT;
  if (typeof output !== 'string' || !isAbsolute(output)) fail('EXTERNAL_OUTPUT_REQUIRED');
  let outputRoot;
  try {
    if (typeof repoRoot !== 'string' || !isAbsolute(repoRoot) || !statSync(repoRoot).isDirectory()) fail('REPOSITORY_REQUIRED');
    const root = realpathSync(repoRoot);
    outputRoot = canonicalFutureDirectory(output);
    if (!outside(outputRoot, root)) fail('EXTERNAL_OUTPUT_REQUIRED');
  } catch (error) {
    if (error instanceof BoundaryError) throw error;
    fail('OUTPUT_UNAVAILABLE');
  }
  return { projectRef, origin, secretKey, publishableKey, pgBin, outputRoot, expectedCommit: expectedCommit.toLowerCase() };
}

export function createAdminBoundary({ config, runId, users, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  if (!config || !PROJECT.test(config.projectRef || '') || config.origin !== `https://${config.projectRef}.supabase.co`
    || !validSecretKey(config.secretKey)) fail('CONFIG_REQUIRED');
  const fixedOrigin = config.origin, adminKey = config.secretKey;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(runId)) fail('RUN_ID_REQUIRED');
  if (typeof fetchImpl !== 'function') fail('FETCH_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) fail('TIMEOUT_INVALID');
  if (!Array.isArray(users) || users.length !== 3) fail('THREE_USERS_REQUIRED');
  const registry = new Map(), labels = new Set(), emails = new Set();
  for (const user of users) {
    if (!user || typeof user.id !== 'string' || !UUID.test(user.id)
      || typeof user.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
      || typeof user.label !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(user.label)
      || registry.has(user.id) || labels.has(user.label) || emails.has(user.email)) fail('USER_REGISTRY_INVALID');
    registry.set(user.id, Object.freeze({ id: user.id, email: user.email, label: user.label }));
    labels.add(user.label); emails.add(user.email);
  }
  // Capture the supplied function now; replacing globalThis.fetch later cannot
  // recurse through this boundary or change its underlying network transport.
  const upstream = fetchImpl;
  const owned = new Set(), attempted = new Map(), entries = [];
  let deletes = 0;

  function matchesIdentity(value, user) {
    const item = value && typeof value === 'object' && 'user' in value ? value.user : value;
    return Boolean(item && typeof item === 'object' && item.id === user.id && item.email === user.email
      && item.app_metadata?.purpose === PURPOSE && item.app_metadata?.run_id === runId);
  }

  async function readResponse(response, signal) {
    const reader = response.clone().body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let size = 0;
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        if (signal.aborted) fail('NETWORK_UNKNOWN');
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 65_536) { cancel(); fail('RESPONSE_TOO_LARGE'); }
        chunks.push(Buffer.from(next.value));
      }
      if (signal.aborted) fail('NETWORK_UNKNOWN');
      return Buffer.concat(chunks).toString('utf8');
    } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  }

  async function boundaryFetch(input, init = {}) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input)); }
    catch { fail('REQUEST_FORBIDDEN'); }
    if (url.origin !== fixedOrigin || url.username || url.password || url.search || url.hash) fail('REQUEST_FORBIDDEN');
    if (init.redirect !== undefined && init.redirect !== 'error') fail('REDIRECT_FORBIDDEN');
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let user, body;
    if (method === 'POST' && url.pathname === '/auth/v1/admin/users') {
      let raw;
      try { raw = init.body !== undefined ? init.body : input instanceof Request ? await input.clone().text() : undefined; }
      catch { fail('CREATE_BODY_INVALID'); }
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) fail('CREATE_BODY_INVALID');
      try { body = JSON.parse(raw); } catch { fail('CREATE_BODY_INVALID'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['id', 'email', 'email_confirm', 'app_metadata'].includes(key))) fail('CREATE_BODY_INVALID');
      user = registry.get(body.id);
      const metadata = body.app_metadata;
      if (!user || body.email !== user.email || body.email_confirm !== true
        || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)
        || metadata.purpose !== PURPOSE || metadata.run_id !== runId
        || Object.keys(metadata).some(key => !['purpose', 'run_id', 'label'].includes(key))
        || (metadata.label !== undefined && metadata.label !== user.label)) fail('CREATE_IDENTITY_MISMATCH');
      if (attempted.has(user.id)) fail('CREATE_ALREADY_ATTEMPTED');
    } else if (method === 'GET' || method === 'DELETE') {
      const match = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(url.pathname);
      user = match ? registry.get(match[1]) : undefined;
      if (!user || init.body !== undefined || (input instanceof Request && input.body !== null)) fail('REQUEST_FORBIDDEN');
      if (method === 'DELETE' && !owned.has(user.id)) fail('DELETE_NOT_OWNED');
    } else fail('REQUEST_FORBIDDEN');
    if (entries.length >= 40) fail('REQUEST_BUDGET_EXHAUSTED');
    if (method === 'DELETE' && deletes >= 6) fail('DELETE_BUDGET_EXHAUSTED');

    const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    if (callerSignal?.aborted) fail('REQUEST_ABORTED');
    if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) fail('SIGNAL_INVALID');
    let suppliedHeaders;
    try { suppliedHeaders = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)); }
    catch { fail('AUTH_HEADERS_INVALID'); }
    const expectedAuthorization = adminKey.startsWith('sb_') ? null : `Bearer ${adminKey}`;
    if (suppliedHeaders.get('apikey') !== adminKey || suppliedHeaders.get('authorization') !== expectedAuthorization) fail('AUTH_HEADERS_INVALID');
    const controller = new AbortController();
    const signal = callerSignal ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal;
    const headers = { apikey: adminKey, accept: 'application/json' };
    if (!adminKey.startsWith('sb_')) headers.authorization = `Bearer ${adminKey}`;
    if (method === 'POST') headers['content-type'] = 'application/json';
    const request = { method, headers, redirect: 'error', signal, ...(body ? { body: JSON.stringify(body) } : {}) };
    const entry = { label: user.label, method, status: 'unknown' };
    entries.push(entry);
    if (method === 'DELETE') deletes += 1;
    if (method === 'POST') attempted.set(user.id, 'unknown');
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await upstream(url, request);
          if (!(response instanceof Response)) throw new Error('invalid response');
          if (signal.aborted) fail('NETWORK_UNKNOWN');
          entry.status = response.status;
          if (response.redirected || (response.status >= 300 && response.status < 400)) {
            if (method === 'POST') attempted.set(user.id, 'rejected');
            fail('REDIRECT_FORBIDDEN');
          }
          if (method === 'POST' && response.status >= 400 && response.status < 500) attempted.set(user.id, 'rejected');
          // Finish the bounded clone within the same timeout as the request.
          // The original remains readable, including non-2xx provider JSON.
          const responseText = await readResponse(response, signal);
          if ((method === 'POST' && response.ok) || (method === 'GET' && response.status === 200)) {
            let payload;
            try { payload = JSON.parse(responseText); } catch { fail('IDENTITY_UNVERIFIED'); }
            if (!matchesIdentity(payload, user)) {
              // Cleanup must not retain permission after a later identity
              // check finds a changed or unrelated account at the same ID.
              owned.delete(user.id);
              attempted.set(user.id, 'rejected');
              fail('IDENTITY_MISMATCH');
            }
            if (method === 'GET' && (!attempted.has(user.id) || attempted.get(user.id) === 'rejected')) fail('EXISTING_USER_NOT_OWNED');
            if (signal.aborted) fail('NETWORK_UNKNOWN');
            if (method === 'POST') attempted.set(user.id, 'confirmed');
            owned.add(user.id);
          }
          // A 404 is returned untouched. The runner independently checks the
          // user_not_found JSON; this boundary never declares deletion.
          return response;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); }),
      ]);
    } catch (error) {
      controller.abort();
      if (error instanceof BoundaryError) throw error;
      fail('NETWORK_UNKNOWN');
    }
    finally { clearTimeout(timer); }
  }
  return {
    fetch: boundaryFetch,
    get requests() { return entries.map(entry => ({ ...entry })); },
    get ownedIds() { return new Set(owned); },
  };
}
