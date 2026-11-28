/**
 * 程序化星空（不使用任何真实星表；HYG 等星表为 CC BY-SA，不得引入）。
 *
 * - 位置：天球上均匀分布（赤经均匀，sin 赤纬均匀）。
 * - 星等：累积数目 N(<m) ∝ 10^(α m)，α = 0.5，与肉眼可见星的计数斜率相近；
 *   用逆变换在 [最亮, 最暗] 区间内取样。
 * - 色温：3000–30000 K，T = 3000 · 10^(u²)，偏向较冷的恒星（中位约 5300 K）。
 * - 颜色：普朗克轨迹的 Kim 等（2002）三次近似得到 CIE xy，再转线性 sRGB、
 *   按最大分量归一并做 sRGB 伽马编码。25000 K 以上沿用同一式外推。
 */
import { TAU } from './math.js';
import { createRandomStream } from './random.js';
import { equatorialToHorizontal, type HorizontalPosition } from './sun.js';

export interface Star {
  readonly id: number;
  readonly rightAscensionRad: number;
  readonly declinationRad: number;
  readonly magnitude: number;
  readonly temperatureK: number;
  /** sRGB 编码，0–255 整数。 */
  readonly rgb: readonly [number, number, number];
}

export interface StarFieldOptions {
  readonly worldSeed: string;
  readonly systemName?: string;
  readonly key?: string;
  readonly count?: number;
  readonly brightestMagnitude?: number;
  readonly faintestMagnitude?: number;
  /** N(<m) ∝ 10^(slope·m) 中的斜率。 */
  readonly magnitudeSlope?: number;
}

export const STAR_FIELD_DEFAULTS = Object.freeze({
  systemName: 'starfield',
  key: 'naked-eye-v1',
  count: 6000,
  brightestMagnitude: -1.5,
  faintestMagnitude: 6.5,
  magnitudeSlope: 0.5,
});

export const STAR_TEMPERATURE_MIN_K = 3000;
export const STAR_TEMPERATURE_MAX_K = 30000;

function planckianXy(temperatureK: number): { x: number; y: number } {
  const t = temperatureK;
  const t2 = t * t;
  const t3 = t2 * t;
  const x = t <= 4000
    ? -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.179910
    : -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.240390;
  const x2 = x * x;
  const x3 = x2 * x;
  const y = t <= 2222
    ? -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683
    : t <= 4000
      ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
      : 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  return { x, y };
}

function srgbEncode(linear: number): number {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** 色温 → sRGB（0–255），亮度按最大分量归一（星的亮度另由星等决定）。 */
export function temperatureToSrgb(temperatureK: number): readonly [number, number, number] {
  const { x, y } = planckianXy(temperatureK);
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  const r = Math.max(0, 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z);
  const g = Math.max(0, -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z);
  const b = Math.max(0, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z);
  const max = Math.max(r, g, b);
  return [srgbEncode(r / max), srgbEncode(g / max), srgbEncode(b / max)];
}

/** 生成整片星空。相同参数永远得到相同结果。 */
export function generateStarField(options: StarFieldOptions): Star[] {
  const systemName = options.systemName ?? STAR_FIELD_DEFAULTS.systemName;
  const key = options.key ?? STAR_FIELD_DEFAULTS.key;
  const count = options.count ?? STAR_FIELD_DEFAULTS.count;
  const mMin = options.brightestMagnitude ?? STAR_FIELD_DEFAULTS.brightestMagnitude;
  const mMax = options.faintestMagnitude ?? STAR_FIELD_DEFAULTS.faintestMagnitude;
  const slope = options.magnitudeSlope ?? STAR_FIELD_DEFAULTS.magnitudeSlope;
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`count must be a non-negative integer, received ${count}`);
  if (!(mMax > mMin) || !(slope > 0)) throw new RangeError('magnitude range and slope must be positive');

  const root = createRandomStream(options.worldSeed, systemName, key);
  const position = root.substream('position');
  const magnitude = root.substream('magnitude');
  const temperature = root.substream('temperature');
  const floor = 10 ** (slope * (mMin - mMax));
  const logTempSpan = Math.log10(STAR_TEMPERATURE_MAX_K / STAR_TEMPERATURE_MIN_K);

  const stars: Star[] = [];
  for (let id = 0; id < count; id += 1) {
    const rightAscensionRad = TAU * position.nextFloat();
    const declinationRad = Math.asin(2 * position.nextFloat() - 1);
    const u = magnitude.nextFloat();
    const mag = mMax + Math.log10(floor + u * (1 - floor)) / slope;
    const w = temperature.nextFloat();
    const temperatureK = STAR_TEMPERATURE_MIN_K * 10 ** (logTempSpan * w * w);
    stars.push({
      id,
      rightAscensionRad,
      declinationRad,
      magnitude: mag,
      temperatureK,
      rgb: temperatureToSrgb(temperatureK),
    });
  }
  return stars;
}

/** 一颗星在某地某刻的地平坐标；`localSiderealRad` 来自 `localSiderealAngleRad`。 */
export function starHorizontal(star: Star, localSiderealRad: number, latitudeDeg: number): HorizontalPosition {
  return equatorialToHorizontal(localSiderealRad - star.rightAscensionRad, star.declinationRad, latitudeDeg);
}

