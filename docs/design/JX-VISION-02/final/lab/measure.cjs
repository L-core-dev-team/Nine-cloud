const { chromium } = require('playwright');
const [url, prefix, w, h] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await p.goto(url); await p.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
  const els = await p.evaluate(() => { const out = []; const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walk.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; const r = document.createRange(); r.selectNodeContents(n); const rects = [...r.getClientRects()];
      const cs = getComputedStyle(el); for (const q of rects) if (q.width > 2 && q.height > 2) out.push({ t: t.slice(0, 16), x: q.x, y: q.y, w: q.width, h: q.height, color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight, op: cs.opacity }); }
    return out; });
  await p.screenshot({ path: prefix + '-with.png' });
  await p.addStyleTag({ content: '*{color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}' });
  await p.waitForTimeout(100); await p.screenshot({ path: prefix + '-bg.png' });
  require('fs').writeFileSync(prefix + '-els.json', JSON.stringify(els)); await b.close();
})();
