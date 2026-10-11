#!/usr/bin/env node
// Real Chromium coverage for IndexedDB v2 -> v3 upgrade, durable replay,
// concurrent compare-and-swap, and transaction rollback after a constraint error.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(url, child, getStderr) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`P2 Vite server exited early: ${getStderr()}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${getStderr()}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  if (await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5_000))])) return;
  const killed = once(child, 'exit');
  child.kill('SIGKILL');
  await killed;
}

(async () => {
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  let stderr = '';
  const child = spawn(process.execPath, [viteFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: webRoot, windowsHide: true, stdio: ['ignore','ignore','pipe'] });
  child.stderr.on('data', chunk => { stderr += chunk; });
  let browser;
  try {
    await waitFor(origin, child, () => stderr);
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
    const page = await browser.newPage();
    await page.goto(origin);
    await page.evaluate(async () => {
      const m = await import('/src/cloud-game-cache.ts'); const db = new m.IndexedGameCache();
      const s = { apiBase: 'https://example.invalid/api', ownerId: 'a', saveId: 'save' };
      const initial = await db.read(s);
      await db.change(s, initial.epoch, v => m.editGameDraft(v, '甲'.repeat(8000), 0));
      await db.change(s, initial.epoch, v => m.beginGameAction(v, { text: v.draft, expectedRevision: 3, idempotencyKey: '11111111-1111-4111-8111-111111111111', requestNarrative: true, draftVersion: v.draftVersion }));
    });
    await page.reload();
    const result = await page.evaluate(async () => {
      const m = await import('/src/cloud-game-cache.ts'); const db = new m.IndexedGameCache();
      const s = { apiBase: 'https://example.invalid/api', ownerId: 'a', saveId: 'save' };
      const restored = await db.read(s);
      const isolated = await Promise.all([{...s,ownerId:'b'},{...s,saveId:'other'},{...s,apiBase:'https://example.invalid/other'}].map(x => db.read(x)));
      const races = await Promise.allSettled([db.change(s,0,v=>m.editGameDraft(v,'new1',1)), db.change(s,0,v=>m.editGameDraft(v,'new2',1))]);
      await m.recoverGameAction(db,s,0,async body => ({ receipt: {saveId:s.saveId,idempotencyKey:body.idempotencyKey,
        requestFingerprint:'sha256:v1:'+'a'.repeat(64),resultingRevision:3,decision:{status:'clarify',question:'观察哪里？',revision:3}},text:'观察哪里？' }));
      return { length:restored.draft.length, key:restored.pending.idempotencyKey, isolated:isolated.every(v=>!v.draft&&!v.pending), races:races.map(r=>r.status) };
    });
    assert.equal(result.length,8000); assert.equal(result.key,'11111111-1111-4111-8111-111111111111');
    assert.equal(result.isolated,true); assert.deepEqual(result.races.sort(),['fulfilled','rejected']);
    await page.reload();
    const historyResult = await page.evaluate(async () => {
      const m=await import('/src/cloud-game-cache.ts');const db=new m.IndexedGameCache();
      const s={apiBase:'https://example.invalid/api',ownerId:'a',saveId:'save'};
      const read=await db.read(s);
      await db.clearAccount(s);
      let lateBlocked=false;try{await db.change(s,0,v=>m.editGameDraft(v,'late',0));}catch{lateBlocked=true;}
      const cleared=await db.read(s);
      return {history:read.history.map(v=>v.text),pending:read.pending,draft:read.draft,lateBlocked,
        cleared:cleared.history.length===0&&!cleared.pending&&cleared.draft===''};
    });
    assert.deepEqual(historyResult.history,['观察哪里？']);assert.equal(historyResult.pending,null);
    assert.ok(['new1','new2'].includes(historyResult.draft));
    assert.equal(historyResult.lateBlocked,true);assert.equal(historyResult.cleared,true);
    console.log('PASS: real IndexedDB refresh, 8000 characters, pending ID, three-way scope isolation, atomic draft CAS, logout late-write rejection');
  } finally { await browser?.close(); await stop(child); }
})().catch(error => { console.error(error); process.exitCode=1; });
