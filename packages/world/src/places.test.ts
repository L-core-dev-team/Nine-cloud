import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceLi, offsetByBearing, PROLOGUE_PLACES } from './places.js';
import { localApparentMinutes } from './sun.js';

describe('prologue places', () => {
  const { loc_luhuadu: luhuadu, loc_wangqitai: wangqitai, loc_zheguiping: zheguiping } = PROLOGUE_PLACES;

  it('puts 芦花渡 at 30°N, 15° east of the standard meridian (+1 h local apparent time)', () => {
    expect(luhuadu.latitudeDeg).toBe(30);
    expect(luhuadu.longitudeOffsetDeg).toBe(15);
    expect(localApparentMinutes(300, luhuadu)).toBe(360);
  });

  it('puts 望气台 3 里 southwest of 芦花渡', () => {
    const derived = offsetByBearing(luhuadu, 225, 3);
    expect(wangqitai.latitudeDeg).toBeCloseTo(derived.latitudeDeg, 6);
    expect(wangqitai.longitudeOffsetDeg).toBeCloseTo(derived.longitudeOffsetDeg, 6);
    expect(distanceLi(luhuadu, wangqitai)).toBeCloseTo(3, 3);
    expect(bearingDeg(luhuadu, wangqitai)).toBeCloseTo(225, 2);
  });

  it('puts 折桂坪 1 里 due north of 望气台, still southwest of the ferry', () => {
    const derived = offsetByBearing(wangqitai, 0, 1);
    expect(zheguiping.latitudeDeg).toBeCloseTo(derived.latitudeDeg, 6);
    expect(zheguiping.longitudeOffsetDeg).toBe(wangqitai.longitudeOffsetDeg);
    expect(distanceLi(wangqitai, zheguiping)).toBeCloseTo(1, 3);
    const towardFerry = bearingDeg(zheguiping, luhuadu);
    expect(towardFerry).toBeGreaterThan(0);
    expect(towardFerry).toBeLessThan(90);
  });
});
