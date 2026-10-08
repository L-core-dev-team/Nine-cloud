#!/usr/bin/env node
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inflateSync } = require('node:zlib');

function decodePng(buffer) {
  assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a', 'screenshot must be PNG');
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const chunks = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(width && height && bitDepth === 8 && channels && interlace === 0, 'unsupported browser PNG format');
  const stride = width * channels;
  const packed = inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[input++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = packed[input++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const above = y > 0 ? pixels[row - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      pixels[row + x] = (value + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function paeth(left, above, upperLeft) {
  const p = left + above - upperLeft;
  const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
  return a <= b && a <= c ? left : b <= c ? above : upperLeft;
}

function contrastRatio(first, second) {
  const luminance = color => {
    const linear = color.slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function parseRgb(value) {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  return parts?.length >= 3 ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
}

function composite(foreground, background) {
  const alpha = foreground[3];
  return [0, 1, 2].map(index => Math.round(foreground[index] * alpha + background[index] * (1 - alpha)));
}

function opaquePixel(png, x, y) {
  const offset = (y * png.width + x) * png.channels;
  return [png.pixels[offset], png.pixels[offset + 1], png.pixels[offset + 2]];
}

function textAudit(original, backgrounds, runs) {
  const images = backgrounds.map(decodePng);
  const source = decodePng(original);
  for (const image of images) assert.deepEqual([image.width, image.height], [source.width, source.height]);
  const failures = [];
  let checkedRuns = 0;
  for (const run of runs) {
    const foreground = parseRgb(run.color);
    if (!foreground || run.rects.length === 0 || run.opacity < 0.05) continue;
    foreground[3] *= run.opacity;
    checkedRuns++;
    let minimum = Infinity, minimumBackground = null, glyphPixels = 0;
    for (const rect of run.rects) {
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(source.width, Math.ceil(rect.x + rect.width));
      const y1 = Math.min(source.height, Math.ceil(rect.y + rect.height));
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const before = opaquePixel(source, x, y), firstBackground = opaquePixel(images[0], x, y);
        if (Math.max(Math.abs(before[0] - firstBackground[0]), Math.abs(before[1] - firstBackground[1]), Math.abs(before[2] - firstBackground[2])) < 10) continue;
        glyphPixels++;
        for (const image of images) {
          const behind = opaquePixel(image, x, y);
          const ratio = contrastRatio(composite(foreground, behind), behind);
          if (ratio < minimum) { minimum = ratio; minimumBackground = behind; }
        }
      }
    }
    if (glyphPixels && minimum < (run.large ? 3 : 4.5)) {
      failures.push({ selector: run.selector, text: run.text, color: run.color, background: minimumBackground, ratio: Number(minimum.toFixed(2)), glyphPixels });
    }
  }
  return { checkedRuns, failures };
}

function borderAudit(background, controls) {
  const image = decodePng(background);
  const failures = [];
  let checkedEdges = 0;
  for (const control of controls) {
    if (control.disabled || control.opacity < 0.99 || control.clipPath !== 'none') continue;
    const borderColor = parseRgb(control.borderColor);
    const fillColor = parseRgb(control.backgroundColor);
    const hasBorder = Object.values(control.borders).some(border => border.width >= 1 && border.style !== 'none') && borderColor?.[3] > 0.05;
    const hasFill = fillColor?.[3] > 0.05;
    if (!hasBorder && !hasFill) continue;
    let minimum = Infinity, weakest = null;
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const width = control.borders[side].width;
      const hasSideBorder = width >= 1 && control.borders[side].style !== 'none' && borderColor?.[3] > 0.05;
      if (!hasSideBorder && !hasFill) continue;
      const { x, y, width: rectWidth, height: rectHeight } = control.rect;
      const fillSamples = [], borderSamples = [];
      for (const position of [0.25, 0.5, 0.75]) {
        let insideX, insideY, borderX, borderY, outsideX, outsideY;
        if (side === 'top') {
          insideX = x + rectWidth * position; insideY = y + Math.min(3, Math.max(1, rectHeight / 4));
          borderX = insideX; borderY = y + Math.max(0.5, width / 2);
          outsideX = insideX; outsideY = y - 2;
        } else if (side === 'bottom') {
          insideX = x + rectWidth * position; insideY = y + rectHeight - Math.min(3, Math.max(1, rectHeight / 4));
          borderX = insideX; borderY = y + rectHeight - Math.max(0.5, width / 2);
          outsideX = insideX; outsideY = y + rectHeight + 2;
        } else if (side === 'left') {
          insideX = x + Math.min(3, Math.max(1, rectWidth / 4)); insideY = y + rectHeight * position;
          borderX = x + Math.max(0.5, width / 2); borderY = insideY;
          outsideX = x - 2; outsideY = insideY;
        } else {
          insideX = x + rectWidth - Math.min(3, Math.max(1, rectWidth / 4)); insideY = y + rectHeight * position;
          borderX = x + rectWidth - Math.max(0.5, width / 2); borderY = insideY;
          outsideX = x + rectWidth + 2; outsideY = insideY;
        }
        const point = (px, py) => ({ x: Math.floor(px), y: Math.floor(py) });
        const inside = point(insideX, insideY), edge = point(borderX, borderY), outsidePoint = point(outsideX, outsideY);
        if ([inside, edge, outsidePoint].some(({ x: px, y: py }) => px < 0 || py < 0 || px >= image.width || py >= image.height)) continue;
        const outside = opaquePixel(image, outsidePoint.x, outsidePoint.y);
        const surface = opaquePixel(image, inside.x, inside.y);
        if (hasFill) fillSamples.push({ ratio: contrastRatio(surface, outside), side, outside });
        if (hasSideBorder) borderSamples.push({ ratio: contrastRatio(composite(borderColor, surface), outside), side, outside });
      }
      const fillRatio = fillSamples.length ? Math.min(...fillSamples.map(sample => sample.ratio)) : 0;
      const borderRatio = borderSamples.length ? Math.min(...borderSamples.map(sample => sample.ratio)) : 0;
      const sideRatio = Math.max(fillRatio, borderRatio);
      if ((hasFill && fillSamples.length) || (hasSideBorder && borderSamples.length)) {
        checkedEdges++;
        if (sideRatio < minimum) {
          minimum = sideRatio;
          const samples = [...fillSamples, ...borderSamples];
          weakest = samples.find(sample => sample.ratio === sideRatio);
        }
      }
    }
    if (weakest && minimum < 3) failures.push({ selector: control.selector, type: control.type, label: control.label, borderColor: control.borderColor, backgroundColor: control.backgroundColor, ratio: Number(minimum.toFixed(2)), ...weakest });
  }
  return { checkedEdges, failures };
}

async function getTextRuns(page) {
  return page.evaluate(() => {
    const runs = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue || '';
      if (!text.trim()) continue;
      const element = node.parentElement;
      if (!element || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const range = document.createRange(); range.selectNode(node);
      const rects = [...range.getClientRects()].map(rect => ({
        x: rect.left + window.scrollX, y: rect.top + window.scrollY,
        width: rect.width, height: rect.height,
      })).filter(rect => rect.width > 0 && rect.height > 0);
      if (!rects.length) continue;
      let opacity = 1;
      for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        opacity *= Number(getComputedStyle(ancestor).opacity || 1);
      }
      const selector = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 2).map(name => `.${name}`).join('')}`;
      runs.push({ text: text.trim().slice(0, 48), selector, color: style.color, opacity, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) || 400, rects });
    }
    return runs.map(run => ({ ...run, large: run.fontSize >= 24 || (run.fontSize >= 18.67 && run.fontWeight >= 700) }));
  });
}

async function getInteractiveControls(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a[href], summary, [role="button"]')]
    .filter(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const stateful = element.matches('[aria-pressed], [aria-expanded], [aria-selected], [role="tab"], [role="checkbox"], [role="radio"]');
      const formControl = element.matches('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea');
      return (stateful || formControl) && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      const label = element.getAttribute('aria-label') || element.innerText || element.getAttribute('placeholder') || element.tagName.toLowerCase();
      const selector = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 2).map(name => `.${name}`).join('')}`;
      const borders = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, {
        width: parseFloat(style[`border${side[0].toUpperCase()}${side.slice(1)}Width`]) || 0,
        style: style[`border${side[0].toUpperCase()}${side.slice(1)}Style`],
      }]));
      let opacity = 1;
      for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) opacity *= Number(getComputedStyle(ancestor).opacity || 1);
      return {
        selector, label: String(label).trim().slice(0, 48), disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true', opacity,
        type: element.type || '', borderColor: style.borderTopColor, backgroundColor: style.backgroundColor, clipPath: style.clipPath,
        rect: { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height }, borders,
      };
    }));
}

async function maskText(page) {
  return page.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' });
}

// A full-page screenshot is only comparable while the document height holds still.
// Lazy images, deferred fonts and collapsing panels can each change it between two
// captures, which is invisible in a single shot but breaks `textAudit`'s
// equal-dimensions guard with an opaque `[width, heightA]` vs `[width, heightB]`
// diff. Wait until the height stops changing between consecutive frames; Playwright
// re-runs the predicate every animation frame by default, so comparing against the
// previous sample settles the layout before any pixels are read.
async function settleHeight(page, timeout = 10000) {
  await page.waitForFunction(() => {
    const height = document.documentElement.scrollHeight;
    const previous = window.__jxAcceptanceHeight;
    window.__jxAcceptanceHeight = height;
    return previous === height && height > 0;
  }, null, { timeout });
}

async function prepareGame(page) {
  await page.goto(new URL('/new', page.url()).toString());
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: /^保存角色并进入/ }).click();
  await page.locator('.game-topline h1').waitFor();
}

async function runDesignAcceptance(browser, origin, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const manifest = [];
  const contrastResults = [];
  const baselinePages = new Set(['home', 'lobby', 'game', 'world', 'ai-mode']);
  const targets = [
    { key: 'home', path: '/' },
    { key: 'lobby', path: '/lobby' },
    { key: 'game', path: '/game', prepare: prepareGame },
    { key: 'world', path: '/world' },
    { key: 'graphics', path: '/settings/graphics' },
    { key: 'ai-mode', path: '/settings/ai' },
    { key: 'ai-professional', path: '/settings/ai', professional: true },
  ];
  for (const [width, height] of [[390, 844], [1366, 768]]) {
    for (const theme of ['night', 'day']) for (const target of targets) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript(themeName => localStorage.setItem('jx10_appearance', themeName), theme);
      await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline acceptance fixture' }) }));
      await page.goto(new URL(target.path, origin).toString());
      if (target.prepare) await target.prepare(page);
      else if (target.key === 'ai-mode') await page.getByRole('button', { name: '开始新手设置', exact: true }).waitFor();
      else if (target.professional) await page.getByRole('button', { name: '进入专业模式', exact: true }).click();
      else if (target.key === 'world') {
        // The world reader loads its Canon through a dynamic import, so waiting for
        // the first entry only proves the list has started rendering. Screenshotting
        // then races the remaining rows: the static pass measured 11298px while the
        // masked background pass measured 10960px for the same page, which is what
        // tripped `textAudit`'s equal-dimensions guard. Wait until the rendered entry
        // count catches up with the count the page itself reports in `.worldbook-scope`
        // ("当前 N 条"), so the layout is settled before any screenshot is taken.
        await page.locator('.worldbook-entry').first().waitFor({ timeout: 10000 });
        await page.waitForFunction(() => {
          const scope = document.querySelector('.worldbook-scope');
          const reported = Number(scope?.textContent?.match(/当前\s*(\d+)\s*条/)?.[1]);
          return Number.isInteger(reported) && document.querySelectorAll('.worldbook-entry').length >= reported;
        }, null, { timeout: 10000 });
      }
      await page.evaluate(() => { document.documentElement.dataset.jxAtmosphere = 'off'; return document.fonts.ready; });
      await settleHeight(page);
      const staticRuns = await getTextRuns(page);
      const controls = await getInteractiveControls(page);
      const name = `${target.key}-${theme}-${width}.png`;
      const screenshotPath = join(outputDir, name);
      const staticOriginal = await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
      const textMask = await maskText(page);
      // The mask style tag is injected after the source shot, so give the layout a
      // chance to settle before taking its background twin.
      await settleHeight(page);
      const staticBackground = await page.screenshot({ fullPage: true, animations: 'disabled' });
      await textMask.evaluate(style => style.remove());
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { document.documentElement.dataset.jxAtmosphere = 'on'; return document.fonts.ready; });
      await page.waitForTimeout(900);
      await settleHeight(page);
      const dynamicRuns = await getTextRuns(page);
      const dynamicOriginal = await page.screenshot({ fullPage: true, animations: 'disabled' });
      await maskText(page);
      await settleHeight(page);
      const dynamicBackgrounds = [];
      for (let frame = 0; frame < 3; frame++) {
        await page.waitForTimeout(320);
        // The atmosphere keeps animating between frames, but its canvas must not
        // change the page height partway through the run — otherwise the three
        // background frames would disagree with the source frame.
        await settleHeight(page);
        dynamicBackgrounds.push(await page.screenshot({ fullPage: true, animations: 'disabled' }));
      }
      const staticAudit = textAudit(staticOriginal, [staticBackground], staticRuns);
      const dynamicAudit = textAudit(dynamicOriginal, dynamicBackgrounds, dynamicRuns);
      const controlAudit = borderAudit(staticBackground, controls);
      contrastResults.push({ page: target.key, theme, width, text: { static: staticAudit, dynamic: dynamicAudit }, controls: controlAudit, dynamicFrames: dynamicBackgrounds.length });
      if (baselinePages.has(target.key)) {
        manifest.push({ page: target.key, route: target.path, theme, viewport: { width, height }, file: name, sha256: createHash('sha256').update(staticOriginal).digest('hex') });
      }
      await context.close();
    }
  }
  writeFileSync(join(outputDir, 'ui-baseline-manifest.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    criteria: 'Five baseline pages: home, lobby, game, world, and AI mode. Two themes, 390x844 and 1366x768 viewports, full-page static PNGs with atmosphere disabled. Contrast audit additionally covers graphics settings and the frozen professional AI settings view. Text is sampled against static backgrounds and three atmosphere-on frames at WCAG AA 4.5:1 normal / 3:1 large, including effective ancestor opacity. The custom control-boundary sampler targets 3:1 rendered fill or border against adjacent pixels; native checkbox, radio, and range controls are excluded from rectangular sampling, clipped shapes remain outside its geometry, and worldbook boundary styling remains frozen per UI-11.',
    screenshots: manifest,
    contrast: contrastResults,
  }, null, 2)}\n`);
  const failures = contrastResults.flatMap(result => [
    ...result.text.static.failures.map(failure => ({ page: result.page, theme: result.theme, width: result.width, kind: 'static-text', ...failure })),
    ...result.text.dynamic.failures.map(failure => ({ page: result.page, theme: result.theme, width: result.width, kind: 'dynamic-text', ...failure })),
    ...result.controls.failures.map(failure => ({ page: result.page, theme: result.theme, width: result.width, kind: 'control-boundary', ...failure })),
  ]);
  const actionableFailures = failures.filter(failure => failure.page !== 'ai-professional' && !(failure.page === 'world' && failure.kind === 'control-boundary'));
  if (actionableFailures.length) {
    throw new Error(`Contrast audit found ${actionableFailures.length} failing samples outside the frozen professional AI and worldbook-boundary scopes (${failures.length - actionableFailures.length} protected-scope exceptions): ${JSON.stringify(actionableFailures.slice(0, 25))}`);
  }
  const checkedRuns = contrastResults.filter(item => item.page !== 'ai-professional').reduce((sum, item) => sum + item.text.static.checkedRuns + item.text.dynamic.checkedRuns, 0);
  const checkedEdges = contrastResults.filter(item => item.page !== 'ai-professional' && item.page !== 'world').reduce((sum, item) => sum + item.controls.checkedEdges, 0);
  const frozenProExceptions = failures.filter(failure => failure.page === 'ai-professional').length;
  const protectedWorldbookExceptions = failures.filter(failure => failure.page === 'world').length;
  console.log(`Design acceptance: ${manifest.length} five-page baselines; ${checkedRuns} non-professional text runs and ${checkedEdges} in-scope control-boundary samples passed across night/day and mobile/desktop. Protected-scope contrast exceptions: professional AI ${frozenProExceptions}; worldbook controls ${protectedWorldbookExceptions}.`);
}

module.exports = { runDesignAcceptance };
