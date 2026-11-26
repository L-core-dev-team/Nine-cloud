import { useEffect, useState } from 'react';
import { readCardAvailability } from '../card-availability';

/**
 * Navigation-only view of card availability (G00). It asks the server only on
 * lobby-layer pages; reading and tool pages reuse the last known answer so they
 * make no extra requests. Unknown means the 角色卡 link stays hidden.
 */
let lastKnown: boolean | null = null;

export function useNavigationCardAvailability(shouldCheck: boolean): boolean {
  const [value, setValue] = useState<boolean | null>(lastKnown);
  useEffect(() => {
    if (!shouldCheck) return;
    const request = new AbortController();
    void readCardAvailability(request.signal).then(available => {
      if (request.signal.aborted) return;
      lastKnown = available;
      setValue(available);
    });
    return () => request.abort();
  }, [shouldCheck]);
  return (shouldCheck ? value : lastKnown) === true;
}
