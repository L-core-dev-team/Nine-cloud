import { describe, expect, it } from 'vitest';
import { createRandomStream, hashParts } from './random.js';
import { generateStarField, STAR_TEMPERATURE_MAX_K, STAR_TEMPERATURE_MIN_K, starHorizontal, temperatureToSrgb } from './stars.js';

describe('deterministic random streams', () => {
  it('hashes stably and separates part boundaries', () => {
    expect(hashParts(['a']).toString(16)).toBe('2753892a614e6925');
    expect(hashParts(['ab', 'c'])).not.toBe(hashParts(['a', 'bc']));
    expect(hashParts(['九霄'])).not.toBe(hashParts(['九', '霄']));
  });

  it('produces identical sequences for identical seeds and independent named substreams', () => {
    const a = createRandomStream('seed', 'starfield', 'k');
    const b = createRandomStream('seed', 'starfield', 'k');
    const seqA = Array.from({ length: 5 }, () => a.nextUint64());
    const seqB = Array.from({ length: 5 }, () => b.nextUint64());
    expect(seqA).toEqual(seqB);
    // A substream does not depend on how many numbers the parent already drew.
    expect(a.substream('x').nextFloat()).toBe(createRandomStream('seed', 'starfield', 'k').substream('x').nextFloat());
    expect(a.substream('x').nextFloat()).not.toBe(a.substream('y').nextFloat());
    const floats = Array.from({ length: 1000 }, () => a.nextFloat());
    expect(Math.min(...floats)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...floats)).toBeLessThan(1);
  });
});

describe('procedural star field', () => {
  const stars = generateStarField({ worldSeed: 'jiuxiao-prologue' });

  it('is deterministic for a seed and differs for another seed', () => {
    expect(generateStarField({ worldSeed: 'jiuxiao-prologue' })).toEqual(stars);
    const other = generateStarField({ worldSeed: 'jiuxiao-other' });
    expect(other).toHaveLength(stars.length);
    expect(other[0]?.rightAscensionRad).not.toBe(stars[0]?.rightAscensionRad);
    expect(other.filter((s, i) => s.magnitude === stars[i]?.magnitude)).toHaveLength(0);
  });

  it('has ~6000 naked-eye stars with a power-law magnitude histogram', () => {
    expect(stars).toHaveLength(6000);
    const mags = stars.map(s => s.magnitude);
    expect(Math.min(...mags)).toBeGreaterThanOrEqual(-1.5);
    expect(Math.max(...mags)).toBeLessThanOrEqual(6.5);
    const bins = new Map<number, number>();
    for (const m of mags) bins.set(Math.floor(m), (bins.get(Math.floor(m)) ?? 0) + 1);
    const n = (bin: number) => bins.get(bin) ?? 0;
    // N(<m) ∝ 10^(0.5 m): each full magnitude bin is ≈ 10^0.5 ≈ 3.16× the previous one.
    for (const bin of [3, 4, 5]) {
      const ratio = n(bin) / n(bin - 1);
      expect(ratio, `bin ${bin}`).toBeGreaterThan(2.5);
      expect(ratio, `bin ${bin}`).toBeLessThan(4);
    }
    expect(stars.filter(s => s.magnitude < 1).length).toBeLessThan(60);
    expect(stars.filter(s => s.magnitude >= 5).length).toBeGreaterThan(4000);
  });

  it('spreads stars uniformly over the sphere', () => {
    const north = stars.filter(s => s.declinationRad > 0).length;
    expect(north / stars.length).toBeGreaterThan(0.47);
    expect(north / stars.length).toBeLessThan(0.53);
    const polarCap = stars.filter(s => Math.sin(s.declinationRad) > 0.9).length; // 5% of the sphere
    expect(polarCap / stars.length).toBeGreaterThan(0.035);
    expect(polarCap / stars.length).toBeLessThan(0.065);
  });

  it('keeps colour temperatures in 3000–30000 K, skewed to cool stars', () => {
    const temps = stars.map(s => s.temperatureK).sort((x, y) => x - y);
    expect(temps[0]).toBeGreaterThanOrEqual(STAR_TEMPERATURE_MIN_K);
    expect(temps.at(-1)).toBeLessThanOrEqual(STAR_TEMPERATURE_MAX_K);
    const median = temps[Math.floor(temps.length / 2)] ?? 0;
    expect(median).toBeGreaterThan(4500);
    expect(median).toBeLessThan(6500);
  });

  it('maps temperature to plausible sRGB: red-orange → white → blue', () => {
    expect(temperatureToSrgb(3000)).toEqual([255, 184, 109]);
    expect(temperatureToSrgb(6500)).toEqual([255, 249, 254]);
    expect(temperatureToSrgb(30000)).toEqual([162, 187, 255]);
    for (const s of stars.slice(0, 50)) {
      for (const c of s.rgb) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });

  it('projects a star onto the local horizon', () => {
    const polaris = { ...stars[0]!, declinationRad: Math.PI / 2 };
    expect(starHorizontal(polaris, 1.234, 30).altitudeDeg).toBeCloseTo(30, 9);
  });
});
