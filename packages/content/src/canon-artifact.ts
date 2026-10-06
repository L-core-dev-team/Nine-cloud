/**
 * Formats a SHA-256 digest for the exact public Canon artifact bytes.
 * The digest identifies save content only. It does not represent
 * `receiptsComplete`, an author signature, or authorization to publish.
 */
export function formatCanonArtifactHash(digest: Uint8Array): `sha256:${string}` {
  if (digest.byteLength !== 32) throw new TypeError('INVALID_CANON_ARTIFACT_DIGEST');
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}
