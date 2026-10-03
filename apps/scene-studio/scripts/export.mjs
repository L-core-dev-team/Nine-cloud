import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'test-results/scene-studio');
const artifacts = resolve(root, 'apps/scene-studio/artifacts');
const url = 'http://127.0.0.1:5185/?export=1';
const all = process.argv.includes('--all');
const variants = [
  { id: 'landscape', width: 960, height: 540 },
  { id: 'portrait', width: 540, height: 960 },
];
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
function run(program, args, cwd = root) {
  return new Promise((ok, fail) => {
    const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', data => { err += data.toString(); });
    child.on('error', fail);
    child.on('close', code => code === 0 ? ok(err) : fail(new Error(`${program} exited ${code}: ${err.slice(-2000)}`)));
  });
}
async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* Vite is starting. */ }
    await sleep(300);
  }
  throw new Error('Studio did not start');
}

await mkdir(output, { recursive: true });
const server = spawn(process.execPath, [resolve(root, 'apps/scene-studio/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { cwd: resolve(root, 'apps/scene-studio'), stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
const started = performance.now();
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const modelUsage = { exportModelCalls: 0, authoringTokens: null, authoringMetering: 'unavailable in this Codex session' };
  const report = { mode: all ? 'full' : 'keyframes', seconds: 8, fps: 30, renderer: 'Playwright Chromium software WebGL', modelUsage, variants: {} };
  for (const variant of variants) {
    const dir = resolve(output, variant.id);
    await mkdir(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: variant.width, height: variant.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__gateStudio));
    const canvas = page.locator('canvas');
    const keys = [0, 80, 160];
    for (const frame of keys) {
      await page.evaluate(time => window.__gateStudio.renderAt(time), frame / 30);
      await canvas.screenshot({ path: resolve(dir, `key-${String(frame).padStart(3, '0')}.png`) });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    const detail = { width: variant.width, height: variant.height, keyframes: keys, keyframeSha256: {} };
    for (const frame of keys) detail.keyframeSha256[frame] = await sha(resolve(dir, `key-${String(frame).padStart(3, '0')}.png`));
    if (all) {
      // Seek out of order, then revisit t=0. Equal pixel hashes are a stronger check than state inspection.
      await page.evaluate(() => window.__gateStudio.renderAt(5.5));
      await page.evaluate(() => window.__gateStudio.renderAt(0));
      await canvas.screenshot({ path: resolve(dir, 'seek-zero.png') });
      if (await sha(resolve(dir, 'seek-zero.png')) !== detail.keyframeSha256[0]) throw new Error(`${variant.id}: renderAt is order-dependent`);
      await page.evaluate(() => window.__gateStudio.renderAt(8));
      await canvas.screenshot({ path: resolve(dir, 'loop-eight.png') });
      if (await sha(resolve(dir, 'loop-eight.png')) !== detail.keyframeSha256[0]) throw new Error(`${variant.id}: loop endpoints differ`);
      const framesDir = resolve(dir, 'frames');
      await mkdir(framesDir, { recursive: true });
      for (let frame = 0; frame < 240; frame++) {
        await page.evaluate(time => window.__gateStudio.renderAt(time), frame / 30);
        await canvas.screenshot({ path: resolve(framesDir, `frame-${String(frame).padStart(4, '0')}.png`) });
      }
      const video = resolve(dir, `mountain-gate.${variant.id}.mp4`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', resolve(framesDir, 'frame-%04d.png'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
      const poster = resolve(dir, `mountain-gate.${variant.id}.webp`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(framesDir, 'frame-0000.png'), '-quality', '85', '-frames:v', '1', poster]);
      const contact = resolve(dir, `mountain-gate.${variant.id}.contact.png`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', resolve(framesDir, 'frame-%04d.png'), '-vf', 'fps=1.5,scale=320:-1,tile=4x3', '-frames:v', '1', contact]);
      detail.video = { path: video, sha256: await sha(video), bytes: (await readFile(video)).length };
      detail.poster = { path: poster, sha256: await sha(poster), bytes: (await readFile(poster)).length };
      detail.contact = { path: contact, sha256: await sha(contact) };
    }
    report.variants[variant.id] = detail;
    await page.close();
  }
  report.elapsedSeconds = Math.round((performance.now() - started) / 1000);
  await writeFile(resolve(output, all ? 'full-report.json' : 'keyframe-report.json'), JSON.stringify(report, null, 2));
  if (all) {
    await mkdir(artifacts, { recursive: true });
    const files = [];
    for (const variant of variants) {
      const dir = resolve(output, variant.id);
      for (const name of [
        `mountain-gate.${variant.id}.mp4`,
        `mountain-gate.${variant.id}.webp`,
        `mountain-gate.${variant.id}.contact.png`,
        ...[0, 80, 160].map(frame => `key-${String(frame).padStart(3, '0')}.${variant.id}.png`),
      ]) {
        const from = resolve(dir, name.startsWith('key-') ? name.replace(`.${variant.id}.png`, '.png') : name);
        const to = resolve(artifacts, name);
        await copyFile(from, to);
        files.push({ path: name, sha256: await sha(to), bytes: (await readFile(to)).length });
      }
    }
    await writeFile(resolve(artifacts, 'manifest.json'), JSON.stringify({
      status: 'internal-candidate', sourceAndLicense: 'unverified', authorApproval: 'pending',
      source: 'packages/scene-gate/src/index.ts', seconds: 8, fps: 30,
      generatedAt: new Date().toISOString(), modelUsage, elapsedSeconds: report.elapsedSeconds,
      files,
    }, null, 2));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser?.close();
  server.kill();
}
