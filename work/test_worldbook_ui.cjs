const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'outputs', '九霄WEB-1.0', '世界书截图');
fs.mkdirSync(shots, { recursive: true });
const base = 'http://127.0.0.1:8772/';
const editions = ['九霄_WEB_1.0_空白版.html', '九霄_WEB_1.0_临江仙存档版.html'];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  try {
    let canonical = null;
    for (const [editionIndex, edition] of editions.entries()) {
      for (const [width, height] of [[390, 844], [430, 932]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + encodeURIComponent(edition), { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#game.active');
        const initialStory = await page.locator('#messages').textContent();
        assert(initialStory && initialStory.length > 5);
        await page.locator('#dockWorld').click();
        await page.waitForSelector('#landing.world-open');
        assert.strictEqual(await page.locator('.world-tree > details').count(), 7);
        const titles = await page.locator('.world-tree > details > summary').allTextContents();
        if (!canonical) canonical = titles;
        else assert.deepStrictEqual(titles, canonical);
        assert.strictEqual(await page.locator('.world-tree > details[open]').count(), 0);
        assert(await page.locator('.world-scroll').evaluate(el => getComputedStyle(el).overflowY === 'auto'));
        const viewportOkay = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        assert(viewportOkay, `${edition} ${width}: horizontal overflow`);
        const snap = editionIndex === 0 && width === 390;
        if (snap) await page.screenshot({ path: path.join(shots, '01_世界设定折叠首页.png') });

        await page.locator('.world-group').filter({ has: page.locator('summary', { hasText: '中州天枢域' }) }).locator('summary').first().click();
        assert.strictEqual(await page.locator('.world-group[open] .world-item').count(), 3);
        if (snap) await page.screenshot({ path: path.join(shots, '02_展开中州.png') });
        await page.locator('.world-item').filter({ has: page.locator('summary', { hasText: '大夏皇朝' }) }).locator('summary').first().click();
        assert(await page.locator('.world-item[open] .world-text').filter({ hasText: '钦天监' }).isVisible());
        if (snap) await page.screenshot({ path: path.join(shots, '03_展开大夏皇朝.png') });

        await page.locator('.world-group').filter({ has: page.locator('summary', { hasText: '洪荒妖林' }) }).locator('summary').first().click();
        await page.locator('.world-item').filter({ has: page.locator('summary', { hasText: '区域划分' }) }).locator('summary').first().click();
        assert(await page.locator('.world-text').filter({ hasText: '核心禁区' }).isVisible());
        const scroll = page.locator('.world-scroll');
        const dimensions = await scroll.evaluate(el => ({ total: el.scrollHeight, visible: el.clientHeight }));
        assert(dimensions.total > dimensions.visible, 'Worldbook long text should scroll within the panel');
        if (snap) await page.screenshot({ path: path.join(shots, '04_洪荒妖林长正文.png') });

        await page.locator('#worldClose').click();
        assert(await page.locator('#game.active').isVisible());
        assert(!(await page.locator('#landing').isVisible()));
        assert.strictEqual(await page.locator('#messages').textContent(), initialStory);
        if (snap) await page.screenshot({ path: path.join(shots, '05_关闭后主界面.png') });
        assert.deepStrictEqual(errors, [], `${edition} ${width} page errors`);
        await context.close();
        console.log(`PASS ${edition} ${width}x${height}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
