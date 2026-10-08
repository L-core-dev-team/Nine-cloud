export type SamplingParameters = {
  temperature?: number;
  topP?: number;
  topK?: number;
};

export type SamplingPolicy = {
  supported: Readonly<Record<keyof SamplingParameters, boolean>>;
  note: string | null;
};

const ALL_SUPPORTED = {
  temperature: true,
  topP: true,
  topK: true,
} as const;

const ALL_OMITTED = {
  temperature: false,
  topP: false,
  topK: false,
} as const;

const OMIT_SAMPLING_MODELS = new Set([
  'claude-opus-5-5',
  'claude-sonnet-5',
  'claude-sonnet-5-5',
  'gemini-3.8-flash',
]);

/**
 * Exact model-specific sampling restrictions verified against provider docs.
 * Unknown IDs remain editable; the runtime adapter must still validate them.
 */
export function modelSamplingPolicy(model: string): SamplingPolicy {
  const normalized = model.trim().toLowerCase();
  if (!OMIT_SAMPLING_MODELS.has(normalized)) {
    return { supported: ALL_SUPPORTED, note: null };
  }

  const note = normalized === 'gemini-3.8-flash'
    ? 'Gemini 3.8 Flash 要求移除这三项。下方保留的是未生效草案；接入请求时必须省略。'
    : '该 Claude 型号只接受采样默认值。下方保留的是未生效草案；接入请求时必须省略。';

  return { supported: ALL_OMITTED, note };
}

/** Remove only documented unsupported fields before building a provider request. */
export function filterSamplingParameters<T extends SamplingParameters>(model: string, params: T): Partial<T> {
  const { supported } = modelSamplingPolicy(model);
  const filtered: Partial<T> = {};
  if (supported.temperature && params.temperature !== undefined) filtered.temperature = params.temperature as T['temperature'];
  if (supported.topP && params.topP !== undefined) filtered.topP = params.topP as T['topP'];
  if (supported.topK && params.topK !== undefined) filtered.topK = params.topK as T['topK'];
  return filtered;
}
