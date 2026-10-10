const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const { getTextRuns, maskText, textAudit } = require('./design-acceptance.cjs');
const root = path.resolve(__dirname, '../..');
const output = path.join(process.env.JX_E2E_OUTPUT_DIR || path.join(root, 'test-results/e2e'), 'world-description');
let server, browser;
const results = [];
async function samplePixels(page, png, runs) {
  // Supplement the unchanged production audit with a conservative minimum over
  // every pixel in each rendered text rectangle, not a best-frame selection.
  return page.evaluate(async ({ png, runs }) => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance = color => color.reduce((sum, value, i) => { const v = value / 255; return sum + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); }, 0);
    return runs.map(run => {
      const color = run.color.match(/[\d.]+/g).map(Number), opacity = run.opacity * (color[3] ?? 1);
      let minimum = Infinity, background = null, count = 0;
      for (const rect of run.rects) for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(canvas.height, Math.ceil(rect.y + rect.height)); y++) for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(canvas.width, Math.ceil(rect.x + rect.width)); x++) {
        const offset = (y * canvas.width + x) * 4;
        const behind = Array.from(pixels.slice(offset, offset + 3));
        const foreground = behind.map((v, i) => Math.round(color[i] * opacity + v * (1 - opacity)));
        const a = luminance(foreground), b = luminance(behind), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < minimum) { minimum = ratio; background = behind; } count++;
      }
      return { selector: run.selector, text: run.text, color: run.color, large: run.large, textShadow: run.textShadowColor, ratio: minimum, background, pixels: count };
    });
  }, { png: png.toString('base64'), runs });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const port = await new Promise(resolve => { const socket = net.createServer().listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
  server = spawn(process.execPath, [path.join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.join(root, 'apps/web'), stdio: 'pipe', windowsHide: true });
  const origin = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1366, height: 768 }]) for (const theme of ['night', 'day']) for (const mode of ['dynamic', 'static', 'reduced-motion']) {
    const context = await browser.newContext({ viewport, reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference' });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.addInitScript(theme => localStorage.setItem('jx10_appearance', theme), theme);
    await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.goto(origin + '/world'); await page.locator('.worldbook-entry').first().waitFor();
    await page.evaluate(async mode => { document.documentElement.dataset.jxAtmosphere = mode === 'static' ? 'off' : 'on'; await document.fonts.ready; }, mode);
    const label = `${viewport.width}-${theme}-${mode}`;
    const layers = await page.evaluate(() => {
      const describe = element => { const s = getComputedStyle(element); return { tag: element.tagName, class: element.className, color: s.color, background: s.backgroundColor, opacity: s.opacity, blend: s.mixBlendMode, filter: s.filter, textShadow: s.textShadow }; };
      const video = document.querySelector('.scene-atmosphere-video');
      return { description: describe(document.querySelector('.world-page > p')), ancestry: ['.world-page', 'main', '.jx-shell', 'body'].map(selector => ({ selector, ...describe(document.querySelector(selector)) })), layers: Array.from(document.querySelectorAll('.scene-atmosphere > *')).map(describe), video: { src: video.currentSrc, paused: video.paused, readyState: video.readyState, time: video.currentTime }, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    const batches = [];
    for (let batch = 0; batch < (mode === 'dynamic' ? 2 : 1); batch++) {
      await page.waitForTimeout(700);
      const all = await getTextRuns(page, '.world-page');
      const runs = all.filter(run => run.rects.every(r => r.y >= 0 && r.y + r.height <= viewport.height));
      const target = runs.filter(run => run.text.startsWith('正文收录已审核设定'));
      assert.equal(target.length, 1, label + ': description must be rendered and sampled');
      const source = await page.screenshot({ path: path.join(output, `${label}-${batch}-source.png`), animations: 'disabled' });
      const mask = await maskText(page), frames = [];
      for (let frame = 0; frame < (mode === 'dynamic' ? 4 : 1); frame++) {
        await page.waitForTimeout(450 + frame * 170);
        const png = await page.screenshot({ path: path.join(output, `${label}-${batch}-frame-${frame}.png`), animations: 'disabled' });
        const audit = textAudit(source, [png], runs, label);
        const samples = await samplePixels(page, png, target);
        const videoTime = await page.locator('video').evaluate(video => video.currentTime);
        frames.push({ frame, capturedAt: new Date().toISOString(), videoTime, audit, samples });
        fs.writeFileSync(path.join(output, 'last-frame.json'), JSON.stringify({ label, batch, layers, frames }, null, 2));
        assert.equal(audit.failures.length, 0, label + ': unchanged audit must pass surrounding text');
        for (const sample of samples) assert.ok(sample.pixels > 0 && sample.ratio >= 4.5, label + ': every valid description sample must meet AA; ' + JSON.stringify(sample));
      }
      await mask.evaluate(element => element.remove()); batches.push({ batch, runs, frames });
    }
    // Existing reading controls remain usable after sampling, without test-only
    // content-visibility styles or runtime rendering changes.
    const search = page.locator('.world-search input');
    await search.fill('不存在的检索词质量回归'); await page.locator('.worldbook-empty').waitFor();
    await search.fill(''); await page.locator('.worldbook-entry').first().waitFor();
    await page.getByRole('button', { name: /画卷图鉴/ }).click(); await page.locator('.atlas-intro').waitFor();
    await page.getByRole('button', { name: /设定正文/ }).click(); await page.locator('.worldbook-entry').first().waitFor();
    const row = { viewport, theme, mode, layers, batches, readingInteractions: 'PASS' };
    results.push(row); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ sourceHead: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim(), build: JSON.parse(fs.readFileSync(path.join(root, 'apps/web/dist/build-manifest.json'))), results }, null, 2));
    console.log(label + ' PASS'); await context.close();
  }
  const samples = results.flatMap(row => row.batches.flatMap(batch => batch.frames.flatMap(frame => frame.samples)));
  console.log(`World description contrast: ${results.length} viewport/theme/motion groups PASS; ${samples.length} frame samples; worst ${Math.min(...samples.map(sample => sample.ratio)).toFixed(4)}:1.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
