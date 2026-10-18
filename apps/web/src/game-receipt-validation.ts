import { ActionIntentSchema, TurnReceiptSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import type { GameCacheScope, PendingGameAction } from './cloud-game-cache';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
/** Mirrors the signed root-branch intent fingerprint; never decides or mutates a turn. */
export async function validateGameReceipt(scope: GameCacheScope, pending: PendingGameAction, save: SaveEnvelope, raw: unknown) {
  const receipt = TurnReceiptSchema.parse(raw);
  const intent = ActionIntentSchema.parse({ kind: 'free_text', saveId: scope.saveId, actorId: save.state.playerId,
    branchId: 'root', expectedRevision: pending.expectedRevision, idempotencyKey: pending.idempotencyKey,
    ...(pending.clarificationOf ? { clarificationOf: pending.clarificationOf } : {}), payload: { text: pending.text } });
  const { branchId: _root, ...fingerprintInput } = intent;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(fingerprintInput)));
  const fingerprint = 'sha256:v1:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (save.saveId !== scope.saveId || receipt.saveId !== scope.saveId || receipt.idempotencyKey !== pending.idempotencyKey
    || receipt.requestFingerprint !== fingerprint) throw Error('INVALID_GAME_RECEIPT');
  return receipt;
}
