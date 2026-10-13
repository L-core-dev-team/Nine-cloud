#!/usr/bin/env node
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdirSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { decodePng, getTextRuns, maskText, textAudit } = require('./design-acceptance.cjs');

const root = resolve(__dirname, '../..');
const output = join(root, 'test-results/ui-final');
let server;
const crystal = process.env.UI_GLASS_MATERIAL === 'crystal';

async function startDevServer() {
  if (process.env.UI_BASE_URL) return process.env.UI_BASE_URL;
  const port = await new Promise(resolvePort => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolvePort(port));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe',
  });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Liquid Glass development server did not start');
}

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function pixelDifferenceWithinRect(firstBytes, secondBytes, rect, threshold = 2) {
  const first = decodePng(firstBytes), second = decodePng(secondBytes);
  assert.deepEqual([first.width, first.height], [second.width, second.height], 'pixel comparison screenshots must share dimensions');
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(first.width, Math.ceil(rect.x + rect.width)), y1 = Math.min(first.height, Math.ceil(rect.y + rect.height));
  let changedPixels = 0, totalDelta = 0, maxDelta = 0;
  const comparedPixels = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * first.width + x) * first.channels;
    const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(first.pixels[offset + channel] - second.pixels[offset + channel])));
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > threshold) changedPixels++;
  }
  return { comparedPixels, changedPixels, changedRatio: comparedPixels ? changedPixels / comparedPixels : 0, meanMaxChannelDelta: comparedPixels ? totalDelta / comparedPixels : 0, maxChannelDelta: maxDelta };
}

async function activateByTouchOrKey(page, locator, viewportWidth, key = 'Enter') {
  if (viewportWidth < 500) {
    const rect = await locator.boundingBox();
    assert.ok(rect, 'touch target must be visible');
    await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  } else {
    await locator.focus();
    await page.keyboard.press(key);
  }
}

async function auditVisibleTextContrast(page, viewport, theme) {
  const view = page.viewportSize();
  const scrollY = await page.evaluate(() => window.scrollY);
  const runs = (await getTextRuns(page)).map(run => ({ ...run, rects: run.rects.map(rect => {
    const y = rect.y - scrollY;
    const left = Math.max(0, rect.x), right = Math.min(view.width, rect.x + rect.width);
    const top = Math.max(0, y), bottom = Math.min(view.height, y + rect.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }).filter(rect => rect.width > 0 && rect.height > 0) })).filter(run => run.rects.length);
  const source = await page.screenshot({ animations: 'disabled' });
  const mask = await maskText(page);
  const background = await page.screenshot({ animations: 'disabled' });
  await mask.evaluate(element => element.remove());
  const result = textAudit(source, [background], runs, `liquid-glass/${viewport}/${theme} `);
  assert.deepEqual(result.failures, [], `${viewport}px ${theme} prototype text must meet WCAG AA contrast: ${JSON.stringify(result.failures)}`);
  return result.checkedRuns;
}

async function emulatePreferences(page, reducedTransparency = 'no-preference') {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'no-preference' },
    { name: 'prefers-reduced-transparency', value: reducedTransparency },
  ] });
}

(async () => {
  mkdirSync(output, { recursive: true });
  const base = await startDevServer();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const errors = [];
  const records = [];
  const contrastRecords = [];
  try {
    const viewports = [
      { width: 390, height: 844, name: '390' },
      { width: 1440, height: 900, name: '1440' },
    ];
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 500 });
      const page = await context.newPage();
      await emulatePreferences(page);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/__liquid-glass${crystal ? '?material=crystal' : ''}`, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
      });
      await page.getByRole('heading', { name: '光过其上，境仍在下' }).waitFor();
      contrastRecords.push({ viewport: viewport.name, theme: 'night', checkedRuns: await auditVisibleTextContrast(page, viewport.name, 'night') });

      const lensStyle = await page.locator('.liquid-lab-primary').evaluate(element => ({
        filter: getComputedStyle(element).backdropFilter,
        supportsSyntax: CSS.supports('backdrop-filter', 'url(#jx-liquid-glass-refract)'),
        svgFilterCount: document.querySelectorAll('#jx-liquid-glass-refract feDisplacementMap').length,
        imageSizes: [...document.images].map(image => ({ alt: image.alt, width: image.naturalWidth })),
      }));
      assert.equal(lensStyle.svgFilterCount, 1, 'the prototype includes a real SVG displacement filter');
      assert.ok(lensStyle.imageSizes.every(image => image.width > 0), `visual media loads: ${JSON.stringify(lensStyle.imageSizes)}`);
      const mainRect = await page.locator('.liquid-lab-primary').boundingBox();
      assert.ok(mainRect && mainRect.height >= 60, 'primary clear-glass action remains a touch target');
      const lensShot = await page.screenshot({ path: join(output, `${viewport.name}-night-liquid-glass.png`) });
      const primary = page.locator('.liquid-lab-primary');
      const restingRadius = await primary.evaluate(element => getComputedStyle(element).borderRadius);
      await primary.hover();
      const hoverRadius = await primary.evaluate(element => getComputedStyle(element).borderRadius);
      const primaryBounds = await primary.boundingBox();
      await page.mouse.move(primaryBounds.x + primaryBounds.width / 2, primaryBounds.y + primaryBounds.height / 2);
      await page.mouse.down();
      const pressedTransform = await primary.evaluate(element => getComputedStyle(element).transform);
      await page.mouse.up();
      assert.notEqual(hoverRadius, restingRadius, 'hover morphs the clear action into a softly rounded shape');
      assert.notEqual(pressedTransform, 'none', 'press responds with a restrained scale');
      if (viewport.width < 500) {
        await activateByTouchOrKey(page, primary, viewport.width);
        assert.match(await primary.locator('small').innerText(), /已触发：按钮按压反馈完成/, 'clear-glass action responds to touch without hover');
      }

      const menuTrigger = page.locator('.liquid-lab-menu-trigger');
      await activateByTouchOrKey(page, menuTrigger, viewport.width, 'Enter');
      assert.equal(await menuTrigger.getAttribute('aria-expanded'), 'true', 'menu opens by keyboard or touch');
      const popover = page.locator('#liquid-lab-menu');
      await page.getByRole('button', { name: '查看世界内容', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#liquid-lab-menu')).opacity) > 0.98);
      assert.match(await popover.evaluate(element => getComputedStyle(element.querySelector('[data-liquid-glass]')).backdropFilter), /blur\(20px\)/);
      await page.screenshot({ path: join(output, `${viewport.name}-night-liquid-glass-menu.png`) });
      await activateByTouchOrKey(page, menuTrigger, viewport.width, 'Space');
      assert.equal(await menuTrigger.getAttribute('aria-expanded'), 'false', 'menu closes by keyboard or touch');
      const segmentOption = page.getByRole('button', { name: '长按', exact: true });
      await activateByTouchOrKey(page, segmentOption, viewport.width, 'Space');
      assert.equal(await segmentOption.getAttribute('aria-pressed'), 'true', 'segment control responds to keyboard or touch');
      await page.evaluate(() => window.scrollTo(0, 380));
      await page.waitForTimeout(120);
      assert.ok(Math.abs((await page.locator('.liquid-lab-nav').boundingBox()).y) < 2, 'navigation remains floating while page content scrolls');
      await page.screenshot({ path: join(output, `${viewport.name}-night-liquid-glass-scroll.png`) });

      await activateByTouchOrKey(page, page.getByRole('button', { name: '切换明亮环境', exact: true }), viewport.width, 'Enter');
      assert.equal(await page.locator('.liquid-lab').getAttribute('data-theme'), 'day');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
      contrastRecords.push({ viewport: viewport.name, theme: 'day', checkedRuns: await auditVisibleTextContrast(page, viewport.name, 'day') });
      await page.screenshot({ path: join(output, `${viewport.name}-day-liquid-glass.png`) });
      records.push({ viewport: viewport.name, supportsSvgFilterSyntax: lensStyle.supportsSyntax, computedBackdropFilter: lensStyle.filter, screenshotSha256: hash(lensShot) });
      await context.close();
    }

    const comparisonContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const lensPage = await comparisonContext.newPage();
    await emulatePreferences(lensPage);
    const lensErrors = [];
    lensPage.on('pageerror', error => lensErrors.push(error.message));
    await lensPage.goto(`${base}/__liquid-glass${crystal ? '?material=crystal' : ''}`, { waitUntil: 'networkidle' });
    await lensPage.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => undefined))); });
    const lensBounds = await lensPage.locator('.liquid-lab-primary').boundingBox();
    assert.ok(lensBounds, 'clear-glass comparison target is visible');
    const lensBytes = await lensPage.screenshot({ path: join(output, '390-night-liquid-glass-lens-check.png') });
    const blurPage = await comparisonContext.newPage();
    await emulatePreferences(blurPage);
    await blurPage.goto(`${base}/__liquid-glass?glass=blur${crystal ? '&material=crystal' : ''}`, { waitUntil: 'networkidle' });
    await blurPage.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => undefined))); });
    const blurBounds = await blurPage.locator('.liquid-lab-primary').boundingBox();
    assert.ok(blurBounds, 'blur-only comparison target is visible');
    const blurBytes = await blurPage.screenshot({ path: join(output, '390-night-liquid-glass-blur-baseline.png') });
    assert.deepEqual(blurBounds, lensBounds, 'the refraction and CSS blur comparison must use the same element bounds');
    const refractionPixelDifference = pixelDifferenceWithinRect(lensBytes, blurBytes, lensBounds);
    const svgBackdropChangesPixels = refractionPixelDifference.changedPixels > 20 && refractionPixelDifference.changedRatio > 0.001;
    const refractionChangesPixels = svgBackdropChangesPixels;
    assert.ok(records[0].supportsSvgFilterSyntax ? svgBackdropChangesPixels : true, `SVG backdrop filter must visibly alter pixels inside the clear-glass control: ${JSON.stringify(refractionPixelDifference)}`);
    await comparisonContext.close();

    const reduceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const reducePage = await reduceContext.newPage();
    const session = await reduceContext.newCDPSession(reducePage);
    await session.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-reduced-transparency', value: 'reduce' },
    ] });
    await reducePage.goto(`${base}/__liquid-glass${crystal ? '?material=crystal' : ''}`, { waitUntil: 'networkidle' });
    const reduced = await reducePage.locator('.liquid-lab-primary').evaluate(element => ({
      filter: getComputedStyle(element).backdropFilter,
      background: getComputedStyle(element).backgroundColor,
      reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      activeTransform: getComputedStyle(element, ':active').transform,
    }));
    assert.equal(reduced.reducedTransparency, true);
    assert.equal(reduced.filter, 'none', 'reduced-transparency preference removes the live filter');
    assert.ok(reduced.background !== 'rgba(0, 0, 0, 0)', 'reduced transparency retains a stable visible surface');
    await reducePage.screenshot({ path: join(output, '390-night-liquid-glass-reduced-transparency.png') });
    await reduceContext.close();

    const contrastContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const contrastPage = await contrastContext.newPage();
    const contrastSession = await contrastContext.newCDPSession(contrastPage);
    await contrastSession.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-contrast', value: 'more' },
      { name: 'forced-colors', value: 'none' },
    ] });
    await contrastPage.goto(`${base}/__liquid-glass${crystal ? '?material=crystal' : ''}`, { waitUntil: 'networkidle' });
    const highContrast = await contrastPage.locator('.liquid-lab-primary').evaluate(element => ({
      preference: matchMedia('(prefers-contrast: more)').matches,
      borderWidth: getComputedStyle(element).borderTopWidth,
    }));
    assert.equal(highContrast.preference, true);
    assert.equal(highContrast.borderWidth, '2px', 'higher-contrast preference strengthens glass boundaries');
    await contrastPage.screenshot({ path: join(output, '390-night-liquid-glass-high-contrast.png') });
    await contrastSession.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-contrast', value: 'no-preference' },
      { name: 'forced-colors', value: 'active' },
    ] });
    const forcedColors = await contrastPage.locator('.liquid-lab-primary').evaluate(element => ({
      preference: matchMedia('(forced-colors: active)').matches,
      background: getComputedStyle(element).backgroundColor,
      borderWidth: getComputedStyle(element).borderTopWidth,
      borderStyle: getComputedStyle(element).borderTopStyle,
      filter: getComputedStyle(element).backdropFilter,
      opticsDisplay: getComputedStyle(element.querySelector('.liquid-glass-optics')).display,
    }));
    assert.equal(forcedColors.preference, true);
    assert.notEqual(forcedColors.background, 'rgba(0, 0, 0, 0)');
    assert.equal(forcedColors.borderStyle, 'solid');
    assert.equal(forcedColors.filter, 'none');
    assert.equal(forcedColors.opticsDisplay, 'none');
    await contrastPage.screenshot({ path: join(output, '390-night-liquid-glass-forced-colors.png') });
    await contrastContext.close();

    assert.deepEqual(errors, [], `browser console errors: ${errors.join('; ')}`);
    assert.deepEqual(lensErrors, []);
    console.log(JSON.stringify({
      prototype: 'PASS',
      records,
      visibleTextContrast: contrastRecords,
      menu: 'opens and closes with keyboard on desktop and touch on mobile',
      scrolling: 'sticky glass navigation over moving content',
      interactions: 'hover shape morph, restrained press scale, keyboard activation and mobile touch activation',
      reducedTransparency: reduced,
      accessibilityPreferences: { highContrast, forcedColors },
      refractionChangesPixels,
      svgBackdropChangesPixels,
      refractionPixelDifference,
      refractionVerdict: svgBackdropChangesPixels ? 'SVG backdrop displacement changed pixels inside the clear-glass control; keep it bounded to small glass controls.' : 'SVG filter syntax was accepted but had no measurable rendered effect; use CSS fallback and do not claim refraction.',
      screenshots: output,
      errors,
    }, null, 2));
  } finally {
    await browser.close();
    if (server) server.kill();
  }
})().catch(error => { if (server) server.kill(); console.error(error); process.exitCode = 1; });
