import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estimateModelCost, getModelRate, MODEL_RATE_SNAPSHOT_DATE, modelRateSnapshotStatus } from './ai-model-pricing';

describe('Bluebird price snapshot', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T00:00:00Z')); });
  afterEach(() => { vi.restoreAllMocks(); });
  it('keeps the snapshot date explicit and separates current DeepSeek V4 Pro from Flash pricing', () => {
    expect(MODEL_RATE_SNAPSHOT_DATE).toBe('2026-10-04');
    expect(getModelRate('deepseek-v4-pro')).toMatchObject({ input: 1.32, output: 3.96, currency: 'USD' });
    expect(getModelRate('deepseek-v4-pro')?.input).not.toBe(getModelRate('deepseek-flash')?.input);
    expect(getModelRate('deepseek-v4-pro')).toMatchObject({
      sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04', currency: 'USD',
      region: 'DeepSeek API 直连', unit: 'per 1M input/output tokens',
    });
    expect(estimateModelCost('deepseek-v4-pro', 1000, 1000)?.amount).toBeCloseTo(0.00528);
  });


  it('records provider, region and tier for a direct Ark quote', () => {
    expect(getModelRate('doubao-seed-2.1-pro')).toMatchObject({
      input: 6, output: 30, currency: 'CNY', sourceCategory: 'official-provider-price',
      verifiedOn: '2026-10-04', region: '火山方舟中国大陆在线服务',
      unit: 'per 1M input/output tokens',
    });
    expect(getModelRate('doubao-seed-2-1-pro-260915')).toBeUndefined();
  });

  it('rejects a snapshot at the 90-day boundary rather than projecting future prices', () => {
    const boundary = Date.parse('2027-01-02T00:00:00Z');
    const promotionEnd = Date.parse('2027-01-01T00:00:00Z');
    expect(getModelRate('gemini-3.8-flash', promotionEnd - 1)).toMatchObject({ input: 0.75, output: 3.75 });
    expect(getModelRate('gemini-3.8-flash', promotionEnd)).toBeUndefined();
    expect(modelRateSnapshotStatus(boundary)).toBe('expired');
    expect(getModelRate('gemini-3.8-flash', boundary)).toBeUndefined();
    expect(estimateModelCost('deepseek-flash', 1000, 1000, boundary)).toBeUndefined();
    expect(getModelRate('gemini-3.8-flash', Date.parse('2027-01-01T00:00:00Z'))).toBeUndefined();
    expect(modelRateSnapshotStatus(NaN)).toBe('invalid-clock');
    expect(getModelRate('deepseek-flash', Date.parse('2026-09-27T00:00:00Z'))).toBeUndefined();
  });

  it('rejects unknown prices rather than presenting a fabricated estimate', () => {
    expect(getModelRate('unlisted-model')).toBeUndefined();
    expect(estimateModelCost('unlisted-model', 1000, 1000)).toBeUndefined();
  });

  it('applies official GPT-6 long-context multipliers to the listed model IDs', () => {
    const short = estimateModelCost('gpt-6.1-sol', 272_000, 1000)!;
    expect(short.amount).toBeCloseTo((272_000 * 2 + 1000 * 10) / 1_000_000);
    for (const model of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna']) {
      const rate = getModelRate(model)!;
      const long = estimateModelCost(model, 272_001, 1000)!;
      expect(long.amount).toBeCloseTo((272_001 * rate.input * 2 + 1000 * rate.output * 1.5) / 1_000_000);
      expect(long.note).toContain('长上下文倍率');
    }
  });

  it('keeps the still-documented GPT-6 Sol price separate from GPT-6.1 Sol', () => {
    expect(getModelRate('gpt-6-sol')).toMatchObject({ input: 2, output: 10, sourceCategory: 'official-provider-price' });
    expect(getModelRate('gpt-6.1-sol')).toMatchObject({ input: 2, output: 10, sourceCategory: 'official-provider-price' });
  });
});
