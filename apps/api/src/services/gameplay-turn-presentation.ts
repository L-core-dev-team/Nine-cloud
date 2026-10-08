import { randomUUID } from 'node:crypto';
import { SaveEnvelopeSchema, TurnReceiptSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import type { Pool } from 'pg';
import { buildP1NarrativeHints, ensureP1NarrativeHints } from './p1-narrative-hints.js';
import type { NarrativeContext } from './narrative-scheduler.js';

type RuleVersions = { ruleVersion: string; canonVersion: string; memoryPolicyVersion: string };
type DeterministicNarrative = (receipt: TurnReceipt, context: NarrativeContext) => string | Promise<string>;
type PresentationRow = {
  result: unknown | null;
  narrative_status: string | null;
};

export type NarrativeRetryResult =
  | { status: 'accepted'; duplicate: true; receipt: TurnReceipt; narrative: { status: 'received'; text: string; source: 'deterministic' } }
  | { status: 'not_found' | 'client_archive' | 'rules_not_ready' | 'version_mismatch' | 'narrative_unavailable' }
  | { status: 'revision_conflict'; currentRevision: number };

/** Read-only receipt restoration and deterministic presentation; never evaluates or commits an action. */
export class GameplayTurnPresentationService {
  constructor(
    private readonly pool: Pool,
    private readonly readSave: (ownerId: string, saveId: string) => Promise<SaveEnvelope | null>,
    private readonly ruleVersions?: RuleVersions,
    private readonly deterministicNarrative?: DeterministicNarrative,
  ) {}

  async latestReceipt(ownerId: string, saveId: string): Promise<
    | { status: 'ready'; receipt: TurnReceipt | null; narrativeStatus: string | null }
    | { status: 'not_found' | 'client_archive' }
  > {
    assertIdentity(ownerId, saveId);
    const save = await this.readSave(ownerId, saveId);
    if (!save) return { status: 'not_found' };
    const current = SaveEnvelopeSchema.parse(save);
    if (current.state.facts.archiveKind === 'local-untrusted-v1') return { status: 'client_archive' };
    const result = await this.pool.query<PresentationRow>(
      `SELECT r.result, r.narrative_status FROM game_saves s
      LEFT JOIN LATERAL (
        SELECT result, narrative_status FROM turn_requests
        WHERE save_id = s.id AND result IS NOT NULL
        ORDER BY created_at DESC, idempotency_key DESC LIMIT 1
      ) r ON true
      WHERE s.id = $1 AND s.owner_id = $2
        AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = s.id)
      LIMIT 1`,
      [saveId, ownerId],
    );
    const row = result.rows[0];
    if (!row) return { status: 'not_found' };
    return {
      status: 'ready',
      receipt: row.result === null ? null : TurnReceiptSchema.parse(row.result),
      narrativeStatus: row.narrative_status,
    };
  }

  async retryNarrative(ownerId: string, saveId: string, requestId: string): Promise<NarrativeRetryResult> {
    assertIdentity(ownerId, saveId);
    if (!this.ruleVersions || !this.deterministicNarrative) return { status: 'rules_not_ready' };
    const rawSave = await this.readSave(ownerId, saveId);
    if (!rawSave) return { status: 'not_found' };
    const save = SaveEnvelopeSchema.parse(rawSave);
    if (save.state.facts.archiveKind === 'local-untrusted-v1') return { status: 'client_archive' };
    const result = await this.pool.query<PresentationRow>(
      `SELECT r.result, r.narrative_status
      FROM game_saves s
      JOIN turn_requests r ON r.save_id = s.id AND r.idempotency_key = $3 AND r.result IS NOT NULL
      WHERE s.id = $1 AND s.owner_id = $2
        AND NOT EXISTS (SELECT 1 FROM cloud_archive_trash t WHERE t.save_id = s.id)
      LIMIT 1`,
      [saveId, ownerId, requestId],
    );
    const row = result.rows[0];
    if (!row) return { status: 'not_found' };
    if (save.ruleVersion !== this.ruleVersions.ruleVersion || save.canonVersion !== this.ruleVersions.canonVersion ||
        save.memoryPolicyVersion !== this.ruleVersions.memoryPolicyVersion) {
      return { status: 'version_mismatch' };
    }
    const receipt = TurnReceiptSchema.parse(row.result);
    if (receipt.decision.status !== 'accepted') return { status: 'not_found' };
    if (receipt.resultingRevision !== save.revision) return { status: 'revision_conflict', currentRevision: save.revision };

    const attemptId = randomUUID();
    if (!await this.recordNarrativeStatus(ownerId, saveId, requestId, attemptId, 'generating', save.revision)) {
      return { status: 'revision_conflict', currentRevision: await this.readRevision(ownerId, saveId) ?? save.revision };
    }
    try {
      const context: NarrativeContext = { npcMemories: [], ...buildP1NarrativeHints(receipt, save) };
      const raw = await this.deterministicNarrative(structuredClone(receipt), structuredClone(context));
      if (typeof raw !== 'string' || !raw.trim() || raw.length > 100_000) throw new Error('INVALID_NARRATIVE');
      const text = ensureP1NarrativeHints(raw, receipt, context);
      if (!await this.recordNarrativeStatus(ownerId, saveId, requestId, attemptId, 'received', save.revision)) {
        return { status: 'revision_conflict', currentRevision: await this.readRevision(ownerId, saveId) ?? save.revision };
      }
      return { status: 'accepted', duplicate: true, receipt, narrative: { status: 'received', text, source: 'deterministic' } };
    } catch {
      await this.recordNarrativeStatus(ownerId, saveId, requestId, attemptId, 'unavailable', save.revision);
      return { status: 'narrative_unavailable' };
    }
  }

  private async recordNarrativeStatus(ownerId: string, saveId: string, requestId: string, attemptId: string,
    status: 'generating' | 'received' | 'unavailable', revision: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE turn_requests r SET narrative_attempt_id = $4, narrative_status = $5, narrative_updated_at = now()
      FROM game_saves s WHERE r.save_id = s.id AND s.id = $2 AND s.owner_id = $1
        AND r.idempotency_key = $3 AND r.result IS NOT NULL AND s.revision = $6
        AND (r.result->>'resultingRevision')::integer = $6
        AND ($5 = 'generating' OR r.narrative_attempt_id = $4)`,
      [ownerId, saveId, requestId, attemptId, status, revision],
    );
    return result.rowCount === 1;
  }

  private async readRevision(ownerId: string, saveId: string): Promise<number | null> {
    const result = await this.pool.query<{ revision: number }>(
      'SELECT revision FROM game_saves WHERE id = $1 AND owner_id = $2', [saveId, ownerId],
    );
    return result.rows[0]?.revision ?? null;
  }
}

function assertIdentity(ownerId: string, saveId: string): void {
  if (!ownerId.trim() || ownerId.length > 200 || !saveId.trim() || saveId.length > 200) {
    throw new TypeError('Authenticated owner and save identity are required');
  }
}
