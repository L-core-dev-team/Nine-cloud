/**
 * 九霄历与九霄标准时（候选兼容扩展，非 Canon 1.0 原文）。
 *
 * 世界时间只从权威的 `gameMinute` 推导，绝不反向写回规则：画面 ⊆ 事实。
 * 本模块不导入任何规则代码；下面的时间网格常量是只读副本，测试会逐项核对来源文件。
 */
import { DEG, mod, normalizeRad, toDeg } from './math.js';

/**
 * Read-only copy of the prologue time grid.
 * Source: packages/content/src/rules/prologue-v1.constants.ts (`PROLOGUE_V1`).
 * That file is frozen rule code; this package never imports it. `calendar.test.ts`
 * parses the source text and fails if any of these values drift.
 */
export const RULE_TIME_GRID = {
  GAME_MINUTES_PER_KEC: 15,
  DAY_KEC_COUNT: 96,
  SAVE_START_GAME_MINUTE: 300,
  DUSK_START_KEC: 48,
} as const;

export const MINUTES_PER_KE = RULE_TIME_GRID.GAME_MINUTES_PER_KEC;
export const KE_PER_DAY = RULE_TIME_GRID.DAY_KEC_COUNT;
export const MINUTES_PER_DAY = MINUTES_PER_KE * KE_PER_DAY; // 1440
export const TROPICAL_YEAR_DAYS = 365.2422;
/** 年内日序上春分（太阳黄经 0°）所在的位置；节气与赤纬都以此为零点。 */
export const SPRING_EQUINOX_YEAR_DAY = 80;

export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
export type EarthlyBranch = typeof EARTHLY_BRANCHES[number];

/** 二十四节气，自春分（黄经 0°）起每 15° 一个。 */
export const SOLAR_TERMS = [
  '春分', '清明', '谷雨', '立夏', '小满', '芒种',
  '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
  '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
  '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰',
] as const;
export type SolarTermName = typeof SOLAR_TERMS[number];

export interface CalendarEpoch {
  /** 存档第 0 日 00:00（九霄标准时）在年内的日序，可为小数。春分在 80。 */
  readonly yearDayOfDay0: number;
  /** 存档第 0 日 00:00 时的月龄（自上次朔起的天数）。 */
  readonly moonAgeAtDay0Days: number;
}

/**
 * 序章历元（候选）：第 0 日在年内第 263 日，太阳黄经约 180.4°，节气为秋分。
 * 月龄 0（朔）只是占位，尚待作者裁定。
 */
export const PROLOGUE_EPOCH: CalendarEpoch = Object.freeze({
  yearDayOfDay0: 263,
  moonAgeAtDay0Days: 0,
});

export interface ShichenInfo {
  readonly branch: EarthlyBranch;
  /** 0 = 子 … 11 = 亥 */
  readonly index: number;
  readonly half: '初' | '正';
  /** 本半时辰内的第几刻，0–3（每半时辰 60 分钟 = 4 刻）。 */
  readonly keInHalf: number;
  /** 如“卯初”。 */
  readonly label: string;
}

export interface SolarTermInfo {
  readonly index: number;
  readonly name: SolarTermName;
  /** 该节气起点的太阳黄经（度）。 */
  readonly startLongitudeDeg: number;
}

export interface WorldTime {
  readonly gameMinute: number;
  /** 民用日序：以标准时 00:00 为界，第 0 日含开局的 05:00。 */
  readonly day: number;
  /** 标准时自 00:00 起的分钟数，0–1439。 */
  readonly minuteOfDay: number;
  readonly hour: number;
  readonly minute: number;
  /** 民用刻序：自 00:00（子正）起计，0–95。 */
  readonly ke: number;
  readonly shichen: ShichenInfo;
  /** 此刻的年内日序（含日内小数），[0, 365.2422)。 */
  readonly yearDay: number;
  /** 自历元所在年起的年数。 */
  readonly yearIndex: number;
  readonly solarLongitudeDeg: number;
  readonly solarTerm: SolarTermInfo;
  /**
   * 规则口径的镜像（只供显示核对，不是权威）：规则日以 05:00 为界，
   * 刻序自 05:00 起计；`ke < DUSK_START_KEC`（即 05:00–17:00）为白昼。
   */
  readonly ruleAnchor: {
    readonly dayIndex: number;
    readonly ke: number;
    readonly beforeDusk: boolean;
  };
}

function assertGameMinute(gameMinute: number): void {
  if (!Number.isSafeInteger(gameMinute) || gameMinute < 0) {
    throw new RangeError(`gameMinute must be a non-negative safe integer, received ${gameMinute}`);
  }
}

/** 太阳平黄经（弧度）。第一版采用圆轨道：每日东移 360°/365.2422，不含中心差。 */
export function solarLongitudeRad(yearDay: number): number {
  return normalizeRad((2 * Math.PI * (yearDay - SPRING_EQUINOX_YEAR_DAY)) / TROPICAL_YEAR_DAYS);
}

export function solarTermForLongitude(longitudeDeg: number): SolarTermInfo {
  const index = Math.floor(mod(longitudeDeg, 360) / 15) % 24;
  return { index, name: SOLAR_TERMS[index] as SolarTermName, startLongitudeDeg: index * 15 };
}

export function solarTermForYearDay(yearDay: number): SolarTermInfo {
  return solarTermForLongitude(toDeg(solarLongitudeRad(yearDay)));
}

/** 子时 = 23:00–01:00：子初 23:00，子正 00:00；丑初 01:00，丑正 02:00；依此类推。 */
export function shichenForMinute(minuteOfDay: number): ShichenInfo {
  const shifted = mod(Math.floor(minuteOfDay) + 60, MINUTES_PER_DAY);
  const index = Math.floor(shifted / 120);
  const withinShichen = shifted % 120;
  const half = withinShichen < 60 ? '初' : '正';
  const branch = EARTHLY_BRANCHES[index] as EarthlyBranch;
  return {
    branch,
    index,
    half,
    keInHalf: Math.floor((withinShichen % 60) / MINUTES_PER_KE),
    label: `${branch}${half}`,
  };
}

/** 把权威 `gameMinute` 映射为九霄历时间。`gameMinute` 0 = 第 0 日标准时 00:00。 */
export function worldTimeAt(gameMinute: number, epoch: CalendarEpoch = PROLOGUE_EPOCH): WorldTime {
  assertGameMinute(gameMinute);
  const day = Math.floor(gameMinute / MINUTES_PER_DAY);
  const minuteOfDay = gameMinute - day * MINUTES_PER_DAY;
  const absoluteYearDay = epoch.yearDayOfDay0 + gameMinute / MINUTES_PER_DAY;
  const yearIndex = Math.floor(absoluteYearDay / TROPICAL_YEAR_DAYS);
  const yearDay = absoluteYearDay - yearIndex * TROPICAL_YEAR_DAYS;
  const solarLongitudeDeg = toDeg(solarLongitudeRad(yearDay));
  const sinceRuleStart = gameMinute - RULE_TIME_GRID.SAVE_START_GAME_MINUTE;
  const ruleDayIndex = Math.floor(sinceRuleStart / MINUTES_PER_DAY);
  const ruleKe = Math.floor(mod(sinceRuleStart, MINUTES_PER_DAY) / MINUTES_PER_KE);
  return {
    gameMinute,
    day,
    minuteOfDay,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    ke: Math.floor(minuteOfDay / MINUTES_PER_KE),
    shichen: shichenForMinute(minuteOfDay),
    yearDay,
    yearIndex,
    solarLongitudeDeg,
    solarTerm: solarTermForLongitude(solarLongitudeDeg),
    ruleAnchor: {
      dayIndex: ruleDayIndex,
      ke: ruleKe,
      beforeDusk: ruleKe < RULE_TIME_GRID.DUSK_START_KEC,
    },
  };
}

/** 把标准时分钟数格式化为 HH:MM（四舍五入到分钟，可跨日）。 */
export function formatClock(minutes: number): string {
  const rounded = mod(Math.round(minutes), MINUTES_PER_DAY);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 便于其他模块使用：太阳黄经（度）。 */
export function solarLongitudeDeg(yearDay: number): number {
  return solarLongitudeRad(yearDay) / DEG;
}
