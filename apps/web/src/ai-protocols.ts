export type ProtocolId = 'openai-chat' | 'openai-responses' | 'anthropic-messages' | 'gemini-content';

export const protocolLabels: Record<ProtocolId, string> = {
  'openai-chat': 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
  'anthropic-messages': 'Anthropic Messages',
  'gemini-content': 'Gemini generateContent',
};

export type ProbeRequest = { url: string; headers: Record<string, string>; body: unknown };
const cleanBase = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');
const ensureV1 = (base: string) => /\/v\d+(beta)?$/i.test(base) ? base : `${base}/v1`;
const endpointRoot = (base: string) => base.replace(/\/(chat\/completions|responses|messages)$/i, '');

export function buildProbeRequest(protocol: ProtocolId, baseUrl: string, model: string, apiKey: string): ProbeRequest {
  const base = endpointRoot(cleanBase(baseUrl));
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (protocol === 'openai-chat') {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return { url: `${ensureV1(base)}/chat/completions`, headers, body: { model, messages: [{ role: 'user', content: '请仅回复：通路已通' }], temperature: 0, max_tokens: 24, stream: false } };
  }
  if (protocol === 'openai-responses') {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return { url: `${ensureV1(base)}/responses`, headers, body: { model, input: '请仅回复：通路已通', max_output_tokens: 24, store: false } };
  }
  if (protocol === 'anthropic-messages') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    // Claude models with adaptive thinking may reject temperature and need room for internal reasoning.
    return { url: `${ensureV1(base)}/messages`, headers, body: { model, max_tokens: 1024, messages: [{ role: 'user', content: '请仅回复：通路已通' }] } };
  }
  if (apiKey) headers['x-goog-api-key'] = apiKey;
  const root = base.replace(/\/v1beta$/i, '').replace(/\/v1$/i, '');
  return { url: `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers, body: { contents: [{ role: 'user', parts: [{ text: '请仅回复：通路已通' }] }], generationConfig: { maxOutputTokens: 24, temperature: 0 } } };
}

function textFromParts(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map(part => {
    if (typeof part === 'string') return part;
    if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
      return (part as Record<string, unknown>).text as string;
    }
    return '';
  }).join('');
}

export function parseProbeResponse(protocol: ProtocolId, payload: unknown): { text: string; inputTokens?: number | undefined; outputTokens?: number | undefined } {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (protocol === 'openai-chat') {
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
    const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {};
    const usage = body.usage && typeof body.usage === 'object' ? body.usage as Record<string, unknown> : {};
    return { text: textFromParts(message.content), inputTokens: numberOrUndefined(usage.prompt_tokens), outputTokens: numberOrUndefined(usage.completion_tokens) };
  }
  if (protocol === 'openai-responses') {
    const usage = body.usage && typeof body.usage === 'object' ? body.usage as Record<string, unknown> : {};
    const output = Array.isArray(body.output) ? body.output : [];
    const text = textFromParts(output.flatMap(item => item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : []));
    return { text: typeof body.output_text === 'string' ? body.output_text : text, inputTokens: numberOrUndefined(usage.input_tokens), outputTokens: numberOrUndefined(usage.output_tokens) };
  }
  if (protocol === 'anthropic-messages') {
    const usage = body.usage && typeof body.usage === 'object' ? body.usage as Record<string, unknown> : {};
    const content = Array.isArray(body.content) ? body.content : [];
    const text = textFromParts(content);
    return { text, inputTokens: numberOrUndefined(usage.input_tokens), outputTokens: numberOrUndefined(usage.output_tokens) };
  }
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const first = candidates[0] && typeof candidates[0] === 'object' ? candidates[0] as Record<string, unknown> : {};
  const content = first.content && typeof first.content === 'object' ? first.content as Record<string, unknown> : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const usage = body.usageMetadata && typeof body.usageMetadata === 'object' ? body.usageMetadata as Record<string, unknown> : {};
  return { text: textFromParts(parts), inputTokens: numberOrUndefined(usage.promptTokenCount), outputTokens: numberOrUndefined(usage.candidatesTokenCount) };
}

function numberOrUndefined(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
