import { parentPort } from 'node:worker_threads';
import { CardError } from './parser.js';
import { renderThumbnailSync } from './thumbnail.js';

/** Worker side of ThumbnailRenderer: decode and encode off the API event loop. */
parentPort?.on('message', (message: { id: number; bytes: Uint8Array }) => {
  try {
    const data = renderThumbnailSync(message.bytes);
    parentPort?.postMessage({ id: message.id, ok: true, data }, [data.buffer as ArrayBuffer]);
  } catch (error) {
    const code = error instanceof CardError ? error.code : 'THUMBNAIL_UNAVAILABLE';
    const status = error instanceof CardError ? error.status : 404;
    parentPort?.postMessage({ id: message.id, ok: false, code, status });
  }
});
