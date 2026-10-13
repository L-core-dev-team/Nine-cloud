#!/usr/bin/env node
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../..');
const dist = join(root, 'apps/web/dist');
const assets = join(dist, 'assets');
const evidence = join(root, 'docs/acceptance/2026-10-12/evidence/390-night-production-route.png');
const reducedEvidence = join(root, 'docs/acceptance/2026-10-12/evidence/390-night-reduced-transparency-route.png');
let server;

async function sampleScrollScheduling(page) {
  return page.evaluate(() => new Promise(resolveSample => {
    const gaps = [];
    const tasks = [];
    const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => entry.duration))) : null;
    observer?.observe({ type: 'longtask', buffered: false });
    let start;
    let previous;
    const extent = Math.max(0, Math.min(1000, document.documentElement.scrollHeight - innerHeight));
    function frame(time) {
      start ??= time;
      if (previous !== undefined) gaps.push(time - previous);
      previous = time;
      const elapsed = time - start;
      scrollTo(0, extent * (1 - Math.cos(Math.min(1, elapsed / 2000) * Math.PI * 2)) / 2);
      if (elapsed < 2000) return requestAnimationFrame(frame);
      observer?.disconnect();
      const sorted = [...gaps].sort((a, b) => a - b);
      const percentile = fraction => Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(2));
      scrollTo(0, 0);
      resolveSample({ samples: gaps.length, scrollExtentPx: extent, durationMs: Number(elapsed.toFixed(2)), medianGapMs: percentile(0.5), p95GapMs: percentile(0.95), gapsOver34Ms: gaps.filter(gap => gap > 34).length, longTasksSupported: !!observer, longTasks: tasks.length, maximumLongTaskMs: tasks.length ? Number(Math.max(...tasks).toFixed(2)) : 0 });
    }
    requestAnimationFrame(frame);
  }));
}

async function startPreview() {
  assert.ok(existsSync(join(dist, 'index.html')), 'Run pnpm build before the production route guard');
  const port = await new Promise(resolvePort => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const selectedPort = socket.address().port;
      socket.close(() => resolvePort(selectedPort));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: join(root, 'apps/web'), windowsHide: true, stdio: 'pipe',
  });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Production preview did not start');
}

(async () => {
  const files = readdirSync(assets).filter(file => /\.(?:js|css)$/i.test(file));
  assert.ok(files.length > 0, 'Production assets must exist');
  const prototypeMarkers = files.flatMap(file => {
    const source = readFileSync(join(assets, file), 'utf8');
    // The URL remains only as a redirect guard; the prototype module and CSS must be absent.
    return /LiquidGlassDemo|liquid-lab/.test(source) ? [file] : [];
  });
  assert.deepEqual(prototypeMarkers, [], `Production assets must not contain the visual prototype: ${prototypeMarkers.join(', ')}`);

  const base = await startPreview();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const media = await page.context().newCDPSession(page);
  await media.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'no-preference' },
    { name: 'prefers-reduced-transparency', value: 'no-preference' },
  ] });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/__liquid-glass`, { waitUntil: 'networkidle' });
    await page.locator('.landing-shell').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    assert.equal(await page.locator('.liquid-lab').count(), 0, 'Production URL must never render the prototype');
    assert.equal(new URL(page.url()).pathname, '/', 'Production prototype URL must return to the formal homepage');
    assert.ok(await page.locator('.landing-shell .portal-enter').isVisible(), 'Formal homepage entry must be visible');
    const visualAudit = await page.evaluate(() => {
      const entry = document.querySelector('.landing-shell .portal-enter');
      const saved = document.querySelector('.landing-shell .landing-read-save');
      const mark = document.querySelector('.landing-shell .hero-mark');
      const markStyle = mark ? getComputedStyle(mark) : null;
      const markRect = mark?.getBoundingClientRect();
      return {
        theme: document.documentElement.dataset.theme ?? null,
        reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
        entryBackdrop: entry ? getComputedStyle(entry).backdropFilter : null,
        saveBackdrop: saved ? getComputedStyle(saved).backdropFilter : null,
        title: mark ? { text: mark.textContent, color: markStyle.color, textFill: markStyle.webkitTextFillColor, fontFamily: markStyle.fontFamily, fontSize: markStyle.fontSize, opacity: markStyle.opacity, visibility: markStyle.visibility, display: markStyle.display, rect: { x: markRect.x, y: markRect.y, width: markRect.width, height: markRect.height } } : null,
      };
    });
    assert.equal(visualAudit.reducedTransparency, false, 'the default production capture must show the normal Liquid Glass material');
    assert.notEqual(visualAudit.entryBackdrop, 'none', 'the primary formal action must transmit its background');
    assert.notEqual(visualAudit.saveBackdrop, 'none', 'the save action must transmit its background');
    assert.ok(visualAudit.title && visualAudit.title.rect.height > 0 && visualAudit.title.opacity !== '0', 'the formal homepage brand title must render in the production screenshot');
    mkdirSync(join(root, 'docs/acceptance/2026-10-12/evidence'), { recursive: true });
    const image = await page.screenshot({ path: evidence, animations: 'disabled' });
    assert.deepEqual(errors, [], `Production route must have no browser errors: ${errors.join('; ')}`);

    await media.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-reduced-transparency', value: 'reduce' },
    ] });
    await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    assert.ok(await page.locator('.hero-mark').isVisible(), 'the brand title must remain visible after the transparency preference changes');
    const reducedAudit = await page.evaluate(() => ({
      reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      entryBackdrop: getComputedStyle(document.querySelector('.landing-shell .portal-enter')).backdropFilter,
      saveBackdrop: getComputedStyle(document.querySelector('.landing-shell .landing-read-save')).backdropFilter,
    }));
    assert.equal(reducedAudit.reducedTransparency, true);
    assert.equal(reducedAudit.entryBackdrop, 'none', 'reduced transparency must retain the accessible solid-surface fallback');
    assert.equal(reducedAudit.saveBackdrop, 'none', 'reduced transparency must retain the accessible solid-surface fallback');
    const reducedImage = await page.screenshot({ path: reducedEvidence, animations: 'disabled' });
    await media.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-reduced-transparency', value: 'no-preference' },
    ] });
    const scheduling = [];
    for (const width of [390, 1366]) for (const theme of ['night', 'day']) for (const path of ['/', '/world']) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      await page.evaluate(themeName => localStorage.setItem('jx10_appearance', themeName), theme);
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      if (path === '/world') await page.locator('.worldbook-entry').last().waitFor();
      await page.evaluate(() => document.fonts.ready);
      scheduling.push({ width, theme, path, ...await sampleScrollScheduling(page) });
    }
    assert.deepEqual(errors, [], 'Formal routes must retain error-free interaction during the scheduling probe');
    const performanceRecord = {
      recordedAt: new Date().toISOString(), browser: browser.version(),
      method: 'Warm local production preview; 2-second synthetic scroll per case. rAF scheduling intervals are a desktop proxy, not measured GPU frames or physical-device performance. No pass threshold is inferred from these observations.',
      scheduling,
    };
    const performancePath = join(root, 'test-results/ui-final/liquid-glass-performance.json');
    mkdirSync(join(root, 'test-results/ui-final'), { recursive: true });
    writeFileSync(performancePath, `${JSON.stringify(performanceRecord, null, 2)}\n`);
    console.log(JSON.stringify({
      result: 'PASS',
      url: '/__liquid-glass → /',
      rendered: 'formal homepage',
      prototypeAssets: prototypeMarkers.length,
      visualAudit,
      reducedAudit,
      screenshot: evidence,
      screenshotSha256: createHash('sha256').update(image).digest('hex').toUpperCase(),
      reducedTransparencyScreenshot: reducedEvidence,
      reducedTransparencyScreenshotSha256: createHash('sha256').update(reducedImage).digest('hex').toUpperCase(),
      performanceRecord,
      performancePath,
    }, null, 2));
  } finally {
    await browser.close();
    if (server && !server.killed) server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
