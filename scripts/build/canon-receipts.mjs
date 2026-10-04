const REVIEWERS = ['LYL', 'Bird'];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Fail-closed validation shared by the Canon publisher and its focused tests.
 * Digests bind each reviewer decision to the exact public content bytes.
 */
export function assertCanonReceiptsComplete(entries, manifest, activeVersion, digestForEntry) {
  const pending = message => { throw new Error(`CANON_RECEIPTS_PENDING: ${message}`); };
  if (!Array.isArray(entries) || entries.length === 0 || !manifest || typeof manifest !== 'object'
    || manifest.canonVersion !== activeVersion || !Array.isArray(manifest.entries)
    || typeof digestForEntry !== 'function') {
    pending('receipt manifest is missing or does not match the active Canon version');
  }

  const receiptsById = new Map();
  for (const item of manifest.entries) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()
      || receiptsById.has(item.id) || !SHA256_PATTERN.test(item.contentSha256)
      || !Array.isArray(item.reviews)) {
      pending('receipt entries are malformed or duplicated');
    }
    receiptsById.set(item.id, item);
  }

  if (receiptsById.size !== entries.length || entries.some(entry => !receiptsById.has(entry.id))) {
    pending('receipt entry IDs do not exactly match the confirmed Canon entries');
  }

  for (const entry of entries) {
    const receipt = receiptsById.get(entry.id);
    const digest = digestForEntry(entry);
    if (!SHA256_PATTERN.test(digest) || receipt.contentSha256 !== digest) {
      pending(`content digest does not match for ${entry.id}`);
    }
    for (const reviewer of REVIEWERS) {
      const reviews = receipt.reviews.filter(review => review?.reviewer === reviewer);
      if (reviews.length !== 1) pending(`${reviewer} review is missing or duplicated for ${entry.id}`);
      const [review] = reviews;
      if (review.decision !== 'approved' || review.contentSha256 !== digest
        || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt))) {
        pending(`${reviewer} review does not approve the current content digest for ${entry.id}`);
      }
    }
  }
}
