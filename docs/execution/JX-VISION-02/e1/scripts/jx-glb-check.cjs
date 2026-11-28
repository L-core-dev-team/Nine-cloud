/**
 * jx-glb-check.cjs —— 用 Chrome 无头模式加载 GLB 并截图（E1.1 浏览器验收）
 *
 * 用法：
 *   node jx-glb-check.cjs --root <WEB_ROOT> --page jx-newglb.html --glb jx_verify_5.3.0.glb --tag 5.3.0 \
 *     --out <DIR>\glb-5.3.0.png --report <DIR>\glb-browser-5.3.0.json \
 *     --playwright <NODE_MODULES>\playwright [--chrome <chrome.exe>]
 *
 * --root 是 HTTP 服务根目录；--page 与 --glb 都是相对 root 的路径（用 / 分隔）。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(arg('root', process.cwd()));
const PAGE = arg('page', 'jx-newglb.html').replace(/\\/g, '/');
const GLB = arg('glb', 'jx_verify.glb').replace(/\\/g, '/');
const TAG = arg('tag', 'glb');
const SHOT = path.resolve(arg('out', path.join(ROOT, `glb-${TAG}.png`)));
const REPORT = path.resolve(arg('report', path.join(ROOT, `glb-browser-${TAG}.json`)));
const PW = arg('playwright', 'playwright');
const CHROME = arg('chrome', '');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.ktx2': 'image/ktx2' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  if (!fs.existsSync(path.join(ROOT, PAGE))) throw new Error(`root 缺少页面 ${PAGE}`);
  if (!fs.existsSync(path.join(ROOT, GLB))) throw new Error(`root 缺少 ${GLB}`);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const { chromium } = require(PW);
  const opts = CHROME && fs.existsSync(CHROME) ? { executablePath: CHROME } : { channel: 'chrome' };
  const browser = await chromium.launch({ ...opts, headless: true, args: ['--use-gl=angle', '--use-angle=gl'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/${PAGE}?glb=${encodeURIComponent(GLB.split('/').pop())}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__result !== undefined', null, { timeout: 60000 });
  const result = await page.evaluate('window.__result');
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT });
  const report = { ...result, console_errors: errors, screenshot: SHOT };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
