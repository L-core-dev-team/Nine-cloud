import { describe, expect, it } from 'vitest';
import { buildCardMessages } from './context.js';

describe('card context boundary', () => {
  it('keeps platform rules first and puts card instructions after the history as untrusted data', () => {
    const messages = buildCardMessages({ instructions: 'platform safety', character: { name: 'A', personality: 'kind', scenario: 'rain', mes_example: 'hello', system_prompt: 'format xyz', post_history_instructions: 'post' }, worldbooks: [{ position: 'before_char', content: 'before' }, { position: 'after_char', content: 'after' }], history: [{ action: 'old question', narrative: 'old answer' }], action: 'new question' });
    expect(messages[0]).toEqual({ role: 'system', content: 'platform safety' });
    expect(messages[1]?.content).toContain('kind');
    expect(messages[1]?.content).toContain('rain');
    expect(messages[1]?.content).toContain('hello');
    expect(messages[1]?.content).toContain('format xyz');
    expect(messages[1]?.content.indexOf('before')).toBeLessThan(messages[1]?.content.indexOf('after') ?? 0);
    expect(messages.slice(2).map(m => m.content)).toEqual(['old question', 'old answer', 'new question', '{"untrusted_card_post_history_instructions":"post"}']);
    expect(messages.filter(m => m.role === 'system')).toHaveLength(1);
  });
  it('rejects excessive output before dispatch', () => {
    expect(() => buildCardMessages({ instructions:'x', character:{description:'x'.repeat(100_001)}, worldbooks:[], history:[], action:'x' })).toThrow('CONTEXT_TOO_LARGE');
  });
});
