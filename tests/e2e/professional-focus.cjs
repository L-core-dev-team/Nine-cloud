const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
const output = process.env.JX_E2E_OUTPUT_DIR || join(root, 'test-results/professional-focus');
let server, browser;
const results = [];

async function focused(locator) {
  await locator.page().waitForFunction(element => element === document.activeElement, await locator.elementHandle(), { timeout: 5000 });
  assert.ok(await locator.isVisible(), 'Focus target must be visible');
}

async function modalFocus(page, direction) {
  const browserBoundary = await page.evaluate(() => document.activeElement === document.body && !document.hasFocus());
  if (browserBoundary) {
    // Edge's native dialog allows browser-chrome focus at the tab boundary.
    // This differs from D8's BODY with document.hasFocus() === true.
    await page.keyboard.press(direction);
  }
  assert.ok(await page.locator('.glass-dialog').evaluate(dialog => {
    const element = document.activeElement;
    return document.hasFocus() && dialog.open && dialog.matches(':modal') && dialog.contains(element)
      && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }), 'Tab focus stays on rendered content inside the existing native modal');
}

(async () => {
  mkdirSync(output, { recursive: true });
  const port = await new Promise(resolve => {
    const socket = net.createServer().listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  server = spawn(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/web'), stdio: 'pipe', windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) for (const theme of ['night', 'day']) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    let releaseInventory, inventoryRequested;
    const responseGate = new Promise(resolve => { releaseInventory = resolve; });
    const requestGate = new Promise(resolve => { inventoryRequested = resolve; });
    try {
      await page.addInitScript(theme => localStorage.setItem('jx10_appearance', theme), theme);
      await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
      await page.route(/^https:\/\/openrouter\.ai\/api\/v1\/models/, async route => {
        inventoryRequested();
        await responseGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'deepseek/d8-fixture', name: 'D8 delayed model', description: 'Focus regression fixture', context_length: 32768, pricing: { prompt: '0.000001', completion: '0.000002' } }] }) });
      });
      await page.goto(origin + '/settings/ai');
      await page.getByRole('button', { name: '进入专业模式', exact: true }).click();
      const opener = page.locator('.provider-open');
      const dialog = page.locator('.glass-dialog');
      const title = dialog.locator('#ai-modal-title');
      const search = dialog.locator('.catalog-search input');
      await opener.click();
      await requestGate;
      const initialFocus = await dialog.evaluate(element => element.contains(document.activeElement) && document.activeElement.className);
      assert.ok(initialFocus, 'Opening the catalog starts inside its native dialog');
      const trigger = dialog.locator('.provider-name-list button').first();
      const triggerName = await trigger.innerText();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const entry = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id }));
      assert.equal(entry.id, 'ai-modal-title', `Detail must focus its semantic heading, got ${JSON.stringify(entry)}`);
      await focused(title);
      assert.ok(await title.evaluate(element => element.matches(':focus-visible') && parseFloat(getComputedStyle(element).outlineWidth) > 0), 'Keyboard entry retains the native visible heading outline');
      await page.keyboard.press('Tab');
      await focused(dialog.locator('.provider-links a').first());
      await page.keyboard.press('Shift+Tab');
      await focused(dialog.locator('.back-link'));
      // A late inventory response must preserve the focused control and current view.
      const back = dialog.locator('.back-link');
      releaseInventory();
      await dialog.locator('.model-table tbody tr').waitFor();
      await focused(back);
      await title.focus();
      await page.keyboard.press('Shift+Tab');
      await focused(back);
      assert.ok(await back.evaluate(element => getComputedStyle(element).outlineStyle !== 'none' && parseFloat(getComputedStyle(element).outlineWidth) > 0), 'Keyboard focus retains its visible outline');
      await page.keyboard.press('Enter');
      const restored = dialog.locator('.provider-name-list button').filter({ hasText: triggerName.replace(/\s*›$/, '') });
      await focused(restored);
      // Restore a different provider too; a first-button fallback is insufficient.
      const last = dialog.locator('.provider-name-list button').last();
      const lastName = await last.innerText();
      await last.focus();
      await page.keyboard.press('Enter');
      await focused(title);
      await back.click();
      await focused(dialog.locator('.provider-name-list button').filter({ hasText: lastName.replace(/\s*›$/, '') }));
      // Native forward/backward wrapping must never expose the inert page or hidden view.
      const count = await dialog.locator('button, input, a[href]').count();
      for (let i = 0; i < count + 2; i++) { await page.keyboard.press('Tab'); await modalFocus(page, 'Tab'); }
      for (let i = 0; i < count + 2; i++) { await page.keyboard.press('Shift+Tab'); await modalFocus(page, 'Shift+Tab'); }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await focused(opener);
      // Simulate an unavailable return target; never focus a hidden button.
      await opener.click();
      const disappearing = dialog.locator('.provider-name-list button').first();
      const disappearingId = await disappearing.getAttribute('data-provider-id');
      await disappearing.click();
      await focused(title);
      const unavailable = await page.addStyleTag({ content: `.provider-name-list [data-provider-id="${disappearingId}"] { display: none; }` });
      await back.click();
      await focused(search);
      assert.equal(await dialog.locator(`[data-provider-id="${disappearingId}"]`).isVisible(), false);
      await unavailable.evaluate(element => element.remove());
      await search.fill('DeepSeek');
      const filtered = dialog.locator('.provider-name-list button').first();
      await filtered.tap();
      await focused(title);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await focused(opener);
      // Reopening cannot carry a stale return target from the previous closed dialog.
      await opener.tap();
      await focused(dialog.locator('.' + initialFocus.trim().split(/\s+/).join('.')));
      await dialog.locator('.dialog-close').click();
      await dialog.waitFor({ state: 'hidden' });
      await focused(opener);
      // Navigating away must not retain a modal or focus its detached view.
      await opener.click();
      await dialog.locator('.provider-name-list button').first().click();
      await focused(title);
      await page.goto(origin + '/');
      assert.equal(await page.locator('.glass-dialog:modal').count(), 0);
      results.push({ viewport, theme, status: 'PASS', entry, keyboard: true, exactReturn: true, safeFallback: true, delayedInventory: true, nativeModal: true, touch: true, hiddenFocus: false, closeAndReopen: true, navigationUnmount: true, realDevice: false });
    } catch (error) {
      results.push({ viewport, theme, status: 'FAIL', error: error.message, active: await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id })).catch(() => null) });
    } finally {
      releaseInventory();
      await context.close();
    }
  }
  const build = JSON.parse(readFileSync(join(root, 'apps/web/dist/build-manifest.json'), 'utf8'));
  writeFileSync(join(output, 'professional-focus.json'), JSON.stringify({ sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), build, results }, null, 2));
  assert.deepEqual(results.filter(result => result.status !== 'PASS'), [], 'All original ten viewport/theme groups and extended D8 keyboard checks must pass');
  console.log(`D8 professional focus: ${results.length}/10 PASS; semantic entry, exact provider return, delayed render, Tab/Shift+Tab, Escape, touch, hidden targets, close/reopen and navigation unmount.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); });
