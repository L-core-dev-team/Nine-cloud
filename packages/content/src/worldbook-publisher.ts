import { sha256, verifySources, type SourceEvidence } from './source-register.js';

export type CanonReviewer = 'LYL' | 'Bird';
export type ReviewReceipt = {
  reviewer: CanonReviewer;
  decision: 'approved';
  contentSha256: string;
  reviewedAt: string;
};
export type CanonCandidate = {
  id: string;
  title: string;
  category: string;
  body: string;
  sourceIds: readonly string[];
  evidence: readonly ('source-confirmed' | 'context-restored' | 'authorized-completion')[];
  status: 'pending' | 'approved' | 'rejected';
  reviews: readonly ReviewReceipt[];
};
export type PublishedEntry = Omit<CanonCandidate, 'status' | 'reviews'> & { contentSha256: string };
export type CanonManifest = {
  canonVersion: string;
  entries: PublishedEntry[];
};

const unresolvedMarker = /⟦(?:疑似缺失|待确认)：|\[看不清|【待归属】/u;

/** The review digest binds content, evidence class, and exact source hashes. */
export async function digestCandidate(candidate: CanonCandidate, verifiedSources: ReadonlyMap<string, string>): Promise<string> {
  const sources = candidate.sourceIds.map(id => {
    const sourceHash = verifiedSources.get(id);
    if (!sourceHash) throw new Error(`Unverified source: ${id}`);
    return [id, sourceHash];
  });
  const bytes = new TextEncoder().encode(JSON.stringify([
    candidate.id, candidate.title, candidate.category, candidate.body, sources, candidate.evidence,
  ]));
  return sha256(bytes);
}

/**
 * Build-time gate for *new* Canon. Review receipts are traceable author
 * attestations, not cryptographic signatures or proof of the source's meaning.
 * Existing seven geography records are outside this gate until re-reviewed.
 */
export async function publishApprovedWorldbook(input: {
  canonVersion: string;
  candidates: readonly CanonCandidate[];
  sources: readonly SourceEvidence[];
}): Promise<CanonManifest> {
  if (!input.canonVersion.trim()) throw new Error('Canon version is required');
  const sources = await verifySources(input.sources);
  const seen = new Set<string>();
  const entries: PublishedEntry[] = [];
  for (const candidate of input.candidates) {
    if (!candidate.id.trim() || seen.has(candidate.id)) throw new Error(`Invalid or repeated Canon ID: ${candidate.id}`);
    seen.add(candidate.id);
    if (candidate.status !== 'approved') continue;
    if (!candidate.title.trim() || !candidate.category.trim() || !candidate.body.trim() || unresolvedMarker.test(`${candidate.title}\n${candidate.body}`)) {
      throw new Error(`Incomplete approved Canon entry: ${candidate.id}`);
    }
    if (!candidate.sourceIds.length || new Set(candidate.sourceIds).size !== candidate.sourceIds.length || !candidate.evidence.length) {
      throw new Error(`Missing or repeated provenance: ${candidate.id}`);
    }
    const contentSha256 = await digestCandidate(candidate, sources);
    for (const reviewer of ['LYL', 'Bird'] as const) {
      const receipts = candidate.reviews.filter(review => review.reviewer === reviewer);
      if (receipts.length !== 1 || receipts[0]?.decision !== 'approved'
        || receipts[0].contentSha256 !== contentSha256
        || !Number.isFinite(Date.parse(receipts[0].reviewedAt))) {
        throw new Error(`Missing or stale ${reviewer} review: ${candidate.id}`);
      }
    }
    if (candidate.reviews.length !== 2) throw new Error(`Unexpected review receipt: ${candidate.id}`);
    entries.push({ id: candidate.id, title: candidate.title, category: candidate.category,
      body: candidate.body, sourceIds: [...candidate.sourceIds], evidence: [...candidate.evidence], contentSha256 });
  }
  return { canonVersion: input.canonVersion, entries };
}
