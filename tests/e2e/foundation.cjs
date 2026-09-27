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
  const buildManifest = JSON.parse(readFileSync(join(webRoot, 'dist/build-manifest.json'), 'utf8'));
  assert.ok(['clean', 'dirty'].includes(buildManifest.sourceTree), 'build provenance must identify the worktree state');
  assert.equal(buildManifest.sourceTree === 'clean', buildManifest.dirtyPathCount === 0);
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
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.route('https://openrouter.ai/api/v1/models?output_modalities=text', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: Array.from({ length: 12 }, (_, index) => ({
          id: index === 0 ? 'anthropic/claude-sonnet-5' : `openai/model-${index}`,
          name: index === 0 ? 'Claude Sonnet 5' : `Model ${index}`,
          description: `Text generation and reasoning model ${index}`,
          context_length: 32000 + index * 1000,
          created: 1780000000,
          pricing: { prompt: '0.000001', completion: '0.000002' },
          architecture: { output_modalities: ['text'] },
        })) }),
      }));
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
      assert.ok((await page.locator('body').innerText()).includes('跳过设置'));
      await page.getByRole('button', { name: '作品简介' }).click();
      assert.equal(await page.locator('h2').innerText(), '作品简介');
      assert.ok((await page.locator('.intro-prose').innerText()).includes('东方修仙世界为核心'));
      await page.getByRole('button', { name: '创建角色' }).click();
      assert.equal(await page.locator('h2').innerText(), '把自己写进山门。');
      assert.equal(await page.locator('.form input').count(), 5);
      assert.equal(await page.locator('.form select').count(), 0);
      await page.locator('input').nth(0).fill(`测试修士-${width}`);
      await page.getByRole('button', { name: '下一步' }).click();
      assert.equal(await page.locator('.form input').count(), 2);
      assert.equal(await page.locator('.form textarea').count(), 1);
      await page.locator('.form label').filter({ hasText: '修为' }).locator('input').fill('炼气期');
      await page.getByRole('button', { name: '下一步' }).click();
      assert.equal(await page.locator('.form select').count(), 1);
      assert.equal(await page.locator('.form textarea').count(), 1);
      assert.ok((await page.locator('.character-summary').innerText()).includes(`测试修士-${width}`));
      assert.ok((await page.locator('.character-summary').innerText()).includes('炼气期'));
      await page.getByRole('button', { name: '上一步' }).click();
      assert.equal(await page.locator('.form input').first().inputValue(), '炼气期');
      await page.getByRole('button', { name: '下一步' }).click();
      await page.getByRole('button', { name: '保存角色并进入' }).click();
      await page.locator('.game-topline h1').filter({ hasText: `测试修士-${width}` }).waitFor();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      assert.match(await page.locator('body').innerText(), /\d+ 项待处理/);
      await page.locator('#player-intent').fill('刷新后仍可恢复的行动草稿');
      await page.reload();
      await page.locator('.game-topline h1').waitFor();
      assert.equal(await page.locator('#player-intent').inputValue(), '刷新后仍可恢复的行动草稿');
      assert.equal(await page.locator('.game-workspace').count(), 1);
      assert.equal(await page.locator('.story-column').count(), 1);
      await page.screenshot({ path: join(root, `docs/audit/${width === 390 ? '09-game-mobile-after-workspace.png' : '10-game-desktop-after-workspace.png'}`), fullPage: true });
      await page.locator('#player-intent').fill('沿山门石阶向前探看');
      await page.getByRole('button', { name: '收入待处理' }).click();
      await page.getByText('沿山门石阶向前探看').waitFor();
      assert.ok((await page.locator('.pending-intent').filter({ hasText: '沿山门石阶向前探看' }).innerText()).includes('沿山门石阶向前探看'));
      assert.ok((await page.locator('.intent-composer').innerText()).includes('不会推进时间或改变角色状态'));
      await page.evaluate(() => {
        window.__restoreLocalStorageSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (['jiuxiao_1_local_saves_v2', 'jiuxiao_1_local_saves', 'jiuxiao_1_local_saves_revision'].includes(key)) {
            throw new DOMException('simulated storage quota', 'QuotaExceededError');
          }
          return window.__restoreLocalStorageSetItem.call(this, key, value);
        };
      });
      await page.locator('#player-intent').fill('本地镜像配额失败时仍由 IndexedDB 保全的行动');
      await page.getByRole('button', { name: '收入待处理' }).click();
      await page.locator('.pending-intent').filter({ hasText: '本地镜像配额失败时仍由 IndexedDB 保全的行动' }).waitFor();
      await page.evaluate(() => { Storage.prototype.setItem = window.__restoreLocalStorageSetItem; });
      await page.reload();
      await page.locator('.game-topline h1').waitFor();
      await page.locator('.pending-intent').filter({ hasText: '本地镜像配额失败时仍由 IndexedDB 保全的行动' }).waitFor();
      assert.equal(await page.evaluate(() => {
        const mirror = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null');
        return mirror?.saves?.some(save => save.pendingQueue?.some(action => action.text === '本地镜像配额失败时仍由 IndexedDB 保全的行动'));
      }), true);
      assert.equal(await page.getByRole('button', { name: '角色状态', exact: true }).count(), 1, 'character status has one visible entry');
      assert.equal(await page.getByRole('button', { name: '综合情报', exact: true }).count(), 1, 'intel has one visible entry');
      assert.equal(await page.getByRole('button', { name: '星记忆', exact: true }).count(), 1, 'memory has one visible entry');
      await page.getByRole('button', { name: '角色状态', exact: true }).click();
      assert.equal(await page.locator('.game-info-panel').getAttribute('aria-label'), '角色状态详情');
      await page.getByRole('button', { name: '关闭资料面板' }).click();

      const stalePage = await context.newPage();
      await stalePage.addInitScript(() => {
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          if (this === window && type === 'storage') return;
          return add.call(this, type, listener, options);
        };
      });
      const gamePath = new URL(page.url()).pathname;
      await stalePage.goto(`http://127.0.0.1:${webPort}${gamePath}`);
      await stalePage.locator('.game-statusline').waitFor();
      await stalePage.locator('#player-intent').fill('甲页先行');
      await page.locator('#player-intent').fill('乙页先行');
      await page.getByRole('button', { name: '收入待处理' }).click();
      await page.getByText(/甲页先行|乙页先行/).waitFor();
      await stalePage.getByRole('button', { name: '收入待处理' }).click();
      assert.ok((await stalePage.locator('.save-conflict-actions').innerText()).includes('载入最新存档'));
      await stalePage.getByRole('button', { name: '另存为分支' }).click();
      await stalePage.getByText(/已另存为独立分支/).waitFor();
      const concurrentSaves = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves);
      assert.equal(concurrentSaves.length, 2, 'same-save conflict recovery should retain the primary save and explicit branch');
      assert.equal(concurrentSaves.some(save => save.pendingQueue?.some(action => action.text === '甲页先行')), true, 'the stale attempt must remain recoverable in its branch');
      assert.equal(concurrentSaves.some(save => save.pendingQueue?.some(action => action.text === '乙页先行')), true, 'the committed save must not be overwritten');
      await stalePage.close();

      await page.goto(`http://127.0.0.1:${webPort}/saves`);
      await page.screenshot({ path: join(root, `docs/audit/${width === 390 ? '11-saves-mobile.png' : '12-saves-desktop.png'}`), fullPage: true });
      const branchCard = page.locator('.save-manager-list .card').filter({ hasText: '（冲突分支）' });
      await branchCard.getByRole('button', { name: '改名' }).click();
      await branchCard.getByRole('textbox', { name: '新名称' }).fill(`旁支修士-${width}`);
      await branchCard.getByRole('button', { name: '保存名称' }).click();
      const renamedCard = page.locator('.save-manager-list .card').filter({ hasText: `旁支修士-${width}` });
      await renamedCard.waitFor();
      const [branchDownload] = await Promise.all([
        page.waitForEvent('download'),
        renamedCard.getByRole('button', { name: '导出' }).click(),
      ]);
      const exportedBranch = JSON.parse(readFileSync(await branchDownload.path(), 'utf8'));
      assert.equal(exportedBranch.save.name, `旁支修士-${width}`);
      assert.equal(JSON.stringify(exportedBranch).includes('test-secret-not-persisted'), false, 'save export must never include AI API keys');
      await renamedCard.getByRole('button', { name: '删除' }).click();
      assert.equal(await renamedCard.getByRole('button', { name: '确认删除' }).isDisabled(), true);
      await renamedCard.getByRole('textbox', { name: '确认名称' }).fill(`旁支修士-${width}`);
      await renamedCard.getByRole('button', { name: '确认删除' }).click();
      await page.getByText('本地存档已删除。').waitFor();
      assert.equal(await page.locator('.save-manager-list .card').count(), 1);
      assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves)).length, 1);

      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: /跳过设置/ }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: 'AI 设置' }).click();
      assert.equal(await page.locator('.ai-title').innerText(), 'AI 设定');
      assert.equal(await page.locator('.jx-shell').evaluate(element => getComputedStyle(element, '::before').backgroundImage.includes('gate-moonlight.webp')), true);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`, 'AI close should return to the game route that opened it');
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.getByRole('button', { name: '继续游玩' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: '阅读世界设定' }).click();
      assert.equal(await page.locator('.worldbook-entry').count(), 7, 'only the seven reviewed geography entries are published');
      await page.getByRole('searchbox', { name: '搜索已审核世界设定' }).fill('音波功');
      assert.equal(await page.locator('.worldbook-entry').count(), 1);
      assert.equal(await page.locator('.worldbook-entry h3').innerText(), '东瀚龙吟域');
      await page.getByRole('searchbox', { name: '搜索已审核世界设定' }).fill('OCR待校');
      assert.equal(await page.locator('.worldbook-entry').count(), 0, 'pending OCR must not enter public search');
      await page.getByRole('searchbox', { name: '搜索已审核世界设定' }).fill('南疆');
      const southEntry = page.getByRole('heading', { name: '南疆万蛊域' }).locator('..');
      await southEntry.locator('details summary').click();
      assert.ok((await southEntry.locator('details').innerText()).includes('作者授权补全'));
      await page.getByRole('button', { name: '回到刚才的位置' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`, 'world close from game should preserve the save route');
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '阅读世界设定' }).click();
      assert.equal(await page.locator('h2').innerText(), '世界设定');
      await page.getByRole('button', { name: '回到刚才的位置' }).click();
      assert.ok((await page.locator('body').innerText()).includes('选择去处'));
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: 'AI 设置' }).click();
      assert.equal(await page.locator('.ai-title').innerText(), 'AI 设定');
      assert.equal(await page.locator('.role-panel').count(), 5);
      assert.equal(await page.locator('.glass-dialog').isVisible(), false, 'closed settings dialog must not cover the page');
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
      await page.getByRole('button', { name: '调用记录' }).click();
      assert.equal(await page.locator('.glass-dialog').isVisible(), true);
      assert.ok((await page.locator('.call-log-dialog-body').innerText()).includes('retained-model'));
      assert.equal(await page.locator('.call-log-dialog-body').evaluate(element => element.scrollHeight >= element.clientHeight), true);
      assert.equal(await page.locator('.call-log-dialog-body').innerText().then(text => text.includes('旧配置迁移')), false);
      await page.getByRole('button', { name: '关闭窗口' }).click();
      assert.ok((await page.locator('.migration-status').innerText()).includes('当前浏览器未发现旧配置'));
      assert.equal(await page.locator('.role-panel').first().locator(':scope > summary').innerText().then(text => text.includes('待配置')), true);
      await page.locator('.provider-open').click();
      assert.equal(await page.locator('.provider-name-list button').count(), 25);
      assert.ok(!(await page.locator('.provider-name-list').innerText()).includes('已收录'));
      assert.ok(await page.locator('.dialog-scroll-region').evaluate(element => element.scrollHeight > element.clientHeight), 'provider names should scroll within the glass dialog');
      await page.getByRole('button', { name: 'Anthropic · Claude API' }).click();
      assert.equal(await page.locator('.dialog-heading h2').innerText(), 'Anthropic · Claude API');
      assert.ok((await page.locator('.provider-detail-body').innerText()).includes('官方型号与价格'));
      await page.waitForFunction(() => document.querySelector('.provider-detail-body')?.textContent?.includes('anthropic/claude-sonnet-5'), null, { timeout: 10000 });
      assert.ok((await page.locator('.provider-detail-body').innerText()).includes('anthropic/claude-sonnet-5'));
      assert.ok((await page.locator('.provider-detail-body').innerText()).includes('OpenRouter 托管目录'));
      await page.locator('.back-link').click();
      await page.locator('.directory-toolbar .comparison-link').click();
      assert.equal(await page.locator('.dialog-heading h2').innerText(), '价格与能力总览比较');
      assert.equal(await page.locator('.comparison-table tbody tr').count(), 12);
      assert.ok((await page.locator('.comparison-body').innerText()).includes('OpenRouter 聚合市场'));
      const comparisonScroll = page.locator('.dialog-scroll-region');
      assert.ok(await comparisonScroll.evaluate(element => element.scrollHeight > element.clientHeight), 'comparison dialog should scroll vertically');
      const comparisonTable = page.locator('.comparison-table').locator('..');
      assert.ok(await comparisonTable.evaluate(element => element.scrollWidth > element.clientWidth), 'comparison table should retain a horizontal scroll path');
      await page.getByRole('button', { name: '关闭窗口' }).click();
      await page.getByRole('button', { name: '查看配置与成本' }).nth(1).click();
      assert.equal(await page.locator('.glass-dialog h2').innerText(), '行云 · 合宜');
      const presetMap = await page.locator('.preset-role-map').innerText();
      assert.ok(presetMap.includes('deepseek-v4-pro'));
      assert.ok(presetMap.includes('doubao-seed-2-1-pro-260915'));
      assert.ok(presetMap.includes('qwen3.8-flash'));
      assert.ok((await page.locator('.estimate-totals').innerText()).includes('/ 周'));
      const modalScroll = page.locator('.dialog-scroll-region');
      assert.ok(await modalScroll.evaluate(element => element.scrollHeight > element.clientHeight));
      await modalScroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
      assert.ok(await modalScroll.evaluate(element => element.scrollTop > 0));
      await page.getByRole('button', { name: '应用此方案' }).click();
      assert.ok((await page.locator('.active-recipe').innerText()).includes('请为启用的岗位填写对应 API Key'));
      const storyPanel = page.locator('.role-panel').first();
      await storyPanel.locator(':scope > summary').click();
      assert.equal(await storyPanel.locator('input').nth(1).inputValue(), 'deepseek-v4-pro');
      assert.equal(await storyPanel.locator('input').nth(2).inputValue(), 'https://api.deepseek.com');
      await storyPanel.locator('.advanced-fields > summary').click();
      await storyPanel.getByLabel('期望上下文上限（tokens）').fill('65536');
      await storyPanel.getByLabel('输出格式').selectOption('json_object');
      await storyPanel.locator('textarea').last().fill('<END>');
      assert.equal(await page.locator('.active-recipe').count(), 0, 'editing a role should mark the applied preset as customized');
      await storyPanel.locator('input[type="password"]').fill('test-secret-not-persisted');
      await page.getByRole('button', { name: '保存配置' }).click();
      const savedConfig = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_config_v2')));
      assert.equal(savedConfig.version, 3);
      assert.equal(savedConfig.roles.story.contextWindowTokens, 65536);
      assert.equal(savedConfig.roles.story.responseFormat, 'json_object');
      assert.equal(savedConfig.roles.story.stopSequences, '<END>');
      assert.equal(savedConfig.roles.premiumDirector.enabled, false);
      assert.equal(JSON.stringify(savedConfig).includes('test-secret-not-persisted'), false);
      assert.ok((await page.locator('body').innerText()).includes('API Key 只保留在当前页面内存'));
      assert.equal(await page.locator('button', { hasText: '测试此岗位' }).first().isDisabled(), true);
      assert.ok((await page.locator('body').innerText()).includes('契约 v1'));
      await page.getByRole('button', { name: '查看配置与成本' }).nth(2).click();
      assert.equal(await page.locator('.glass-dialog h2').innerText(), '长歌 · 旗舰');
      assert.ok((await page.locator('.preset-role-map').innerText()).includes('claude-opus-5-5'));
      assert.ok((await page.locator('.estimate-totals').innerText()).includes('$'));
      await page.getByRole('button', { name: '关闭窗口' }).click();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      assert.ok((await page.locator('body').innerText()).includes('选择去处'), 'AI settings should close back to its entry route');
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '菜单' }).click();
      const importInput = page.locator('aside input[type="file"]');
      const savesBeforeBadImport = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length);
      const [badBackup] = await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"messages":') }),
      ]);
      assert.ok(badBackup.suggestedFilename().startsWith('九霄-导入前原文备份-'));
      await page.getByText(/导入失败：文件格式或内容不符合旧档契约/).waitFor();
      assert.equal(await page.locator('.import-preview').count(), 0, 'malformed JSON must not enter the import preview as story text');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length), savesBeforeBadImport, 'a malformed import must not alter existing saves');
      if (width === 390) {
        const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x61);
        await importInput.setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: oversized });
        await page.getByText(/导入失败：文件超过 20 MiB 上限/).waitFor();
        assert.equal(await page.locator('.import-preview').count(), 0, 'an oversized file must be rejected before preview');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length), savesBeforeBadImport, 'an oversized import must not alter existing saves');
      }
      const legacyJson = JSON.stringify({
        messages: [{ role: 'user', content: '旧档正文' }],
        status: '姓名：迁移修士',
        world: { location: '旧档山门', weather: '夜雨', key: '旧钥匙' },
        intel: { clue: '石阶留有剑痕' },
        memory: '曾与守门弟子交谈',
        apiKey: 'imported-secret-not-exported',
        legacyAiConfig: { providers: [{ api_key: 'imported-secret-not-exported' }] },
        stm: ['短期线索甲'],
        ltm: ['长期约定乙'],
      });
      const [backup] = await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'legacy-chat.json', mimeType: 'application/json', buffer: Buffer.from(legacyJson) }),
      ]);
      assert.ok(backup.suggestedFilename().startsWith('九霄-导入前原文备份-'));
      assert.equal(await page.locator('.import-preview h2').innerText(), '导入旧局');
      assert.ok((await page.locator('.import-preview').innerText()).includes('status'));
      assert.equal(await page.locator('.import-preview h2').innerText(), '导入旧局');
      await page.getByRole('button', { name: '导入此档' }).click();
      assert.equal(await page.locator('.game-topline h1').innerText(), '导入旧局');
      await page.getByRole('button', { name: '角色状态', exact: true }).click();
      let legacyPanel = page.locator('.game-info-panel [aria-label="资料内容"]');
      assert.ok((await legacyPanel.innerText()).includes('旧版状态记录'));
      assert.ok((await legacyPanel.innerText()).includes('姓名：迁移修士'));
      await page.getByRole('button', { name: '关闭资料面板' }).click();
      await page.getByRole('button', { name: '综合情报', exact: true }).click();
      legacyPanel = page.locator('.game-info-panel [aria-label="资料内容"]');
      assert.ok((await legacyPanel.innerText()).includes('旧版世界资料'));
      assert.ok((await legacyPanel.innerText()).includes('旧版综合情报'));
      assert.ok((await legacyPanel.innerText()).includes('石阶留有剑痕'));
      await page.getByRole('button', { name: '关闭资料面板' }).click();
      await page.getByRole('button', { name: '星记忆', exact: true }).click();
      legacyPanel = page.locator('.game-info-panel [aria-label="资料内容"]');
      for (const memoryField of ['旧版记忆记录', '短期记忆', '长期记忆', '曾与守门弟子交谈', '短期线索甲', '长期约定乙']) {
        assert.ok((await legacyPanel.innerText()).includes(memoryField), `memory panel should retain ${memoryField}`);
      }
      await page.getByRole('button', { name: '关闭资料面板' }).click();
      await page.locator('.legacy-groups summary').filter({ hasText: 'status' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('姓名：迁移修士'));
      assert.equal(await page.evaluate(() => {
        const saves = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves;
        return saves.find(save => save.name === '导入旧局')?.legacyArchive?.payload?.legacyAiConfig?.providers?.[0]?.api_key;
      }), 'imported-secret-not-exported', 'the local legacy archive must retain the original payload');
      await page.goto(`http://127.0.0.1:${webPort}/saves`);
      const importedCard = page.locator('.save-manager-list .card').filter({ hasText: '导入旧局' });
      const [sanitizedDownload] = await Promise.all([
        page.waitForEvent('download'),
        importedCard.getByRole('button', { name: '导出' }).click(),
      ]);
      const sanitizedExport = JSON.parse(readFileSync(await sanitizedDownload.path(), 'utf8'));
      assert.equal(JSON.stringify(sanitizedExport).includes('imported-secret-not-exported'), false, 'downloaded save must not contain archived API keys');
      assert.equal(sanitizedExport.save.legacyArchive.payload.apiKey, '[已移除密钥]');
      assert.equal(sanitizedExport.save.legacyArchive.payload.legacyAiConfig.providers[0].api_key, '[已移除密钥]');
      assert.equal(sanitizedExport.save.legacyArchive.payload.world.key, '旧钥匙', 'non-credential game fields must survive export');
      assert.equal(sanitizedExport.save.legacyArchive.payload.memory, '曾与守门弟子交谈');
      await importedCard.getByRole('button', { name: '打开' }).click();
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
          const library = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null').saves;
          return library.filter(save => save.legacyArchive?.sourceFormat).map(save => save.legacyArchive.payload);
        });
        assert.equal(archivedPayloads.some(payload => isDeepStrictEqual(payload, expectedPayload)), true, 'real-save fields must be preserved losslessly');
      }
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.evaluate(() => new Promise(resolve => {
        localStorage.removeItem('jiuxiao_1_local_saves');
        localStorage.removeItem('jiuxiao_1_local_saves_v2');
        localStorage.setItem('jiuxiao_v1_library', JSON.stringify({ version: 1, active: 'old-1', saves: [
          {
            id: 'old-1', name: '旧库修士', turn: 2,
            messages: Array.from({ length: 40 }, (_, index) => ({ role: 'assistant', content: `旧档正文 ${index + 1}` })),
            player: { 姓名: '旧库修士' }, world: { location: '山门' },
          },
          {
            id: 'old-1', name: '重名旧库修士', turn: 3,
            messages: [{ role: 'assistant', content: '重复 ID 仍须保全的内容。' }],
            player: { 姓名: '重名旧库修士' }, world: { location: '山门' },
          },
        ] }));
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
      await page.getByText(/已迁移 2 份旧局/).waitFor();
      const migratedSaves = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves);
      assert.equal(migratedSaves.length, 2, 'duplicate legacy IDs must migrate without dropping either save');
      assert.equal(new Set(migratedSaves.map(save => save.saveId)).size, 2, 'duplicate legacy IDs must receive a unique copy ID');
      assert.equal(migratedSaves.some(save => save.messages.some(message => message.content === '重复 ID 仍须保全的内容。')), true);
      await page.getByRole('button', { name: '继续游玩' }).click();
      await page.locator('.game-topline h1').waitFor();
      assert.equal(await page.locator('.game-topline h1').innerText(), '旧库修士');
      const storyScroll = page.locator('.story-scroll');
      const beforeWorld = await storyScroll.evaluate(element => {
        element.scrollTop = 280;
        return element.scrollTop;
      });
      assert.ok(beforeWorld > 0, 'legacy history should be scrollable in this fixture');
      await page.locator('.game-tools').getByRole('button', { name: '世界设定' }).click();
      await page.getByRole('button', { name: '回到刚才的位置' }).click();
      await storyScroll.waitFor();
      assert.ok(Math.abs((await storyScroll.evaluate(element => element.scrollTop)) - beforeWorld) <= 2,
        'worldbook reading should restore the story scroll position');
      await page.evaluate(() => {
        localStorage.removeItem('jiuxiao_1_local_saves');
        localStorage.removeItem('jiuxiao_1_local_saves_v2');
      });
      await page.reload();
      await page.locator('.game-topline h1').waitFor();
      await page.waitForFunction(() => {
        const mirror = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null');
        return Array.isArray(mirror?.saves) && mirror.saves.some(save => save.name === '旧库修士');
      });
      assert.equal(await page.locator('.game-topline h1').innerText(), '旧库修士', 'IndexedDB must restore the mirror after an interrupted compatibility write');
      await page.evaluate(() => localStorage.setItem('jiuxiao_1_local_saves_v2', '{damaged-json'));
      await page.reload();
      await page.locator('.game-topline h1').waitFor();
      await page.waitForFunction(() => localStorage.getItem('jiuxiao_1_local_saves_v2_damaged_backup') === '{damaged-json');
      assert.equal(await page.locator('.game-topline h1').innerText(), '旧库修士', 'a damaged mirror must not hide the durable save');
      const restoredSaves = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves);
      assert.equal(restoredSaves.length, 2, 'mirror recovery must retain both saves migrated from duplicate legacy IDs');
      assert.equal(new Set(restoredSaves.map(save => save.saveId)).size, 2);
      await context.close();

      const damagedContext = await browser.newContext({ viewport: { width, height } });
      const damagedPage = await damagedContext.newPage();
      await damagedPage.addInitScript(() => {
        localStorage.setItem('jiuxiao_1_local_saves_v2', '{broken-mirror');
        localStorage.setItem('jiuxiao_1_local_saves', '{broken-legacy');
      });
      await damagedPage.goto(`http://127.0.0.1:${webPort}/new`);
      await damagedPage.getByText(/受损的本地存档文本/).waitFor();
      await damagedPage.getByRole('button', { name: '下一步' }).click();
      await damagedPage.getByRole('button', { name: '下一步' }).click();
      await damagedPage.getByRole('button', { name: '保存角色并进入' }).click();
      await damagedPage.getByText(/角色草稿仍在/).waitFor();
      assert.deepEqual(await damagedPage.evaluate(() => [
        localStorage.getItem('jiuxiao_1_local_saves_v2'), localStorage.getItem('jiuxiao_1_local_saves'),
      ]), ['{broken-mirror', '{broken-legacy'], 'invalid raw saves must survive a failed first migration');
      await damagedContext.close();
    }
  } finally { await browser.close(); }
  console.log('Local UI regression, reviewed worldbook search, save conflict and mirror recovery, and API smoke passed at mobile and desktop viewports');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const child of children) child.kill(); });
