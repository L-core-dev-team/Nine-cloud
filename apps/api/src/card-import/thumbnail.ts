import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { CardError } from './parser.js';

/**
 * 卡库缩略图（JX-UI-E-01 第三轮）。
 *
 * The original card file already lives in PostgreSQL; this derives a small JPEG from a PNG
 * card on the existing server, so it adds no paid service. Pure-JS codecs (pngjs, jpeg-js),
 * no native modules. Decoding runs in one worker thread so a large PNG never blocks the API
 * event loop; when the compiled worker is not present (tests, ts sources) it runs inline.
 * Results are content-addressed (sha256 + version) and cached by the browser for a year.
 */
export const THUMBNAIL_VERSION = 'v1';
export const THUMBNAIL_WIDTH = 360;
/** Refuse to decode anything larger than this many pixels (memory bound, ~64 MiB RGBA). */
export const THUMBNAIL_MAX_PIXELS = 4096 * 4096;
const MATTE = [16, 36, 47] as const;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Area-average downscale of RGBA pixels, composited onto the shelf's dark matte. */
export function downscale(rgba: Uint8Array, width: number, height: number, targetWidth: number): { data: Uint8Array; width: number; height: number } {
  const outWidth = Math.max(1, Math.min(width, targetWidth));
  const outHeight = Math.max(1, Math.round(height * outWidth / width));
  const out = new Uint8Array(outWidth * outHeight * 4);
  const sx = width / outWidth, sy = height / outHeight;
  for (let y = 0; y < outHeight; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.min(height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < outWidth; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.min(width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, count = 0;
      for (let yy = y0; yy < y1; yy++) {
        let index = (yy * width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, index += 4) {
          const alpha = rgba[index + 3]! / 255;
          r += rgba[index]! * alpha + MATTE[0] * (1 - alpha);
          g += rgba[index + 1]! * alpha + MATTE[1] * (1 - alpha);
          b += rgba[index + 2]! * alpha + MATTE[2] * (1 - alpha);
          count++;
        }
      }
      const target = (y * outWidth + x) * 4;
      out[target] = Math.round(r / count); out[target + 1] = Math.round(g / count); out[target + 2] = Math.round(b / count); out[target + 3] = 255;
    }
  }
  return { data: out, width: outWidth, height: outHeight };
}

/** Synchronous core shared by the worker and the inline fallback. Throws CardError on unusable input. */
export function renderThumbnailSync(bytes: Uint8Array): Uint8Array {
  const size = pngDimensions(bytes);
  if (!size) throw new CardError('THUMBNAIL_UNAVAILABLE', 404);
  if (size.width * size.height > THUMBNAIL_MAX_PIXELS) throw new CardError('THUMBNAIL_UNAVAILABLE', 404);
  let png: PNG;
  try { png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); } catch { throw new CardError('THUMBNAIL_UNAVAILABLE', 404); }
  const small = downscale(png.data, png.width, png.height, THUMBNAIL_WIDTH);
  return new Uint8Array(jpeg.encode({ data: small.data, width: small.width, height: small.height }, 82).data);
}

type Job = { resolve: (value: Uint8Array) => void; reject: (error: unknown) => void };

/** One worker thread, a small queue, and an in-memory LRU of finished thumbnails. */
export class ThumbnailRenderer {
  private worker: Worker | null = null;
  private workerUnavailable = false;
  private next = 0;
  private readonly jobs = new Map<number, Job>();
  private readonly cache = new Map<string, Uint8Array>();
  private cacheBytes = 0;
  constructor(private readonly options: { maxQueue?: number; cacheBytes?: number; workerUrl?: URL } = {}) {}

  async render(sha256: string, bytes: Uint8Array): Promise<Uint8Array> {
    const key = `${THUMBNAIL_VERSION}:${sha256}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    if (!pngDimensions(bytes)) throw new CardError('THUMBNAIL_UNAVAILABLE', 404);
    if (this.jobs.size >= (this.options.maxQueue ?? 16)) throw new CardError('THUMBNAIL_BUSY', 503);
    const data = await this.run(bytes);
    this.remember(key, data);
    return data;
  }

  close() { void this.worker?.terminate(); this.worker = null; }

  private remember(key: string, data: Uint8Array) {
    const limit = this.options.cacheBytes ?? 8 * 1024 * 1024;
    this.cache.set(key, data); this.cacheBytes += data.byteLength;
    while (this.cacheBytes > limit && this.cache.size > 1) {
      const [oldest, value] = this.cache.entries().next().value as [string, Uint8Array];
      this.cache.delete(oldest); this.cacheBytes -= value.byteLength;
    }
  }

  private run(bytes: Uint8Array): Promise<Uint8Array> {
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve().then(() => renderThumbnailSync(bytes));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      const copy = new Uint8Array(bytes);
      worker.postMessage({ id, bytes: copy }, [copy.buffer]);
    });
  }

  private ensureWorker(): Worker | null {
    if (this.worker || this.workerUnavailable) return this.worker;
    const url = this.options.workerUrl ?? new URL('./thumbnail-worker.js', import.meta.url);
    if (!existsSync(fileURLToPath(url))) { this.workerUnavailable = true; return null; }
    const worker = new Worker(url);
    worker.unref();
    worker.on('message', (message: { id: number; ok: boolean; data?: Uint8Array; code?: string; status?: number }) => {
      const job = this.jobs.get(message.id); if (!job) return;
      this.jobs.delete(message.id);
      if (message.ok && message.data) job.resolve(message.data);
      else job.reject(new CardError(message.code ?? 'THUMBNAIL_UNAVAILABLE', message.status ?? 404));
    });
    const fail = () => {
      for (const job of this.jobs.values()) job.reject(new CardError('THUMBNAIL_UNAVAILABLE', 503));
      this.jobs.clear(); this.worker = null;
    };
    worker.on('error', fail);
    worker.on('exit', code => { if (code !== 0) fail(); else this.worker = null; });
    this.worker = worker;
    return worker;
  }
}
