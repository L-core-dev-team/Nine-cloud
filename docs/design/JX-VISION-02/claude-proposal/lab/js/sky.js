// Single-scattering sky (Nishita-style, Rayleigh + Mie), evaluated on a coarse grid.
// Units: metres. Returns linear RGB radiance, tonemapped later.
// Game astronomy (design proposal, not a signed rule): sunrise 05:00, solar noon 11:00, sunset 17:00,
// i.e. equinox geometry with the day centred on 11:00 so that the rule's 卯初 start and 酉初 dusk are sunrise and sunset.
export function sunFromGameMinute(gameMinute, latitudeDeg = 30) {
  const m = ((gameMinute % 1440) + 1440) % 1440;
  const H = (m / 60 - 11) * 15 * Math.PI / 180;        // hour angle
  const phi = latitudeDeg * Math.PI / 180, dec = 0;   // equinox
  const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(sinEl);
  // azimuth measured from north, clockwise
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { elevation: el, azimuth: (az + 2 * Math.PI) % (2 * Math.PI) };
}

const Re = 6360e3, Ra = 6420e3, Hr = 8000, Hm = 1200;
const betaR = [5.8e-6, 13.5e-6, 33.1e-6], betaM = 21e-6, g = 0.76;
// ozone absorption (Chappuis band) — what keeps the twilight zenith blue; approximated with the Rayleigh density profile
const betaO = [0.65e-6, 1.881e-6, 0.085e-6];

function raySphere(oy, dx, dy, dz, R) {
  // origin (0, oy, 0); returns far intersection distance
  const b = oy * dy, c = oy * oy - R * R; const d = b * b - c; if (d < 0) return -1; return -b + Math.sqrt(d);
}
export function skyRadiance(dir, sunDir, samples = 12, lightSamples = 6) {
  const [dx, dy, dz] = dir; const oy = Re + 2;
  const tMax = raySphere(oy, dx, dy, dz, Ra);
  const seg = tMax / samples;
  const mu = dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2];
  const phR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const phM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  let odR = 0, odM = 0; const sumR = [0, 0, 0], sumM = [0, 0, 0];
  for (let i = 0; i < samples; i++) {
    const t = seg * (i + 0.5);
    const px = dx * t, py = oy + dy * t, pz = dz * t;
    const h = Math.hypot(px, py, pz) - Re; if (h < 0) break;
    const hr = Math.exp(-h / Hr) * seg, hm = Math.exp(-h / Hm) * seg; odR += hr; odM += hm;
    // light ray to sun
    const r = Math.hypot(px, py, pz); const ux = px / r, uy = py / r, uz = pz / r;
    const cosT = ux * sunDir[0] + uy * sunDir[1] + uz * sunDir[2];
    const bb = r * cosT, cc = r * r - Ra * Ra; const tl = -bb + Math.sqrt(bb * bb - cc);
    // ground shadow test
    const cg = r * r - Re * Re; if (bb < 0 && bb * bb - cg > 0) continue;
    const sl = tl / lightSamples; let lR = 0, lM = 0, blocked = false;
    for (let j = 0; j < lightSamples; j++) {
      const tj = sl * (j + 0.5); const qx = px + sunDir[0] * tj, qy = py + sunDir[1] * tj, qz = pz + sunDir[2] * tj;
      const hj = Math.hypot(qx, qy, qz) - Re; if (hj < 0) { blocked = true; break; }
      lR += Math.exp(-hj / Hr) * sl; lM += Math.exp(-hj / Hm) * sl;
    }
    if (blocked) continue;
    for (let k = 0; k < 3; k++) {
      const tau = (betaR[k] + betaO[k] * 1.8) * (odR + lR) + betaM * 1.1 * (odM + lM); const att = Math.exp(-tau);
      sumR[k] += att * hr; sumM[k] += att * hm;
    }
  }
  const E = 22;
  return [0, 1, 2].map((k) => E * (sumR[k] * betaR[k] * phR + sumM[k] * betaM * phM));
}
// filmic tonemap (ACES fit) + sRGB
export function tonemap(c, exposure = 1) {
  return c.map((x) => { x *= exposure; const y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); const v = Math.min(1, Math.max(0, y)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); });
}
// Paint a sky into ctx for a camera looking along azimuth camAz (radians from north), horizontal fov, horizon at row hy.
export function paintSky(ctx, W, H, hy, { camAz, fov, sun, exposure = 1, grid = 6 }) {
  const se = sun.elevation, sa = sun.azimuth;
  // world frame: x = east, y = up, z = north
  const sunDir = [Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa)];
  const f = (W / 2) / Math.tan(fov / 2);
  const gw = Math.ceil(W / grid) + 1, gh = Math.ceil(hy / grid) + 2;
  const buf = new Float32Array(gw * gh * 3);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const sx = i * grid - W / 2, sy = hy - j * grid;               // sy > 0 above horizon
    const yaw = camAz + Math.atan2(sx, f), pitch = Math.atan2(Math.max(sy, 0.5), Math.hypot(sx, f));
    const d = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const c = skyRadiance(d, sunDir);
    buf.set(c, (j * gw + i) * 3);
  }
  const img = ctx.createImageData(W, hy); const D = img.data;
  for (let y = 0; y < hy; y++) {
    const gy = (hy - y) / grid, j0 = Math.floor(gy), ty = gy - j0;
    for (let x = 0; x < W; x++) {
      const gx = x / grid, i0 = Math.floor(gx), tx = gx - i0;
      const o = (y * W + x) * 4; const c = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const a = buf[(j0 * gw + i0) * 3 + k], b = buf[(j0 * gw + i0 + 1) * 3 + k], cc = buf[((j0 + 1) * gw + i0) * 3 + k], dd = buf[((j0 + 1) * gw + i0 + 1) * 3 + k];
        c[k] = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty;
      }
      const t = tonemap(c, exposure); D[o] = t[0]; D[o + 1] = t[1]; D[o + 2] = t[2]; D[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { sunDir, sunScreenX: W / 2 + f * Math.tan(((sa - camAz + 3 * Math.PI) % (2 * Math.PI)) - Math.PI), sunScreenY: hy - f * Math.tan(se) };
}
