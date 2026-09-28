/**
 * Manually reviewed direct-provider token prices used by the Bluebird estimate.
 * These are list prices, not account-specific quotes. See the dated source note
 * before treating an estimate as a budget or invoice.
 */
export type ModelRate = {
  input: number;
  output: number;
  currency: 'USD' | 'CNY';
  sourceUrl: string;
  note?: string;
};

export const MODEL_RATE_SNAPSHOT_DATE = '2026-09-28';

const DEEPSEEK_PRICING = 'https://api-docs.deepseek.com/quick_start/pricing/';
const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  'doubao-seed-2.1-pro': {
    input: 6, output: 30, currency: 'CNY',
    sourceUrl: 'https://docs.volcengine.com/docs/ark/model-pricing?lang=zh',
    note: '按方舟常规在线推理文本价（输入长度 0–1024K）；低优先级、低延迟、缓存和实际接入点可能采用其他计费档。',
  },
  'deepseek-flash': {
    input: 0.3, output: 1.2, currency: 'USD', sourceUrl: DEEPSEEK_PRICING,
    note: '按输入未命中缓存的峰时单价；非峰时更低。',
  },
  'deepseek-v4-pro': {
    input: 1.32, output: 3.96, currency: 'USD', sourceUrl: DEEPSEEK_PRICING,
    note: 'V4-Pro-0813 现行 ID；此估算采用峰时、缓存未命中的直连价。',
  },
  'qwen3.8-flash': {
    input: 0.8, output: 2.7, currency: 'CNY',
    sourceUrl: 'https://help.aliyun.com/en/model-studio/model-pricing',
    note: '中国大陆/北京标准文本档；其他地域和缓存命中价格可能不同。',
  },
  'qwen3.8-max': {
    input: 12, output: 36, currency: 'CNY',
    sourceUrl: 'https://help.aliyun.com/en/model-studio/model-pricing',
    note: '中国大陆/北京标准文本档；其他地域和缓存命中价格可能不同。',
  },
  'kimi-k3': {
    input: 3, output: 15, currency: 'USD',
    sourceUrl: 'https://platform.kimi.ai/',
    note: '按未命中缓存的输入单价；思考 token 计入输出用量，缓存另计。',
  },
  'gpt-6-astra': {
    input: 10, output: 50, currency: 'USD',
    sourceUrl: 'https://developers.openai.com/api/docs/pricing',
    note: '采用标准短上下文单价；输入超过 272K tokens 时按官方长上下文倍率估算。',
  },
  'gpt-6-sol': {
    input: 2, output: 10, currency: 'USD',
    sourceUrl: 'https://developers.openai.com/api/docs/pricing',
    note: '采用标准短上下文单价；输入超过 272K tokens 时按官方长上下文倍率估算。',
  },
  'gpt-6-luna': {
    input: 0.1, output: 0.5, currency: 'USD',
    sourceUrl: 'https://developers.openai.com/api/docs/pricing',
    note: '采用标准短上下文单价；输入超过 272K tokens 时按官方长上下文倍率估算。',
  },
  'claude-opus-5-5': {
    input: 4, output: 20, currency: 'USD',
    sourceUrl: 'https://platform.claude.com/docs/en/models/overview',
  },
  'claude-sonnet-5': {
    input: 2, output: 10, currency: 'USD',
    sourceUrl: 'https://platform.claude.com/docs/en/models/overview',
  },
  'gemini-3.8-flash': {
    input: 0.75, output: 3.75, currency: 'USD',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    note: '标准档促销价至 2026-12-31；之后按已公告标准价计。',
  },
};

export function getModelRate(model: string, now = Date.now()): ModelRate | undefined {
  const rate = MODEL_RATES[model];
  if (!rate) return undefined;
  if (model === 'gemini-3.8-flash' && now >= Date.parse('2027-01-01T00:00:00+08:00')) {
    return { ...rate, input: 1.5, output: 7.5, note: '标准档促销价已于 2026-12-31 结束。' };
  }
  return rate;
}

export function estimateModelCost(model: string, inputTokens: number, outputTokens: number, now = Date.now()) {
  const rate = getModelRate(model, now);
  if (!rate) return undefined;
  const input = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const output = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  return {
    currency: rate.currency,
    amount: (input * (rate.input * (input > 272_000 && model.startsWith('gpt-6-') ? 2 : 1))
      + output * (rate.output * (input > 272_000 && model.startsWith('gpt-6-') ? 1.5 : 1))) / 1_000_000,
    sourceUrl: rate.sourceUrl,
    note: input > 272_000 && model.startsWith('gpt-6-')
      ? `GPT-6 单次输入超过 272K tokens，已按长上下文倍率估算。${rate.note ? ` ${rate.note}` : ''}`
      : rate.note,
  };
}
