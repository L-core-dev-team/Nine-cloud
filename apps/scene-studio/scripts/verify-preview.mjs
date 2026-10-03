import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const server = spawn(process.execPath, [resolve(root, 'apps/scene-studio/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { cwd: resolve(root, 'apps/scene-studio'), stdio: 'ignore' });
const hash = data => createHash('sha256').update(data).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:5185/')).ok) break; } catch { /* starting */ }
    if (i === 79) throw new Error('Studio did not start');
    await sleep(250);
  }
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5185/?still=1');
  await page.waitForFunction(() => Boolean(window.__gateStudio));
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
  await reducedPage.goto('http://127.0.0.1:5185/');
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
  await blockedPage.goto('http://127.0.0.1:5185/');
  assert(await blockedPage.locator('.fallback img').isVisible(), 'WebGL failure poster is missing');
  await blocked.close();
  process.stdout.write('Camera drag/reset, reduced-motion poster, WebGL-failure poster, and context-loss poster passed.\n');
} finally {
  await browser?.close();
  server.kill();
}
