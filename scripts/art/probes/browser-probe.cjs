const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const http = require('node:http');
const { chromium } = createRequire(resolve('package.json'))('playwright');

async function probe() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) throw Error('WebGL2 context failed');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  gl.disable(gl.DITHER); gl.clearColor(64/255, 128/255, 191/255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const pixel = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
  let gpu = null;
  if (adapter) {
    const device = await adapter.requestDevice();
    const buffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const copy = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const code = '@group(0) @binding(0) var<storage,read_write> out: array<u32>; @compute @workgroup_size(1) fn main() { out[0] = 6u * 7u; }';
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(buffer, 0, copy, 0, 4);
    device.queue.submit([encoder.finish()]);
    await copy.mapAsync(GPUMapMode.READ);
    gpu = { result: new Uint32Array(copy.getMappedRange())[0], vendor: adapter.info.vendor, fallback: adapter.info.isFallbackAdapter };
    copy.unmap();
    device.destroy();
  }
  const ctx = new OfflineAudioContext(1, 4800, 48000);
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  osc.connect(ctx.destination);
  osc.start();
  const pcm = (await ctx.startRendering()).getChannelData(0);
  return { gl: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL), pixel: Array.from(pixel), gpu, rms: Math.sqrt(pcm.reduce((s, v) => s + v*v, 0) / pcm.length) };
}

async function main() {
  const server = http.createServer((req, res) => res.end('<!doctype html><title>Local test</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    const evidence = await page.evaluate(probe);
    console.log(JSON.stringify({ browser: browser.version(), ...evidence }));
    assert.deepEqual(evidence.pixel, [64,128,191,255]);
    assert.ok(evidence.gpu && !evidence.gpu.fallback && evidence.gpu.result === 42);
    assert.ok(evidence.rms > 0.70 && evidence.rms < 0.72);
  } finally {
    await browser?.close();
    server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
