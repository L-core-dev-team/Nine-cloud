/** Small numeric helpers shared by the astronomy modules. Pure and deterministic. */

export const DEG = Math.PI / 180;
export const TAU = 2 * Math.PI;

/** Euclidean modulo: the result always has the sign of `m` (here: non-negative). */
export function mod(value: number, m: number): number {
  const r = value % m;
  return r < 0 ? r + m : r;
}

/** Normalises an angle in radians to [0, 2π). */
export function normalizeRad(angle: number): number {
  return mod(angle, TAU);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function toDeg(rad: number): number {
  return rad / DEG;
}

export function toRad(deg: number): number {
  return deg * DEG;
}
