import { createHash } from 'node:crypto';

const SIGNED_SCOPE = Object.freeze({
  commit: '61ca62e096fe9456f2e46c356a62284bde31f628',
  registrySha256: 'a22f4d0cd82c3de5a1ffb9c73928482677ddbd5b2e93664431c4c39828ebf19f',
  runtimeSha256: 'a65fc6e9b3e5c233407d7602180d51d372c5bb3159b0d8f99cc142f70eb4f8f2',
  evidence: Object.freeze({
    receipt: '8f2b00a71dd4bea7c935bd24684c6bf9428fdd95fb8c2f5047db30d040ef92bb',
    digests: '88d30d14421312f118a99b7f52a5c0e28c17e72032869b256220076698efd719',
    entries: 'a57faa529490f35448d88662e9bdf7adb04ab89d47d9c12bcc59182acfa0a1a9',
  }),
  counts: Object.freeze({ entries: 39, confirmed: 34, deprecated: 5 }),
});

const hash = value => createHash('sha256').update(value).digest('hex');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseEntryDigests(csv) {
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== 'canonId,status,reviewDigest') throw new Error('CANON_SIGNED_EVIDENCE_TAMPERED: unexpected entry digest header');
  return lines.map(line => {
    const parts = line.split(',');
    if (parts.length !== 3 || !parts[0] || !['confirmed', 'deprecated'].includes(parts[1]) || !/^[0-9a-f]{64}$/i.test(parts[2] ?? '')) {
      throw new Error('CANON_SIGNED_EVIDENCE_TAMPERED: malformed entry digest row');
    }
    return { id: parts[0], status: parts[1], reviewDigest: parts[2] };
  });
}

/**
 * Bind the immutable author receipt snapshot to the exact bytes a publisher
 * proposes to emit. A row-level match cannot override whole-file receipt scope.
 */
export function inspectCanonPublisherBinding(input) {
  if (!input || typeof input !== 'object' || typeof input.registryText !== 'string' || typeof input.runtimeText !== 'string') {
    throw new TypeError('Canon binding inputs are required');
  }
  for (const [name, expected] of Object.entries(SIGNED_SCOPE.evidence)) {
    if (typeof input.evidence?.[name] !== 'string' || hash(input.evidence[name]) !== expected) {
      throw new Error(`CANON_SIGNED_EVIDENCE_TAMPERED: ${name}`);
    }
  }

  let registry;
  let digestManifest;
  try {
    registry = JSON.parse(input.registryText);
    digestManifest = JSON.parse(input.evidence.digests);
  } catch {
    throw new Error('CANON_SIGNED_EVIDENCE_TAMPERED: invalid JSON');
  }
  const signedRows = parseEntryDigests(input.evidence.entries);
  if (signedRows.length !== SIGNED_SCOPE.counts.entries
    || signedRows.filter(row => row.status === 'confirmed').length !== SIGNED_SCOPE.counts.confirmed
    || signedRows.filter(row => row.status === 'deprecated').length !== SIGNED_SCOPE.counts.deprecated
    || digestManifest.gitHead !== SIGNED_SCOPE.commit
    || digestManifest.files?.['canon.registry.json']?.sha256 !== SIGNED_SCOPE.registrySha256
    || digestManifest.files?.['canon-runtime.json']?.sha256 !== SIGNED_SCOPE.runtimeSha256) {
    throw new Error('CANON_SIGNED_EVIDENCE_TAMPERED: signed scope does not match pinned receipt');
  }

  const currentEntries = Array.isArray(registry.entries) ? registry.entries : [];
  const currentRows = currentEntries.map(entry => ({
    id: entry.id,
    status: entry.status,
    reviewDigest: hash(stableJson(entry)),
  }));
  const rowDigestMatch = canonicalRows(currentRows) === canonicalRows(signedRows);
  const currentRegistrySha256 = hash(input.registryText);
  const currentRuntimeSha256 = hash(input.runtimeText);
  const registryHashMatch = currentRegistrySha256 === SIGNED_SCOPE.registrySha256;
  const runtimeHashMatch = currentRuntimeSha256 === SIGNED_SCOPE.runtimeSha256;
  const rowCountsMatch = currentEntries.length === SIGNED_SCOPE.counts.entries
    && currentEntries.filter(entry => entry.status === 'confirmed').length === SIGNED_SCOPE.counts.confirmed
    && currentEntries.filter(entry => entry.status === 'deprecated').length === SIGNED_SCOPE.counts.deprecated;
  return Object.freeze({
    signedCommit: SIGNED_SCOPE.commit,
    currentRegistrySha256,
    currentRuntimeSha256,
    registryHashMatch,
    runtimeHashMatch,
    rowCountsMatch,
    rowDigestMatch,
    publisherBound: registryHashMatch && runtimeHashMatch && rowCountsMatch && rowDigestMatch,
  });
}

export function assertCanonPublisherBinding(binding) {
  if (!binding?.publisherBound) {
    throw new Error('CANON_RECEIPTS_PENDING: current registry/runtime bytes are outside the signed publisher scope');
  }
}

function canonicalRows(rows) {
  return [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map(row => `${row.id}\0${row.status}\0${row.reviewDigest}`).join('\n');
}
