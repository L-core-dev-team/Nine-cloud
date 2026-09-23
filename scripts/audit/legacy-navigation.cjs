#!/usr/bin/env node
// Reproduce the old/current entry flow without changing saves or source files.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const [legacy, current] = process.argv.slice(2);
if (!legacy || !current) {
  console.error('Usage: node scripts/audit/legacy-navigation.cjs <legacy.html> <current.html>');
  process.exit(2);
}

async function measure(browser, path, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(path)).href, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const read = async () => page.evaluate(() => {
    const info = id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { top: Math.round(r.top), bottom: Math.round(r.bottom),
        inViewport: r.bottom > 0 && r.top < innerHeight && style.display !== 'none' && style.visibility !== 'hidden' };
    };
    return { viewportHeight: innerHeight,
      landingHidden: document.getElementById('landing')?.classList.contains('hidden'),
      gameActive: document.getElementById('game')?.classList.contains('active'),
      hasSave: !!localStorage.getItem('jiuxiao_v1_library'),
      character: info('charName'), world: info('worldSections'),
      gameText: document.getElementById('messages')?.innerText.slice(0, 160) ?? '' };
  });
  const initial = await read();
  if (!initial.gameActive) await page.locator('#enterGameTop').click();
  const entered = await read();
  await page.locator('#dockNew').click();
  const newGame = await read();
  await page.locator('#enterGameTop').click();
  await page.locator('#dockWorld').click();
  const world = await read();
  await context.close();
  return { initial, entered, newGame, world, errors };
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const report = {};
  try {
    for (const [name, path] of Object.entries({ legacy, current })) {
      report[name] = {};
      for (const [label, width, height] of [['desktop', 1366, 768], ['mobile', 390, 844]]) {
        report[name][label] = await measure(browser, path, width, height);
      }
    }
  } finally {
    await browser.close();
  }
  for (const viewport of ['desktop', 'mobile']) {
    const oldFlow = report.legacy[viewport];
    const newFlow = report.current[viewport];
    assert.equal(oldFlow.initial.hasSave, false, `${viewport}: expected isolated empty storage`);
    assert.equal(newFlow.initial.hasSave, false, `${viewport}: expected isolated empty storage`);
    assert.equal(newFlow.initial.gameActive, true, `${viewport}: empty game reproduction changed`);
    assert.equal(oldFlow.newGame.character.inViewport, true, `${viewport}: old form baseline changed`);
    assert.equal(newFlow.newGame.character.inViewport, false, `${viewport}: hidden form reproduction changed`);
    assert.equal(newFlow.world.world.inViewport, false, `${viewport}: hidden world reproduction changed`);
    assert.deepEqual(newFlow.errors, [], `${viewport}: browser errors`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
})().catch(error => { console.error(error); process.exit(1); });
