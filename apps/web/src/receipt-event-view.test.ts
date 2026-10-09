import { describe, expect, it } from 'vitest';
import type { TurnReceipt } from '@jiuxiao/contracts';
import { formatReceiptDelta, projectReceiptEvents } from './receipt-event-view';

function acceptedReceipt(): TurnReceipt {
  return {
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    saveId: 'save-1',
    requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
    branchId: 'root',
    rulesVersion: 'rules-v1',
    clockMinute: 15,
    rng: { seed: null, draws: 0 },
    decision: {
      status: 'accepted', outcome: 'success', nextRevision: 1,
      events: [
        {
          id: '11111111-1111-4111-8111-111111111111', saveId: 'save-1', branchId: 'root',
          type: 'PLAYER_MOVED', beforeRevision: 0, afterRevision: 1,
          occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: 'rules-v1',
          payload: {
            stateDelta: {
              timeChange: 15,
              locationChange: { before: 'gate-a', after: 'gate-b' },
              factChanges: [],
            },
          },
        },
        {
          id: '33333333-3333-4333-8333-333333333333', saveId: 'save-1', branchId: 'root',
          type: 'TRAIL_RECORDED', beforeRevision: 0, afterRevision: 1,
          occurredAt: '2026-10-05T12:00:00.000Z', source: 'RULES', ruleVersion: 'rules-v1',
          payload: { clueId: 'clue-trail' },
        },
      ],
    },
    resultingRevision: 1,
  };
}

describe('receipt event view', () => {
  it('binds each displayed delta to its event ID and resulting revision', () => {
    expect(projectReceiptEvents(acceptedReceipt())).toEqual([
      {
        eventId: '11111111-1111-4111-8111-111111111111',
        stateRevision: 1,
        eventType: 'PLAYER_MOVED',
        delta: {
          timeChange: 15,
          locationChange: { before: 'gate-a', after: 'gate-b' },
          factChanges: [],
        },
      },
      {
        eventId: '33333333-3333-4333-8333-333333333333',
        stateRevision: 1,
        eventType: 'TRAIL_RECORDED',
        delta: null,
      },
    ]);
  });

  it('does not present rejected or clarified decisions as committed state changes', () => {
    const rejected: TurnReceipt = {
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      saveId: 'save-1',
      requestFingerprint: `sha256:v1:${'a'.repeat(64)}`,
      branchId: 'root', rulesVersion: 'rules-v1', clockMinute: 0,
      rng: { seed: null, draws: 0 },
      decision: { status: 'rejected', code: 'INPUT_NO_SUCH_TARGET', message: 'target unavailable', revision: 0 },
      resultingRevision: 0,
    };
    expect(projectReceiptEvents(rejected)).toEqual([]);
    expect(projectReceiptEvents(undefined)).toEqual([]);
  });

  it('formats accepted deltas as readable, receipt-backed facts', () => {
    const event = projectReceiptEvents(acceptedReceipt())[0];
    expect(formatReceiptDelta(event?.delta ?? null)).toBe('耗时 15 分钟；地点：gate-a → gate-b');
    expect(formatReceiptDelta({
      timeChange: 15,
      locationChange: null,
      factChanges: [
        { key: 'gameMinute', before: { present: true, value: 300 }, after: { present: true, value: 315 } },
        { key: 'stamina', before: { present: true, value: 100 }, after: { present: true, value: 97 } },
        { key: 'clues', before: { present: true, value: [] }, after: { present: true, value: ['clue_ferry_stuck'] } },
      ],
    })).toBe('耗时 15 分钟；游戏分钟：300 → 315；体力：100 → 97；线索：无 → 渡口淤堵线索');
    expect(formatReceiptDelta(null)).toBeNull();
  });
});
