import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { createCardImportRouter } from './router.js';
import type { CardImportService } from './service.js';
import { CardError } from './parser.js';
import { THUMBNAIL_WIDTH, ThumbnailRenderer, downscale, pngDimensions, renderThumbnailSync } from './thumbnail.js';

function makePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4; const [r, g, b, a] = pixel(x, y);
    png.data[index] = r; png.data[index + 1] = g; png.data[index + 2] = b; png.data[index + 3] = a;
  }
  return PNG.sync.write(png);
}

describe('卡库缩略图', () => {
  it('reads PNG dimensions from IHDR and rejects other bytes', () => {
    expect(pngDimensions(makePng(30, 45, () => [0, 0, 0, 255]))).toEqual({ width: 30, height: 45 });
    expect(pngDimensions(Buffer.from('{"name":"json card"}'))).toBeNull();
  });

  it('downscales to the shelf width, keeps the aspect ratio and encodes a JPEG', () => {
    const source = makePng(720, 1080, x => (x < 360 ? [200, 40, 40, 255] : [40, 40, 200, 255]));
    const thumb = renderThumbnailSync(source);
    const decoded = jpeg.decode(thumb, { useTArray: true });
    expect([decoded.width, decoded.height]).toEqual([THUMBNAIL_WIDTH, 540]);
    const left = decoded.data[(270 * decoded.width + 10) * 4]!, right = decoded.data[(270 * decoded.width + 350) * 4 + 2]!;
    expect(left).toBeGreaterThan(160); expect(right).toBeGreaterThan(160);
  });

  it('is much smaller than a photo-like original', () => {
    let seed = 7; const grain = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 24;
    const source = makePng(720, 1080, (x, y) => { const t = grain(); return [Math.min(255, 40 + x * 0.2 + t), Math.min(255, 60 + y * 0.12 + t), Math.min(255, 90 + Math.sin(x / 40) * 30 + t), 255]; });
    expect(renderThumbnailSync(source).byteLength).toBeLessThan(source.byteLength / 20);
  });

  it('composites transparency onto the dark shelf matte instead of black or white', () => {
    const out = downscale(new Uint8Array([255, 255, 255, 0, 255, 255, 255, 0]), 2, 1, 1);
    expect(Array.from(out.data)).toEqual([16, 36, 47, 255]);
  });

  it('never upscales a small image', () => {
    const decoded = jpeg.decode(renderThumbnailSync(makePng(120, 180, () => [90, 90, 90, 255])), { useTArray: true });
    expect([decoded.width, decoded.height]).toEqual([120, 180]);
  });

  it('refuses images too large to decode safely before touching pixel data', () => {
    const header = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
    header.writeUInt32BE(13, 8); header.write('IHDR', 12, 'latin1'); header.writeUInt32BE(5000, 16); header.writeUInt32BE(5000, 20);
    expect(() => renderThumbnailSync(header)).toThrow(CardError);
    expect(() => renderThumbnailSync(Buffer.from('not a png'))).toThrow('THUMBNAIL_UNAVAILABLE');
  });

  it('caches by content and bounds the queue', async () => {
    const renderer = new ThumbnailRenderer({ workerUrl: new URL('./missing-worker.js', import.meta.url), maxQueue: 4 });
    const bytes = makePng(400, 600, () => [10, 120, 90, 255]);
    const first = await renderer.render('a'.repeat(64), bytes);
    expect(await renderer.render('a'.repeat(64), Buffer.from('ignored because cached'))).toBe(first);
    await expect(renderer.render('b'.repeat(64), Buffer.from('{}'))).rejects.toMatchObject({ code: 'THUMBNAIL_UNAVAILABLE', status: 404 });
  });

  it('serves the thumbnail only through the owner-checked import read, with long-lived caching', async () => {
    const original = makePng(360, 540, () => [30, 60, 90, 255]);
    let owner = '';
    const service = { readImport: async (who: string) => { owner = who; return { sha256: 'c'.repeat(64), original }; } } as unknown as CardImportService;
    const app = createCardImportRouter(service, { resolveOwnerId: async () => 'A' }, 'http://card.test');
    const response = await app.request('/imports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/thumbnail');
    expect(response.status).toBe(200);
    expect(owner).toBe('A');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    const etag = response.headers.get('etag')!;
    const again = await app.request('/imports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/thumbnail', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
  });

  it('answers 404 with a thumbnail-specific code for JSON cards', async () => {
    const service = { readImport: async () => ({ sha256: 'd'.repeat(64), original: Buffer.from('{"name":"x"}') }) } as unknown as CardImportService;
    const app = createCardImportRouter(service, { resolveOwnerId: async () => 'A' }, 'http://card.test');
    const response = await app.request('/imports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/thumbnail');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'THUMBNAIL_UNAVAILABLE' });
  });
});
