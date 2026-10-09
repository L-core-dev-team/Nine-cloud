import type { ServerTurnResult } from '../services/server-turn.js';

type TurnHttpStatus = 200 | 400 | 404 | 409 | 503;

/** Shared HTTP mapping for every route that delegates to the one server turn transaction. */
export function serverTurnHttpResponse(result: ServerTurnResult): { status: TurnHttpStatus; body: unknown } {
  switch (result.status) {
    case 'not_found': return { status: 404, body: { code: 'NOT_FOUND' } };
    case 'client_archive': return { status: 400, body: { code: 'CLIENT_ARCHIVE_NOT_AUTHORITATIVE' } };
    case 'rules_not_ready': return { status: 503, body: { code: 'RULES_NOT_READY' } };
    case 'version_mismatch': return { status: 409, body: { code: 'VERSION_MISMATCH' } };
    case 'idempotency_conflict': return { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } };
    case 'clarification_conflict': return { status: 409, body: { code: 'CLARIFICATION_CONFLICT' } };
    case 'revision_conflict': return { status: 409, body: { code: 'REVISION_CONFLICT', currentRevision: result.currentRevision } };
    default: return { status: 200, body: result };
  }
}
