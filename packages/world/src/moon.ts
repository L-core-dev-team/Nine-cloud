/**
 * 月亮（候选扩展：九霄有一个月亮）。只用于画面。
 *
 * - 朔望月 29.530588 日；相位角 ψ = 2π · (月龄 / 29.530588)，0 = 朔，π = 望。
 * - 被照亮的比例 k = (1 − cos ψ)/2。
 * - 位置：把月亮放在黄道上、太阳以东 ψ 处（黄经 λ☾ = λ☉ + ψ，黄纬取 0），
 *   再与太阳共用同一个地方恒星时换算到地平坐标。
 *
 * 误差（相对真实月球）：忽略约 5.1° 的轨道倾角（赤纬误差可达约 5°）、
 * 约 ±6.3° 的中心差与其他摄动（黄经误差数度），以及约 1° 的地平视差。
 * 因此月出时刻误差可达 20–30 分钟，只适合画面，不适合任何规则判定。
 */
import { type CalendarEpoch, MINUTES_PER_DAY, PROLOGUE_EPOCH, solarLongitudeRad, worldTimeAt } from './calendar.js';
import { mod, TAU, toDeg } from './math.js';
import type { Place } from './places.js';
import { eclipticToEquatorial, equatorialToHorizontal, type HorizontalPosition, localSiderealAngleRad } from './sun.js';

export const SYNODIC_MONTH_DAYS = 29.530588;

export const MOON_PHASE_NAMES = ['朔', '蛾眉月', '上弦月', '盈凸月', '望', '亏凸月', '下弦月', '残月'] as const;
export type MoonPhaseName = typeof MOON_PHASE_NAMES[number];

export interface MoonPhase {
  /** 自上次朔起的天数，[0, 29.530588)。 */
  readonly ageDays: number;
  readonly phaseAngleRad: number;
  readonly phaseAngleDeg: number;
  /** 被照亮的比例 k = (1 − cos ψ)/2，0 = 朔，1 = 望。 */
  readonly illuminatedFraction: number;
  readonly name: MoonPhaseName;
  readonly waxing: boolean;
}

export function moonPhaseForAge(ageDays: number): MoonPhase {
  const age = mod(ageDays, SYNODIC_MONTH_DAYS);
  const psi = TAU * (age / SYNODIC_MONTH_DAYS);
  const psiDeg = toDeg(psi);
  const nameIndex = Math.floor(mod(psiDeg + 22.5, 360) / 45) % 8;
  return {
    ageDays: age,
    phaseAngleRad: psi,
    phaseAngleDeg: psiDeg,
    illuminatedFraction: (1 - Math.cos(psi)) / 2,
    name: MOON_PHASE_NAMES[nameIndex] as MoonPhaseName,
    waxing: psi < Math.PI,
  };
}

export function moonAgeAtGameMinute(gameMinute: number, epoch: CalendarEpoch = PROLOGUE_EPOCH): number {
  return mod(epoch.moonAgeAtDay0Days + gameMinute / MINUTES_PER_DAY, SYNODIC_MONTH_DAYS);
}

export function moonPhaseAtGameMinute(gameMinute: number, epoch: CalendarEpoch = PROLOGUE_EPOCH): MoonPhase {
  return moonPhaseForAge(moonAgeAtGameMinute(gameMinute, epoch));
}

export interface MoonState extends HorizontalPosition {
  readonly phase: MoonPhase;
  readonly declinationDeg: number;
  readonly rightAscensionDeg: number;
}

/** 由权威 `gameMinute` 求月亮的近似位置与月相。 */
export function moonAtGameMinute(
  gameMinute: number,
  place: Pick<Place, 'latitudeDeg' | 'longitudeOffsetDeg'>,
  epoch: CalendarEpoch = PROLOGUE_EPOCH,
): MoonState {
  const time = worldTimeAt(gameMinute, epoch);
  const phase = moonPhaseAtGameMinute(gameMinute, epoch);
  const moonLongitude = solarLongitudeRad(time.yearDay) + phase.phaseAngleRad;
  const eq = eclipticToEquatorial(moonLongitude);
  const lst = localSiderealAngleRad(time.yearDay, time.minuteOfDay, place);
  return {
    ...equatorialToHorizontal(lst - eq.rightAscensionRad, eq.declinationRad, place.latitudeDeg),
    phase,
    declinationDeg: toDeg(eq.declinationRad),
    rightAscensionDeg: toDeg(eq.rightAscensionRad),
  };
}
