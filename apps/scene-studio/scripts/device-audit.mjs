// 真机性能采集：Android + Chrome DevTools Protocol。
//
// 通过 adb 端口转发连到真机 Chrome 的 devtools socket，注入 requestAnimationFrame
// 采样器采集逐秒 FPS 与 JS 堆内存，持续默认 5 分钟，输出 JSON 与阈值判定。
// 通过阈值为编制方（AI）建议值，作者可否决：见
// docs/acceptance/2026-10-10/scene-studio许可与真机查证结论.md 任务③④。
//
// 用法：
//   node apps/scene-studio/scripts/device-audit.mjs --url http://127.0.0.1:5173/ [--duration 300] [--out result.json]
// 前置条件：
//   - 设备开启 USB 调试并授权本机；
//   - 本机 adb 在 PATH（或用 JIUXIAO_ADB 指定 adb 路径）；
//   - 手机 Chrome 允许 USB 调试（chrome://inspect 首次勾选信任）；
//   - 预览页由 `scripts/local-server.mjs` / vite 起在本机，脚本会自动 `adb reverse`。
// 采集期间保持屏幕常亮、勿锁屏：页面后台化时 rAF 停止，样本会被标记 hidden 并剔除。

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ADB = process.env.JIUXIAO_ADB ?? 'adb';
const DEVTOOLS_HOST = '127.0.0.1:9222';

function parseArgs(argv) {
  const args = { url: null, durationSec: 300, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${flag} 需要一个值`);
      return argv[++i];
    };
    if (flag === '--url') args.url = value();
    else if (flag === '--duration') args.durationSec = Number(value());
    else if (flag === '--out') args.out = value();
    else throw new Error(`未知参数 ${flag}（支持 --url --duration --out）`);
  }
  if (!args.url) throw new Error('用法: node device-audit.mjs --url http://127.0.0.1:5173/ [--duration 300] [--out result.json]');
  if (!/^https?:\/\//.test(args.url)) throw new Error('--url 必须是 http(s) URL');
  if (!Number.isFinite(args.durationSec) || args.durationSec < 30) throw new Error('--duration 至少 30 秒');
  return args;
}

async function adb(...args) {
  const { stdout } = await run(ADB, args, { timeout: 15000 });
  return stdout.trim();
}

async function requireDevice() {
  const output = await adb('devices');
  const lines = output.split('\n').slice(1).filter(line => line.trim() && !line.includes('offline') && !line.includes('unauthorized'));
  if (lines.length === 0) throw new Error('未找到已授权的 adb 设备；请插入手机并在手机上确认 USB 调试授权');
  const serial = lines[0].split('\t')[0];
  if (lines.length > 1) console.warn(`[device-audit] 检测到 ${lines.length} 台设备，使用第一台 ${serial}`);
  return serial;
}

async function readProps(serial) {
  const keys = ['ro.product.brand', 'ro.product.model', 'ro.build.version.release', 'ro.build.version.sdk', 'ro.product.cpu.abi'];
  const props = {};
  for (const key of keys) props[key] = await adb('-s', serial, 'shell', 'getprop', key);
  return props;
}

async function adbRetry(...args) {
  try { return await adb(...args); } catch (error) {
    console.warn(`[device-audit] ${args.join(' ')} 失败（${error.message.split('\n')[0]}），继续执行`);
    return '';
  }
}

async function waitForTarget(urlPrefix, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${DEVTOOLS_HOST}/json/list`);
      const targets = await response.json();
      const page = targets.find(target => target.type === 'page' && target.url.startsWith(urlPrefix) && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) { lastError = error; }
    await new Promise(ok => setTimeout(ok, 500));
  }
  throw new Error(`等待 Chrome 打开 ${urlPrefix} 超时${lastError ? `：${lastError.message}` : '；请确认手机 Chrome 已启动且已信任 USB 调试'}`);
}

function connectWebSocket(wsUrl) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('本脚本需要 Node ≥ 22 的内置 WebSocket；请升级 Node 后重试');
  }
  return new WebSocket(wsUrl);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  const serial = await requireDevice();
  const props = await readProps(serial);
  const device = { serial, ...props };

  // 预览服务跑在本机时，把设备侧同名端口反向代理到主机。
  const previewUrl = new URL(args.url);
  if (['127.0.0.1', 'localhost'].includes(previewUrl.hostname)) {
    const port = previewUrl.port || '80';
    await adbRetry('reverse', `tcp:${port}`, `tcp:${port}`);
  }

  // devtools socket 与屏幕常亮；锁屏会让 rAF 停摆，破坏采样。
  await adbRetry('-s', serial, 'forward', `tcp:${DEVTOOLS_HOST}`, 'localabstract:chrome_devtools_remote');
  if (await adbRetry('-s', serial, 'shell', 'settings', 'get', 'system', 'stay_on_while_plugged_in') === '0') {
    await adbRetry('-s', serial, 'shell', 'svc', 'power', 'stayon', 'true');
  }
  await adbRetry('-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', JSON.stringify(args.url), '-p', 'com.android.chrome');

  const target = await waitForTarget(args.url);
  const ws = connectWebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { ok, fail } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? fail(new Error(message.error.message)) : ok(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++nextId;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`页面内采样器异常: ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`);
    return result.result?.value;
  };

  await send('Runtime.enable');
  await evaluate(`(() => {
    window.__jxAudit = { perSec: [], frames: 0, last: performance.now() };
    const tick = now => {
      const s = window.__jxAudit;
      s.frames += 1;
      if (now - s.last >= 1000) {
        s.perSec.push({
          t: Math.round(now),
          visible: document.visibilityState === 'visible',
          fps: Math.round(s.frames * 1000 / (now - s.last)),
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null,
        });
        s.frames = 0;
        s.last = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return JSON.stringify({
      href: location.href,
      viewport: [innerWidth, innerHeight],
      devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      hasMemoryAPI: Boolean(performance.memory),
    });
  })()`);
  const pageInfo = JSON.parse(await evaluate('JSON.stringify({ href: location.href, viewport: [innerWidth, innerHeight], devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency ?? null, hasMemoryAPI: Boolean(performance.memory) })'));

  console.log(`[device-audit] 采集 ${args.durationSec}s：${pageInfo.href} @ ${device['ro.product.brand']} ${device['ro.product.model']}`);
  const deadline = Date.now() + args.durationSec * 1000;
  let collected = 0;
  let interrupted = false;
  const onInterrupt = () => { interrupted = true; };
  process.on('SIGINT', onInterrupt);
  while (!interrupted && Date.now() < deadline) {
    await new Promise(ok => setTimeout(ok, 1000));
    const perSec = await evaluate('JSON.stringify(window.__jxAudit.perSec)');
    const samples = JSON.parse(perSec);
    if (samples.length > collected) collected = samples.length;
  }
  process.off('SIGINT', onInterrupt);

  const rawSamples = JSON.parse(await evaluate('JSON.stringify(window.__jxAudit.perSec)'));
  await evaluate('window.__jxAudit = undefined');
  ws.close();
  await adbRetry('reverse', '--remove', `tcp:${new URL(args.url).port || 80}`);

  const valid = rawSamples.filter(sample => sample.visible);
  const fpsValues = valid.map(sample => sample.fps).sort((a, b) => a - b);
  const percentile = sorted => {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length, Math.ceil(sorted.length * 0.95)) - 1];
  };
  const mean = values => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  const windowMeanMin60 = (() => {
    if (valid.length < 60) return null;
    let best = Infinity;
    for (let i = 0; i + 60 <= valid.length; i++) {
      best = Math.min(best, mean(valid.slice(i, i + 60).map(sample => sample.fps)));
    }
    return Math.round(best * 10) / 10;
  })();
  const heapPoints = rawSamples.filter(sample => sample.heapMB !== null);
  const heapSlopeMBPerMin = (() => {
    if (heapPoints.length < 30) return null;
    const xs = heapPoints.map(p => p.t);
    const ys = heapPoints.map(p => p.heapMB);
    const mx = mean(xs);
    const my = mean(ys);
    const slope = ys.reduce((acc, y, i) => acc + (xs[i] - mx) * (y - my), 0)
      / xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
    return Math.round(slope * 60000 * 100) / 100; // ms^-1 → MB/min
  })();
  const heapGrowthMB = heapPoints.length >= 120
    ? Math.round((mean(heapPoints.slice(-60).map(p => p.heapMB)) - mean(heapPoints.slice(0, 60).map(p => p.heapMB))) * 10) / 10
    : null;

  // 通过阈值（编制方 AI 建议，作者可否决）：均值与 P95 ≥ 30 FPS；低帧样本 ≤ 5%；
  // 最差 60 秒滑窗均值 ≥ 24 FPS；堆斜率 ≤ 0.5 MB/min 且首尾 60 秒均值增长 ≤ 10 MB。
  const thresholds = { aiProposed: true, authorMayVeto: true, avgFps: 30, p95Fps: 30, lowFpsRatioMax: 0.05, window60sMeanMin: 24, heapSlopeMBPerMinMax: 0.5, heapGrowthMBMax: 10 };
  const summary = {
    validSamples: valid.length,
    hiddenSamples: rawSamples.length - valid.length,
    avgFps: Math.round((mean(valid.map(s => s.fps)) ?? 0) * 10) / 10,
    p95Fps: percentile(fpsValues),
    lowFpsRatio: valid.length ? Math.round(valid.filter(s => s.fps < 24).length / valid.length * 1000) / 1000 : null,
    windowMeanMin60,
    heapSlopeMBPerMin,
    heapGrowthMB,
  };
  const failures = [];
  if (summary.avgFps < thresholds.avgFps) failures.push(`平均帧率 ${summary.avgFps} < ${thresholds.avgFps}`);
  if (summary.p95Fps === null || summary.p95Fps < thresholds.p95Fps) failures.push(`P95 帧率 ${summary.p95Fps} < ${thresholds.p95Fps}`);
  if (summary.lowFpsRatio === null || summary.lowFpsRatio > thresholds.lowFpsRatioMax) failures.push(`低帧样本占比 ${summary.lowFpsRatio} > ${thresholds.lowFpsRatioMax}`);
  if (summary.windowMeanMin60 !== null && summary.windowMeanMin60 < thresholds.window60sMeanMin) failures.push(`最差 60s 均值 ${summary.windowMeanMin60} < ${thresholds.window60sMeanMin}`);
  if (summary.heapSlopeMBPerMin !== null && summary.heapSlopeMBPerMin > thresholds.heapSlopeMBPerMinMax) failures.push(`堆斜率 ${summary.heapSlopeMBPerMin} MB/min > ${thresholds.heapSlopeMBPerMinMax}`);
  if (summary.heapGrowthMB !== null && summary.heapGrowthMB > thresholds.heapGrowthMBMax) failures.push(`堆增长 ${summary.heapGrowthMB} MB > ${thresholds.heapGrowthMBMax}`);

  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    interrupted,
    url: args.url,
    requestedDurationSec: args.durationSec,
    device,
    pageInfo,
    thresholds,
    summary,
    pass: failures.length === 0,
    failures,
    samples: rawSamples,
  };

  const outPath = resolve(args.out ?? `apps/scene-studio/test-results/device-audit/${startedAt.replace(/[:.]/g, '-')}-${(device['ro.product.model'] ?? 'device').replace(/\W+/g, '-')}.json`);
  await mkdir(resolve(outPath, '..'), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[device-audit] ${report.pass ? 'PASS' : 'FAIL'} 均值 ${summary.avgFps} FPS / P95 ${summary.p95Fps} / 低帧占比 ${summary.lowFpsRatio} / 堆斜率 ${summary.heapSlopeMBPerMin} MB/min → ${outPath}`);
  if (failures.length) for (const line of failures) console.error(`[device-audit] 未达标: ${line}`);
  process.exitCode = report.pass ? 0 : 2;
}

main().catch(error => {
  console.error(`[device-audit] ${error.message}`);
  process.exitCode = 1;
});
