import { useEffect, useState } from 'react';
import { cloudRequest } from './cloud-sync';

/** Mounting capability, not authentication or a production release approval. */
export async function readCardAvailability(signal?: AbortSignal): Promise<boolean> {
  try {
    const value = await cloudRequest('/api/auth/providers', 'GET', undefined, undefined, signal, 4096);
    return !signal?.aborted && value.cardImport === true;
  } catch { return false; }
}

export function useCardAvailability(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let current: AbortController | undefined;
    const check = () => {
      current?.abort();
      const request = new AbortController(); current = request;
      // Keep a mounted session while revalidating; focus must not discard its draft.
      void readCardAvailability(request.signal).then(value => {
        if (!request.signal.aborted && current === request) setAvailable(value);
      });
    };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    check(); window.addEventListener('focus', check); document.addEventListener('visibilitychange', visible);
    return () => { current?.abort(); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return available;
}
