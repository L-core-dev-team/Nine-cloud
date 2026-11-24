import { useEffect, useRef, useState } from 'react';
import { Monogram } from './Ornaments';

/**
 * 立轴画像 (P03): portrait for a saved character card.
 * CardItem carries no image URL, so the existing original-file endpoint is read
 * lazily for cards that enter the viewport. PNG bytes are decoded and downscaled
 * in memory (LRU, never persisted). Anything else falls back to the monogram.
 * No new API, no storage writes.
 */
type Loader = (importId: string) => Promise<Uint8Array>;

const MAX_BYTES = 2 * 1024 * 1024;
const LRU_LIMIT = 40;
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let active = 0;
const queue: (() => void)[] = [];

function remember(key: string, value: string | null) {
  cache.set(key, value);
  while (cache.size > LRU_LIMIT) {
    const oldest = cache.keys().next().value as string;
    const url = cache.get(oldest);
    if (url) URL.revokeObjectURL(url);
    cache.delete(oldest);
  }
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => { active += 1; task().then(resolve, reject).finally(() => { active -= 1; queue.shift()?.(); }); };
    if (active < 2) run(); else queue.push(run);
  });
}

async function decodeThumbnail(bytes: Uint8Array): Promise<string | null> {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!isPng || bytes.length > MAX_BYTES || typeof createImageBitmap !== 'function') return null;
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
  // Decode straight to thumbnail width where supported; otherwise decode full size and scale on the canvas.
  const bitmap = await createImageBitmap(blob, { resizeWidth: 360, resizeQuality: 'medium' }).catch(() => createImageBitmap(blob));
  const scale = Math.min(1, 360 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const thumbnail = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
  return thumbnail ? URL.createObjectURL(thumbnail) : null;
}

type ThumbnailLoader = (importId: string) => Promise<Blob>;
/** Set false after the API answers without the thumbnail route (an older server); then only decode locally. */
let serverThumbnails = true;

async function serverOrLocal(importId: string, load: Loader, thumbnail?: ThumbnailLoader): Promise<string | null> {
  if (thumbnail && serverThumbnails) {
    try { return URL.createObjectURL(await thumbnail(importId)); }
    catch (error) {
      const code = (error as { code?: string; status?: number })?.code;
      // A thumbnail-specific answer means this card has no usable image on the server either.
      if (code === 'THUMBNAIL_UNAVAILABLE') return null;
      if (code !== 'THUMBNAIL_BUSY') serverThumbnails = false;
    }
  }
  return decodeThumbnail(await load(importId));
}

function loadPortrait(importId: string, load: Loader, thumbnail?: ThumbnailLoader): Promise<string | null> {
  if (cache.has(importId)) return Promise.resolve(cache.get(importId) ?? null);
  const pending = inflight.get(importId);
  if (pending) return pending;
  const task = schedule(async () => {
    try { return await serverOrLocal(importId, load, thumbnail); } catch { return null; }
  }).then(url => { remember(importId, url); inflight.delete(importId); return url; });
  inflight.set(importId, task);
  return task;
}

export function CardPortrait({ name, importId, load, thumbnail, skip }: { name: string; importId: string; load: Loader; thumbnail?: ThumbnailLoader | undefined; skip?: boolean }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(() => cache.get(importId) ?? null);
  useEffect(() => {
    if (skip || cache.has(importId)) return;
    const element = frame.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void loadPortrait(importId, load, thumbnail).then(result => { if (alive) setUrl(result); });
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => { alive = false; observer.disconnect(); };
  }, [importId, load, thumbnail, skip]);
  return <span ref={frame} className="jx-scroll-frame" aria-hidden="true">
    {url ? <img src={url} alt="" decoding="async" /> : <Monogram name={name} className="jx-scroll-monogram" />}
  </span>;
}
