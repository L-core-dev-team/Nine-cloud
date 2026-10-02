/** Limits untrusted JSON before it reaches a PostgreSQL jsonb column. */
export function isBoundedJson(value: unknown, maximumBytes = 256_000, maximumDepth = 32): boolean {
  const seen = new Set<object>();
  let visited = 0;
  function visit(current: unknown, depth: number): boolean {
    if (++visited > 20_000 || depth > maximumDepth) return false;
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return true;
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current !== 'object' || seen.has(current)) return false;
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) return false;
    seen.add(current);
    const values = Array.isArray(current) ? current : Object.values(current);
    if (!values.every(child => visit(child, depth + 1))) return false;
    seen.delete(current);
    return true;
  }
  try {
    return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).byteLength <= maximumBytes;
  } catch { return false; }
}
