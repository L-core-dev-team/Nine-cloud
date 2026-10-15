// Exercises compiled preview assets, including their real chunk dependency graph.
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../../apps/web/dist');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
 try {
  let file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  if (req.url.startsWith('/api/')) { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"code":"UNAUTHENTICATED"}'); return; }
  if (!existsSync(file) || !statSync(file).isFile()) file = resolve(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
 } catch { res.writeHead(500).end(); }
});
(async () => {
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 const origin = process.env.PREVIEW_GAMEPLAY_ORIGIN || `http://127.0.0.1:${server.address().port}`;
 const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser = await chromium.launch({ executablePath: existsSync(edge) ? edge : undefined });
 try {
  for (const mode of ['continue', 'forgetting']) {
   const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
   const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
   await page.goto(origin + '/new');
   await page.getByRole('textbox', { name: '姓名', exact: true }).fill('预览构建检查');
   await page.getByRole('button', { name: '下一步', exact: true }).click();
   await page.getByRole('button', { name: '下一步', exact: true }).click();
   await page.locator(`input[name="p2-memory-mode"][value="${mode}"]`).check();
   await page.getByRole('button', { name: /保存角色并进入/ }).click();
   await page.getByTestId('p2-review-gameplay').waitFor({ timeout: 20000 });
   await page.getByTestId('p2-suggestion-talk-0').click();
   await page.getByTestId('p2-submit-action').click();
   await page.waitForFunction(() => document.querySelector('[data-testid="p2-revision"]')?.textContent === '1');
   await page.reload(); await page.getByTestId('p2-review-gameplay').waitFor();
   assert.equal(await page.getByTestId('p2-revision').textContent(), '1');
   assert.deepEqual(errors, []); await context.close();
  }
  console.log(JSON.stringify({ status: 'PASS', origin, modes: ['continue', 'forgetting'], create: true, firstTurn: true, reloadRevision: 1, realCompiledChunks: true }));
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
