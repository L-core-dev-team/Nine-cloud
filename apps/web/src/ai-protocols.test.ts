import { describe, expect, it } from 'vitest';
import { buildProbeRequest, parseProbeResponse, type ProtocolId } from './ai-protocols';
import { filterRouterModels, normalizeRouterModels } from './ai-model-inventory';

describe('protocol connection probes', () => {
  it.each([
    ['openai-chat', 'https://api.example/v1/chat/completions', 'Bearer secret'],
    ['openai-responses', 'https://api.example/v1/responses', 'Bearer secret'],
    ['anthropic-messages', 'https://api.example/v1/messages', 'secret'],
    ['gemini-content', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent', 'secret'],
  ] as const)('%s builds a protocol-specific request without query-string secrets', (protocol, url, secret) => {
    const request = buildProbeRequest(protocol, protocol === 'gemini-content' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.example/v1', 'gemini-x', 'secret');
    expect(request.url).toBe(url);
    expect(Object.values(request.headers).join(' ')).toContain(secret);
    expect(request.url).not.toContain(secret);
  });

  it('uses Anthropic-compatible probe parameters for adaptive-thinking models', () => {
    const request = buildProbeRequest('anthropic-messages', 'https://api.anthropic.com/v1', 'claude-opus-5-5', 'secret');
    expect(request.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 1024 });
    expect(request.body).not.toHaveProperty('temperature');
  });

  it.each([
    ['openai-chat', { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }],
    ['openai-responses', { output_text: 'ok', usage: { input_tokens: 2, output_tokens: 3 } }],
    ['anthropic-messages', { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 2, output_tokens: 3 } }],
    ['gemini-content', { candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 } }],
  ] as const)('%s parses text and usage', (protocol, payload) => {
    expect(parseProbeResponse(protocol as ProtocolId, payload)).toEqual({ text: 'ok', inputTokens: 2, outputTokens: 3 });
  });
});

describe('OpenRouter inventory snapshot', () => {
  it('converts per-token prices, removes expired/non-text entries and supports author filtering', () => {
    const now = Date.parse('2026-09-24T00:00:00Z');
    const models = normalizeRouterModels({ data: [
      { id: 'openai/gpt-x', name: 'GPT X', description: 'Reasoning and writing', context_length: 32000, created: 1780000000, pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { output_modalities: ['text'] } },
      { id: 'openai/old', expiration_date: '2026-09-01', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
      { id: 'vendor/image', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } },
    ] }, now);
    expect(models).toHaveLength(1);
    expect(models[0]!.inputUsdPerMillion).toBe(1);
    expect(models[0]!.outputUsdPerMillion).toBe(2);
    expect(filterRouterModels(models, 'writing', 'openai')).toHaveLength(1);
    expect(filterRouterModels(models, '', 'anthropic')).toHaveLength(0);
  });
});
