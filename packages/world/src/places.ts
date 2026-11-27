/**
 * 序章地点的地理坐标（候选扩展，非 Canon）。
 *
 * 经度一律写成“在九霄标准子午线（天衍城观星台）以东多少度”，向西为负。
 * 地方视时 = 标准时 + 经度差 / 15°（每度 4 分钟）。
 */
import { DEG, toDeg } from './math.js';

/** 一里的长度（候选）：取 500 米。 */
export const LI_METERS = 500;
/** 世界半径（候选）：与地球同尺度，6371 千米。只用于把里程换算为经纬度差。 */
export const WORLD_RADIUS_METERS = 6_371_000;
export const METERS_PER_DEGREE_LATITUDE = (WORLD_RADIUS_METERS * Math.PI) / 180;

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly latitudeDeg: number;
  /** 在标准子午线以东的度数，向西为负。 */
  readonly longitudeOffsetDeg: number;
  readonly note: string;
}

/** 标准子午线的参照：只定经度，不定纬度（Canon 未写天衍城的纬度）。 */
export const STANDARD_MERIDIAN = Object.freeze({
  name: '天衍城观星台子午线',
  longitudeOffsetDeg: 0,
});

/**
 * 在小范围内按平面近似，从一个点出发沿方位角（自正北顺时针）走一段路程。
 * 数里之内误差远小于 1 米，足够画面使用。
 */
export function offsetByBearing(
  from: Pick<Place, 'latitudeDeg' | 'longitudeOffsetDeg'>,
  bearingDeg: number,
  distanceLi: number,
): { latitudeDeg: number; longitudeOffsetDeg: number } {
  const meters = distanceLi * LI_METERS;
  const north = meters * Math.cos(bearingDeg * DEG);
  const east = meters * Math.sin(bearingDeg * DEG);
  const latitudeDeg = from.latitudeDeg + north / METERS_PER_DEGREE_LATITUDE;
  const meanLat = ((from.latitudeDeg + latitudeDeg) / 2) * DEG;
  const longitudeOffsetDeg = from.longitudeOffsetDeg + east / (METERS_PER_DEGREE_LATITUDE * Math.cos(meanLat));
  return { latitudeDeg, longitudeOffsetDeg };
}

/** 两点间的平面近似距离（里）。 */
export function distanceLi(a: Place, b: Place): number {
  const north = (b.latitudeDeg - a.latitudeDeg) * METERS_PER_DEGREE_LATITUDE;
  const meanLat = ((a.latitudeDeg + b.latitudeDeg) / 2) * DEG;
  const east = (b.longitudeOffsetDeg - a.longitudeOffsetDeg) * METERS_PER_DEGREE_LATITUDE * Math.cos(meanLat);
  return Math.hypot(north, east) / LI_METERS;
}

/** 自 a 望 b 的方位角（度，自正北顺时针）。 */
export function bearingDeg(a: Place, b: Place): number {
  const north = b.latitudeDeg - a.latitudeDeg;
  const meanLat = ((a.latitudeDeg + b.latitudeDeg) / 2) * DEG;
  const east = (b.longitudeOffsetDeg - a.longitudeOffsetDeg) * Math.cos(meanLat);
  const deg = toDeg(Math.atan2(east, north));
  return deg < 0 ? deg + 360 : deg;
}

/**
 * 序章地点。坐标是字面量（便于审阅），`places.test.ts` 用 `offsetByBearing` 复算核对：
 * - 芦花渡：北纬 30°，标准子午线以东 15°，地方视时 = 标准时 + 1 小时。
 * - 望气台：芦花渡西南（方位 225°）3 里 = 1500 米。
 * - 折桂坪：望气台正北 1 里 = 500 米的缓坡（“望气台北侧缓坡，可俯瞰渡口”；距离为候选）。
 */
export const PROLOGUE_PLACES = Object.freeze({
  loc_luhuadu: Object.freeze({
    id: 'loc_luhuadu',
    name: '芦花渡',
    latitudeDeg: 30,
    longitudeOffsetDeg: 15,
    note: '序章基准点；北纬 30°，标准子午线以东 15°。',
  }),
  loc_wangqitai: Object.freeze({
    id: 'loc_wangqitai',
    name: '望气台',
    latitudeDeg: 29.990461,
    longitudeOffsetDeg: 14.988986,
    note: '芦花渡西南 3 里的丘顶旧观测台。',
  }),
  loc_zheguiping: Object.freeze({
    id: 'loc_zheguiping',
    name: '折桂坪',
    latitudeDeg: 29.994958,
    longitudeOffsetDeg: 14.988986,
    note: '望气台正北 1 里的缓坡（距离为候选）。',
  }),
} satisfies Record<string, Place>);

export type ProloguePlaceId = keyof typeof PROLOGUE_PLACES;

export function prologuePlace(id: ProloguePlaceId): Place {
  return PROLOGUE_PLACES[id];
}
