import { describe, expect, it } from 'vitest';
import { estimateModelCost, getModelRate, MODEL_RATE_SNAPSHOT_DATE } from './ai-model-pricing';

describe('Bluebird price snapshot', () => {
  it('keeps the snapshot date explicit and separates current DeepSeek V4 Pro from Flash pricing', () => {
    expect(MODEL_RATE_SNAPSHOT_DATE).toBe('2026-09-28');
    expect(getModelRate('deepseek-v4-pro')).toMatchObject({ input: 1.32, output: 3.96, currency: 'USD' });
    expect(getModelRate('deepseek-v4-pro')?.input).not.toBe(getModelRate('deepseek-flash')?.input);
    expect(estimateModelCost('deepseek-v4-pro', 1000, 1000)?.amount).toBeCloseTo(0.00528);
  });

  it('uses the current Ark model ID and regular online inference rates', () => {
    expect(getModelRate('doubao-seed-2.1-pro')).toMatchObject({ input: 6, output: 30, currency: 'CNY' });
    expect(getModelRate('doubao-seed-2-1-pro-260915')).toBeUndefined();
  });

  it('uses the announced Gemini 3.8 Flash introductory rate only through 2026-12-31', () => {
    const beforeChange = Date.parse('2026-12-31T23:59:59+08:00');
    const afterChange = Date.parse('2027-01-01T00:00:00+08:00');
    expect(getModelRate('gemini-3.8-flash', beforeChange)).toMatchObject({ input: 0.75, output: 3.75 });
    expect(getModelRate('gemini-3.8-flash', afterChange)).toMatchObject({ input: 1.5, output: 7.5 });
  });

  it('rejects unknown prices rather than presenting a fabricated estimate', () => {
    expect(getModelRate('unlisted-model')).toBeUndefined();
    expect(estimateModelCost('unlisted-model', 1000, 1000)).toBeUndefined();
  });

  it('applies official GPT-6 long-context multipliers when one request exceeds 272K input tokens', () => {
    const short = estimateModelCost('gpt-6-sol', 272_000, 1000)!;
    const long = estimateModelCost('gpt-6-sol', 272_001, 1000)!;
    expect(short.amount).toBeCloseTo((272_000 * 2 + 1000 * 10) / 1_000_000);
    expect(long.amount).toBeCloseTo((272_001 * 4 + 1000 * 15) / 1_000_000);
    expect(long.note).toContain('长上下文倍率');
  });
});
