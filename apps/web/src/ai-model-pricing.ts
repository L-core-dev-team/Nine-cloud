/**
 * Manually reviewed direct-provider token prices used by the Bluebird estimate.
 * These are list prices, not account-specific quotes. Model-specific region,
 * tier, source class, verification date, and earlier expiry are recorded below.
 */
export type ModelRate = {
  input: number;
  output: number;
  currency: 'USD' | 'CNY';
  sourceUrl: string;
  sourceCategory: 'official-provider-price';
  verifiedOn: string;
  region: string;
  billingTier: string;
  unit: 'per 1M input/output tokens';
  /** Exclusive UTC cutoff for an announced price change, if earlier than snapshot expiry. */
  validUntil?: string;
  note?: string;
};

export const MODEL_RATE_SNAPSHOT_DATE = '2026-10-05';
export const MODEL_RATE_VALID_UNTIL = '2027-01-03';
const snapshotAt = Date.parse(`${MODEL_RATE_SNAPSHOT_DATE}T00:00:00Z`);
const expiresAt = Date.parse(`${MODEL_RATE_VALID_UNTIL}T00:00:00Z`);

export function modelRateSnapshotStatus(now = Date.now()): 'current' | 'expired' | 'invalid-clock' {
  if (!Number.isFinite(now) || now < snapshotAt) return 'invalid-clock';
  return now >= expiresAt ? 'expired' : 'current';
}

const DEEPSEEK_PRICING = 'https://api-docs.deepseek.com/quick_start/pricing/';
const ARK_PRICING = 'https://docs.volcengine.com/docs/ark/model-pricing?lang=zh';
const ALIBABA_PRICING = 'https://help.aliyun.com/en/model-studio/model-pricing';
const OPENAI_PRICING = 'https://developers.openai.com/api/docs/pricing';
const ANTHROPIC_PRICING = 'https://platform.claude.com/docs/en/about-claude/pricing';
const GEMINI_PRICING = 'https://ai.google.dev/gemini-api/docs/pricing';
const KIMI_PRICING = 'https://platform.kimi.ai/';
const GPT_6_LONG_CONTEXT_MODELS = new Set(['gpt-6-astra', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna']);

const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  'doubao-seed-2.1-pro': {
    input: 6, output: 30, currency: 'CNY',
    sourceUrl: ARK_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: '火山方舟中国大陆在线服务', billingTier: '标准在线文本档；输入长度 0–1024K；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '缓存、低优先级、低延迟和其他接入区域可能采用不同计费档。',
  },
  'deepseek-flash': {
    input: 0.3, output: 1.2, currency: 'USD', sourceUrl: DEEPSEEK_PRICING,
    sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04', region: 'DeepSeek API 直连',
    billingTier: '峰时；输入未命中缓存；输出标准价', unit: 'per 1M input/output tokens',
    note: '非峰时、缓存命中价格更低。',
  },
  'deepseek-v4-pro': {
    input: 1.32, output: 3.96, currency: 'USD', sourceUrl: DEEPSEEK_PRICING,
    sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04', region: 'DeepSeek API 直连',
    billingTier: '峰时；输入未命中缓存；输出标准价', unit: 'per 1M input/output tokens',
    note: '当前版本 V4-Pro-0813；非峰时和缓存命中价格更低。',
  },
  'qwen3.8-flash': {
    input: 0.8, output: 2.7, currency: 'CNY',
    sourceUrl: ALIBABA_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'Global deployment tier', billingTier: '标准在线文本档；单次输入不超过 1M tokens；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '国际区域、缓存命中与接入端点价格可能不同。',
  },
  'qwen3.8-max': {
    input: 12, output: 36, currency: 'CNY',
    sourceUrl: ALIBABA_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'Global deployment tier', billingTier: '标准在线文本档；单次输入不超过 1M tokens；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '国际区域、缓存命中与接入端点价格可能不同。',
  },
  'kimi-k3': {
    input: 3, output: 15, currency: 'USD',
    sourceUrl: KIMI_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'Kimi API 直连', billingTier: '标准文本输入/输出；不含缓存',
    unit: 'per 1M input/output tokens', note: '缓存命中和缓存写入另计。',
  },
  'gpt-6-astra': {
    input: 10, output: 50, currency: 'USD',
    sourceUrl: OPENAI_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'OpenAI API 标准端点', billingTier: 'Standard；短上下文（输入不超过 272K）；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '输入超过 272K tokens 时按官方长上下文档估算。',
  },
'gpt-6-sol': {
    input: 2, output: 10, currency: 'USD',
    sourceUrl: OPENAI_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'OpenAI API 标准端点', billingTier: 'Standard；短上下文（输入不超过 272K）；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '仍有官方文档与 API 支持；输入超过 272K tokens 时按官方长上下文档估算。',
  },
  'gpt-6.1-sol': {
    input: 2, output: 10, currency: 'USD',
    sourceUrl: OPENAI_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'OpenAI API 标准端点', billingTier: 'Standard；短上下文（输入不超过 272K）；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '输入超过 272K tokens 时按官方长上下文档估算。',
  },
  'gpt-6-luna': {
    input: 0.1, output: 0.5, currency: 'USD',
    sourceUrl: OPENAI_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'OpenAI API 标准端点', billingTier: 'Standard；短上下文（输入不超过 272K）；未命中缓存',
    unit: 'per 1M input/output tokens',
    note: '输入超过 272K tokens 时按官方长上下文档估算。',
  },
  'claude-opus-5-5': {
    input: 4, output: 20, currency: 'USD',
    sourceUrl: ANTHROPIC_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'Claude API 全球端点', billingTier: '标准输入/输出；不含 prompt cache 与 Batch API',
    unit: 'per 1M input/output tokens',
  },
  'claude-sonnet-5': {
    input: 2, output: 10, currency: 'USD',
    sourceUrl: ANTHROPIC_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'Claude API 全球端点', billingTier: '标准输入/输出；不含 prompt cache 与 Batch API',
    unit: 'per 1M input/output tokens',
  },
  'claude-sonnet-5-5': {
    input: 2, output: 10, currency: 'USD',
    sourceUrl: 'https://platform.claude.com/docs/en/models/sonnet-5-5/overview',
    sourceCategory: 'official-provider-price', verifiedOn: '2026-10-05',
    region: 'Claude API 全球端点', billingTier: '标准输入/输出；不含 prompt cache 与 Batch API',
    unit: 'per 1M input/output tokens',
    note: '官方型号页列示 1M 上下文与 128K 最大输出；缓存和 Batch API 采用不同费率。',
  },
  'gemini-3.8-flash': {
    input: 0.75, output: 3.75, currency: 'USD',
    sourceUrl: GEMINI_PRICING, sourceCategory: 'official-provider-price', verifiedOn: '2026-10-04',
    region: 'Google Gemini Developer API', billingTier: 'Paid Standard；不含 cache、grounding 或批处理',
    unit: 'per 1M input/output tokens', validUntil: '2027-01-01T00:00:00Z',
    note: '促销价有效至 2026-12-31；次日起改价，届时停止此项估算。',
  },
};

export function getModelRate(model: string, now = Date.now()): ModelRate | undefined {
  if (modelRateSnapshotStatus(now) !== 'current') return undefined;
  const rate = MODEL_RATES[model];
  if (!rate) return undefined;
  if (rate.validUntil && now >= Date.parse(rate.validUntil)) return undefined;
  return rate;
}

export function estimateModelCost(model: string, inputTokens: number, outputTokens: number, now = Date.now()) {
  const rate = getModelRate(model, now);
  if (!rate) return undefined;
  const input = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const output = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  const longContext = input > 272_000 && GPT_6_LONG_CONTEXT_MODELS.has(model);
  return {
    currency: rate.currency,
    amount: (input * (rate.input * (longContext ? 2 : 1))
      + output * (rate.output * (longContext ? 1.5 : 1))) / 1_000_000,
    sourceUrl: rate.sourceUrl,
    note: longContext
      ? `GPT-6 单次输入超过 272K tokens，已按长上下文倍率估算。${rate.note ? ` ${rate.note}` : ''}`
      : rate.note,
  };
}
