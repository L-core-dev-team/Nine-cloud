import { describe, expect, it } from 'vitest';
import { CloudHttpError } from '../cloud-sync';
import { cloudGameDiagnostic, cloudGameErrorPlan } from './cloud-game-errors';

describe('cloud-game error recovery guidance', () => {
  it('keeps rules-not-ready and conflict outcomes distinct from unknown submission outcomes', () => {
    expect(cloudGameErrorPlan(new CloudHttpError(503, 'RULES_NOT_READY'))).toMatchObject({ next: 'reload', message: expect.stringContaining('没有结算') });
    expect(cloudGameErrorPlan(new CloudHttpError(409, 'REVISION_CONFLICT'))).toMatchObject({ next: 'reload', message: expect.stringContaining('最新修订') });
  });

  it('maps known server turn failures to player actions without showing internal codes', () => {
    for (const [error, next] of [
      [new CloudHttpError(409, 'IDEMPOTENCY_CONFLICT'), 'reload'],
      [new CloudHttpError(409, 'CLARIFICATION_CONFLICT'), 'reload'],
      [new CloudHttpError(409, 'VERSION_MISMATCH'), 'home'],
      [new CloudHttpError(400, 'INVALID_TURN'), 'edit'],
      [new CloudHttpError(413, 'REQUEST_TOO_LARGE'), 'edit'],
      [new CloudHttpError(429, 'RATE_LIMITED'), 'wait'],
    ] as const) {
      const plan = cloudGameErrorPlan(error);
      expect(plan.next).toBe(next);
      expect(plan.message).not.toContain(error.code!);
    }
  });

  it('uses one idempotent, no-narrative recovery action for outcomes that are genuinely unknown', () => {
    for (const error of [new CloudHttpError(503, 'TURN_UNAVAILABLE'), new TypeError('network disconnected'), new Error('INVALID_CLOUD_RESPONSE'), new DOMException('deadline', 'TimeoutError'), new SyntaxError('invalid response')]) {
      expect(cloudGameErrorPlan(error)).toMatchObject({ next: 'same-request', message: expect.stringContaining('核对本次结果') });
      expect(cloudGameErrorPlan(error).message).not.toMatch(/请求编号|TURN_UNAVAILABLE|INVALID_CLOUD_RESPONSE/);
    }
  });

  it('exposes only bounded error codes in collapsed diagnostics, never raw response details', () => {
    expect(cloudGameDiagnostic(new CloudHttpError(503, 'TURN_UNAVAILABLE'))).toBe('HTTP 503 · TURN_UNAVAILABLE');
    expect(cloudGameDiagnostic(new CloudHttpError(503, 'secret-provider-body'))).toBe('HTTP 503');
    expect(cloudGameDiagnostic(new Error('private provider response'))).not.toContain('private');
  });
});
