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

const mediaSessions = new WeakMap();
async function emulateVisualPreferences(page, reducedMotion) {
  let session = mediaSessions.get(page);
  if (!session) { session = await page.context().newCDPSession(page); mediaSessions.set(page, session); }
  await session.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: reducedMotion },
    { name: 'prefers-reduced-transparency', value: 'no-preference' },
  ] });
}

function opaquePixel(png, x, y) {
  const offset = (y * png.width + x) * png.channels;
  return [png.pixels[offset], png.pixels[offset + 1], png.pixels[offset + 2]];
}

function textAudit(original, backgrounds, runs, label = '') {
  const images = backgrounds.map(decodePng);
  const source = decodePng(original);
  for (const [index, image] of images.entries()) {
    assert.deepEqual(
      [image.width, image.height],
      [source.width, source.height],
      `${label}frame ${index} of ${images.length} disagrees with the source frame: ` +
        `source ${source.width}x${source.height}, frame ${image.width}x${image.height}. ` +
        'Every frame in a capture group must share the same document size; a mismatch ' +
        'means the page changed height between screenshots (async content, lazy media, ' +
        'or a collapsing panel) rather than a stale baseline.',
    );
  }
  const failures = [];
  const shadowRelief = [];
  let checkedRuns = 0;
  for (const run of runs) {
    const foreground = parseRgb(run.color);
    if (!foreground || run.rects.length === 0 || run.opacity < 0.05) continue;
    foreground[3] *= run.opacity;
    // A text-shadow is the author's legibility mechanism for labels that sit over
    // imagery: the darkened halo it paints immediately around each stroke raises the
    // effective contrast of the glyph edge. The atmosphere plays a video, so the
    // pixel directly behind a glyph varies frame to frame and can dip below AA purely
    // by animation phase. Measure both the bare composite (the strict case) and the
    // shadow-cushioned composite (what the reader actually perceives); only the strict
    // case with no shadow cushion counts as a failure.
    const shadow = parseRgb(run.textShadowColor || '');
    checkedRuns++;
    let minimum = Infinity, minimumBackground = null, glyphPixels = 0;
    let cushioned = Infinity, cushionedBackground = null;
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
          if (shadow && shadow[3] > 0.2) {
            const shadowed = composite(shadow, behind);
            const cushionedRatio = contrastRatio(composite(foreground, shadowed), shadowed);
            if (cushionedRatio < cushioned) { cushioned = cushionedRatio; cushionedBackground = shadowed; }
          }
        }
      }
    }
    const threshold = run.large ? 3 : 4.5;
    const bare = glyphPixels ? minimum : Infinity;
    // The analytic shadow estimate omits blur/offset geometry. Keep it as
    // diagnostic evidence, never use a hypothetical opaque halo to pass AA.
    if (bare >= threshold) {
      continue;
    }
    failures.push({ selector: run.selector, text: run.text, color: run.color, background: minimumBackground, ratio: Number(bare.toFixed(2)), glyphPixels, textShadow: run.textShadowColor ?? null });
  }
  return { checkedRuns, failures, shadowRelief };
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

async function getTextRuns(page, rootSelector = 'body') {
  return page.evaluate(rootSelector => {
    const runs = [];
    const walker = document.createTreeWalker(document.querySelector(rootSelector), NodeFilter.SHOW_TEXT);
    let runId = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue || '';
      if (!text.trim()) continue;
      const element = node.parentElement;
      if (!element || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) continue;
      // Range geometry can expose the retained layout of closed <details>.
      // Only its summary is rendered until the disclosure is opened.
      if ([...document.querySelectorAll('details:not([open])')].some(details => details.contains(element) && !details.querySelector(':scope > summary')?.contains(element))) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const range = document.createRange(); range.selectNode(node);
      let rects = [...range.getClientRects()].map(rect => ({
        x: rect.left + window.scrollX, y: rect.top + window.scrollY,
        width: rect.width, height: rect.height,
      })).filter(rect => rect.width > 0 && rect.height > 0);
      for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor);
        const clipX = /hidden|clip|auto|scroll/.test(ancestorStyle.overflowX);
        const clipY = /hidden|clip|auto|scroll/.test(ancestorStyle.overflowY);
        if (!clipX && !clipY) continue;
        const bounds = ancestor.getBoundingClientRect();
        rects = rects.map(rect => {
          const x = clipX ? Math.max(rect.x, bounds.left + scrollX) : rect.x;
          const y = clipY ? Math.max(rect.y, bounds.top + scrollY) : rect.y;
          const right = clipX ? Math.min(rect.x + rect.width, bounds.right + scrollX) : rect.x + rect.width;
          const bottom = clipY ? Math.min(rect.y + rect.height, bounds.bottom + scrollY) : rect.y + rect.height;
          return { x, y, width: right-x, height: bottom-y };
        }).filter(rect => rect.width > 0 && rect.height > 0);
      }
      if (!rects.length) continue;
      let opacity = 1;
      for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        opacity *= Number(getComputedStyle(ancestor).opacity || 1);
      }
      const selector = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList].slice(0, 2).map(name => `.${name}`).join('')}`;
      runs.push({ runId: runId++, fixedBar: !!element.closest('.ai-actionbar'), stickyHeader: !!element.closest('.jx-shell > header, .liquid-lab-nav'), text: text.trim().slice(0, 48), selector, color: style.color, opacity, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) || 400, textShadowColor: style.textShadow && style.textShadow !== 'none' ? style.textShadow : null, rects });
    }
    return runs.map(run => ({ ...run, large: run.fontSize >= 24 || (run.fontSize >= 18.67 && run.fontWeight >= 700) }));
  }, rootSelector);
}

async function getInteractiveControls(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a[href], summary, [role="button"]')]
    .filter(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      if ([...document.querySelectorAll('details:not([open])')].some(details => details.contains(element) && !details.querySelector(':scope > summary')?.contains(element))) return false;
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
  // Preserve the browser-rendered shadow in the background screenshot. This
  // measures its actual blur and coverage instead of compositing its nominal
  // color at full opacity across every glyph bounding box.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      element.style.setProperty('--jx-audit-shadow', getComputedStyle(element).textShadow);
    }
  });
  return page.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: var(--jx-audit-shadow, none) !important; }' });
}

// A full-page screenshot is only comparable while the document height holds still.
// The world reader exposes a subtle trap: its Canon entries are laid out with the
// fallback font for the first ~100ms, then reflow tighter once the web font metrics
// apply — the document measured 14437px before that and 12828px after. A settle that
// only requires a couple of matching animation frames passes *inside* that window and
// then the page shrinks before the next capture, which is exactly how the source and
// background frames ended up 1609px apart.
//
// So settle on wall-clock time, not frame count: require the height to be unchanged
// for `holdMs` of real time, re-awaiting `document.fonts.ready` on every sample so the
// font-metric reflow is observed rather than raced. Call this immediately before every
// screenshot — any work in between can reflow again.
const SETTLE_HOLD_MS = 600;
const SETTLE_POLL_MS = 50;
async function settleHeight(page, holdMs = SETTLE_HOLD_MS, timeout = 20000) {
  const started = Date.now();
  let last = -1;
  let lastChange = Date.now();
  for (;;) {
    const height = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.documentElement.scrollHeight;
    });
    if (height !== last) {
      last = height;
      lastChange = Date.now();
    }
    if (height > 0 && Date.now() - lastChange >= holdMs) return height;
    if (Date.now() - started > timeout) {
      throw new Error(`Document height did not settle for ${holdMs}ms within ${timeout}ms (last ${height}px)`);
    }
    await page.waitForTimeout(SETTLE_POLL_MS);
  }
}

async function prepareGame(page) {
  await page.goto(new URL('/new', page.url()).toString());
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: /^保存角色并进入/ }).click();
  await page.locator('.game-topline h1').waitFor();
}

async function auditProfessionalViewports(page, outputDir, label) {
  // A full-document PNG contains viewport-fixed chrome but DOM ranges use
  // document coordinates. Audit overlapping real viewports instead: every run
  // must be reached, and the operation bar is sampled in every tile as rendered.
  const initialRuns = await getTextRuns(page);
  const covered = new Set();
  const coveredControls = new Set();
  const staticResult = { checkedRuns: 0, failures: [], shadowRelief: [] };
  const dynamicResult = { checkedRuns: 0, failures: [], shadowRelief: [] };
  const controlsResult = { checkedEdges: 0, failures: [] };
  const viewport = page.viewportSize();
  const barHeight = await page.locator('.ai-actionbar').evaluate(e => e.getBoundingClientRect().height);
  const step = Math.max(100, viewport.height - barHeight - 40);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const offsets = [...new Set([...Array.from({length: Math.ceil(height / step)}, (_, i) => Math.min(i * step, height - viewport.height)), Math.max(0, height - viewport.height)])];
  const merge = (into, from, tile) => {
    into.checkedRuns !== undefined && (into.checkedRuns += from.checkedRuns);
    into.checkedEdges !== undefined && (into.checkedEdges += from.checkedEdges);
    into.failures.push(...from.failures.map(f => ({ ...f, tile })));
  };
  for (const [tile, offset] of offsets.entries()) {
    await page.evaluate(y => window.scrollTo(0, y), offset);
    await emulateVisualPreferences(page, 'reduce');
    await page.evaluate(() => { document.documentElement.dataset.jxAtmosphere = 'off'; });
    const clip = async () => {
      const geometry = await page.evaluate(() => ({
        scrollY,
        barTop: document.querySelector('.ai-actionbar').getBoundingClientRect().top,
        headerBottom: document.querySelector('.jx-shell > header')?.getBoundingClientRect().bottom ?? 0,
      }));
      const runs = (await getTextRuns(page)).map(run => ({ ...run, rects: run.rects.map(r => {
        const y = r.y - geometry.scrollY;
        const left = Math.max(0, r.x), top = Math.max(0, y, run.stickyHeader ? 0 : geometry.headerBottom);
        const right = Math.min(viewport.width, r.x + r.width);
        const bottom = Math.min(run.fixedBar ? viewport.height : geometry.barTop, y + r.height);
        return { x: left, y: top, width: right-left, height: bottom-top };
      }).filter(r => r.width > 0 && r.height > 0) })).filter(run => run.rects.length);
      runs.forEach(run => covered.add(run.runId));
      const controls = (await getInteractiveControls(page)).map((c, i) => ({...c, auditId:i, rect:{...c.rect, y:c.rect.y-geometry.scrollY}}))
        .filter(c => c.rect.y >= 2 && c.rect.y + c.rect.height + 2 <= geometry.barTop);
      controls.forEach(c => coveredControls.add(c.auditId));
      return {runs, controls};
    };
    await settleHeight(page);
    const sampled = await clip();
    const source = await page.screenshot({path:join(outputDir,`${label}-tile-${tile}.png`),animations:'disabled'});
    const mask = await maskText(page);
    const background = await page.screenshot({animations:'disabled'});
    await mask.evaluate(e => e.remove());
    merge(staticResult, textAudit(source,[background],sampled.runs,`${label}/${tile}/static `), tile);
    merge(controlsResult,borderAudit(background,sampled.controls),tile);
    await emulateVisualPreferences(page, 'no-preference');
    await page.evaluate(()=>{document.documentElement.dataset.jxAtmosphere='on';});
    await page.waitForTimeout(320);
    const dynamicSampled = await clip();
    const dynamicSource = await page.screenshot({animations:'disabled'});
    const dynamicMask = await maskText(page);
    const backgrounds=[];
    for(let frame=0;frame<3;frame++){await page.waitForTimeout(100);backgrounds.push(await page.screenshot({animations:'disabled'}));}
    await dynamicMask.evaluate(e=>e.remove());
    merge(dynamicResult,textAudit(dynamicSource,backgrounds,dynamicSampled.runs,`${label}/${tile}/dynamic `),tile);
  }
  const missed = initialRuns.filter(run => !covered.has(run.runId));
  assert.deepEqual(missed.map(run=>({selector:run.selector,text:run.text})),[], 'Every professional text run must be reached by viewport contrast sampling');
  return {staticResult,dynamicResult,controlsResult,coverage:{tiles:offsets.length,totalRuns:initialRuns.length,coveredRuns:covered.size,coveredControls:coveredControls.size}};
}

async function runDesignAcceptance(browser, origin, outputDir, options = {}) {
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
    for (const theme of ['night', 'day']) for (const target of targets.filter(target => !options.targets || options.targets.includes(target.key))) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await emulateVisualPreferences(page, 'reduce');
      await page.addInitScript(themeName => localStorage.setItem('jx10_appearance', themeName), theme);
      await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline acceptance fixture' }) }));
      await page.goto(new URL(target.path, origin).toString());
      if (target.key === 'home' && width === 390) {
        const mobileHero = await page.locator('.hero').evaluate(element => ({
          minHeight: parseFloat(getComputedStyle(element).minHeight),
          actionBottom: document.querySelector('.portal-enter')?.getBoundingClientRect().bottom ?? Infinity,
          saveActionBottom: document.querySelector('.landing-read-save')?.getBoundingClientRect().bottom ?? Infinity,
        }));
        const expectedMinHeight = await page.evaluate(() => window.innerHeight * 0.78);
        assert.ok(Math.abs(mobileHero.minHeight - expectedMinHeight) <= 1, `Mobile landing hero must follow the 78dvh design contract (${mobileHero.minHeight}px vs ${expectedMinHeight}px)`);
        assert.ok(mobileHero.actionBottom <= expectedMinHeight, 'The primary enter action must remain inside the mobile first-screen hero');
        assert.ok(mobileHero.saveActionBottom <= expectedMinHeight, 'The save-reading action must remain inside the mobile first-screen hero');
        await page.getByText('当前没有旧档', { exact: true }).waitFor();
        const readSave = page.getByRole('button', { name: '读取存档', exact: true });
        await readSave.waitFor({ state: 'visible' });
        await readSave.click();
        await page.getByRole('heading', { name: '存档管理', exact: true }).waitFor();
        await page.goto(new URL('/', origin).toString());
        await page.locator('.landing-read-save').waitFor({ state: 'visible' });
      }
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
        // content-visibility: auto re-layouts off-screen worldbook entries from their
        // 420px contain-intrinsic-size estimate as the full-page capture scrolls, so
        // the document height drifts between frames (observed 12499px vs 12177px).
        // Render every entry at full size for the whole capture session so the
        // source shot and all dynamic frames share one stable document height.
        await page.addStyleTag({ content: '.worldbook-entry { content-visibility: visible !important; }' });
      }
      await page.evaluate(async () => {
        document.documentElement.dataset.jxAtmosphere = 'off';
        // A full-page capture can trigger offscreen lazy media after the height
        // has appeared stable. Decode it first so the source and masked frames
        // measure the same rendered document, including the atlas below the fold.
        await Promise.all(Array.from(document.images, async image => {
          image.loading = 'eager';
          try { await image.decode(); } catch { /* Broken media is still measurable. */ }
        }));
        await document.fonts.ready;
      });
      const staticRuns = await getTextRuns(page);
      const controls = await getInteractiveControls(page);
      const name = `${target.key}-${theme}-${width}.png`;
      const screenshotPath = join(outputDir, name);
      await settleHeight(page);
      const staticOriginal = await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
      const textMask = await maskText(page);
      // The mask style tag is injected after the source shot, so give the layout a
      // chance to settle before taking its background twin.
      await settleHeight(page);
      const staticBackground = await page.screenshot({ fullPage: true, animations: 'disabled' });
      await textMask.evaluate(style => style.remove());
      await emulateVisualPreferences(page, 'no-preference');
      await page.evaluate(() => { document.documentElement.dataset.jxAtmosphere = 'on'; return document.fonts.ready; });
      await page.waitForTimeout(900);
      const dynamicRuns = await getTextRuns(page);
      await settleHeight(page);
      const dynamicOriginal = await page.screenshot({ fullPage: true, animations: 'disabled' });
      const dynamicTextMask = await maskText(page);
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
      await dynamicTextMask.evaluate(style => style.remove());
      const frameLabel = `${target.key}/${theme}/${width}px `;
      const tiled = target.professional ? await auditProfessionalViewports(page,outputDir,`${target.key}-${theme}-${width}`) : null;
      const staticAudit = tiled?.staticResult || textAudit(staticOriginal, [staticBackground], staticRuns, `${frameLabel}static `);
      const dynamicAudit = tiled?.dynamicResult || textAudit(dynamicOriginal, dynamicBackgrounds, dynamicRuns, `${frameLabel}dynamic `);
      const controlAudit = tiled?.controlsResult || borderAudit(staticBackground, controls);
      contrastResults.push({ page: target.key, theme, width, text: { static: staticAudit, dynamic: dynamicAudit }, controls: controlAudit, dynamicFrames: dynamicBackgrounds.length, coverage:tiled?.coverage });
      if (baselinePages.has(target.key)) {
        manifest.push({ page: target.key, route: target.path, theme, viewport: { width, height }, file: name, sha256: createHash('sha256').update(staticOriginal).digest('hex') });
      }
      await context.close();
    }
  }
  writeFileSync(join(outputDir, 'ui-baseline-manifest.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    criteria: 'Five baseline pages: home, lobby, game, world, and AI mode; two themes and 390/1366px viewports. Contrast additionally covers graphics and professional AI with no protected-scope exemptions. Professional text uses overlapping real viewport tiles with complete rendered-run coverage, excluding glyphs obscured by the sticky header or fixed operation bar. Static backgrounds and three atmosphere-on frames use unchanged WCAG AA 4.5:1 normal / 3:1 large thresholds and effective opacity. Control boundaries use 3:1 fill or border against adjacent pixels; native checkbox/radio/range and clipped shapes remain outside rectangular sampling. Closed disclosures and clipped-off glyphs are not rendered text; expanded professional fields and dialog states are checked separately.',
    screenshots: manifest,
    contrast: contrastResults,
  }, null, 2)}\n`);
  const failures = contrastResults.flatMap(result => [
    ...result.text.static.failures.map(failure => ({ page: result.page, theme: result.theme, width: result.width, kind: 'static-text', ...failure })),
    ...result.text.dynamic.failures.map(failure => ({ page: result.page, theme: result.theme, width: result.width, kind: 'dynamic-text', ...failure })),
    ...result.controls.failures.map(failure => ({ page: result.page, theme: result.theme, width: result.width, kind: 'control-boundary', ...failure })),
  ]);
  const actionableFailures = failures;
  if (actionableFailures.length) {
    throw new Error(`Contrast audit found ${actionableFailures.length} failing samples including professional AI (no protected-scope exemptions): ${JSON.stringify(actionableFailures.slice(0, 25))}`);
  }
  const checkedRuns = contrastResults.reduce((sum, item) => sum + item.text.static.checkedRuns + item.text.dynamic.checkedRuns, 0);
  const checkedEdges = contrastResults.reduce((sum, item) => sum + item.controls.checkedEdges, 0);
  const frozenProExceptions = failures.filter(failure => failure.page === 'ai-professional').length;
  const protectedWorldbookExceptions = failures.filter(failure => failure.page === 'world').length;
  console.log(`Design acceptance: ${manifest.length} five-page baselines; ${checkedRuns} text runs including professional AI and ${checkedEdges} control-boundary samples passed across night/day and mobile/desktop. Contrast failures: professional AI ${frozenProExceptions}; worldbook controls ${protectedWorldbookExceptions}.`);
}

module.exports = { runDesignAcceptance, textAudit, getTextRuns, maskText, decodePng };
