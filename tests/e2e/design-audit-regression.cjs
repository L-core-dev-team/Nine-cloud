const assert = require('node:assert/strict');
const { deflateSync } = require('node:zlib');
const { textAudit } = require('./design-acceptance.cjs');
// Synthetic screenshots isolate the no-shadow path from browser animation.
function png(rgb) {
  const chunk = (type, bytes) => {
    const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    return Buffer.concat([size, Buffer.from(type), bytes, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.from([0, ...rgb, ...rgb]);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat([row, row]))), chunk('IEND', Buffer.alloc(0))]);
}
function audit(color, foreground, background) {
  return textAudit(png(foreground), [png(background)], [{color, opacity: 1, large: false, selector: '.fixture', text: 'fixture', rects: [{x: 0, y: 0, width: 2, height: 2}]}]);
}
assert.equal(audit('rgb(120, 120, 120)', [120,120,120], [150,150,150]).failures.length, 1, 'No shadow must not turn failing contrast into Infinity/PASS');
assert.equal(audit('rgb(255, 255, 255)', [255,255,255], [0,0,0]).failures.length, 0, 'Readable unshadowed text passes');
assert.equal(audit('rgba(255,255,255,0.2)', [51,51,51], [0,0,0]).failures.length, 1, 'Effective opacity remains part of the contrast criterion');
console.log('Contrast sampler regression: 3/3 PASS');
