import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleAfterFonts } from './GameShell';

describe('阅读位置 · 字体到达后再校正一次', () => {
  const original = (globalThis as { document?: unknown }).document;
  afterEach(() => { vi.useRealTimers(); (globalThis as { document?: unknown }).document = original; });

  it('re-applies the restore when fonts finish loading inside the window, then stops', () => {
    vi.useFakeTimers();
    const fonts = new EventTarget();
    (globalThis as { document?: unknown }).document = { fonts };
    const restore = vi.fn();
    settleAfterFonts(restore, 5000);
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(restore).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when the reading view unmounts', () => {
    const fonts = new EventTarget();
    (globalThis as { document?: unknown }).document = { fonts };
    const restore = vi.fn();
    const stop = settleAfterFonts(restore);
    stop();
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(restore).not.toHaveBeenCalled();
  });

  it('does nothing where the font loading API is missing', () => {
    (globalThis as { document?: unknown }).document = {};
    expect(() => settleAfterFonts(vi.fn())()).not.toThrow();
  });
});
