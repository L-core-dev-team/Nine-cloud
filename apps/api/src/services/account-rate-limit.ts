const buckets = new Map<string, number[]>();

/** SEC-08: in-memory per-account sliding window for expensive authenticated routes.
 *  Scope: single API instance. A multi-instance deployment must move this to a
 *  shared store (Redis/PostgreSQL) before horizontal scaling. */
export function consumeAccountQuota(key: string, action: string, limit: number, windowMs: number): boolean {
  if (!key.trim()) return false;
  const id = `${action}:${key}`;
  const now = Date.now();
  const hits = (buckets.get(id) ?? []).filter(time => now - time < windowMs);
  if (hits.length >= limit) { buckets.set(id, hits); return false; }
  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > 10_000) {
    for (const [idKey, times] of buckets) if (!times.some(time => now - time < windowMs)) buckets.delete(idKey);
  }
  return true;
}
