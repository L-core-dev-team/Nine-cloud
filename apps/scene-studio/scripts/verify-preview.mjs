import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startStudioServer } from './local-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
const studioServer = await startStudioServer(root);
const baseUrl = studioServer.url;
const hash = data => createHash('sha256').update(data).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 700 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?still=1`);
  await page.waitForFunction(() => Boolean(window.__gateStudio));
  await page.evaluate(() => window.__gateStudio.ready());
  await page.evaluate(() => window.__gateStudio.renderAt(0));
  const canvas = page.locator('.stage canvas');
  const before = hash(await canvas.screenshot());
  const rect = await canvas.boundingBox();
  assert(rect, 'Canvas is missing');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 100, rect.y + rect.height / 2 + 35, { steps: 5 });
  await page.mouse.up();
  await page.evaluate(() => window.__gateStudio.renderAt(0));
  assert(hash(await canvas.screenshot()) !== before, 'Dragging did not change the camera');
  await page.getByRole('button', { name: '重置视角' }).click();
  await page.evaluate(() => window.__gateStudio.renderAt(0));
  assert(hash(await canvas.screenshot()) === before, 'Camera reset did not restore the frame');

  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => window.__gateStudio.renderAt(0));
  assert(hash(await canvas.screenshot()) !== before, 'Keyboard camera control did not change the view');
  await canvas.focus();
  await page.keyboard.press('Home');
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => window.__gateStudio.renderAt(0));
  assert(hash(await canvas.screenshot()) === before, 'Home did not reset the camera');

  const canvasSize = await canvas.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  await page.evaluate(size => {
    window.__gateStudio.resize(0, 0);
    window.__gateStudio.renderAt(Number.NaN);
    window.__gateStudio.resize(size.width, size.height);
    window.__gateStudio.renderAt(0);
  }, canvasSize);
  assert(hash(await canvas.screenshot()) === before, 'Invalid time or zero-sized resize corrupted the frame');

  let resolveLandscapeRequest;
  const landscapeRequested = new Promise(resolveRequest => { resolveLandscapeRequest = resolveRequest; });
  page.setDefaultTimeout(8000);
  const raceErrors = [];
  page.on('pageerror', error => raceErrors.push(error.message));
  await page.addInitScript(() => {
    window.__sceneStudioUnhandled = [];
    window.addEventListener('unhandledrejection', event => window.__sceneStudioUnhandled.push(String(event.reason)));
  });
  await page.route('**/*gate-environment-landscape*', async route => {
    if (new URL(route.request().url()).searchParams.has('import')) return route.continue();
    resolveLandscapeRequest();
    await sleep(400);
    await route.abort();
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => Boolean(window.__gateStudio)).catch(async error => {
    const fallbackText = await page.locator('.fallback span').textContent().catch(() => 'no fallback text');
    const bodyText = await page.locator('body').innerText().catch(() => 'empty body');
    throw new Error(`Aspect-race scene did not start (${fallbackText}; body=${bodyText}; errors=${raceErrors.join(' | ')}): ${error.message}`);
  });
  await Promise.race([landscapeRequested, sleep(5000).then(() => { throw new Error('Landscape texture request did not start'); })]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__gateStudio.ready());
  await sleep(500);
  const staleRequestFallback = await page.locator('.fallback').isVisible();
  const unhandled = await page.evaluate(() => window.__sceneStudioUnhandled);
  assert(!staleRequestFallback, 'A stale landscape request replaced the valid portrait scene with the fallback');
  assert(raceErrors.length === 0 && unhandled.length === 0, `A stale texture request produced an uncaught error: ${[...raceErrors, ...unhandled].join('; ')}`);

  await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (extension) extension.loseContext();
    else document.querySelector('canvas')?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await page.locator('.fallback img').waitFor({ state: 'visible', timeout: 3000 });
  await context.close();

  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(baseUrl);
  assert(await reducedPage.locator('.fallback img').isVisible(), 'Reduced motion poster is missing');
  await reduced.close();

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(baseUrl);
  assert(await blockedPage.locator('.fallback img').isVisible(), 'WebGL failure poster is missing');
  await blocked.close();

  const noCanvas2d = await browser.newContext();
  await noCanvas2d.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === '2d') return null;
      return original.call(this, type, ...args);
    };
  });
  const noCanvas2dPage = await noCanvas2d.newPage();
  await noCanvas2dPage.goto(baseUrl);
  assert(await noCanvas2dPage.locator('.fallback img').isVisible(), 'Canvas texture initialization failure did not show the static poster');
  await noCanvas2d.close();
  process.stdout.write('Drag and keyboard camera controls, reset, invalid-input handling, stale texture failure, reduced-motion poster, WebGL startup failure, Canvas initialization failure, and context-loss fallback passed.\n');
} finally {
  await browser?.close();
  await studioServer.stop();
}
