// Built-UI presentation regression with synthetic data and fully intercepted API traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const dist = path.resolve(process.env.UI_NARRATIVE_DIST || path.join(root, 'apps/web/dist'));
const output = path.resolve(process.env.UI_NARRATIVE_OUTPUT || path.join(root, 'test-results/cloud-narrative-reading'));
const narrative = '第一段：山门。\n\n第二段：灯火。\n第三段：行旅。\nhttps://example.invalid/' + 'a'.repeat(260) + '\n' + 'X'.repeat(300) + '\n最后一行：正文完整保留。';
const localText = '本地原文第一段。\n\n本地原文第二段。';
let server, browser;
(async () => {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Build Web first');
  fs.mkdirSync(path.join(output, 'tmp'), { recursive: true });
  process.env.TEMP = path.join(output, 'tmp'); process.env.TMP = process.env.TEMP;
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    let file = path.resolve(dist, '.' + pathname);
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined), headless: true });
  const results = [];
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const now = '2026-10-24T00:00:00.000Z';
    const local = { schemaVersion: 1, saveId: 'narrative-local', name: '合成本地对照', createdAt: now, updatedAt: now, revision: 0, canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', character: { name: '合成人物', description: '合成长资料。\n'.repeat(150) }, location: 'fixture', status: 'pending_rules', messages: [{ role: 'assistant', content: localText }] };
    await context.addInitScript(save => localStorage.setItem('jiuxiao_1_local_saves', JSON.stringify([save])), local);
    const cloud = { schemaVersion: 1, saveId: 'narrative-cloud', canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture', revision: 0, state: { playerId: 'fixture', locationId: 'fixture', elapsedMinutes: 0, facts: { gameMinute: 0 } } };
    const requests = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      requests.push({ path: url.pathname, method: request.method() });
      let status = 200, body;
      if (url.pathname === '/api/auth/session') body = { account: { id: 'synthetic-owner', kind: 'guest' } };
      else if (url.pathname.endsWith('/action-suggestions')) body = { actions: [] };
      else if (url.pathname === '/api/games/' + cloud.saveId) body = { save: cloud };
      else if (url.pathname === '/api/games/' + cloud.saveId + '/turns' && request.method() === 'POST') {
        const input = request.postDataJSON();
        body = { receipt: { idempotencyKey: input.idempotencyKey, saveId: cloud.saveId, requestFingerprint: 'sha256:v1:' + '0'.repeat(64), resultingRevision: 0, decision: { status: 'rejected', code: 'INPUT_SYNTHETIC', message: 'fixture', revision: 0 } }, narrative: { text: narrative } };
      } else { status = 404; body = { code: 'NOT_FOUND' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function checkInput(selector) {
      const input = page.locator(selector); await input.fill('未提交的输入对照');
      const geometry = await input.evaluate(element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, visible: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; });
      assert.ok(geometry.top >= 0 && geometry.bottom <= 844 && geometry.visible, JSON.stringify(geometry));
      assert.equal(await input.inputValue(), '未提交的输入对照');
      return geometry;
    }
    async function checkDialog(buttonName) {
      const trigger = page.getByRole('button', { name: buttonName, exact: true }); await trigger.click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      assert.ok(await dialog.isVisible());
      await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)));
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      assert.ok(await trigger.evaluate(element => element === document.activeElement));
    }
    await page.goto(origin + '/game/' + cloud.saveId);
    await page.getByTestId('p2-action-input').fill('synthetic display request');
    await page.getByTestId('p2-submit-action').click(); await page.getByTestId('p2-narrative').waitFor();
    const text = page.getByTestId('p2-narrative');
    assert.equal(await text.textContent(), narrative, 'Keep all original characters');
    assert.equal(await text.innerText(), narrative, 'Preserve hard line breaks and blank lines');
    const geometry = await text.evaluate(element => {
      const reading = element.closest('.story-reading'), style = getComputedStyle(element);
      const topAt = index => { const range = document.createRange(); range.setStart(element.firstChild, index); range.setEnd(element.firstChild, index + 1); return range.getBoundingClientRect().top; };
      return { lineHeight: parseFloat(style.lineHeight), first: topAt(0), second: topAt(element.textContent.indexOf('第二段')), third: topAt(element.textContent.indexOf('第三段')), textWidth: element.clientWidth, textScrollWidth: element.scrollWidth, readingWidth: reading.clientWidth, readingScrollWidth: reading.scrollWidth, documentWidth: document.documentElement.scrollWidth, wordBreak: style.wordBreak, overflow: [element, element.parentElement, reading].map(e => getComputedStyle(e).overflowX) };
    });
    assert.ok(geometry.second - geometry.first >= geometry.lineHeight * 1.9, 'Blank line has visible height');
    assert.ok(geometry.third - geometry.second >= geometry.lineHeight * 0.9, 'Single newline remains visible');
    assert.ok(geometry.textScrollWidth <= geometry.textWidth + 1 && geometry.readingScrollWidth <= geometry.readingWidth + 1 && geometry.documentWidth <= width + 1, JSON.stringify(geometry));
    assert.equal(geometry.wordBreak, 'normal', 'Keep normal Chinese line breaking');
    assert.ok(geometry.overflow.every(value => !['hidden', 'clip'].includes(value)), 'Do not clip the narrative');
    await text.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'cloud-' + width + '.png') });
    const cloudInput = await checkInput('#p2-action-input');
    await checkDialog('存档状态');
    assert.equal(await page.getByTestId('p2-action-input').inputValue(), '未提交的输入对照');
    assert.equal(await page.getByTestId('p2-revision').innerText(), '0');
    assert.equal(requests.filter(r => r.method === 'POST').length, 1);
    await page.goto(origin + '/game/' + local.saveId);
    const localBody = page.locator('.story-message p'); await localBody.waitFor();
    assert.equal(await localBody.textContent(), localText); assert.equal(await localBody.innerText(), localText);
    const localInput = await checkInput('#player-intent');
    await checkDialog('角色状态');
    assert.equal(await page.locator('#player-intent').inputValue(), '未提交的输入对照');
    const localState = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves')));
    assert.deepEqual(localState.find(save => save.saveId === local.saveId), local);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'local-' + width + '.png') });
    results.push({ width, status: 'PASS', geometry, cloudInput, localInput, localTextUnchanged: true, inputAndDialogs: 'PASS', mockedApiPosts: 1, liveApiRequests: 0 });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: 'PASS', scope: 'SYNTHETIC_PRESENTATION_ONLY', browser: browser.version(), results }, null, 2) + '\n');
  console.log('PASS: 360/390 narrative paragraphs, blank lines, URL/continuous-character wrapping, local text, inputs and dialogs.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
});
