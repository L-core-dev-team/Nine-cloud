#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const apiPort = 18787;
const webPort = 15173;
const children = [];

function run(script, args, cwd, env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd, env: { ...process.env, ...env }, stdio: 'pipe', windowsHide: true,
  });
  children.push(child);
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  return child;
}

async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

(async () => {
  const apiFile = join(root, 'apps/api/dist/index.js');
  const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');
  assert.ok(existsSync(apiFile) && existsSync(viteFile), 'Run pnpm build before test:e2e');
  // This API health smoke uses an intentionally unreachable database and does not require Docker.
  run(apiFile, [], root, {
    API_PORT: String(apiPort),
    DATABASE_URL: 'postgresql://jiuxiao:unused@127.0.0.1:1/unused',
  });
  run(viteFile, ['preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], webRoot);
  const response = await ready(`http://127.0.0.1:${apiPort}/health`);
  assert.equal((await response.json()).saveSchemaVersion, 1);
  await ready(`http://127.0.0.1:${webPort}/`);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const [width, height] of [[390, 844], [1366, 768]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`http://127.0.0.1:${webPort}/`);
      await page.evaluate(() => new Promise(resolve => {
        localStorage.clear();
        const request = indexedDB.deleteDatabase('jiuxiao-1');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      }));
      await page.reload();
      assert.equal(await page.locator('h1').innerText(), '九霄');
      assert.equal(await page.locator('.brand').innerText(), '踏月过山门，天地任君行。');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => document.documentElement.clientWidth), 'landing should not overflow horizontally');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.fonts.check('400 64px "Ma Shan Zheng Brand"', '九霄月下山门修途自此启程踏月过山门天地任君行进入世界风')), true);
      assert.equal(await page.getByRole('button', { name: '进入世界' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: '新开一局' }).count(), 0);
      assert.equal(await page.locator('.scene-picture').count(), 1);
      assert.notEqual(await page.locator('.portal-enter').evaluate(element => getComputedStyle(element, '::after').animationName), 'none');
      assert.equal(await page.locator('.waterfall-traces path').count(), 3);
      assert.notEqual(await page.locator('.scene-cloud-drift-one').evaluate(element => getComputedStyle(element).animationName), 'none');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.scene-cloud-drift-one').evaluate(element => getComputedStyle(element).animationName), 'none');
      assert.equal(await page.locator('.portal-enter').evaluate(element => getComputedStyle(element, '::after').animationName), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      mkdirSync(join(root, 'docs/audit'), { recursive: true });
      await page.screenshot({ path: join(root, `docs/audit/${width === 390 ? '03-home-mobile-after-layers.png' : '04-home-desktop-after-layers.png'}`), fullPage: true });
      await page.getByRole('button', { name: '切换到晴昼配色' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'day');
      assert.equal(await page.evaluate(() => localStorage.getItem('jx10_appearance')), 'day');
      await page.screenshot({ path: join(root, `docs/audit/${width === 390 ? '05-home-mobile-day.png' : '06-home-desktop-day.png'}`), fullPage: true });
      await page.reload();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'day');
      await page.getByRole('button', { name: '切换到夜色配色' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'night');
      await page.getByRole('button', { name: '进入世界' }).click();
      assert.ok((await page.locator('body').innerText()).includes('选择去处'));
      assert.ok((await page.locator('body').innerText()).includes('新开一局'));
      assert.ok((await page.locator('body').innerText()).includes('阅读世界设定'));
      assert.ok((await page.locator('body').innerText()).includes('AI 设置'));
      await page.getByRole('button', { name: '新开一局' }).click();
      assert.equal(await page.locator('h2').innerText(), '把自己写进山门。');
      assert.equal(await page.locator('input').count(), 7);
      assert.equal(await page.locator('select').count(), 1);
      assert.equal(await page.locator('textarea').count(), 2);
      await page.locator('input').nth(0).fill(`测试修士-${width}`);
      await page.getByRole('button', { name: '保存角色并进入' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      assert.ok((await page.locator('body').innerText()).includes('开局请求待处理'));
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.getByRole('button', { name: '继续游玩' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '阅读世界设定' }).click();
      assert.equal(await page.locator('h2').innerText(), '世界设定');
      await page.goto(`http://127.0.0.1:${webPort}/settings/ai`);
      assert.equal(await page.locator('h2').innerText(), '让五席各司其职。');
      assert.equal(await page.locator('.role-panel').count(), 5);
      await page.getByRole('button', { name: '切换到晴昼配色' }).click();
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.role-summary strong')).color), 'rgb(41, 58, 70)');
      await page.screenshot({ path: join(root, `docs/audit/${width === 390 ? '07-ai-settings-mobile-day.png' : '08-ai-settings-desktop-day.png'}`), fullPage: true });
      await page.getByRole('button', { name: '切换到夜色配色' }).click();
      await page.evaluate(() => {
        const now = Date.now();
        sessionStorage.setItem('jx10_ai_call_log_v1', JSON.stringify([
          { at: new Date('2000-01-01T00:00:00.000Z').toISOString(), role: '过期岗位', model: 'expired-model', elapsedMs: 1, outcome: 'success' },
          { at: new Date(now - 86_400_000).toISOString(), role: '近期岗位', model: 'retained-model', elapsedMs: 12, outcome: 'success' },
        ]));
      });
      await page.reload();
      const retainedLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1')));
      assert.deepEqual(retainedLogs.map(log => log.model), ['retained-model']);
      assert.equal(await page.locator('.role-panel').first().locator(':scope > summary').innerText().then(text => text.includes('待配置')), true);
      await page.locator('.provider-open').click();
      assert.equal(await page.locator('.provider-card').count(), 25);
      assert.ok((await page.locator('.provider-list').innerText()).includes('Anthropic'));
      assert.ok((await page.locator('.provider-card').filter({ hasText: 'OpenAI API' }).innerText()).includes('$0.10（缓存 $0.01）'));
      await page.getByRole('button', { name: '关闭窗口' }).click();
      await page.getByRole('button', { name: '查看配置与成本' }).nth(1).click();
      assert.equal(await page.locator('.glass-dialog h2').innerText(), '行云 · 均衡');
      assert.ok((await page.locator('.preset-role-map').innerText()).includes('deepseek-v4-pro'));
      assert.ok((await page.locator('.estimate-totals').innerText()).includes('/ 周'));
      await page.getByRole('button', { name: '应用并启用此档' }).click();
      const storyPanel = page.locator('.role-panel').first();
      await storyPanel.locator(':scope > summary').click();
      assert.equal(await storyPanel.locator('input').nth(1).inputValue(), 'deepseek-v4-pro');
      assert.equal(await storyPanel.locator('input').nth(2).inputValue(), 'https://api.deepseek.com');
      assert.ok((await page.locator('.active-recipe').innerText()).includes('请自行填入各岗位 API Key'));
      await storyPanel.locator('input[type="password"]').fill('test-secret-not-persisted');
      await page.getByRole('button', { name: '保存配置' }).click();
      const savedConfig = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_config_v2')));
      assert.equal(JSON.stringify(savedConfig).includes('test-secret-not-persisted'), false);
      assert.ok((await page.locator('body').innerText()).includes('API Key 只保留在当前页面内存'));
      assert.equal(await page.locator('button', { hasText: '测试此岗位' }).first().isDisabled(), true);
      assert.ok((await page.locator('body').innerText()).includes('契约 v1'));
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '菜单' }).click();
      const importInput = page.locator('aside input[type="file"]');
      const legacyJson = JSON.stringify({ messages: [{ role: 'user', content: '旧档正文' }], status: '姓名：迁移修士' });
      const [backup] = await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'legacy-chat.json', mimeType: 'application/json', buffer: Buffer.from(legacyJson) }),
      ]);
      assert.ok(backup.suggestedFilename().startsWith('九霄-导入前原文备份-'));
      assert.equal(await page.locator('.import-preview h2').innerText(), '导入旧局');
      assert.ok((await page.locator('.import-preview').innerText()).includes('status'));
      assert.equal(await page.locator('.import-preview h2').innerText(), '导入旧局');
      await page.getByRole('button', { name: '导入此档' }).click();
      assert.equal(await page.locator('h2').innerText(), '导入旧局');
      await page.locator('.legacy-groups summary').filter({ hasText: 'status' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('姓名：迁移修士'));
      const privateSavePath = process.env.JIUXIAO_PRIVATE_LEGACY_SAVE;
      if (width === 390 && privateSavePath) {
        const sourceBytes = readFileSync(privateSavePath);
        const source = JSON.parse(sourceBytes.toString('utf8'));
        const expectedPayload = source.save || source;
        await page.goto(`http://127.0.0.1:${webPort}/`);
        await page.getByRole('button', { name: '菜单' }).click();
        const privateInput = page.locator('aside input[type="file"]');
        const [privateBackup] = await Promise.all([
          page.waitForEvent('download'),
          privateInput.setInputFiles({ name: 'private-legacy.json', mimeType: 'application/json', buffer: sourceBytes }),
        ]);
        assert.deepEqual(readFileSync(await privateBackup.path()), sourceBytes, 'real-save backup must be byte-identical');
        const duplicate = await page.getByRole('button', { name: '另存为副本' }).count();
        await page.getByRole('button', { name: duplicate ? '另存为副本' : '导入此档' }).click();
        const archivedPayloads = await page.evaluate(() => {
          const library = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves') || '[]');
          return library.filter(save => save.legacyArchive?.sourceFormat).map(save => save.legacyArchive.payload);
        });
        assert.equal(archivedPayloads.some(payload => isDeepStrictEqual(payload, expectedPayload)), true, 'real-save fields must be preserved losslessly');
      }
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.evaluate(() => new Promise(resolve => {
        localStorage.removeItem('jiuxiao_1_local_saves');
        localStorage.setItem('jiuxiao_v1_library', JSON.stringify({ version: 1, active: 'old-1', saves: [{
          id: 'old-1', name: '旧库修士', turn: 2, messages: [{ role: 'assistant', content: '旧档正文' }],
          player: { 姓名: '旧库修士' }, world: { location: '山门' },
        }] }));
        const request = indexedDB.deleteDatabase('jiuxiao-1');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      }));
      await page.reload();
      await page.getByText(/检测到旧版 localStorage 存档/).waitFor({ state: 'visible', timeoutMs: 5000 });
      assert.ok((await page.locator('body').innerText()).includes('旧版 localStorage 存档'));
      const [libraryBackup] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: '下载原文备份并迁移' }).click(),
      ]);
      assert.ok(libraryBackup.suggestedFilename().startsWith('九霄-旧localStorage原文备份-'));
      await page.getByRole('button', { name: '继续游玩' }).click();
      assert.equal(await page.locator('h2').innerText(), '旧库修士');
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('S2 navigation, character save/continue, API smoke passed at mobile and desktop viewports');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const child of children) child.kill(); });
