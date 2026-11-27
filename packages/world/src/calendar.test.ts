import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatClock,
  PROLOGUE_EPOCH,
  RULE_TIME_GRID,
  SOLAR_TERMS,
  shichenForMinute,
  solarTermForYearDay,
  worldTimeAt,
} from './calendar.js';

const ruleConstantsUrl = new URL('../../content/src/rules/prologue-v1.constants.ts', import.meta.url);

describe('rule time grid mirror', () => {
  it('matches the frozen prologue constants verbatim (read-only source check)', () => {
    const source = readFileSync(ruleConstantsUrl, 'utf8');
    for (const [name, value] of Object.entries(RULE_TIME_GRID)) {
      const match = new RegExp(`\\b${name}:\\s*([0-9_]+),`).exec(source);
      expect(match, name).not.toBeNull();
      expect(Number((match?.[1] ?? '').replaceAll('_', '')), name).toBe(value);
    }
  });

  it('keeps the package free of rule, workspace and node imports', () => {
    const dir = new URL('./', import.meta.url);
    const sources = readdirSync(dir).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = readFileSync(new URL(file, dir), 'utf8');
      const specifiers = [...text.matchAll(/from\s+'([^']+)'/g)].map(m => m[1] ?? '');
      for (const specifier of specifiers) expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/[a-z-]+\.js$/);
      expect(text, file).not.toMatch(/Math\.random\(/);
    }
  });
});

describe('九霄标准时 mapping from gameMinute', () => {
  it('maps the prologue start 300 to 05:00, 卯初, rule ke 0', () => {
    const t = worldTimeAt(300);
    expect(t).toMatchObject({
      day: 0, minuteOfDay: 300, hour: 5, minute: 0, ke: 20,
      shichen: { branch: '卯', half: '初', label: '卯初', keInHalf: 0 },
      ruleAnchor: { dayIndex: 0, ke: 0, beforeDusk: true },
    });
    expect(formatClock(t.minuteOfDay)).toBe('05:00');
  });

  it('places DUSK_START_KEC (48 ke after the 05:00 anchor) at 17:00 = 酉初', () => {
    const dusk = RULE_TIME_GRID.SAVE_START_GAME_MINUTE + RULE_TIME_GRID.DUSK_START_KEC * RULE_TIME_GRID.GAME_MINUTES_PER_KEC;
    expect(dusk).toBe(1020);
    const t = worldTimeAt(dusk);
    expect(formatClock(t.minuteOfDay)).toBe('17:00');
    expect(t.shichen.label).toBe('酉初');
    expect(t.ke).toBe(68); // civil ke counts from 00:00; 68 − 20 = 48 rule ke
    expect(t.ruleAnchor).toEqual({ dayIndex: 0, ke: 48, beforeDusk: false });
    expect(worldTimeAt(dusk - 15).ruleAnchor.beforeDusk).toBe(true);
  });

  it('rolls the civil day at 00:00 and the rule day at 05:00', () => {
    const lateNight = worldTimeAt(1440 + 4 * 60 + 45); // day 1 04:45
    expect(lateNight.day).toBe(1);
    expect(lateNight.ruleAnchor).toEqual({ dayIndex: 0, ke: 95, beforeDusk: false });
    const nextStart = worldTimeAt(300 + 1440);
    expect(nextStart.day).toBe(1);
    expect(nextStart.ruleAnchor).toEqual({ dayIndex: 1, ke: 0, beforeDusk: true });
    expect(worldTimeAt(1439).ke).toBe(95);
  });

  it('labels the twelve 时辰 with 初/正 halves (子 = 23:00–01:00)', () => {
    expect(shichenForMinute(23 * 60).label).toBe('子初');
    expect(shichenForMinute(0).label).toBe('子正');
    expect(shichenForMinute(59).label).toBe('子正');
    expect(shichenForMinute(60).label).toBe('丑初');
    expect(shichenForMinute(2 * 60).label).toBe('丑正');
    expect(shichenForMinute(6 * 60).label).toBe('卯正');
    expect(shichenForMinute(11 * 60).label).toBe('午初');
    expect(shichenForMinute(12 * 60).label).toBe('午正');
    expect(shichenForMinute(22 * 60 + 59)).toMatchObject({ label: '亥正', keInHalf: 3 });
  });

  it('rejects non-integer or negative gameMinute', () => {
    expect(() => worldTimeAt(-1)).toThrow(RangeError);
    expect(() => worldTimeAt(1.5)).toThrow(RangeError);
  });
});

describe('二十四节气', () => {
  it('puts 秋分 at yearDay ≈ 263 and 春分 at ≈ 80', () => {
    expect(solarTermForYearDay(263).name).toBe('秋分');
    expect(solarTermForYearDay(80).name).toBe('春分');
    expect(solarTermForYearDay(79.9).name).toBe('惊蛰');
    expect(solarTermForYearDay(262.5).name).toBe('白露'); // 秋分 begins at yearDay 262.6211
  });

  it('starts the prologue epoch in 秋分 at solar longitude ≈ 180°', () => {
    const t = worldTimeAt(300, PROLOGUE_EPOCH);
    expect(t.solarTerm.name).toBe('秋分');
    expect(t.solarLongitudeDeg).toBeCloseTo(180.5788, 3);
    expect(t.yearDay).toBeCloseTo(263.2083, 4);
  });

  it('advances one term per 15° and wraps after a tropical year', () => {
    expect(SOLAR_TERMS).toHaveLength(24);
    expect(solarTermForYearDay(80 + 365.2422 / 4 + 0.01).name).toBe('夏至');
    expect(solarTermForYearDay(80 + (3 * 365.2422) / 4 + 0.01).name).toBe('冬至');
    const later = worldTimeAt(Math.round(365.2422 * 1440) + 300);
    expect(later.yearIndex).toBe(1);
    expect(later.solarTerm.name).toBe('秋分');
  });
});
