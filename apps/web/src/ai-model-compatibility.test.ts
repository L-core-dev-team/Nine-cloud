import { describe, expect, it } from 'vitest';
import { filterSamplingParameters, modelSamplingPolicy } from './ai-model-compatibility';

describe('model-specific sampling compatibility', () => {
  it('keeps the controls available for models without a documented restriction', () => {
    expect(modelSamplingPolicy('deepseek-flash').supported).toEqual({ temperature: true, topP: true, topK: true });
    expect(filterSamplingParameters('gpt-6.1-sol', { temperature: 0.7, topP: 0.9, topK: 32 })).toEqual({ temperature: 0.7, topP: 0.9, topK: 32 });
  });

  it.each(['claude-opus-5-5', 'claude-sonnet-5', 'gemini-3.8-flash'])(
    'omits non-default sampling fields for documented restricted model %s', model => {
      expect(modelSamplingPolicy(model).supported).toEqual({ temperature: false, topP: false, topK: false });
      expect(filterSamplingParameters(model, { temperature: 0.72, topP: 0.9, topK: 32 })).toEqual({});
      expect(modelSamplingPolicy(model).note).toBeTruthy();
    },
  );

  it('normalizes case and surrounding whitespace without guessing unknown aliases', () => {
    expect(filterSamplingParameters(' Claude-Opus-5-5 ', { temperature: 0.7 })).toEqual({});
    expect(filterSamplingParameters('claude-opus-latest', { temperature: 0.7 })).toEqual({ temperature: 0.7 });
  });
});
