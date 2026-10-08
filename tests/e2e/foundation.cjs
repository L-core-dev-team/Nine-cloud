#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const net = require('node:net');
const { join, resolve } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const screenshotDir = join(root, 'test-results/e2e');
// 视觉冻结基线：由作者于 2026-10-08 批准后重置。
// 旧基线 69471c7（2026-10-05）之后 style.css 经历 9 次经批准的视觉改动
// （d8e8e02 player shell、17c63fe candidate atlas、c776de9 合并、d73e0b7 页脚等），
// 继续以旧基线比对会使该门禁恒为红，等同失效。
// 新基线取 d73e0b7 —— 作者已确认其为当前期望的视觉状态。
const PROFESSIONAL_BASELINE_COMMIT = 'd73e0b7';
const professionalBaselineCss = execFileSync('git', ['show', `${PROFESSIONAL_BASELINE_COMMIT}:apps/web/src/style.css`], { cwd: root, encoding: 'utf8' });
const children = [];

async function availablePorts(count) {
  const servers = Array.from({ length: count }, () => net.createServer());
  try {
    await Promise.all(servers.map(server => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    })));
    return servers.map(server => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      return address.port;
    });
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => {
      if (!server.listening) return resolve();
      server.close(resolve);
    })));
  }
}

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
  mkdirSync(screenshotDir, { recursive: true });
  const [apiPort, webPort] = await availablePorts(2);
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
  assert.equal((await response.json()).saveSchemaVersion, 2);
  await ready(`http://127.0.0.1:${webPort}/`);
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const runtimeBackends = [];
  const fallbackChecks = [];
  const audioChecks = [];
  try {
    for (const [width, height] of [[390, 844], [1366, 768]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__jxDrawModes = [];
        window.__jxTrianglePositionPasses = [];
        const contextState = new WeakMap();
        const attributePrograms = new WeakMap();
        const bufferIds = new WeakMap();
        const bufferKinds = new WeakMap();
        let nextBufferId = 1;
        const stateFor = gl => {
          let state = contextState.get(gl);
          if (!state) {
            state = { arrayBuffer: null, currentProgram: null, attributeBuffers: new Map() };
            contextState.set(gl, state);
          }
          return state;
        };
        const bufferId = buffer => {
          if (!buffer) return 0;
          let id = bufferIds.get(buffer);
          if (!id) { id = nextBufferId++; bufferIds.set(buffer, id); }
          return id;
        };
        for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
          const prototype = window[name]?.prototype;
          if (!prototype || typeof prototype.drawArrays !== 'function') continue;
          const originalBindBuffer = prototype.bindBuffer;
          prototype.bindBuffer = function (target, buffer) {
            if (target === this.ARRAY_BUFFER) stateFor(this).arrayBuffer = buffer;
            return originalBindBuffer.call(this, target, buffer);
          };
          const originalBufferData = prototype.bufferData;
          prototype.bufferData = function (target, data, usage) {
            const result = originalBufferData.call(this, target, data, usage);
            const buffer = target === this.ARRAY_BUFFER ? stateFor(this).arrayBuffer : null;
            if (buffer && data && typeof data.byteLength === 'number') {
              if (data.byteLength === 48) bufferKinds.set(buffer, 'fullscreen-quad');
              else if (data.byteLength === 1536) bufferKinds.set(buffer, 'particles');
            }
            return result;
          };
          const originalVertexAttribPointer = prototype.vertexAttribPointer;
          prototype.vertexAttribPointer = function (index, ...args) {
            const result = originalVertexAttribPointer.call(this, index, ...args);
            stateFor(this).attributeBuffers.set(index, stateFor(this).arrayBuffer);
            return result;
          };
          const originalGetAttribLocation = prototype.getAttribLocation;
          prototype.getAttribLocation = function (program, attribute) {
            const location = originalGetAttribLocation.call(this, program, attribute);
            if (attribute === 'aPosition') attributePrograms.set(program, location);
            return location;
          };
          const originalUseProgram = prototype.useProgram;
          prototype.useProgram = function (program) {
            stateFor(this).currentProgram = program;
            return originalUseProgram.call(this, program);
          };
          const original = prototype.drawArrays;
          prototype.drawArrays = function (mode, first, count) {
            window.__jxDrawModes.push(mode);
            if (mode === this.TRIANGLES) {
              const state = stateFor(this);
              window.__jxTrianglePositionPasses.push({
                bufferId: bufferId(state.attributeBuffers.get(attributePrograms.get(state.currentProgram))),
                bufferKind: bufferKinds.get(state.attributeBuffers.get(attributePrograms.get(state.currentProgram))) || 'unknown',
              });
            }
            return original.call(this, mode, first, count);
          };
        }
      });
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
      if (width === 390) {
        await page.setViewportSize({ width: 360, height: 800 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => document.documentElement.clientWidth), 'the narrow phone landing must not overflow horizontally');
        assert.equal(await page.getByRole('heading', { name: '九霄' }).isVisible(), true);
        assert.equal(await page.getByRole('button', { name: '进入世界' }).isVisible(), true);
        await page.setViewportSize({ width, height });
      }
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
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '03-home-mobile-after-layers.png' : '04-home-desktop-after-layers.png'}`), fullPage: true });
      await page.getByRole('button', { name: '切换到晴昼配色' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'day');
      assert.equal(await page.evaluate(() => localStorage.getItem('jx10_appearance')), 'day');
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '05-home-mobile-day.png' : '06-home-desktop-day.png'}`), fullPage: true });
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
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '13-lobby-mobile-night.png' : '14-lobby-desktop-night.png'}`), fullPage: true });
      await page.getByRole('button', { name: '作品简介' }).click();
      assert.equal(await page.locator('h2').innerText(), '作品简介');
      assert.ok((await page.locator('.intro-prose').innerText()).includes('东方修仙世界为核心'));
      await page.getByRole('button', { name: '创建角色' }).click();
      assert.equal(await page.locator('h2').innerText(), '把自己写进山门。');
      assert.equal(await page.locator('.form input').count(), 5);
      assert.equal(await page.locator('.character-suggestions select').count(), 5, 'each person field has an optional suggestion picker');
      await page.locator('input').nth(0).fill(`测试修士-${width}`);
      const characterDetails = { age: '未知', personality: '冷静谨慎', origin: '散修', appearance: '青衣' };
      for (const [index, value] of Object.values(characterDetails).entries()) await page.locator('.form input').nth(index + 1).fill(value);
      const beforeCharacterDraft = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.reload();
      assert.equal(await page.locator('.form input').first().inputValue(), `测试修士-${width}`);
      for (const [index, value] of Object.values(characterDetails).entries()) assert.equal(await page.locator('.form input').nth(index + 1).inputValue(), value);
      await page.getByRole('button', { name: '返回山门', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/lobby');
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeCharacterDraft, 'leaving creation must not create a save');
      await page.getByRole('button', { name: /^新开一局/ }).click();
      assert.equal(await page.locator('.form input').first().inputValue(), `测试修士-${width}`, 'returning to creation restores the draft');
      await page.getByRole('button', { name: '下一步' }).click();
      assert.equal(await page.locator('.form input').count(), 2);
      assert.equal(await page.locator('.form textarea').count(), 1);
      await page.getByRole('textbox', { name: '修为', exact: true }).fill('炼气期');
      await page.getByRole('textbox', { name: '灵根', exact: true }).fill('天灵根（金）');
      await page.locator('.form textarea').fill('天赋一\n天赋二\n天赋三\n天赋四');
      await page.reload();
      await page.getByRole('button', { name: '下一步' }).click();
      assert.equal(await page.locator('.form input').first().inputValue(), '炼气期');
      assert.equal(await page.locator('.form textarea').inputValue(), '天赋一\n天赋二\n天赋三\n天赋四');
       await page.getByRole('button', { name: '下一步' }).click();
      for (const buttonName of ['保存角色并进入', '按资料随机开局']) {
        await page.getByRole('button', { name: buttonName }).click();
        await page.getByText('天赋最多三项，请每行填写一项。').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeCharacterDraft, 'over-limit talents must reject both start modes without creating a save');
      }
      await page.getByRole('button', { name: '上一步' }).click();
      await page.locator('.form textarea').fill(' 天赋一 \n\n天赋二\n天赋三 ');
      await page.getByRole('button', { name: '下一步' }).click();
      await page.locator('.form textarea').fill('只想炼器');
      await page.reload();
      await page.getByRole('button', { name: '下一步' }).click();
      await page.getByRole('button', { name: '下一步' }).click();
      assert.equal(await page.locator('.form textarea').inputValue(), '只想炼器', 'third-step fields survive refresh');
       assert.equal(await page.getByLabel('开局地域').count(), 1);
       assert.equal(await page.locator('.character-suggestions select').count(), 1);
       assert.equal(await page.locator('.form textarea').count(), 1);
       const regionSelect = page.getByLabel('开局地域');
       const regionPreview = page.locator('.region-visual-reference img');
       const assertRegionImage = file => page.waitForFunction(expected => {
         const image = document.querySelector('.region-visual-reference img');
         return image instanceof HTMLImageElement && image.src.endsWith(expected) && image.complete && image.naturalWidth > 0;
       }, file);
       assert.match(await regionPreview.getAttribute('src'), /region_zhongzhou_tianshu\.webp$/);
       await assertRegionImage('region_zhongzhou_tianshu.webp');
       await regionSelect.selectOption({ label: '北境霜寒域' });
       assert.match(await regionPreview.getAttribute('src'), /region_beijing_shuanghan\.webp$/);
       await assertRegionImage('region_beijing_shuanghan.webp');
       await regionSelect.selectOption({ label: '完全自定义' });
       assert.match(await regionPreview.getAttribute('src'), /world_jiuxiao\.webp$/);
       await assertRegionImage('world_jiuxiao.webp');
       await regionSelect.selectOption({ label: '中州天枢域' });
       assert.ok((await page.locator('.character-summary').innerText()).includes(`测试修士-${width}`));
      assert.ok((await page.locator('.character-summary').innerText()).includes('炼气期'));
      await page.getByRole('button', { name: '上一步' }).click();
      assert.equal(await page.locator('.form input').first().inputValue(), '炼气期');
      await page.getByRole('button', { name: '下一步' }).click();
      const beforeCreationFailure = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.evaluate(() => {
        const original = IDBDatabase.prototype.transaction;
        window.restoreCreationDatabaseForTest = () => { IDBDatabase.prototype.transaction = original; };
        IDBDatabase.prototype.transaction = function (stores, mode, options) {
          if (mode === 'readwrite') throw new DOMException('synthetic creation write failure', 'QuotaExceededError');
          return original.call(this, stores, mode, options);
        };
      });
      await page.getByRole('button', { name: '保存角色并进入' }).click();
      await page.getByText(/角色草稿仍在/).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeCreationFailure);
      assert.equal(await page.getByRole('button', { name: '保存角色并进入' }).isEnabled(), true, 'failed creation must release its submit lock');
      assert.ok((await page.locator('.character-summary').innerText()).includes(`测试修士-${width}`), 'failed creation must preserve edited character data');
      await page.evaluate(() => {
        window.restoreCreationDatabaseForTest(); delete window.restoreCreationDatabaseForTest;
        const buttons = [...document.querySelectorAll('button')];
        const manual = buttons.find(button => button.textContent.includes('保存角色并进入'));
        const random = buttons.find(button => button.textContent.includes('按资料随机开局'));
        manual.click(); manual.click(); random.click();
      });
      await page.locator('.game-topline h1').filter({ hasText: `测试修士-${width}` }).waitFor();
      const onceCreated = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves);
      assert.equal(onceCreated.length, 1, 'rapid manual/random submissions must only create one save');
      assert.equal(onceCreated[0].pending.source, 'CHARACTER_START', 'later clicks must not change the accepted start mode');
      assert.deepEqual(onceCreated[0].character.talents, ['天赋一', '天赋二', '天赋三'], 'three nonempty trimmed talents must be accepted');
      assert.equal(onceCreated[0].character.goal, '只想炼器');
      for (const [field, value] of Object.entries(characterDetails)) assert.equal(onceCreated[0].character[field], value);
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_character_draft')), null, 'only successful creation clears the draft');
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      assert.match(await page.locator('body').innerText(), /\d+ 项待处理/);
      const beforeMissingLink = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      for (const invalidId of ['missing-save-link', 'missing-save-%E4%B8%AD%E6%96%87']) {
        await page.goto(`http://127.0.0.1:${webPort}/game/${invalidId}`);
        await page.waitForFunction(() => document.documentElement.dataset.jxStorageHydrated === 'true');
        await page.getByRole('heading', { name: '找不到这份存档' }).waitFor();
        assert.equal(await page.locator('#player-intent').count(), 0, 'missing save links must not expose an actionable game');
        await page.reload();
        await page.getByRole('heading', { name: '找不到这份存档' }).waitFor();
        await page.getByRole('button', { name: '回到首页', exact: true }).click();
        await page.getByRole('button', { name: '进入世界', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeMissingLink, 'invalid link navigation and refresh must not create or modify saves');
      }
      await page.goto(`http://127.0.0.1:${webPort}/game/${onceCreated[0].saveId}`);
      await page.locator('.game-topline h1').filter({ hasText: `测试修士-${width}` }).waitFor();
      const supplementInput = page.locator('.game-tools input[type="file"]');
      const supplementBytes = Buffer.from('旅途札记：在山门外遇见一位采药人。\n<script>不应作为网页执行</script>');
      await supplementInput.setInputFiles({ name: '旅途札记.txt', mimeType: 'text/plain', buffer: supplementBytes });
      await page.getByText(/已附加到.*不会覆盖旧内容/).waitFor();
      await page.waitForFunction(() => {
        const saveId = location.pathname.split('/')[2];
        const save = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null')?.saves?.find(item => item.saveId === saveId);
        return save?.legacyArchive?.payload?.supplements?.some(item => item.name === '旅途札记.txt');
      });
      const supplementCount = await page.evaluate(() => {
        const saveId = location.pathname.split('/')[2];
        const save = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null').saves.find(item => item.saveId === saveId);
        return save.legacyArchive.payload.supplements.length;
      });
      assert.equal(supplementCount, 1, 'supplement import should append rather than replace previous notes');
      await supplementInput.setInputFiles({ name: 'boundary-notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(100_000, 0x61) });
      await page.getByText(/boundary-notes\.txt.*已附加到/).waitFor();
      assert.equal(await page.evaluate(() => {
        const saveId = location.pathname.split('/')[2];
        const save = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null').saves.find(item => item.saveId === saveId);
        return save.legacyArchive.payload.supplements.length;
      }), 2, 'the documented 100,000-byte maximum should be accepted');
      await supplementInput.setInputFiles({ name: 'oversized-notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(100_001, 0x61) });
      await page.getByText('补充资料不可超过 100 KB（100,000 字节），当前存档未修改。').waitFor();
      assert.equal(await page.evaluate(() => {
        const saveId = location.pathname.split('/')[2];
        const save = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null').saves.find(item => item.saveId === saveId);
        return save.legacyArchive.payload.supplements.length;
      }), 2, 'oversized supplementary files must not modify the archive');
      const beforeSupplementFailure = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.evaluate(() => {
        const original = File.prototype.text;
        File.prototype.text = function () {
          if (this.name === 'unreadable-notes.txt') return Promise.reject(new Error('synthetic read failure'));
          if (this.name === 'delayed-notes.txt') return new Promise(resolve => { window.resolveSupplementForTest = resolve; });
          return original.call(this);
        };
      });
      await supplementInput.setInputFiles({ name: 'unreadable-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('合成读取失败样本') });
      await page.getByText('无法读取该补充资料，存档未修改。').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeSupplementFailure, 'failed supplement reads must not write saves');
      await supplementInput.setInputFiles([]);
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeSupplementFailure, 'empty file selection must not write saves');
      await supplementInput.setInputFiles({ name: 'delayed-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('过时附加资料') });
      await page.waitForFunction(() => typeof window.resolveSupplementForTest === 'function');
      await page.locator('#player-intent').fill('补充资料读取期间写入的新行动');
      await page.getByRole('button', { name: '收入待处理' }).click();
      await page.waitForFunction(() => {
        const mirror = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null');
        return mirror?.saves?.some(save => save.pendingQueue?.some(item => item.text === '补充资料读取期间写入的新行动'));
      });
      const newerSupplementSnapshot = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.evaluate(() => { window.resolveSupplementForTest('过时附加资料'); delete window.resolveSupplementForTest; });
      await page.getByText('存档在读取补充资料期间发生变化，未覆盖较新版本；请重新附加。').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), newerSupplementSnapshot, 'stale supplement commit must preserve the newer action and snapshot');
      await page.evaluate(() => {
        const original = IDBDatabase.prototype.transaction;
        window.restoreSupplementDatabaseForTest = () => { IDBDatabase.prototype.transaction = original; };
        IDBDatabase.prototype.transaction = function (stores, mode, options) {
          if (mode === 'readwrite') throw new DOMException('synthetic database write rejection', 'QuotaExceededError');
          return original.call(this, stores, mode, options);
        };
      });
      await supplementInput.setInputFiles({ name: 'database-failure-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('不能写入的合成资料') });
      await page.getByText('浏览器数据库不可写，补充资料没有写入。').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), newerSupplementSnapshot, 'failed IndexedDB supplement writes must not modify the mirror');
      await page.evaluate(() => { window.restoreSupplementDatabaseForTest(); delete window.restoreSupplementDatabaseForTest; });
      await page.locator('#player-intent').fill('刷新后仍可恢复的行动草稿');
      await page.reload();
      await page.locator('.game-topline h1').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), newerSupplementSnapshot, 'refresh must recover the same durable snapshot after failed supplement writes');
      assert.equal(await page.locator('#player-intent').inputValue(), '刷新后仍可恢复的行动草稿');
      assert.equal(await page.locator('.game-workspace').count(), 1);
      assert.equal(await page.locator('.story-column').count(), 1);
      if (width === 390) {
        await page.setViewportSize({ width: 360, height: 800 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => document.documentElement.clientWidth), 'the narrow phone game view must not overflow horizontally');
        assert.equal(await page.locator('#player-intent').isVisible(), true);
        assert.equal(await page.getByRole('button', { name: '收入待处理' }).isVisible(), true);
        await page.setViewportSize({ width, height });
      }
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '09-game-mobile-after-workspace.png' : '10-game-desktop-after-workspace.png'}`), fullPage: true });
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
      assert.equal(await page.locator('.game-info-dialog').getAttribute('aria-label'), '角色状态详情');
      await page.getByRole('button', { name: '关闭资料面板' }).click();

      const stalePage = await context.newPage();
      await stalePage.addInitScript(() => {
        const add = EventTarget.prototype.addEventListener;
        window.__blockedStorageListener = false;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          if (type === 'storage') { window.__blockedStorageListener = true; return; }
          return add.call(this, type, listener, options);
        };
      });
      const gamePath = new URL(page.url()).pathname;
      await stalePage.goto(`http://127.0.0.1:${webPort}${gamePath}`);
      await stalePage.waitForFunction(() => document.documentElement.dataset.jxStorageHydrated === 'true');
      assert.equal(await stalePage.evaluate(() => window.__blockedStorageListener), true, 'stale-tab test must block application storage synchronization');
      await stalePage.locator('.game-statusline').waitFor();
      await stalePage.locator('#player-intent').fill('甲页先行');
      await page.locator('#player-intent').fill('乙页先行');
      await page.getByRole('button', { name: '收入待处理' }).click();
      await page.locator('.pending-intent').filter({ hasText: '乙页先行' }).waitFor();
      await page.waitForFunction(() => {
        const mirror = JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null');
        return mirror?.saves?.some(save => save.pendingQueue?.some(action => action.text === '乙页先行'));
      });
      await stalePage.getByRole('button', { name: '收入待处理' }).click();
      await stalePage.waitForFunction(() => {
        const feedback = document.querySelector('.intent-composer [role="status"]')?.textContent || '';
        return Boolean(document.querySelector('.save-conflict-actions')) || feedback.includes('行动已加入本地待处理队列');
      }, null, { timeout: 5000 });
      if (!(await stalePage.locator('.save-conflict-actions').count())) {
        const staleFeedback = await stalePage.locator('.intent-composer').innerText();
        const latestMirror = await stalePage.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null'));
        console.error(`Expected stale-save conflict UI. Feedback: ${staleFeedback}; current actions: ${JSON.stringify(latestMirror?.saves?.[0]?.pendingQueue?.map(action => action.text) ?? [])}`);
      }
      assert.ok((await stalePage.locator('.save-conflict-actions').innerText()).includes('载入最新存档'));
      await stalePage.getByRole('button', { name: '另存为分支' }).click();
      await stalePage.getByText(/已另存为独立分支/).waitFor();
      const concurrentSaves = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves);
      assert.equal(concurrentSaves.length, 2, 'same-save conflict recovery should retain the primary save and explicit branch');
      assert.equal(concurrentSaves.some(save => save.pendingQueue?.some(action => action.text === '甲页先行')), true, 'the stale attempt must remain recoverable in its branch');
      assert.equal(concurrentSaves.some(save => save.pendingQueue?.some(action => action.text === '乙页先行')), true, 'the committed save must not be overwritten');
      await stalePage.close();

      await page.goto(`http://127.0.0.1:${webPort}/saves`);
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '11-saves-mobile.png' : '12-saves-desktop.png'}`), fullPage: true });
      const branchCard = page.locator('.save-manager-list .card').filter({ hasText: '（冲突分支）' });
      const savesBeforeRenameCancel = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await branchCard.getByRole('button', { name: '改名' }).click();
      await branchCard.getByRole('textbox', { name: '新名称' }).fill('   ');
      assert.equal(await branchCard.getByRole('button', { name: '保存名称' }).isDisabled(), true);
      await branchCard.getByRole('textbox', { name: '新名称' }).fill('不应保存的取消名称');
      await branchCard.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), savesBeforeRenameCancel, 'cancelled rename must not write saves');
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
      const savesBeforeDeleteCancel = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await renamedCard.getByRole('button', { name: '删除' }).click();
      await renamedCard.getByRole('textbox', { name: '确认名称' }).fill('不匹配的名称');
      assert.equal(await renamedCard.getByRole('button', { name: '确认删除' }).isDisabled(), true);
      await renamedCard.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), savesBeforeDeleteCancel, 'cancelled deletion must not write saves');
      await page.reload();
      await renamedCard.waitFor();
      assert.equal(await page.locator('.save-manager-list .card').count(), 2, 'cancelled deletion must survive refresh');
      const beforeManagerFailure = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.evaluate(() => {
        const original = IDBDatabase.prototype.transaction;
        window.restoreManagerDatabase = () => { IDBDatabase.prototype.transaction = original; };
        IDBDatabase.prototype.transaction = function (stores, mode, options) {
          if (mode === 'readwrite') throw new DOMException('synthetic management write failure', 'QuotaExceededError');
          return original.call(this, stores, mode, options);
        };
      });
      for (const operation of ['改名', '删除']) {
        await renamedCard.getByRole('button', { name: operation, exact: true }).click();
        if (operation === '改名') await renamedCard.getByRole('textbox', { name: '新名称' }).fill('不得提交的失败改名');
        else await renamedCard.getByRole('textbox', { name: '确认名称' }).fill(`旁支修士-${width}`);
        await renamedCard.getByRole('button', { name: operation === '改名' ? '保存名称' : '确认删除', exact: true }).click();
        await page.getByText(operation === '改名' ? '改名未写入。请检查存储状态或重新载入列表。' : '删除未完成。请检查另一标签页的改动后重试。').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeManagerFailure, 'failed save management must not change the compatibility mirror');
        assert.equal(await page.locator('.save-manager-list .card').count(), 2, 'failed deletion must retain both visible saves');
        await renamedCard.getByRole('button', { name: '取消', exact: true }).click();
      }
      await page.evaluate(() => { window.restoreManagerDatabase(); });
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.jxStorageHydrated === 'true');
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeManagerFailure, 'failed management must preserve authoritative data after hydration');
      const managerConcurrentPage = await context.newPage();
      await managerConcurrentPage.goto(`http://127.0.0.1:${webPort}/game/${exportedBranch.save.saveId}`);
      for (const operation of ['改名', '删除']) {
        await renamedCard.getByRole('button', { name: operation, exact: true }).click();
        if (operation === '改名') await renamedCard.getByRole('textbox', { name: '新名称' }).fill('不得覆盖新进度的名称');
        else await renamedCard.getByRole('textbox', { name: '确认名称' }).fill(`旁支修士-${width}`);
        const beforeManagerConflict = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
        await managerConcurrentPage.locator('#player-intent').fill(`确认${operation}期间新增进度`);
        await managerConcurrentPage.getByRole('button', { name: '收入待处理' }).click();
        await page.waitForFunction(previous => localStorage.getItem('jiuxiao_1_local_saves_v2') !== previous, beforeManagerConflict);
        await page.getByText('检测到另一个标签页修改了存档。已从本地数据库重新读取；同一存档再次提交前仍会核对版本。').waitFor();
        const newerManagerSnapshot = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
        const newerManagedSave = JSON.parse(newerManagerSnapshot).saves.find(save => save.saveId === exportedBranch.save.saveId);
        await renamedCard.getByText(new RegExp(`存档版本 ${newerManagedSave.revision}$`)).waitFor();
        await renamedCard.getByRole('button', { name: operation === '改名' ? '保存名称' : '确认删除', exact: true }).click();
        await page.getByText(operation === '改名' ? '改名未写入。请检查存储状态或重新载入列表。' : '删除未完成。请检查另一标签页的改动后重试。').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), newerManagerSnapshot, 'stale management confirmation must preserve the whole latest library');
        await renamedCard.getByRole('button', { name: '取消', exact: true }).click();
      }
      await managerConcurrentPage.close();
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
      assert.equal(await page.getByRole('heading', { name: '选择设置方式' }).count(), 1);
      assert.equal(await page.locator('.skip-to-content').count(), 1, 'the mode chooser has a keyboard skip link without changing the professional editor');
      const readingReturnTarget = await page.evaluate(() => history.state?.returnTo);
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '15-ai-mode-mobile-night.png' : '16-ai-mode-desktop-night.png'}`), fullPage: true });
      const modeSkip = page.locator('.skip-to-content');
      await modeSkip.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'ai-mode-main', 'the mode skip link moves focus to the current content');
      assert.equal(await page.evaluate(() => history.state?.returnTo), readingReturnTarget, 'keyboard skip navigation must preserve the route return target');
      const localKeysBeforeModeSwitch = await page.evaluate(() => Object.keys(localStorage).sort());
      await page.getByRole('button', { name: '开始新手设置' }).click();
      assert.equal(await page.getByRole('heading', { name: '先选你熟悉的 AI 服务商' }).count(), 1);
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '17-ai-beginner-provider-mobile-night.png' : '18-ai-beginner-provider-desktop-night.png'}`), fullPage: true });
      const beginnerSkip = page.locator('.skip-to-content');
      assert.equal(await beginnerSkip.count(), 1, 'beginner setup has its own skip link');
      await beginnerSkip.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'ai-beginner-main', 'the beginner skip link moves focus to the current step');
      assert.equal(await page.evaluate(() => history.state?.returnTo), readingReturnTarget, 'beginner skip navigation must preserve the route return target');
      assert.equal(await page.locator('.ai-mode-card-featured').getByRole('button', { name: '用 DeepSeek 配置五岗' }).count(), 1);
      assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_config_v2')).uiMode), 'beginner');
      await page.getByRole('button', { name: '用 DeepSeek 配置五岗' }).click();
      assert.equal(await page.getByRole('heading', { name: '让五个岗位共用一个型号' }).count(), 1);
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '19-ai-beginner-config-mobile-night.png' : '20-ai-beginner-config-desktop-night.png'}`), fullPage: true });
      assert.equal(await page.getByLabel('API Key').getAttribute('type'), 'password');
      assert.ok((await page.locator('.ai-beginner-callout').innerText()).includes('高级剧情已预填配置，但仍保持停用。'));
      await page.getByRole('button', { name: '转到专业模式' }).click();
      assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_config_v2')).uiMode), 'professional');
      assert.equal(await page.locator('.skip-to-content').count(), 0, 'the professional editor keeps its existing keyboard entry points unchanged');
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), localKeysBeforeModeSwitch, 'AI mode state must remain in the existing session configuration without a new localStorage key');
      assert.equal(await page.locator('.ai-title').innerText(), 'AI 设定');
      assert.equal(await page.locator('.jx-shell').evaluate(element => getComputedStyle(element, '::before').backgroundImage.includes('/scenes/candidate/mountain-gate.')), true, 'all pages should retain the selected scene poster behind overlays');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`, 'AI close should return to the game route that opened it');
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      await page.getByRole('button', { name: '继续游玩' }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`);
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: '阅读世界设定' }).click();
      await page.locator('.worldbook-entry').first().waitFor();
      assert.equal(await page.locator('.worldbook-entry').count(), 34, 'player search should use the complete current public Canon runtime');
      assert.ok((await page.locator('.worldbook-scope').innerText()).includes('当前 34 条'), 'the reader should report the published entry count instead of a stale hardcoded number');
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '21-worldbook-mobile-night.png' : '22-worldbook-desktop-night.png'}`), fullPage: true });
      const worldSearch = page.getByRole('searchbox', { name: '搜索已审核世界设定' });
      await worldSearch.fill('天工阁');
      const worldTitles = await page.locator('.worldbook-entry-title').allTextContents();
      assert.ok(worldTitles.includes('天工阁'), 'search should find a published faction beyond the old geography sample');
      const factionEntry = page.locator('.worldbook-entry').filter({ has: page.getByRole('heading', { name: '天工阁', exact: true }) });
      await factionEntry.locator('details summary').click();
      assert.ok((await factionEntry.locator('details').innerText()).includes('原设截图'));
      assert.equal(/(?:original_\d+|[0-9a-f]{8}-[0-9a-f-]{27})/i.test(await factionEntry.locator('details').innerText()), false,
        'player source notes must not expose author-only source IDs');
      await page.getByRole('searchbox', { name: '搜索已审核世界设定' }).fill('OCR待校');
      assert.equal(await page.locator('.worldbook-entry').count(), 0, 'pending OCR must not enter public search');
       await page.getByRole('button', { name: /画卷图鉴/ }).click();
       assert.equal(await page.locator('.atlas-card').count(), 7, 'region artwork should be grouped under the source-inspired world collection');
       await page.waitForFunction(() => {
         const image = document.querySelector('.atlas-card img');
         return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
       });
       await page.getByRole('button', { name: '放大查看：九霄大陆全图' }).click();
       assert.equal(await page.locator('.atlas-dialog').evaluate(dialog => dialog.open), true, 'a visual reference should open in a native, closable detail view');
       assert.equal(/(?:canonId|world_jiuxiao)/i.test(await page.locator('.atlas-dialog').innerText()), false, 'gallery copy must not expose internal asset tags');
       await page.keyboard.press('Escape');
       await page.locator('.atlas-dialog').waitFor({ state: 'hidden' });
       // Every collection the atlas exposes is checked against the catalogue, so
       // the gallery cannot silently drop a group. Counts mirror
       // CANDIDATE_ILLUSTRATIONS, the same source the unit test pins.
       const galleryCollections = [
         ['山河与地域', 7], ['宗门与势力', 16], ['修行图鉴', 14], ['题字与纹章', 4], ['纸墨氛围', 3],
         ['人物志', 10], ['法宝器物', 10], ['天气时序', 6], ['战斗与行动', 4],
       ];
       for (const [label, count] of galleryCollections) {
         await page.locator('.atlas-collections').getByRole('button', { name: new RegExp(label) }).click();
         assert.equal(await page.locator('.atlas-card').count(), count, `${label} must include every supplied illustration in that collection`);
       }
       assert.ok((await page.getByRole('button', { name: /画卷图鉴/ }).innerText()).includes('74 幅视觉稿'), 'the gallery total should be presented from the current illustration catalogue');
       await page.getByRole('searchbox', { name: '搜索画卷图鉴' }).fill('不存在的画面名称');
       await page.getByRole('button', { name: '查看全部画卷' }).click();
       assert.equal(await page.locator('.atlas-card').count(), 7, 'the empty gallery state should offer a direct recovery action');
       assert.equal(await page.locator('.atlas-grid').innerText().then(text => /(?:world|region|faction|system)_/.test(text)), false, 'asset index tags must not leak into player-facing copy');
       await page.getByRole('button', { name: /回到.*刚才的位置/ }).click();
      assert.equal(await page.locator('h2').innerText(), `测试修士-${width}`, 'world close from game should preserve the save route');
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '阅读世界设定' }).click();
      assert.equal(await page.locator('h2').innerText(), '世界设定');
      await page.getByRole('button', { name: /回到.*刚才的位置/ }).click();
      assert.ok((await page.locator('body').innerText()).includes('选择去处'));
      await page.getByRole('button', { name: '阅读世界设定' }).click();
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: 'AI 设置' }).click();
      await page.getByRole('button', { name: '进入专业模式', exact: true }).click();
      assert.equal(await page.locator('.ai-title').innerText(), 'AI 设定');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      assert.equal(await page.locator('h2').innerText(), '世界设定', 'closing AI settings opened from the world reader should return to that reader');
      await page.getByRole('button', { name: /回到.*刚才的位置/ }).click();
      assert.ok((await page.locator('body').innerText()).includes('选择去处'), 'closing the world reader should preserve the lobby as the original return destination');
      await page.getByRole('button', { name: '作品简介' }).click();
      await page.getByRole('button', { name: '查看世界资料' }).click();
      await page.getByRole('button', { name: /回到.*刚才的位置/ }).click();
      assert.equal(await page.locator('h2').innerText(), '作品简介', 'the world reader should preserve the introduction route');
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: '回到山门' }).click();
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: '画面与声音' }).click();
      assert.equal(await page.locator('h2').innerText(), '山河光景');
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: 'AI 设置' }).click();
      await page.getByRole('button', { name: '进入专业模式', exact: true }).click();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      assert.equal(await page.locator('h2').innerText(), '山河光景', 'AI settings should preserve the graphics settings route');
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: '回到山门' }).click();
      await page.getByRole('button', { name: '管理存档' }).click();
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: '阅读世界设定' }).click();
      await page.getByRole('button', { name: /回到.*刚才的位置/ }).click();
      assert.equal(await page.locator('h2').innerText(), '存档管理', 'the world reader should preserve the save manager route');
      await page.getByRole('button', { name: '返回山门' }).click();
      await page.getByRole('button', { name: '菜单' }).click();
      await page.locator('aside').getByRole('button', { name: 'AI 设置' }).click();
      await page.getByRole('button', { name: '进入专业模式', exact: true }).click();
      assert.equal(await page.locator('.ai-title').innerText(), 'AI 设定');
      assert.equal(await page.locator('.role-panel').count(), 5);
      const privacySettingsText = await page.locator('.settings-card').filter({ hasText: '全局调度与隐私' }).innerText();
      assert.ok(privacySettingsText.includes('调用记录最长保留（天）'));
      assert.ok(privacySettingsText.includes('当前标签页会话的 sessionStorage'));
      assert.equal(await page.locator('.glass-dialog').isVisible(), false, 'closed settings dialog must not cover the page');
      await page.getByRole('button', { name: '切换到晴昼配色' }).click();
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.role-summary strong')).color), 'rgb(41, 58, 70)');
      const readVisualContract = () => page.evaluate(() => {
        const roots = [...document.querySelectorAll('.ai-page, .ai-actionbar, .glass-dialog')];
        if (!roots.some(root => root.matches('.ai-page'))) throw new Error('Professional AI editor root is missing.');
        const elements = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))];
        return elements.map(element => {
          const style = getComputedStyle(element);
          const properties = [...style].filter(property => !property.startsWith('--'));
          return [element.tagName, element.id, element.getAttribute('class') || '', properties.map(property => {
            const value = style.getPropertyValue(property);
            return [property, property === 'background-position' && value === '0px 0px' ? '0% 0%' : value];
          })];
        });
      });
      const assertFrozenProfessionalStyles = async () => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); return document.fonts.ready; });
        const activeProVisualContract = await readVisualContract();
        const activeStylesheetStates = await page.locator('link[rel="stylesheet"]').evaluateAll(links => {
          const states = links.map(link => link.disabled);
          links.forEach(link => { link.disabled = true; });
          return states;
        });
        const baselineStyleTag = await page.addStyleTag({ content: professionalBaselineCss });
        await page.evaluate(() => document.fonts.ready);
        const baselineProVisualContract = await readVisualContract();
        await baselineStyleTag.evaluate(style => style.remove());
        await page.locator('link[rel="stylesheet"]').evaluateAll((links, states) => links.forEach((link, index) => { link.disabled = states[index] ?? false; }), activeStylesheetStates);
        assert.deepEqual(activeProVisualContract, baselineProVisualContract, 'professional AI computed layout, type, color, and interaction styles must match the frozen baseline');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      };
      await assertFrozenProfessionalStyles();
      if (width === 390) {
        await page.setViewportSize({ width: 360, height: 800 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => document.documentElement.clientWidth), 'the narrow phone AI settings must not overflow horizontally');
        assert.equal(await page.locator('.ai-title').isVisible(), true);
        assert.equal(await page.locator('.provider-open').isVisible(), true);
        await page.setViewportSize({ width, height });
      }
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '07-ai-settings-mobile-day.png' : '08-ai-settings-desktop-day.png'}`), fullPage: true });
      await page.getByRole('button', { name: '切换到夜色配色' }).click();
      await page.evaluate(() => {
        const now = Date.now();
        sessionStorage.setItem('jx10_ai_call_log_v1', JSON.stringify([
          { at: new Date('2000-01-01T00:00:00.000Z').toISOString(), role: '过期岗位', model: 'expired-model', elapsedMs: 1, outcome: 'success' },
          { at: new Date(now - 86_400_000).toISOString(), role: '近期岗位', model: 'retained-model', elapsedMs: 12, outcome: 'success', apiKey: 'synthetic-log-secret', response: 'synthetic-private-response', errorCode: 'synthetic-log-secret' },
          { at: new Date(now + 86_400_000).toISOString(), role: '未来岗位', model: 'future-model', elapsedMs: 1, outcome: 'success' },
        ]));
      });
      await page.reload();
      await page.getByRole('button', { name: '进入专业模式', exact: true }).click();
      await assertFrozenProfessionalStyles();
      await page.screenshot({ path: join(screenshotDir, `${width === 390 ? '23-ai-professional-mobile-night.png' : '24-ai-professional-desktop-night.png'}`), fullPage: true });
      const retainedLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1')));
      assert.deepEqual(retainedLogs.map(log => log.model), ['retained-model']);
      assert.deepEqual(Object.keys(retainedLogs[0]).sort(), ['at', 'elapsedMs', 'model', 'outcome', 'role']);
      assert.equal(JSON.stringify(retainedLogs).includes('synthetic-'), false, 'polluted old logs must be sanitized before storage rewrite');
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
      assert.ok(presetMap.includes('deepseek-flash'));
      assert.ok(presetMap.includes('doubao-seed-2.1-pro'));
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
      assert.equal(await storyPanel.locator('input').nth(1).inputValue(), 'deepseek-flash');
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
      let probeCount = 0;
      await page.route('https://api.deepseek.com/v1/chat/completions', async route => {
        const request = route.request();
        const headers = await request.allHeaders();
        const payload = request.postDataJSON();
        assert.equal(headers.authorization, 'Bearer test-secret-not-persisted', 'the entered key should be sent only with the explicit test request');
        assert.equal(payload.model, 'deepseek-flash');
        assert.deepEqual(payload.messages, [{ role: 'user', content: '请仅回复：通路已通' }], 'connection test must not send the game transcript');
        probeCount++;
        if (probeCount === 1) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            choices: [{ message: { content: '通路已通' } }], usage: { prompt_tokens: 9, completion_tokens: 3 },
          }) });
        } else if (probeCount === 2) {
          await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({
            error: { message: 'synthetic provider error contains test-secret-not-persisted' },
          }) });
        } else if (probeCount === 3) {
          await route.abort('failed');
        } else if (probeCount === 4) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid-json' });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '通路已通' } }] }) });
        }
      });
      await page.locator('.test-permission input').check();
      const storyTestButton = storyPanel.getByRole('button', { name: '测试此岗位' });
      assert.equal(await storyTestButton.isDisabled(), false, 'an enabled role may be tested only after the user grants permission');
      await storyTestButton.click();
      await storyPanel.locator('.role-probe [role="status"]').filter({ hasText: /连接成功，\d+ ms/ }).waitFor();
      let testLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1') || '[]'));
      assert.equal(testLogs.at(-1).outcome, 'success');
      assert.equal(testLogs.at(-1).inputTokens, 9);
      assert.equal(testLogs.at(-1).outputTokens, 3);
      assert.equal(JSON.stringify(testLogs).includes('test-secret-not-persisted'), false, 'call logs must not retain API keys or provider response bodies');
      await storyTestButton.click();
      await page.locator('.ai-feedback').getByText(/服务返回 HTTP 401。.*响应正文未保存/).waitFor();
      testLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1') || '[]'));
      assert.equal(testLogs.at(-1).outcome, 'failure');
      assert.equal(testLogs.at(-1).status, 401);
      assert.equal(testLogs.at(-1).errorCode, 'HTTP_401');
      assert.equal(JSON.stringify(testLogs).includes('test-secret-not-persisted'), false, 'HTTP error bodies must not enter persisted diagnostics');
      for (const expectedCount of [3, 4]) {
        const priorLogCount = testLogs.length;
        await storyTestButton.click();
        await page.waitForFunction(previous => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1') || '[]').length === previous + 1, priorLogCount);
        testLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1') || '[]'));
        assert.equal(testLogs.at(-1).outcome, 'failure');
        assert.equal(testLogs.at(-1).errorCode, 'NETWORK_OR_FORMAT');
        assert.equal(await storyTestButton.isEnabled(), true, 'network and format failures must release the test button');
        assert.equal(probeCount, expectedCount, 'a failed probe must not automatically retry');
      }
      await storyPanel.getByRole('spinbutton', { name: '超时（秒）' }).fill('5');
      await page.evaluate(() => {
        window.originalTimeoutProbeFetch = window.fetch;
        window.timeoutProbeCount = 0;
        window.fetch = (input, init) => {
          if (String(input) === 'https://api.deepseek.com/v1/chat/completions') {
            window.timeoutProbeCount++;
            return new Promise((resolve, reject) => {
              init.signal.addEventListener('abort', () => {
                window.timeoutProbeAborted = true;
                reject(new DOMException('Synthetic aborted probe', 'AbortError'));
              }, { once: true });
            });
          }
          return window.originalTimeoutProbeFetch(input, init);
        };
      });
      const logsBeforeTimeout = testLogs.length;
      await storyTestButton.click();
      await page.locator('.ai-feedback').getByText('超过 5 秒，连接已中止。可核对超时与服务商状态后重试。', { exact: true }).waitFor();
      testLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1') || '[]'));
      assert.equal(testLogs.length, logsBeforeTimeout + 1, 'timeout records exactly one failure');
      assert.equal(testLogs.at(-1).errorCode, 'TIMEOUT');
      assert.equal(testLogs.at(-1).outcome, 'failure');
      assert.equal(await page.evaluate(() => window.timeoutProbeAborted), true, 'timeout must actually abort the signal');
      assert.equal(await page.evaluate(() => window.timeoutProbeCount), 1, 'timeout must not auto-retry');
      assert.equal(await storyTestButton.isEnabled(), true);
      assert.equal(JSON.stringify(testLogs).includes('test-secret-not-persisted'), false);
      await page.evaluate(() => { window.fetch = window.originalTimeoutProbeFetch; });
      await storyTestButton.click();
      await storyPanel.locator('.role-probe [role="status"]').filter({ hasText: /连接成功，\d+ ms/ }).waitFor();
      testLogs = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jx10_ai_call_log_v1') || '[]'));
      assert.equal(testLogs.at(-1).outcome, 'success', 'explicit retry after timeout may succeed');
      assert.equal(probeCount, 5);
      await page.getByRole('button', { name: '调用记录' }).click();
      const connectionLogText = await page.locator('.call-log-dialog-body').innerText();
      assert.ok(connectionLogText.includes('deepseek-flash'));
      assert.ok(connectionLogText.includes('HTTP 401'));
      assert.equal(connectionLogText.includes('test-secret-not-persisted'), false);
      await page.getByRole('button', { name: '关闭窗口' }).click();
      assert.ok((await page.locator('body').innerText()).includes('契约 v2'));
      await page.getByRole('button', { name: '查看配置与成本' }).nth(2).click();
      assert.equal(await page.locator('.glass-dialog h2').innerText(), '长歌 · 旗舰');
      assert.ok((await page.locator('.preset-role-map').innerText()).includes('claude-opus-5-5'));
      assert.ok((await page.locator('.estimate-totals').innerText()).includes('$'));
      await page.getByRole('button', { name: '应用此方案' }).click();
      const opusPanel = page.locator('.role-panel').nth(0);
      const opusTemperature = opusPanel.locator('.number-grid').first().locator('input').nth(0);
      const opusTopP = opusPanel.locator('.number-grid').first().locator('input').nth(1);
      assert.equal(await opusTemperature.inputValue(), '1');
      assert.equal(await opusTemperature.isDisabled(), true, 'Claude sampling controls should be locked to model defaults');
      assert.equal(await opusTopP.inputValue(), '1');
      assert.equal(await opusTopP.isDisabled(), true);
      assert.ok((await opusPanel.innerText()).includes('接入请求时必须省略'));
      const directorPanel = page.locator('.role-panel').nth(1);
      assert.equal(await directorPanel.locator('.number-grid').first().locator('input').nth(0).isDisabled(), false, 'unrestricted models should retain editable sampling controls');
      const geminiPanel = page.locator('.role-panel').nth(2);
      await geminiPanel.locator(':scope > summary').click();
      await geminiPanel.locator('.advanced-fields > summary').click();
      const geminiTemperature = geminiPanel.locator('.number-grid').first().locator('input').nth(0);
      assert.equal(await geminiTemperature.isDisabled(), true, 'Gemini 3.8 Flash migration guidance requires omitting sampling fields');
      assert.ok((await geminiPanel.innerText()).includes('Gemini 3.8 Flash 要求移除这三项'));
      const logsBeforeLeave = await page.evaluate(() => sessionStorage.getItem('jx10_ai_call_log_v1'));
      await page.evaluate(() => {
        window.originalLeaveProbeFetch = window.fetch; window.leaveProbeCount = 0;
        window.fetch = (_input, init) => {
          window.leaveProbeCount++;
          return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => {
            window.leaveProbeAborted = true; reject(new DOMException('Synthetic leave cancellation', 'AbortError'));
          }, { once: true }));
        };
        const button = document.querySelector('.connection-row button'); button.click(); button.click();
      });
      await page.waitForFunction(() => window.leaveProbeCount === 1);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.waitForFunction(() => window.leaveProbeAborted === true);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('jx10_ai_call_log_v1')), logsBeforeLeave, 'leaving settings must abort and not append late diagnostics');
      await page.evaluate(() => { window.fetch = window.originalLeaveProbeFetch; });
      assert.ok((await page.locator('body').innerText()).includes('选择去处'), 'AI settings should close back to its entry route');

      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip-to-content').evaluate(element => document.activeElement === element), true, 'the first keyboard stop should skip directly to page content');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('main').evaluate(element => document.activeElement === element), true, 'skip navigation should place focus on the main content');
      assert.equal(await page.locator('.graphics-page h2').innerText(), '山河光景');
      assert.equal(await page.locator('.scene-choice').count(), 4, 'the graphics page should expose the four fixed scene identities');
      assert.equal(await page.locator('.jx-shell').evaluate(element => getComputedStyle(element, '::before').backgroundImage.includes('/scenes/candidate/mountain-gate.')), true, 'graphics settings should retain the shared selected-scene background');
      await page.locator('.scene-choice').nth(1).click();
      assert.equal(await page.locator('.scene-choice').nth(1).getAttribute('aria-pressed'), 'true');
      assert.ok((await page.locator('.scene-choice').nth(1).innerText()).includes('当前预览'), 'the selected scene should be identified by text as well as shape');
      await page.getByLabel('画质档位').selectOption('extreme');
      const fpsTarget = page.getByLabel('场景帧率目标');
      await fpsTarget.focus();
      await fpsTarget.press('End');
      assert.deepEqual(await page.evaluate(() => {
        const value = JSON.parse(localStorage.getItem('jx10_graphics_v1'));
        return [value.quality, value.targetFps];
      }), ['extreme', 120], 'quality and frame target must persist locally');
      const reduceMotionToggle = page.getByRole('checkbox', { name: /^减少动态效果/ });
      await reduceMotionToggle.check();
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.jxReducedMotion), 'on', 'the custom reduced-motion preference must reach every route');
      assert.equal(await page.locator('.waterfall-traces').first().evaluate(element => getComputedStyle(element).animationName), 'none', 'custom reduced motion must freeze waterfall decoration');
      assert.equal(await page.locator('.scene-cloud-drift-one').evaluate(element => getComputedStyle(element).animationName), 'none', 'custom reduced motion must freeze drifting clouds');
      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.getByRole('checkbox', { name: /^减少动态效果/ }).uncheck();
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.notEqual(await page.locator('.waterfall-traces').first().evaluate(element => getComputedStyle(element).animationName), 'none', 'turning custom reduced motion off must restore scene motion');

      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.locator('.graphics-toggle').filter({ hasText: '雾与水光' }).locator('input').uncheck();
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.jxAtmosphere), 'off', 'the atmosphere preference must reach the home scene');
      assert.equal(await page.locator('.scene-mist-back').evaluate(element => getComputedStyle(element).display), 'none', 'turning atmosphere off must hide CSS mist');
      assert.equal(await page.locator('.waterfall-traces').first().evaluate(element => getComputedStyle(element).display), 'none', 'turning atmosphere off must hide waterfall highlights');
      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.locator('.graphics-toggle').filter({ hasText: '雾与水光' }).locator('input').check();
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.notEqual(await page.locator('.scene-mist-back').evaluate(element => getComputedStyle(element).display), 'none', 'turning atmosphere on must restore CSS mist');

      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.locator('.graphics-toggle').filter({ hasText: '浮尘与灵火' }).locator('input').uncheck();
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.jxParticles), 'off', 'the particle preference must reach the home scene');
      assert.equal(await page.locator('.scene-petals').first().evaluate(element => getComputedStyle(element).display), 'none', 'turning particles off must hide the decorative petals');
      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.locator('.graphics-toggle').filter({ hasText: '浮尘与灵火' }).locator('input').check();

      await page.locator('.graphics-toggle').filter({ hasText: '省电 / 省流量' }).locator('input').check();
      assert.equal(await fpsTarget.isDisabled(), true, 'data saver should lock the scene cap');
      assert.ok((await page.locator('.renderer-readout').innerText()).includes('30 FPS'), 'data saver should impose a real 30 FPS cap');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => document.documentElement.clientWidth), 'graphics controls should not overflow horizontally');
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.jxDataSaver), 'on', 'data saver must reach the home scene');
      assert.equal(await page.locator('.scene-cloud-drift-one').evaluate(element => getComputedStyle(element).animationName), 'none', 'data saver must freeze decorative CSS animation rather than only the canvas');
      assert.equal(await page.locator('.scene-petals').first().evaluate(element => getComputedStyle(element).display), 'none', 'data saver must suppress decorative particles');
      assert.equal(await page.locator('.portal-enter').evaluate(element => getComputedStyle(element, '::after').animationName), 'none', 'data saver must also freeze the animated entry-button sheen');
      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.locator('.graphics-toggle').filter({ hasText: '省电 / 省流量' }).locator('input').uncheck();
      await page.goto(`http://127.0.0.1:${webPort}/`);
      assert.notEqual(await page.locator('.portal-enter').evaluate(element => getComputedStyle(element, '::after').animationName), 'none', 'disabling data saver must restore the entry-button sheen');
      await page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element =>
        /^当前后端：(WebGL 2|WebGL|Canvas 2D|静态回退)$/.test(element.textContent?.trim() || '')), null, { timeout: 5000 });
      const runtimeBackend = await page.locator('.graphics-status').filter({ hasText: '当前后端：' }).innerText();
      assert.match(runtimeBackend, /^当前后端：(WebGL 2|WebGL|Canvas 2D|静态回退)$/,
        'the diagnostics must report the renderer that actually compiled or the explicit fallback');
      if (runtimeBackend.includes('WebGL')) {
        await page.waitForFunction(() => {
          const pointMode = window.WebGL2RenderingContext?.POINTS ?? window.WebGLRenderingContext?.POINTS;
          return pointMode !== undefined && window.__jxDrawModes?.includes(pointMode);
        });
        assert.ok(await page.evaluate(() => window.__jxDrawModes.includes(window.WebGL2RenderingContext?.POINTS ?? window.WebGLRenderingContext?.POINTS)),
          'particles must use a dedicated point pass rather than a per-pixel fragment loop');
        await page.waitForFunction(() => window.__jxTrianglePositionPasses.length >= 3);
        const trianglePasses = await page.evaluate(() => window.__jxTrianglePositionPasses);
        assert.ok(trianglePasses.every(pass => pass.bufferId > 0 && pass.bufferKind === 'fullscreen-quad'),
          `each fullscreen pass must bind the quad data after the particle pass: ${JSON.stringify(trianglePasses)}`);
      }
      runtimeBackends.push(`${width}px ${runtimeBackend}`);
      await page.locator('.graphics-toggle').filter({ hasText: '浮尘与灵火' }).locator('input').uncheck();
      const atmosphereToggle = page.locator('.graphics-toggle').filter({ hasText: '雾与水光' }).locator('input');
      await atmosphereToggle.uncheck();
      await page.waitForFunction(() => document.querySelector('.renderer-readout')?.textContent?.includes('0 FPS'));
      await page.waitForTimeout(150);
      const pausedDrawCount = await page.evaluate(() => window.__jxDrawModes.length);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__jxDrawModes.length), pausedDrawCount,
        'disabling fog with particles already off should stop the render loop after its final frame');
      await atmosphereToggle.check();
      await page.waitForFunction(() => /[1-9]\d* FPS/.test(document.querySelector('.renderer-readout')?.textContent || ''), null, { timeout: 5000 });
      if (await page.evaluate(() => Boolean(window.AudioContext))) {
        const soundButton = page.getByRole('button', { name: '启水声' });
        await soundButton.click();
        await page.getByRole('button', { name: '水声已启' }).waitFor();
        assert.equal(await page.getByRole('button', { name: '水声已启' }).getAttribute('aria-pressed'), 'true', 'sound must only start after the explicit user gesture');
        await page.getByRole('button', { name: '水声已启' }).click();
        assert.equal(await page.getByRole('button', { name: '启水声' }).getAttribute('aria-pressed'), 'false');
        audioChecks.push(`${width}px 音频手势/静音已验证`);
      } else audioChecks.push(`${width}px AudioContext 不可用，未验证播放`);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('.renderer-readout')?.textContent?.includes('0 FPS'));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => /[1-9]\d* FPS/.test(document.querySelector('.renderer-readout')?.textContent || ''), null, { timeout: 5000 });
      const contextLossTriggered = await page.evaluate(() => {
        const canvas = document.querySelector('.scene-atmosphere-canvas');
        const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null;
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext();
        return true;
      });
      assert.equal(contextLossTriggered, true, 'the WebGL context-loss fallback must be injectable in this browser');
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element => element.textContent?.includes('当前后端：Canvas 2D')));
      assert.equal(await page.locator('.scene-atmosphere-2d').evaluate(element => element.classList.contains('is-active')), true,
        'context loss should switch to the independent 2D canvas when available');
      fallbackChecks.push(`${width}px WebGL context loss → Canvas 2D`);

      const shaderFailurePage = await context.newPage();
      await shaderFailurePage.addInitScript(() => {
        localStorage.setItem('jx10_graphics_v1', JSON.stringify({ quality: 'extreme', targetFps: 120, renderScale: 135 }));
        for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
          const prototype = window[name]?.prototype;
          if (!prototype || typeof prototype.getShaderParameter !== 'function') continue;
          const original = prototype.getShaderParameter;
          prototype.getShaderParameter = function (shader, parameter) {
            if (parameter === this.COMPILE_STATUS) return false;
            return original.call(this, shader, parameter);
          };
        }
      });
      await shaderFailurePage.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await shaderFailurePage.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element => element.textContent?.includes('当前后端：Canvas 2D')));
      assert.equal(await shaderFailurePage.locator('.scene-atmosphere-2d').evaluate(element => element.classList.contains('is-active')), true,
        'shader compilation failure must leave a usable 2D fallback');
      const fallbackScale = Number((await shaderFailurePage.locator('.renderer-readout').innerText()).match(/有效渲染比例\s+(\d+)%/)?.[1]);
      assert.ok(fallbackScale <= 80, 'the CPU fallback must cap its canvas resolution even when extreme quality was selected');
      fallbackChecks.push(`${width}px 着色器编译失败 → Canvas 2D`);
      await shaderFailurePage.close();

      const bufferFailurePage = await context.newPage();
      await bufferFailurePage.addInitScript(() => {
        localStorage.setItem('jx10_graphics_v1', JSON.stringify({ quality: 'extreme', targetFps: 120, renderScale: 135 }));
        for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
          const prototype = window[name]?.prototype;
          if (prototype && typeof prototype.createBuffer === 'function') prototype.createBuffer = () => null;
        }
      });
      await bufferFailurePage.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await bufferFailurePage.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element => element.textContent?.includes('当前后端：Canvas 2D')));
      assert.equal(await bufferFailurePage.locator('.scene-atmosphere-2d').evaluate(element => element.classList.contains('is-active')), true,
        'GPU buffer allocation failure must choose the independent 2D fallback');
      const allocationFallbackScale = Number((await bufferFailurePage.locator('.renderer-readout').innerText()).match(/有效渲染比例\s+(\d+)%/)?.[1]);
      assert.ok(allocationFallbackScale <= 80, 'buffer allocation failure must use the bounded CPU fallback profile');
      fallbackChecks.push(`${width}px WebGL 缓冲区分配失败 → Canvas 2D`);
      await bufferFailurePage.close();

      const webgl1Page = await context.newPage();
      await webgl1Page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (this.classList.contains('scene-atmosphere-webgl') && type === 'webgl2') return null;
          return original.call(this, type, ...args);
        };
      });
      await webgl1Page.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await webgl1Page.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element => element.textContent?.trim() === '当前后端：WebGL'));
      const webgl1Status = await webgl1Page.locator('.graphics-status').filter({ hasText: '当前后端：' }).innerText();
      assert.equal(webgl1Status, '当前后端：WebGL', 'the WebGL 1 path should compile when WebGL 2 is unavailable');
      fallbackChecks.push(`${width}px WebGL 2 禁用 → WebGL 1`);
      await webgl1Page.close();

      const canvasFallbackPage = await context.newPage();
      await canvasFallbackPage.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(contextId, options) {
          if (contextId === 'webgl2' || contextId === 'webgl' || contextId === 'experimental-webgl') return null;
          return original.call(this, contextId, options);
        };
      });
      await canvasFallbackPage.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await canvasFallbackPage.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element => element.textContent?.includes('当前后端：Canvas 2D')));
      fallbackChecks.push(`${width}px WebGL 禁用 → Canvas 2D`);
      await canvasFallbackPage.close();

      const staticFallbackPage = await context.newPage();
      await staticFallbackPage.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = () => null;
      });
      await staticFallbackPage.goto(`http://127.0.0.1:${webPort}/settings/graphics`);
      await staticFallbackPage.waitForFunction(() => Array.from(document.querySelectorAll('.graphics-status')).some(element => element.textContent?.includes('当前后端：静态回退')));
      fallbackChecks.push(`${width}px Canvas 不可用 → 静态回退`);
      await staticFallbackPage.close();

      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.equal(await page.locator('.scene-choice').count(), 0, 'temporary scene preview controls should not leak outside settings');

      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '菜单' }).click();
      const importInput = page.locator('aside input[type="file"]');
      const beforeImportRace = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.evaluate(() => {
        window.originalImportText = File.prototype.text;
        File.prototype.text = function () {
          if (this.name === 'slow-import.json') return new Promise(resolve => { window.resolveSlowImport = resolve; });
          if (this.name === 'stale-failure.json') return new Promise((resolve, reject) => { window.rejectStaleImport = reject; });
          if (this.name === 'unreadable-import.json') return Promise.reject(new Error('synthetic read failure'));
          return window.originalImportText.call(this);
        };
      });
      await importInput.setInputFiles({ name: 'slow-import.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
      await page.waitForFunction(() => typeof window.resolveSlowImport === 'function');
      const latestImport = { name: 'latest-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ messages: [{ role: 'user', content: '最新预览正文' }] })) };
      await page.getByRole('button', { name: '菜单' }).click();
      await Promise.all([page.waitForEvent('download'), importInput.setInputFiles(latestImport)]);
      await page.locator('.import-preview').getByText(/来源：latest-import.json/).waitFor();
      await page.evaluate(async () => {
        window.resolveSlowImport(JSON.stringify({ messages: [{ role: 'user', content: '旧预览正文' }] }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.match(await page.locator('.import-preview').innerText(), /来源：latest-import.json/, 'a late old read must not replace the latest preview');
      await page.getByRole('button', { name: '菜单' }).click();
      await importInput.setInputFiles({ name: 'stale-failure.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
      await page.waitForFunction(() => typeof window.rejectStaleImport === 'function');
      await page.getByRole('button', { name: '菜单' }).click();
      await Promise.all([page.waitForEvent('download'), importInput.setInputFiles(latestImport)]);
      await page.locator('.import-preview').getByText(/来源：latest-import.json/).waitFor();
      await page.evaluate(async () => {
        window.rejectStaleImport(new Error('synthetic superseded failure'));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.getByText(/已读取「latest-import.json」/).waitFor();
      await page.getByRole('button', { name: '菜单' }).click();
      await importInput.setInputFiles({ name: 'unreadable-import.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
      await page.getByText(/导入失败：无法读取文件。原存档未修改。/).waitFor();
      assert.equal(await page.locator('.import-preview').count(), 0, 'a failed new read must clear the old actionable preview');
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeImportRace, 'read races and failures must not change saved data');
      await page.evaluate(() => { File.prototype.text = window.originalImportText; });
      await page.getByRole('button', { name: '菜单' }).click();
      const savesBeforeBadImport = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length);
      const [badBackup] = await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"messages":') }),
      ]);
      assert.ok(badBackup.suggestedFilename().startsWith('九霄-导入前原文备份-'));
      await page.getByText(/导入失败：文件格式或内容不符合旧档契约/).waitFor();
      assert.equal(await page.locator('.import-preview').count(), 0, 'malformed JSON must not enter the import preview as story text');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length), savesBeforeBadImport, 'a malformed import must not alter existing saves');
      assert.equal(await page.locator('aside').count(), 0, 'selecting a file should close the menu before import review');
      if (width === 390) {
        const boundarySnapshot = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
        const exactLimit = Buffer.alloc(20 * 1024 * 1024, 0x20);
        Buffer.from(JSON.stringify({ messages: ['boundary story'], status: 'boundary status' })).copy(exactLimit);
        await page.getByRole('button', { name: '菜单' }).click();
        const [boundaryBackup] = await Promise.all([
          page.waitForEvent('download'),
          importInput.setInputFiles({ name: 'exact-limit.json', mimeType: 'application/json', buffer: exactLimit }),
        ]);
        await page.locator('.import-preview').getByText(/来源：exact-limit.json/).waitFor();
        assert.deepEqual(readFileSync(await boundaryBackup.path()), exactLimit, 'the exact 20 MiB import backup must retain every original byte');
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), boundarySnapshot, 'a valid boundary preview must not commit a save');
        await page.locator('.import-preview').getByRole('button', { name: '取消', exact: true }).click();
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), boundarySnapshot, 'cancelling a boundary preview must preserve saved data');
        // Accepted boundary input must survive the final write and a real reload, not merely preview.
        await page.reload();
        await page.getByRole('button', { name: '菜单' }).click();
        await Promise.all([page.waitForEvent('download'),importInput.setInputFiles({ name:'exact-limit-final.json',mimeType:'application/json',buffer:exactLimit })]);
        await page.locator('.import-preview').getByRole('button',{name:'导入此档',exact:true}).click();
        await page.waitForFunction(()=>JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.some(save=>JSON.stringify(save).includes('boundary story')));
        await page.reload();
        assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.some(save=>JSON.stringify(save).includes('boundary story'))),'the accepted 20 MiB source must persist its parsed archive after reload; original byte backup was separately verified');
        // Remove only this isolated boundary fixture from the authoritative test DB.
        await page.evaluate(()=>new Promise((resolve,reject)=>{
          const opened=indexedDB.open('jiuxiao-1',2);
          opened.onsuccess=()=>{const db=opened.result,tx=db.transaction(['saves','meta'],'readwrite'),store=tx.objectStore('saves'),meta=tx.objectStore('meta');
            const rows=store.getAll();rows.onsuccess=()=>{for(const save of rows.result)if(JSON.stringify(save).includes('boundary story'))store.delete(save.saveId);};
            const revision=meta.get('revision');revision.onsuccess=()=>meta.put({key:'revision',value:revision.result.value+1});
            tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(new Error('boundary fixture cleanup failed'));};
          };opened.onerror=()=>reject(new Error('boundary fixture cleanup open failed'));
        }));
        await page.reload();
        await page.getByRole('button', { name: '菜单' }).waitFor();
        const boundaryAfterCleanup = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
        const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x61);
        await page.getByRole('button', { name: '菜单' }).click();
        await importInput.setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: oversized });
        await page.getByText(/导入失败：文件超过 20 MiB 上限/).waitFor();
        assert.equal(await page.locator('.import-preview').count(), 0, 'an oversized file must be rejected before preview');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length), savesBeforeBadImport, 'an oversized import must not alter existing saves');
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), boundaryAfterCleanup, 'over-limit rejection must preserve the complete saved library');
      }
      const beforeInvalidImports = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      const invalidImports = [
        ['empty.json', ''], ['object.json', '{}'], ['null.json', 'null'], ['array.json', '[]'], ['scalar.json', '42'],
        ['messages-type.json', '{"messages":"not-an-array"}'], ['negative-turn.json', '{"turn":-1}'],
        ['fractional-turn.json', '{"turn":1.5}'], ['revision-type.json', '{"revision":"1"}'],
        ['player-type.json', '{"player":[]}'], ['world-type.json', '{"world":"not-an-object"}'],
        ['unrecognized.json', '{"unknown":"not-a-save"}'],
        ['bad-envelope.json', '{"format":"JIUXIAO_SAVE","version":0,"save":{"messages":[]}}'],
        ['blank.txt', '   \n'], ['script-only.html', '<script>window.importScriptExecuted=true</script><style>body{display:none}</style>'],
      ];
      for (const [name, text] of invalidImports) {
        console.log(`Invalid import regression: ${width}px ${name}`);
        const bytes = Buffer.from(text);
        // Each rejection must also survive a real reload. Browser-initiated
        // navigation resets the automatic-download limiter between samples.
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.jxStorageHydrated === 'true');
        await page.getByRole('button', { name: '菜单' }).click();
        const [invalidBackup] = await Promise.all([
          page.waitForEvent('download'),
          importInput.setInputFiles({ name, mimeType: name.endsWith('.json') ? 'application/json' : 'text/plain', buffer: bytes }),
        ]);
        await page.getByText(/导入失败：文件格式或内容不符合旧档契约/).waitFor();
        assert.deepEqual(readFileSync(await invalidBackup.path()), bytes, `rejected ${name} must retain its exact original backup`);
        assert.equal(await page.locator('.import-preview').count(), 0, `rejected ${name} must not enter preview`);
        assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeInvalidImports, `rejected ${name} must preserve the complete save library`);
      }
      assert.equal(await page.evaluate(() => window.importScriptExecuted), undefined, 'HTML import must not execute scripts');
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.jxStorageHydrated === 'true');
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), beforeInvalidImports, 'rejected imports must preserve authoritative saves after refresh');
      const legacyJson = JSON.stringify({
        messages: [{ role: 'user', content: '旧档正文' }],
        status: '姓名：迁移修士',
        world: { location: '旧档山门', weather: '夜雨', key: '旧钥匙' },
        intel: { clue: '石阶留有剑痕' },
        memory: '曾与守门弟子交谈',
        apiKey: 'imported-secret-not-exported',
        legacyAiConfig: { providers: [{ api_key: 'imported-secret-not-exported' }] },
        pendingQueue: [{ text: '旧版待处理行动' }],
        extensionFromOldVersion: { clue: '仍可核对的扩展字段' },
        stm: ['短期线索甲'],
        ltm: ['长期约定乙'],
      });
      await page.getByRole('button', { name: '菜单' }).click();
      const [backup] = await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'legacy-chat.json', mimeType: 'application/json', buffer: Buffer.from(legacyJson) }),
      ]);
      assert.ok(backup.suggestedFilename().startsWith('九霄-导入前原文备份-'));
      assert.equal(await page.locator('.import-preview h2').innerText(), '导入旧局');
      assert.ok((await page.locator('.import-preview').innerText()).includes('status'));
      assert.equal(await page.locator('.import-preview h2').innerText(), '导入旧局');
      const savesBeforeImportCancel = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      assert.equal(readFileSync(await backup.path(), 'utf8'), legacyJson, 'cancelled import still has the exact original backup');
      await page.locator('.import-preview').getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await page.locator('.import-preview').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), savesBeforeImportCancel, 'cancelled import must not write saves');
      await page.reload();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), savesBeforeImportCancel, 'cancelled import must not change saves after refresh');
      await page.getByRole('button', { name: '菜单' }).click();
      await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'legacy-chat.json', mimeType: 'application/json', buffer: Buffer.from(legacyJson) }),
      ]);
      await page.locator('.import-preview').waitFor();
      await page.getByRole('button', { name: '导入此档' }).click();
      assert.equal(await page.locator('.game-topline h1').innerText(), '导入旧局');
      await page.getByRole('button', { name: '角色状态', exact: true }).click();
      let legacyPanel = page.locator('.game-info-dialog [aria-label="资料内容"]');
      assert.ok((await legacyPanel.innerText()).includes('旧版状态记录'));
      assert.ok((await legacyPanel.innerText()).includes('姓名：迁移修士'));
      await page.getByRole('button', { name: '关闭资料面板' }).click();
      await page.getByRole('button', { name: '综合情报', exact: true }).click();
      legacyPanel = page.locator('.game-info-dialog [aria-label="资料内容"]');
      assert.ok((await legacyPanel.innerText()).includes('旧版世界资料'));
      assert.ok((await legacyPanel.innerText()).includes('旧版综合情报'));
      assert.ok((await legacyPanel.innerText()).includes('石阶留有剑痕'));
      await page.getByRole('button', { name: '关闭资料面板' }).click();
      await page.getByRole('button', { name: '星记忆', exact: true }).click();
      legacyPanel = page.locator('.game-info-dialog [aria-label="资料内容"]');
      for (const memoryField of ['旧版记忆记录', '短期记忆', '长期记忆', '曾与守门弟子交谈', '短期线索甲', '长期约定乙']) {
        assert.ok((await legacyPanel.innerText()).includes(memoryField), `memory panel should retain ${memoryField}`);
      }
      await page.getByRole('button', { name: '关闭资料面板' }).click();
      await page.getByRole('button', { name: '旧档资料与迁移核对', exact: true }).click();
      await page.locator('.legacy-groups summary').filter({ hasText: 'status' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('姓名：迁移修士'));
      await page.locator('.legacy-groups summary').filter({ hasText: 'pendingQueue' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('旧版待处理行动'), 'legacy queues should remain inspectable after import');
      await page.locator('.legacy-groups summary').filter({ hasText: 'extensionFromOldVersion' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('仍可核对的扩展字段'), 'unknown legacy fields should remain inspectable');
      await page.locator('.legacy-groups summary').filter({ hasText: 'legacyAiConfig' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('[已移除密钥]'), 'archive preview should redact credential fields');
      assert.equal((await page.locator('.legacy-groups').innerText()).includes('imported-secret-not-exported'), false, 'archive preview should not expose credential values');
      await page.locator('.legacy-groups summary').filter({ hasText: 'apiKey' }).click();
      assert.ok((await page.locator('.legacy-groups').innerText()).includes('[已移除密钥]'), 'top-level archive credential fields should also be redacted');
      assert.equal((await page.locator('.legacy-groups').innerText()).includes('imported-secret-not-exported'), false, 'no archive preview should expose credential values');
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
      const collisionJson = JSON.stringify(sanitizedExport);
      const collisionSnapshotBefore = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      await page.getByRole('button', { name: '菜单' }).click();
      await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'same-id-import.json', mimeType: 'application/json', buffer: Buffer.from(collisionJson) }),
      ]);
      assert.equal(await page.locator('.import-preview').getByRole('button', { name: '导入此档', exact: true }).count(), 0,
        'an ID collision must not expose an unconfirmed keep/overwrite action');
      assert.equal(await page.getByRole('button', { name: '确认替换现有存档' }).isDisabled(), true,
        'an ID collision must require the exact existing save name before replacement');
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), collisionSnapshotBefore, 'same-ID keep import must not silently replace');
      const importConcurrentPage = await context.newPage();
      await importConcurrentPage.goto(page.url());
      await importConcurrentPage.locator('#player-intent').fill('导入预览后另一个标签保存的新进度');
      await importConcurrentPage.getByRole('button', { name: '收入待处理' }).click();
      await importConcurrentPage.getByText(/行动已加入本地待处理队列/).waitFor();
      await page.getByText('检测到另一个标签页修改了存档。已从本地数据库重新读取；同一存档再次提交前仍会核对版本。').waitFor();
      const collisionSnapshotNewer = await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2'));
      assert.notEqual(collisionSnapshotNewer, collisionSnapshotBefore);
      await page.locator('.replace-save-confirm input').fill(sanitizedExport.save.name);
      await page.locator('.import-preview').getByRole('button', { name: '确认替换现有存档' }).click();
      await page.getByText('存档列表刚有变化，导入未覆盖任何内容。请核对最新列表后再选“另存副本”或重试。').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('jiuxiao_1_local_saves_v2')), collisionSnapshotNewer, 'stale reviewed replacement must not overwrite new progress after a storage refresh');
      await page.locator('.import-preview').getByRole('button', { name: '另存为副本' }).click();
      await page.waitForFunction(name => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2') || 'null')?.saves?.some(save => save.name === name), `${sanitizedExport.save.name}（副本）`);
      const recoveredCollisionSaves = await page.evaluate(() => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves);
      const expectedLatest = JSON.parse(collisionSnapshotNewer).saves.find(save => save.saveId === sanitizedExport.save.saveId);
      assert.deepEqual(recoveredCollisionSaves.find(save => save.saveId === expectedLatest.saveId), expectedLatest, 'copy recovery must preserve the entire latest original');
      const collisionCopy = recoveredCollisionSaves.find(save => save.name === `${sanitizedExport.save.name}（副本）`);
      assert.ok(collisionCopy && collisionCopy.saveId !== expectedLatest.saveId);
      await importConcurrentPage.close();
      await page.getByRole('button', { name: '菜单' }).click();
      await Promise.all([
        page.waitForEvent('download'),
        importInput.setInputFiles({ name: 'freshly-reviewed-replacement.json', mimeType: 'application/json', buffer: Buffer.from(collisionJson) }),
      ]);
      await page.locator('.replace-save-confirm input').fill(sanitizedExport.save.name);
      await page.locator('.import-preview').getByRole('button', { name: '确认替换现有存档' }).click();
      await page.waitForFunction(id => location.pathname === `/game/${id}` && !document.querySelector('.import-preview'), sanitizedExport.save.saveId);
      const deliberatelyReplaced = await page.evaluate(id => JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.find(save => save.saveId === id), sanitizedExport.save.saveId);
      assert.deepEqual(deliberatelyReplaced.pendingQueue, sanitizedExport.save.pendingQueue, 'a newly reviewed explicit replacement must still be allowed');
      assert.deepEqual(deliberatelyReplaced.messages, sanitizedExport.save.messages);
      const privateSavePath = process.env.JIUXIAO_PRIVATE_LEGACY_SAVE;
      if (width === 390 && privateSavePath) {
        // SEC-10: real private saves must not enter the browser render/download
        // pipeline. Byte-exact backup and lossless-import behaviour for real data
        // was verified manually on 2026-10-02 (acceptance evidence); automation
        // now asserts only structure and the recorded fingerprint.
        const sourceBytes = readFileSync(privateSavePath);
        const source = JSON.parse(sourceBytes.toString('utf8'));
        const expectedPayload = source.save || source;
        assert.equal(typeof expectedPayload, 'object', 'real save must expose a save/payload object');
        assert.ok(Array.isArray(expectedPayload.messages), 'real save must retain its message history');
        const privateSha = createHash('sha256').update(sourceBytes).digest('hex');
        if (process.env.JIUXIAO_PRIVATE_LEGACY_SAVE_SHA256) {
          assert.equal(privateSha, process.env.JIUXIAO_PRIVATE_LEGACY_SAVE_SHA256, 'real save fingerprint must match the recorded digest');
        }
      }
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.ok((await page.locator('body').innerText()).includes('继续游玩'));
      const htmlBytes = Buffer.from('<article><h1>旧 HTML 章节</h1><p>应保留的正文。</p><script>window.__legacyInjected=true;</script></article>');
      await page.getByRole('button', { name: '菜单' }).click();
      const [htmlBackup] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('aside input[type="file"]').setInputFiles({ name: 'old-chapter.html', mimeType: 'text/html', buffer: htmlBytes }),
      ]);
      assert.deepEqual(readFileSync(await htmlBackup.path()), htmlBytes, 'HTML import must back up exact source bytes before parsing');
      assert.equal(await page.locator('.import-preview h2').innerText(), 'old-chapter');
      assert.equal((await page.locator('.import-preview .stats').innerText()).includes('消息\n1'), true, 'HTML import preview should report its one recovered message');
      await page.getByRole('button', { name: '导入此档' }).click();
      await page.locator('.game-topline h1').waitFor();
      assert.ok((await page.locator('.story-reading').innerText()).includes('应保留的正文'));
      assert.equal(await page.locator('.story-reading').evaluate(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)), true,
        'the story scrolls inside the fixed game frame');
      assert.equal(await page.evaluate(() => window.scrollY), 0, 'the outer game document does not compete for scrolling');
      assert.equal(await page.evaluate(() => window.__legacyInjected), undefined, 'HTML import must never execute script elements');
      const txtBytes = Buffer.from('[USER]:山门之外有何去处？\n[AI]:沿石阶向东，可见一条溪谷。\n#-----#\n');
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      await page.getByRole('button', { name: '菜单' }).click();
      const [txtBackup] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('aside input[type="file"]').setInputFiles({ name: 'old-dialogue.txt', mimeType: 'text/plain', buffer: txtBytes }),
      ]);
      assert.deepEqual(readFileSync(await txtBackup.path()), txtBytes, 'TXT import must back up exact source bytes before parsing');
      await page.getByRole('button', { name: '导入此档' }).click();
      await page.locator('.game-topline h1').waitFor();
      const txtStory = await page.locator('.story-reading').innerText();
      assert.ok(txtStory.includes('山门之外有何去处？'));
      assert.ok(txtStory.includes('沿石阶向东，可见一条溪谷。'));
      await page.evaluate(() => new Promise(resolve => {
        localStorage.removeItem('jiuxiao_1_local_saves');
        localStorage.removeItem('jiuxiao_1_local_saves_v2');
        sessionStorage.removeItem('jiuxiao_active_save_id');
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
      const firstLegacySave = migratedSaves.find(save => save.name === '旧库修士');
      assert.ok(firstLegacySave, 'the first legacy save should retain its original name');
      await page.evaluate(saveId => sessionStorage.setItem('jiuxiao_active_save_id', saveId), firstLegacySave.saveId);
      await page.goto(`http://127.0.0.1:${webPort}/lobby`);
      assert.equal(await page.locator('.lobby-page h2').innerText(), '选择去处');
      await page.getByRole('button', { name: '继续游玩' }).click();
      await page.locator('.game-topline h1').waitFor();
      assert.equal(await page.locator('.game-topline h1').innerText(), '旧库修士');
      const beforeWorld = await page.locator('.story-reading').evaluate(element => {
        element.scrollTop = 280;
        return element.scrollTop;
      });
      assert.ok(beforeWorld > 0, 'the story container should scroll through the full story history');
      await page.locator('.game-tools').getByRole('button', { name: '世界设定' }).evaluate(button => button.click());
      await page.getByRole('button', { name: '返回当前行旅' }).click();
      await page.locator('.story-reading').waitFor();
      await page.waitForFunction(expected => Math.abs(document.querySelector('.story-reading').scrollTop - expected) <= 2, beforeWorld);
      assert.ok(Math.abs((await page.locator('.story-reading').evaluate(element => element.scrollTop)) - beforeWorld) <= 2,
        'worldbook reading should restore the story container scroll position');
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
      await require('./acceptance-feedback.cjs').checkFeedback(page);
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
    await require('./design-acceptance.cjs').runDesignAcceptance(browser, `http://127.0.0.1:${webPort}`, screenshotDir);
  } finally { await browser.close(); }
  console.log(`Runtime renderer: ${runtimeBackends.join('; ')}`);
  console.log(`Fallbacks: ${fallbackChecks.join('; ')}`);
  console.log(`Audio consent: ${audioChecks.join('; ')}`);
  console.log('Local UI regression, reviewed worldbook search, save conflict and mirror recovery, and API smoke passed at mobile and desktop viewports');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const child of children) child.kill(); });
