import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startStudioServer } from './local-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'test-results/scene-studio');
const artifacts = resolve(root, 'apps/scene-studio/artifacts');
const all = process.argv.includes('--all');
const variants = [
  { id: 'landscape', width: 960, height: 540 },
  { id: 'portrait', width: 540, height: 960 },
];
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
function run(program, args, cwd = root) {
  return new Promise((ok, fail) => {
    const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout = `${stdout}${data}`.slice(-1_000_000); });
    child.stderr.on('data', data => { stderr = `${stderr}${data}`.slice(-4000); });
    child.on('error', fail);
    child.on('close', code => code === 0 ? ok({ stdout, stderr }) : fail(new Error(`${program} exited ${code}: ${stderr}`)));
  });
}
async function locateFfprobe() {
  const executable = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, executable);
    try { await access(candidate); return candidate; } catch { /* Check the next PATH entry. */ }
  }
  throw new Error('ffprobe is not on PATH; install it with FFmpeg to verify exported files');
}
async function verifyVideo(video, width, height, ffprobe) {
  const { stdout } = await run(ffprobe, [
    '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', video,
  ]);
  const metadata = JSON.parse(stdout);
  const streams = metadata.streams ?? [];
  const stream = streams[0];
  const duration = Number(metadata.format?.duration);
  if (streams.length !== 1 || stream?.codec_type !== 'video' || stream.codec_name !== 'h264'
    || stream.width !== width || stream.height !== height || stream.pix_fmt !== 'yuv420p'
    || stream.avg_frame_rate !== '30/1' || Number(stream.nb_read_frames) !== 240
    || !Number.isFinite(duration) || Math.abs(duration - 8) > 0.02) {
    throw new Error(`Unexpected video output: ${JSON.stringify(metadata)}`);
  }
  await run('ffmpeg', ['-v', 'error', '-i', video, '-f', 'null', '-']);
  const blackScan = await run('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-i', video, '-vf', 'blackdetect=d=0.1:pix_th=0.06', '-an', '-f', 'null', '-']);
  if (blackScan.stderr.includes('black_start')) throw new Error(`Black frames detected in ${video}`);
  return { codec: stream.codec_name, pixelFormat: stream.pix_fmt, fps: 30, frames: Number(stream.nb_read_frames), durationSeconds: duration, blackFrameScan: 'passed' };
}
async function measureSsim(left, right) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner', '-i', left, '-i', right,
    '-filter_complex', '[0:v][1:v]ssim=stats_file=-', '-f', 'null', '-',
  ]);
  const match = stderr.match(/\bAll:([0-9]*\.[0-9]+)/);
  if (!match) throw new Error(`Could not read SSIM result for ${left} and ${right}`);
  return Number(match[1]);
}

await mkdir(output, { recursive: true });
const studioServer = await startStudioServer(root);
const url = `${studioServer.url}/?export=1`;
let browser;
const started = performance.now();
try {
  const ffprobePath = await locateFfprobe();
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const modelUsage = { exportModelCalls: 0, authoringTokens: null, authoringMetering: 'unavailable in this Codex session' };
  const report = { mode: all ? 'full' : 'keyframes', seconds: 8, fps: 30, renderer: 'Playwright Chromium software WebGL', modelUsage, variants: {} };
  for (const variant of variants) {
    const dir = resolve(output, variant.id);
    await mkdir(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: variant.width, height: variant.height }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', event => {
        const bag = window.__sceneStudioUnhandled ?? (window.__sceneStudioUnhandled = []);
        bag.push(String(event.reason));
      });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__gateStudio));
    await page.evaluate(() => window.__gateStudio.ready());
    const assertPageHealthy = async () => {
      const unhandled = await page.evaluate(() => window.__sceneStudioUnhandled ?? []);
      if (errors.length || unhandled.length) throw new Error([...errors, ...unhandled].join('\n'));
    };
    const canvas = page.locator('canvas');
    const keys = [0, 80, 160];
    for (const frame of keys) {
      await page.evaluate(time => window.__gateStudio.renderAt(time), frame / 30);
      await canvas.screenshot({ path: resolve(dir, `key-${String(frame).padStart(3, '0')}.png`) });
    }
    await assertPageHealthy();
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
      await assertPageHealthy();
      detail.loopMetrics = {
        firstToSecondFrameSsim: await measureSsim(resolve(framesDir, 'frame-0000.png'), resolve(framesDir, 'frame-0001.png')),
        lastToFirstFrameSsim: await measureSsim(resolve(framesDir, 'frame-0239.png'), resolve(framesDir, 'frame-0000.png')),
      };
      const video = resolve(dir, `mountain-gate.${variant.id}.mp4`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', resolve(framesDir, 'frame-%04d.png'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
      const videoValidation = await verifyVideo(video, variant.width, variant.height, ffprobePath);
      const poster = resolve(dir, `mountain-gate.${variant.id}.webp`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(framesDir, 'frame-0000.png'), '-quality', '85', '-frames:v', '1', poster]);
      const contact = resolve(dir, `mountain-gate.${variant.id}.contact.png`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', resolve(framesDir, 'frame-%04d.png'), '-vf', 'fps=1.5,scale=320:-1,tile=4x3', '-frames:v', '1', contact]);
      detail.video = { path: video, sha256: await sha(video), bytes: (await readFile(video)).length };
      detail.videoValidation = videoValidation;
      detail.poster = { path: poster, sha256: await sha(poster), bytes: (await readFile(poster)).length };
      detail.contact = { path: contact, sha256: await sha(contact) };
    }
    await assertPageHealthy();
    report.variants[variant.id] = detail;
    await page.close();
  }
  report.elapsedSeconds = Math.round((performance.now() - started) / 1000);
  await writeFile(resolve(output, all ? 'full-report.json' : 'keyframe-report.json'), JSON.stringify(report, null, 2));
  if (all) {
    await mkdir(artifacts, { recursive: true });
    const files = [];
    const sourceAssets = [];
    const sourceFiles = [];
    for (const path of [
      'packages/scene-gate/src/index.ts',
      'apps/scene-studio/src/main.tsx',
      'apps/scene-studio/src/style.css',
      'apps/scene-studio/scripts/export.mjs',
      'apps/scene-studio/scripts/local-server.mjs',
      'pnpm-lock.yaml',
    ]) {
      const sourcePath = resolve(root, path);
      sourceFiles.push({ path, sha256: await sha(sourcePath), bytes: (await readFile(sourcePath)).length });
    }
    for (const name of ['gate-environment-landscape.webp', 'gate-environment-portrait.webp']) {
      const path = resolve(root, 'apps/scene-studio/src/assets', name);
      sourceAssets.push({ path: `apps/scene-studio/src/assets/${name}`, sha256: await sha(path), bytes: (await readFile(path)).length });
    }
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
      source: 'packages/scene-gate/src/index.ts', sourceFiles, sourceAssets, seconds: 8, fps: 30,
      technicalQC: 'passed', blackFrameScan: 'passed', codec: 'h264', pixelFormat: 'yuv420p', frameCountPerVariant: 240,
      loopMetrics: Object.fromEntries(variants.map(variant => [variant.id, report.variants[variant.id].loopMetrics])),
      generatedAt: new Date().toISOString(), modelUsage, elapsedSeconds: report.elapsedSeconds,
      files,
    }, null, 2));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser?.close();
  await studioServer.stop();
}
