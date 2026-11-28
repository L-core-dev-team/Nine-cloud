/**
 * 太阳位置与日出日落（低精度，只用于画面）。
 *
 * - 黄经 λ：圆轨道平黄经，见 `solarLongitudeRad`。
 * - 赤纬 δ = asin(sin ε · sin λ)，ε = 23.44°（精确式，不用 δ ≈ ε·sin λ 的简化）。
 * - 赤经 α = atan2(cos ε · sin λ, cos λ)。
 * - 时角 H = 15° × (地方视时 − 12)，地方视时 = 标准时 + 经度差/15°。第一版忽略时差方程（≤ 16 分钟）。
 * - 高度 sin h = sin φ sin δ + cos φ cos δ cos H。
 * - 方位 A = atan2(−sin H, tan δ cos φ − sin φ cos H)，自正北顺时针。
 * - 日出日落：cos H₀ = (sin h₀ − sin φ sin δ)/(cos φ cos δ)，h₀ = −0.833°（大气折射 + 日面半径）。
 */
import {
  type CalendarEpoch,
  MINUTES_PER_DAY,
  PROLOGUE_EPOCH,
  solarLongitudeRad,
  worldTimeAt,
} from './calendar.js';
import { clamp, DEG, normalizeRad, toDeg } from './math.js';
import type { Place } from './places.js';

export const OBLIQUITY_DEG = 23.44;
export const SUNRISE_ALTITUDE_DEG = -0.833;
const OBLIQUITY = OBLIQUITY_DEG * DEG;

export interface EquatorialPosition {
  readonly rightAscensionRad: number;
  readonly declinationRad: number;
}

export interface HorizontalPosition {
  readonly altitudeDeg: number;
  /** 自正北顺时针，[0, 360)。 */
  readonly azimuthDeg: number;
}

/** 黄道上（黄纬 0）一点的赤道坐标。 */
export function eclipticToEquatorial(longitudeRad: number): EquatorialPosition {
  const sinL = Math.sin(longitudeRad);
  return {
    rightAscensionRad: normalizeRad(Math.atan2(Math.cos(OBLIQUITY) * sinL, Math.cos(longitudeRad))),
    declinationRad: Math.asin(Math.sin(OBLIQUITY) * sinL),
  };
}

export function solarDeclinationRad(yearDay: number): number {
  return Math.asin(Math.sin(OBLIQUITY) * Math.sin(solarLongitudeRad(yearDay)));
}

export function solarEquatorial(yearDay: number): EquatorialPosition {
  return eclipticToEquatorial(solarLongitudeRad(yearDay));
}

/** 地方视时（分钟）= 标准时 + 经度差 × 4 分钟/度。 */
export function localApparentMinutes(standardMinuteOfDay: number, place: Pick<Place, 'longitudeOffsetDeg'>): number {
  return standardMinuteOfDay + place.longitudeOffsetDeg * 4;
}

/** 太阳时角（弧度），正午为 0，下午为正。 */
export function solarHourAngleRad(standardMinuteOfDay: number, place: Pick<Place, 'longitudeOffsetDeg'>): number {
  return ((localApparentMinutes(standardMinuteOfDay, place) / 60 - 12) * 15) * DEG;
}

/** 赤道坐标 → 地平坐标。 */
export function equatorialToHorizontal(hourAngleRad: number, declinationRad: number, latitudeDeg: number): HorizontalPosition {
  const lat = latitudeDeg * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(declinationRad)
    + Math.cos(lat) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  // A = atan2(−sin H, tan δ cos φ − sin φ cos H)，两项同乘 cos δ 以避开 tan 的奇点。
  const az = Math.atan2(
    -Math.cos(declinationRad) * Math.sin(hourAngleRad),
    Math.sin(declinationRad) * Math.cos(lat) - Math.cos(declinationRad) * Math.sin(lat) * Math.cos(hourAngleRad),
  );
  return { altitudeDeg: toDeg(alt), azimuthDeg: toDeg(normalizeRad(az)) };
}

/**
 * 低层接口：给定年内日序（直接用于计算赤纬，不随 `standardMinuteOfDay` 推进）与标准时，求太阳位置。
 */
export function solarPosition(
  yearDay: number,
  standardMinuteOfDay: number,
  place: Pick<Place, 'latitudeDeg' | 'longitudeOffsetDeg'>,
): HorizontalPosition & { readonly declinationDeg: number; readonly hourAngleDeg: number } {
  const declinationRad = solarDeclinationRad(yearDay);
  const hourAngleRad = solarHourAngleRad(standardMinuteOfDay, place);
  return {
    ...equatorialToHorizontal(hourAngleRad, declinationRad, place.latitudeDeg),
    declinationDeg: toDeg(declinationRad),
    hourAngleDeg: toDeg(hourAngleRad),
  };
}

/** 高层接口：由权威 `gameMinute` 求太阳位置（年内日序含日内小数）。 */
export function sunAtGameMinute(
  gameMinute: number,
  place: Pick<Place, 'latitudeDeg' | 'longitudeOffsetDeg'>,
  epoch: CalendarEpoch = PROLOGUE_EPOCH,
): ReturnType<typeof solarPosition> {
  const time = worldTimeAt(gameMinute, epoch);
  return solarPosition(time.yearDay, time.minuteOfDay, place);
}

/**
 * 地方恒星时（弧度）：春分点的时角 = 太阳时角 + 太阳赤经。
 * 星空与月亮都用它从赤道坐标换到地平坐标，保证与太阳一致。
 */
export function localSiderealAngleRad(
  yearDay: number,
  standardMinuteOfDay: number,
  place: Pick<Place, 'longitudeOffsetDeg'>,
): number {
  return normalizeRad(solarHourAngleRad(standardMinuteOfDay, place) + solarEquatorial(yearDay).rightAscensionRad);
}

export type DaylightKind = 'normal' | 'polar-day' | 'polar-night';

export interface SunEvents {
  readonly day: number;
  readonly kind: DaylightKind;
  /** 以下均为该民用日 00:00 起的标准时分钟数（小数）。 */
  readonly solarNoonMinute: number;
  readonly sunriseMinute: number | null;
  readonly sunsetMinute: number | null;
  readonly dayLengthMinutes: number;
  readonly noonAltitudeDeg: number;
  readonly sunriseAzimuthDeg: number | null;
  readonly sunsetAzimuthDeg: number | null;
}

function halfDayArcRad(declinationRad: number, latitudeDeg: number, altitudeDeg: number): number | 'polar-day' | 'polar-night' {
  const lat = latitudeDeg * DEG;
  const cosH0 = (Math.sin(altitudeDeg * DEG) - Math.sin(lat) * Math.sin(declinationRad))
    / (Math.cos(lat) * Math.cos(declinationRad));
  if (cosH0 > 1) return 'polar-night';
  if (cosH0 < -1) return 'polar-day';
  return Math.acos(cosH0);
}

/**
 * 求某民用日（`day`，0 起）的日出、正午、日落。赤纬取事件时刻的值，迭代 4 次收敛到 0.01 秒以内。
 */
export function sunEventsForDay(
  day: number,
  place: Pick<Place, 'latitudeDeg' | 'longitudeOffsetDeg'>,
  epoch: CalendarEpoch = PROLOGUE_EPOCH,
  altitudeDeg: number = SUNRISE_ALTITUDE_DEG,
): SunEvents {
  if (!Number.isSafeInteger(day)) throw new RangeError(`day must be an integer, received ${day}`);
  const dayStartYearDay = epoch.yearDayOfDay0 + day;
  const yearDayAt = (minute: number): number => dayStartYearDay + minute / MINUTES_PER_DAY;
  const solarNoonMinute = 720 - place.longitudeOffsetDeg * 4;
  const noon = solarPosition(yearDayAt(solarNoonMinute), solarNoonMinute, place);

  const solve = (sign: -1 | 1): number | 'polar-day' | 'polar-night' => {
    let minute = solarNoonMinute + sign * 360;
    for (let i = 0; i < 4; i += 1) {
      const arc = halfDayArcRad(solarDeclinationRad(yearDayAt(minute)), place.latitudeDeg, altitudeDeg);
      if (typeof arc === 'string') return arc;
      minute = solarNoonMinute + sign * (toDeg(arc) / 15) * 60;
    }
    return minute;
  };

  const rise = solve(-1);
  const set = solve(1);
  if (typeof rise === 'string' || typeof set === 'string') {
    const kind = typeof rise === 'string' ? rise : set as 'polar-day' | 'polar-night';
    return {
      day,
      kind,
      solarNoonMinute,
      sunriseMinute: null,
      sunsetMinute: null,
      dayLengthMinutes: kind === 'polar-day' ? MINUTES_PER_DAY : 0,
      noonAltitudeDeg: noon.altitudeDeg,
      sunriseAzimuthDeg: null,
      sunsetAzimuthDeg: null,
    };
  }
  return {
    day,
    kind: 'normal',
    solarNoonMinute,
    sunriseMinute: rise,
    sunsetMinute: set,
    dayLengthMinutes: set - rise,
    noonAltitudeDeg: noon.altitudeDeg,
    sunriseAzimuthDeg: solarPosition(yearDayAt(rise), rise, place).azimuthDeg,
    sunsetAzimuthDeg: solarPosition(yearDayAt(set), set, place).azimuthDeg,
  };
}
