import { describe, expect, it } from 'vitest';
import { sanitizeCallLogs } from './ai-call-logs';

const now = Date.parse('2026-09-30T12:00:00Z');
const valid = { at: new Date(now).toISOString(), role: '主剧情', model: 'example-model', elapsedMs: 12, outcome: 'success' };

describe('call log metadata boundary', () => {
  it('strips secrets, prompts, raw responses and unknown nested metadata', () => {
    const logs = sanitizeCallLogs([{ ...valid, apiKey: 'private-key', headers: { Authorization: 'Bearer private-key' },
      prompt: 'private-prompt', response: 'private-response', extra: { token: 'private-key' } }], 7, now);
    expect(logs).toEqual([valid]);
    expect(JSON.stringify(logs)).not.toContain('private-');
  });

  it('keeps valid zero usage and bounded HTTP/error metadata', () => {
    expect(sanitizeCallLogs([{ ...valid, inputTokens: 0, outputTokens: 3, status: 429, errorCode: 'HTTP_429' }], 7, now))
      .toEqual([{ ...valid, inputTokens: 0, outputTokens: 3, status: 429, errorCode: 'HTTP_429' }]);
  });

  it.each([-1, 0.5, '3', null, Infinity, Number.MAX_SAFE_INTEGER + 1])('discards invalid usage %s', value => {
    expect(sanitizeCallLogs([{ ...valid, inputTokens: value, outputTokens: value, status: 999, errorCode: 'server echoed private-key' }], 7, now))
      .toEqual([valid]);
  });

  it('expires old entries, rejects future dates, and keeps the exact cutoff', () => {
    const cutoff = now - 7 * 86_400_000;
    const at = (time: number) => ({ ...valid, at: new Date(time).toISOString() });
    expect(sanitizeCallLogs([at(cutoff - 1), at(now + 1), at(cutoff), valid], 7, now)).toEqual([at(cutoff), valid]);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 91])('does not retain logs for invalid or disabled retention %s', days => {
    expect(sanitizeCallLogs([valid], days, now)).toEqual([]);
  });

  it('retains the newest 200 records even when imported out of order', () => {
    const entries = Array.from({ length: 205 }, (_, i) => ({ ...valid, at: new Date(now - i).toISOString() }));
    const result = sanitizeCallLogs(entries, 1, now);
    expect(result).toHaveLength(200);
    expect(result[0]!.at).toBe(new Date(now - 199).toISOString());
    expect(result[199]).toEqual(valid);
  });

  it('rejects malformed containers and records', () => {
    expect(sanitizeCallLogs({ logs: [valid] }, 7, now)).toEqual([]);
    expect(sanitizeCallLogs([null, [], {}, { ...valid, at: 'invalid' }, { ...valid, elapsedMs: -1 }, { ...valid, outcome: 'unknown' }], 7, now)).toEqual([]);
  });
});
