/** Author-only source evidence supplied to the publisher, never to the web bundle. */
export type SourceEvidence = {
  id: string;
  sha256: string;
  /** Read one local original at a time; callers should not preload the full image batch. */
  readBytes: () => Promise<Uint8Array>;
};

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function verifySources(sources: readonly SourceEvidence[]): Promise<Map<string, string>> {
  const verified = new Map<string, string>();
  for (const source of sources) {
    if (!source.id.trim() || !/^[a-f0-9]{64}$/i.test(source.sha256) || verified.has(source.id)) {
      throw new Error(`Invalid or repeated source ID: ${source.id}`);
    }
    const actual = await sha256(await source.readBytes());
    if (actual !== source.sha256.toLowerCase()) throw new Error(`Source hash mismatch: ${source.id}`);
    verified.set(source.id, actual);
  }
  return verified;
}
