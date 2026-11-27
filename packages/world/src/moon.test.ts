import { describe, expect, it } from 'vitest';
import { moonAtGameMinute, moonPhaseAtGameMinute, moonPhaseForAge, SYNODIC_MONTH_DAYS } from './moon.js';
import { PROLOGUE_PLACES } from './places.js';
import { sunAtGameMinute } from './sun.js';

const luhuadu = PROLOGUE_PLACES.loc_luhuadu;

describe('moon phase', () => {
  it('is dark at new moon and fully lit at full moon', () => {
    expect(moonPhaseForAge(0)).toMatchObject({ illuminatedFraction: 0, name: '朔', waxing: true });
    const full = moonPhaseForAge(SYNODIC_MONTH_DAYS / 2);
    expect(full.illuminatedFraction).toBeCloseTo(1, 12);
    expect(full.name).toBe('望');
    expect(moonPhaseForAge(SYNODIC_MONTH_DAYS / 4)).toMatchObject({ name: '上弦月' });
    expect(moonPhaseForAge(SYNODIC_MONTH_DAYS / 4).illuminatedFraction).toBeCloseTo(0.5, 12);
    expect(moonPhaseForAge((3 * SYNODIC_MONTH_DAYS) / 4)).toMatchObject({ name: '下弦月', waxing: false });
    expect(moonPhaseForAge(SYNODIC_MONTH_DAYS).ageDays).toBeCloseTo(0, 12);
  });

  it('advances with gameMinute from the epoch moon age', () => {
    const epoch = { yearDayOfDay0: 263, moonAgeAtDay0Days: 10 };
    expect(moonPhaseAtGameMinute(0, epoch).ageDays).toBe(10);
    expect(moonPhaseAtGameMinute(1440 * 5, epoch).ageDays).toBeCloseTo(15, 12);
  });
});

describe('moon position (presentation only)', () => {
  it('sits with the sun at new moon and opposite it at full moon', () => {
    const newMoon = { yearDayOfDay0: 263, moonAgeAtDay0Days: 0 };
    const m = moonAtGameMinute(0, luhuadu, newMoon);
    const s = sunAtGameMinute(0, luhuadu, newMoon);
    expect(m.altitudeDeg).toBeCloseTo(s.altitudeDeg, 6);
    expect(m.azimuthDeg).toBeCloseTo(s.azimuthDeg, 6);

    // Full moon at local midnight (standard 23:00): the moon culminates due south.
    const full = { yearDayOfDay0: 263, moonAgeAtDay0Days: SYNODIC_MONTH_DAYS / 2 - 23 / 24 };
    const midnight = moonAtGameMinute(23 * 60, luhuadu, full);
    expect(midnight.phase.illuminatedFraction).toBeCloseTo(1, 12);
    expect(midnight.azimuthDeg).toBeCloseTo(180, 1);
    expect(midnight.altitudeDeg).toBeGreaterThan(55);
  });
});
