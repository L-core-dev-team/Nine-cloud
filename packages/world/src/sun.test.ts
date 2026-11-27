import { describe, expect, it } from 'vitest';
import { formatClock } from './calendar.js';
import { DEG } from './math.js';
import { PROLOGUE_PLACES } from './places.js';
import { OBLIQUITY_DEG, solarDeclinationRad, solarPosition, sunAtGameMinute, sunEventsForDay } from './sun.js';

const luhuadu = PROLOGUE_PLACES.loc_luhuadu;

describe('sun at 芦花渡 on the prologue epoch (day 0, yearDay 263)', () => {
  const events = sunEventsForDay(0, luhuadu);

  it('rises ≈ 05:00 and sets ≈ 17:00 standard time (exact values locked)', () => {
    expect(events.kind).toBe('normal');
    // 04:56:41 and 17:02:52 standard time; h0 = −0.833°, exact declination, no equation of time.
    expect(events.sunriseMinute).toBeCloseTo(296.682, 2);
    expect(events.sunsetMinute).toBeCloseTo(1022.861, 2);
    expect(formatClock(events.sunriseMinute ?? Number.NaN)).toBe('04:57');
    expect(formatClock(events.sunsetMinute ?? Number.NaN)).toBe('17:03');
    expect(events.dayLengthMinutes).toBeCloseTo(726.179, 2);
  });

  it('culminates at 11:00 standard (local apparent noon) at ≈ 60° altitude', () => {
    expect(events.solarNoonMinute).toBe(660);
    expect(events.noonAltitudeDeg).toBeCloseTo(59.6717, 3);
    const noon = sunAtGameMinute(660, luhuadu);
    expect(noon.azimuthDeg).toBeCloseTo(180, 9);
    expect(noon.altitudeDeg).toBeCloseTo(events.noonAltitudeDeg, 9);
  });

  it('uses azimuth clockwise from north: sunrise ≈ 90° (east), sunset ≈ 270° (west)', () => {
    expect(events.sunriseAzimuthDeg).toBeCloseTo(89.784, 2);
    expect(events.sunsetAzimuthDeg).toBeCloseTo(269.988, 2);
    const morning = sunAtGameMinute(8 * 60, luhuadu);
    expect(morning.azimuthDeg).toBeGreaterThan(90);
    expect(morning.azimuthDeg).toBeLessThan(180);
  });

  it('agrees with the rule 05:00 start and 17:00 dusk to within a few minutes', () => {
    expect(Math.abs((events.sunriseMinute ?? 0) - 300)).toBeLessThan(5);
    expect(Math.abs((events.sunsetMinute ?? 0) - 1020)).toBeLessThan(5);
    expect(sunAtGameMinute(300, luhuadu).altitudeDeg).toBeCloseTo(-0.1151, 3);
    expect(sunAtGameMinute(1020, luhuadu).altitudeDeg).toBeCloseTo(-0.2131, 3);
  });

  it('local apparent time is standard + 1 h at 15° east', () => {
    expect(solarPosition(263, 660, luhuadu).hourAngleDeg).toBe(0);
    expect(solarPosition(263, 660, { latitudeDeg: 30, longitudeOffsetDeg: 0 }).hourAngleDeg).toBeCloseTo(-15, 12);
  });
});

describe('seasonal and polar behaviour', () => {
  it('lengthens the day at the June solstice and handles polar day/night', () => {
    const solsticeEpoch = { yearDayOfDay0: 80 + 365.2422 / 4, moonAgeAtDay0Days: 0 };
    const summer = sunEventsForDay(0, luhuadu, solsticeEpoch);
    expect(summer.dayLengthMinutes).toBeGreaterThan(13.9 * 60);
    expect(summer.noonAltitudeDeg).toBeCloseTo(90 - 30 + OBLIQUITY_DEG, 1);
    expect(sunEventsForDay(0, { latitudeDeg: 80, longitudeOffsetDeg: 0 }, solsticeEpoch).kind).toBe('polar-day');
    expect(sunEventsForDay(0, { latitudeDeg: -80, longitudeOffsetDeg: 0 }, solsticeEpoch).kind).toBe('polar-night');
  });
});

/**
 * lab/astro.py ported verbatim: δ ≈ ε · sin λ (the shortcut this package replaces).
 * Reference values below were printed by running astro.py itself.
 */
function labDeclinationRad(dayOfYear: number): number {
  return OBLIQUITY_DEG * DEG * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365.2422);
}
function labAltitudeDeg(standardMinutes: number, dayOfYear: number, latDeg: number, lonDeg: number): number {
  const lat = latDeg * DEG;
  const dec = labDeclinationRad(dayOfYear);
  const H = ((standardMinutes / 60 + lonDeg / 15 - 12) * 15) * DEG;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)) / DEG;
}

describe('comparison with lab/astro.py', () => {
  const cases = [
    // [yearDay, minute, astro.py altitude, this package altitude]
    [263, 300, -0.07639196370642043, -0.0742789],
    [263, 660, 59.847215936787364, 59.8514421],
    [266, 300, -0.6808110839173396, -0.6620400],
    [266, 660, 58.638281683797565, 58.6758317],
    [125, 300, 8.109150775051447, 7.9926003],
    [125, 660, 76.38669588371569, 76.1462676],
  ] as const;

  it.each(cases)('yearDay %d minute %d: port reproduces astro.py and exact δ stays within 0.26°', (day, minute, lab, exact) => {
    expect(labAltitudeDeg(minute, day, 30, 15)).toBeCloseTo(lab, 9);
    const ours = solarPosition(day, minute, luhuadu).altitudeDeg;
    expect(ours).toBeCloseTo(exact, 6);
    expect(Math.abs(ours - lab)).toBeLessThan(0.26);
  });

  it('documents where the shortcut differs: ≈0 at equinox and solstice, max ≈0.256° near λ = 36°', () => {
    const gap = (day: number) => (labDeclinationRad(day) - solarDeclinationRad(day)) / DEG;
    expect(Math.abs(gap(80))).toBeLessThan(1e-12);
    expect(Math.abs(gap(80 + 365.2422 / 4))).toBeLessThan(1e-9);
    expect(gap(263)).toBeCloseTo(-0.0042, 4); // the doc's "δ ≈ −0.1°" holds for both
    expect(gap(80 + (36 / 360) * 365.2422)).toBeCloseTo(0.2560, 3);
    expect(gap(125)).toBeCloseTo(0.2404, 3);
  });
});
