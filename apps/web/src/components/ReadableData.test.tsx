import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadableData } from './ReadableData';

describe('player-facing legacy data', () => {
  it('preserves zero, false, unknown fields and escapes supplied markup', () => {
    const html = renderToStaticMarkup(<ReadableData value={{ hp: 0, active: false, note: '<script>bad()</script>', missing: null }} />);
    expect(html).toContain('生命'); expect(html).toContain('>0<'); expect(html).toContain('>否<');
    expect(html).toContain('尚未记录'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  });
  it('bounds the entire wide tree and leaves the source intact', () => {
    const value = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => ({ note: 'entry' })));
    const before = JSON.stringify(value);
    const html = renderToStaticMarkup(<ReadableData value={value} />);
    expect((html.match(/entry/g) ?? []).length).toBeLessThan(250);
    expect(html).toContain('仅显示部分内容'); expect(JSON.stringify(value)).toBe(before);
  });
});
