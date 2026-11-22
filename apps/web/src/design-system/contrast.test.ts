import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// JX-UI-E-01 01-设计总纲 §4.5: recompute the documented contrast targets from the
// shipped token file, so a palette edit cannot silently drop below them.
const css = readFileSync(fileURLToPath(new URL('./tokens-v2.css', import.meta.url)), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--jx-c-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Missing primitive --jx-c-${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe('JX-UI-E-01 palette contrast', () => {
  const pairs: [string, string, string, number][] = [
    ['night reading body', 'yue-100', 'xuan-850', 10],
    ['night soft reading body', 'yue-200', 'xuan-850', 9],
    ['night title', 'yue-50', 'xuan-900', 7],
    ['night secondary', 'yue-300', 'xuan-850', 5],
    ['night muted on raised', 'yue-500', 'xuan-700', 4.5],
    ['night accent on canvas', 'jade-400', 'xuan-900', 4.5],
    ['night focus ring', 'jade-300', 'xuan-900', 4.5],
    ['night button text on jade', 'xuan-900', 'jade-400', 4.5],
    ['night ornament', 'gold-400', 'xuan-900', 3],
    ['paper reading body', 'mo-800', 'zhi-100', 10],
    ['paper secondary', 'mo-600', 'zhi-200', 5],
    ['paper muted', 'mo-500', 'zhi-200', 4.5],
    ['paper accent', 'jade-700', 'zhi-200', 4.5],
    ['paper focus ring', 'jade-700', 'zhi-200', 4.5],
    ['paper ornament', 'gold-700', 'zhi-200', 3],
    ['night danger', 'danger-night', 'xuan-700', 4.5],
    ['paper danger', 'danger-day', 'zhi-200', 4.5],
    ['night warning', 'warning-night', 'xuan-700', 4.5],
    ['paper warning', 'warning-day', 'zhi-200', 4.5],
    ['night success', 'success-night', 'xuan-700', 4.5],
    ['paper success', 'success-day', 'zhi-200', 4.5],
    ['night info', 'info-night', 'xuan-700', 4.5],
    ['paper info', 'info-day', 'zhi-200', 4.5],
  ];
  for (const [label, foreground, background, minimum] of pairs) {
    it(`${label} ≥ ${minimum}:1`, () => {
      expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(minimum);
    });
  }
  for (let index = 1; index <= 8; index += 1) {
    it(`speaker pigment ${index} is readable in both themes`, () => {
      expect(contrast(token(`pigment-${index}-night`), token('xuan-850'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(`pigment-${index}-day`), token('zhi-100'))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
