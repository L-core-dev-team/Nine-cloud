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
        await page.waitForSelector('#landing:not(.hidden)');
        await page.waitForSelector('#worldSections details');
        const worldItems = page.locator('#worldSections details');
        const itemCount = await worldItems.count();
        assert(itemCount > 0, 'Worldbook should expose at least one evidence section');
        const titles = await worldItems.locator('summary').allTextContents();
        if (!canonical) canonical = titles;
        else assert.deepStrictEqual(titles, canonical);
        assert.strictEqual(await page.locator('#worldSections details[open]').count(), 0);
        const viewportOkay = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        assert(viewportOkay, `${edition} ${width}: horizontal overflow`);
        const snap = editionIndex === 0 && width === 390;
        if (snap) await page.screenshot({ path: path.join(shots, '01_世界设定折叠首页.png') });

        await worldItems.first().locator('summary').click();
        assert(await worldItems.first().locator('.v1-stack').isVisible());
        if (snap) await page.screenshot({ path: path.join(shots, '02_展开中州.png') });
        const firstBody = (await worldItems.first().locator('.v1-stack').textContent()) || '';
        assert(firstBody.trim().length > 0, 'Expanded worldbook evidence must contain text');
        if (snap) await page.screenshot({ path: path.join(shots, '03_展开资料正文.png') });

        await page.locator('#enterWorldHero').click();
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
