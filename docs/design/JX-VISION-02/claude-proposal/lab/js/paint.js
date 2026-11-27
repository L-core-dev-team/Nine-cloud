// Procedural painting toolkit for the JX-VISION-02 concept lab (non-production design evidence).
// Everything is generated from code: no photographs, no third-party artwork.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// 1D/2D value noise with smooth interpolation and fBm.
export function makeNoise(seed) {
  const r = rng(seed); const P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const fade = t => t * t * (3 - 2 * t);
  const n1 = x => { const i = Math.floor(x), f = x - i; const a = P[i & 511], b = P[(i + 1) & 511]; return a + (b - a) * fade(f); };
  const h2 = (x, y) => P[(x * 73 + y * 151 + ((x * y) & 127)) & 511];
  const n2 = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
    const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm1 = (x, oct = 5, lac = 2.03, gain = 0.5) => { let v = 0, a = 1, f = 1, norm = 0; for (let o = 0; o < oct; o++) { v += a * n1(x * f + o * 17.3); norm += a; a *= gain; f *= lac; } return v / norm; };
  const ridge1 = (x, oct = 6) => { let v = 0, a = 1, f = 1, norm = 0; for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(n1(x * f + o * 31.7) * 2 - 1); v += a * n * n; norm += a; a *= 0.52; f *= 2.1; } return v / norm; };
  const fbm2 = (x, y, oct = 4) => { let v = 0, a = 1, f = 1, norm = 0; for (let o = 0; o < oct; o++) { v += a * n2(x * f + o * 5.1, y * f - o * 3.7); norm += a; a *= 0.5; f *= 2; } return v / norm; };
  return { n1, n2, fbm1, ridge1, fbm2 };
}

export const PIGMENT = {
  silk: [216, 199, 160], silkDeep: [196, 176, 134],
  azurite: [42, 98, 128],      // 石青
  azuriteLight: [112, 158, 170],
  malachite: [58, 128, 98],    // 石绿
  malachiteLight: [138, 176, 136],
  ochre: [168, 112, 62],       // 赭石
  ink: [34, 30, 26],           // 墨
  cinnabar: [178, 46, 34],     // 朱砂（印泥）
  gold: [196, 154, 74],        // 泥金
};
export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// A mountain mass: ridge polyline from x0..x1 with an envelope peak shape.
export function ridgeLine(noise, { x0, x1, base, height, peaks = [[0.5, 1, 0.3]], rough = 0.28, freq = 3.2, step = 3, seed = 0 }) {
  const pts = [];
  for (let x = x0; x <= x1 + step; x += step) {
    const u = (x - x0) / (x1 - x0);
    let env = 0;
    for (const [c, h, w] of peaks) env = Math.max(env, h * Math.exp(-((u - c) ** 2) / (2 * w * w)));
    const n = noise.ridge1(u * freq + seed) * rough + (1 - rough);
    pts.push([x, base - height * env * n]);
  }
  return pts;
}

// Fill a mountain with layered mineral colour, ink contour and texture strokes (皴).
export function paintMountain(ctx, noise, R, pts, base, opts) {
  const { top = PIGMENT.azurite, mid = PIGMENT.malachite, foot = PIGMENT.ochre, contour = 0.55, cun = 900, haze = 0, inkW = 2.2 } = opts;
  let minY = Infinity; for (const p of pts) minY = Math.min(minY, p[1]);
  const path = new Path2D(); path.moveTo(pts[0][0], base); for (const p of pts) path.lineTo(p[0], p[1]); path.lineTo(pts[pts.length - 1][0], base); path.closePath();
  ctx.save(); ctx.clip(path);
  const g = ctx.createLinearGradient(0, minY, 0, base);
  g.addColorStop(0, rgba(mix(top, PIGMENT.silk, haze), 0.97));
  g.addColorStop(0.45, rgba(mix(mid, PIGMENT.silk, haze), 0.95));
  g.addColorStop(0.9, rgba(mix(foot, PIGMENT.silk, haze), 0.9));
  g.addColorStop(1, rgba(mix(PIGMENT.silk, PIGMENT.silkDeep, 0.3), 0.6));
  ctx.fillStyle = g; ctx.fillRect(pts[0][0] - 10, minY - 10, pts[pts.length - 1][0] - pts[0][0] + 20, base - minY + 20);
  // Texture strokes: short down-slope strokes concentrated near ridges.
  for (let i = 0; i < cun; i++) {
    const k = Math.floor(R() * pts.length); const [x, y] = pts[k];
    const depth = Math.pow(R(), 1.6) * (base - y) * 0.85; const yy = y + depth; const xx = x + (R() - 0.5) * 14;
    const slope = (pts[Math.min(k + 1, pts.length - 1)][1] - pts[Math.max(k - 1, 0)][1]);
    const len = 6 + R() * 22; const ang = Math.PI / 2 + Math.atan(slope * 0.12) + (R() - 0.5) * 0.6;
    const shade = R() < 0.55 ? mix(PIGMENT.ink, top, 0.5) : (R() < 0.5 ? mid : top);
    ctx.strokeStyle = rgba(mix(shade, PIGMENT.silk, haze), (0.05 + R() * 0.16) * (1 - depth / (base - y + 1) * 0.6));
    ctx.lineWidth = 0.6 + R() * 1.8; ctx.beginPath(); ctx.moveTo(xx, yy);
    ctx.quadraticCurveTo(xx + Math.cos(ang) * len * 0.5 + (R() - 0.5) * 6, yy + Math.sin(ang) * len * 0.5, xx + Math.cos(ang) * len, yy + Math.sin(ang) * len); ctx.stroke();
  }
  // Interior folds (内轮廓): ink lines from ridge points down into the mass.
  const folds = opts.folds ?? 0;
  for (let f = 0; f < folds; f++) {
    const k = Math.floor(R() * pts.length); let [x, y] = pts[k]; const len = (base - y) * (0.3 + R() * 0.5);
    ctx.strokeStyle = rgba(mix(PIGMENT.ink, top, 0.35), (0.16 + R() * 0.18) * (1 - haze)); ctx.lineWidth = 0.8 + R() * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y + 2); const dir = R() < 0.5 ? -1 : 1;
    ctx.bezierCurveTo(x + dir * len * 0.15, y + len * 0.35, x + dir * len * 0.35, y + len * 0.6, x + dir * len * 0.4, y + len); ctx.stroke();
  }
  // Light: a warm wash on the sun-facing side and cool shade on the other (pigment that receives real light).
  if (opts.sun) {
    const [sx, sy, warm = 0.42] = opts.sun; const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    const lg = ctx.createLinearGradient(sx < (x0 + x1) / 2 ? x0 : x1, 0, sx < (x0 + x1) / 2 ? x1 : x0, 0);
    lg.addColorStop(0, `rgba(250,196,118,${warm * (1 - haze)})`); lg.addColorStop(0.55, 'rgba(250,196,118,0)'); lg.addColorStop(1, `rgba(20,40,70,${0.28 * (1 - haze)})`);
    ctx.fillStyle = lg; ctx.fillRect(x0, minY, x1 - x0, base - minY);
    const vg = ctx.createLinearGradient(0, minY, 0, base); vg.addColorStop(0, 'rgba(255,220,160,0)'); vg.addColorStop(0.7, 'rgba(255,240,220,0)'); vg.addColorStop(1, `rgba(236,228,208,${0.55 * (1 - haze * 0.5)})`);
    ctx.fillStyle = vg; ctx.fillRect(x0, minY, x1 - x0, base - minY); // foot dissolving into mist
  }
  ctx.restore();
  // Rim light along ridge segments that face the sun.
  if (opts.sun) {
    const [sx, sy] = opts.sun;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const nx = -(by - ay), ny = bx - ax; // left normal points up for left-to-right ridges
      const lx = sx - bx, ly = sy - by; const len = Math.hypot(nx, ny) * Math.hypot(lx, ly) || 1;
      const facing = (nx * lx + ny * ly) / len; if (facing < 0.15) continue;
      ctx.strokeStyle = `rgba(255,214,150,${Math.min(0.85, facing) * 0.8 * (1 - haze)})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ax, ay + 0.6); ctx.lineTo(bx, by + 0.6); ctx.stroke();
    }
  }
  // Moss dots (苔点) along the ridge.
  for (let i = 0; i < (opts.moss ?? 0); i++) {
    const [x, y] = pts[Math.floor(R() * pts.length)];
    ctx.fillStyle = rgba(mix(PIGMENT.ink, PIGMENT.malachite, 0.25), (0.5 + R() * 0.4) * (1 - haze)); ctx.beginPath(); ctx.ellipse(x + (R() - 0.5) * 6, y + 2 + R() * 10, 1 + R() * 1.6, 0.8 + R(), 0, 0, Math.PI * 2); ctx.fill();
  }
  // Ink contour with pressure variation (勾勒).
  for (let i = 1; i < pts.length; i++) {
    const w = inkW * (0.35 + noise.fbm1(i * 0.05 + 3) * 1.1);
    ctx.strokeStyle = rgba(mix(PIGMENT.ink, PIGMENT.silk, haze * 0.9), contour * (0.5 + noise.n1(i * 0.11) * 0.6));
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  }
}

// Pine trees as ink glyphs along a ridge.
export function pines(ctx, R, pts, count, scale = 1, haze = 0) {
  for (let i = 0; i < count; i++) {
    const [x, y] = pts[Math.floor(R() * pts.length)]; const h = (10 + R() * 18) * scale;
    const col = rgba(mix(mix(PIGMENT.ink, PIGMENT.malachite, 0.35), PIGMENT.silk, haze), 0.75);
    ctx.strokeStyle = col; ctx.lineWidth = 1.1 * scale; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + (R() - 0.5) * 3, y - h); ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const yy = y - h * (0.25 + k * 0.17); const w = (8 - k * 1.3) * scale * (0.8 + R() * 0.4);
      ctx.lineWidth = (1.6 - k * 0.15) * scale; ctx.beginPath(); ctx.moveTo(x - w, yy + 1.5 * scale); ctx.quadraticCurveTo(x, yy - 2 * scale, x + w, yy + 1.5 * scale); ctx.stroke();
    }
  }
}

// Horizontal mist band.
export function mist(ctx, noise, R, { y, h, x0, x1, alpha = 0.7, color = [236, 228, 208] }) {
  for (let i = 0; i < 70; i++) {
    const x = x0 + R() * (x1 - x0); const yy = y + (R() - 0.5) * h * 0.6; const rx = 80 + R() * 260; const ry = h * (0.25 + R() * 0.35);
    const g = ctx.createRadialGradient(x, yy, 0, x, yy, rx);
    const a = alpha * (0.25 + noise.fbm1(x * 0.004 + 9) * 0.6);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
    ctx.save(); ctx.translate(x, yy); ctx.scale(1, ry / rx); ctx.translate(-x, -yy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, yy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

// Reeds with pale plumes (芦花).
export function reeds(ctx, R, { x0, x1, baseY, count, height, lean = 0.25 }) {
  for (let i = 0; i < count; i++) {
    const x = x0 + R() * (x1 - x0); const h = height * (0.5 + R() * 0.7); const l = (lean + (R() - 0.5) * 0.3) * h;
    ctx.strokeStyle = rgba(mix(PIGMENT.ink, PIGMENT.ochre, 0.45), 0.55 + R() * 0.3); ctx.lineWidth = 0.8 + R() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x + l * 0.3, baseY - h * 0.6, x + l, baseY - h); ctx.stroke();
    // plume
    const px = x + l, py = baseY - h;
    for (let k = 0; k < 10; k++) {
      ctx.strokeStyle = rgba(mix([238, 228, 205], PIGMENT.ochre, R() * 0.25), 0.35 + R() * 0.35); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + l * 0.12 + (R() - 0.3) * 10, py - 4 - R() * 14); ctx.stroke();
    }
  }
}

// Paper/silk grain and age vignette, applied per pixel.
export function silkGrain(ctx, w, h, noise, strength = 1, vignette = 0.35, tint = [0, 0, 0]) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let y = 0; y < h; y++) {
    const fy = noise.n1(y * 0.9) * 6 - 3; // horizontal fibres
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const grain = (Math.random() - 0.5) * 10 * strength + fy * 0.6 * strength + (noise.n2(x * 0.02, y * 0.6) - 0.5) * 8 * strength;
      const dx = (x / w - 0.5), dy = (y / h - 0.5); const v = 1 - vignette * (dx * dx * 1.6 + dy * dy * 2.2);
      const stain = (noise.fbm2(x * 0.0025, y * 0.0025) - 0.5) * 18 * strength;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); const sat = mx ? (mx - mn) / mx : 0;
      const gran = sat > 0.28 ? (Math.random() - 0.5) * 34 * sat * strength + (noise.n2(x * 0.35, y * 0.35) - 0.5) * 26 * sat * strength : 0;
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] + grain + stain + gran + tint[c]) * v));
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Seal (印) with irregular border, carved characters.
export function seal(ctx, { x, y, size, text, font, red = PIGMENT.cinnabar, rot = 0, R }) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = rgba(red, 0.88); ctx.beginPath();
  const s = size; const j = () => (R() - 0.5) * s * 0.04;
  ctx.moveTo(-s / 2 + j(), -s / 2 + j()); ctx.lineTo(s / 2 + j(), -s / 2 + j()); ctx.lineTo(s / 2 + j(), s / 2 + j()); ctx.lineTo(-s / 2 + j(), s / 2 + j()); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const chars = Array.from(text);
  if (chars.length === 1) ctx.fillText(chars[0], 0, s * 0.03);
  else if (chars.length === 2) { ctx.fillText(chars[0], 0, -s * 0.22); ctx.fillText(chars[1], 0, s * 0.24); }
  else { ctx.fillText(chars[0], s * 0.22, -s * 0.22); ctx.fillText(chars[1], s * 0.22, s * 0.24); ctx.fillText(chars[2], -s * 0.22, -s * 0.22); if (chars[3]) ctx.fillText(chars[3], -s * 0.22, s * 0.24); }
  // worn speckles
  for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((R() - 0.5) * s, (R() - 0.5) * s, R() * s * 0.025, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// Vertical text columns, right to left, like a colophon (题跋).
export function verticalText(ctx, { x, y, lines, size, lead = 1.5, font, color = PIGMENT.ink, alpha = 0.86, jitter = 0, R }) {
  ctx.save(); ctx.fillStyle = rgba(color, alpha); ctx.font = `${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  let cx = x;
  for (const line of lines) {
    let cy = y;
    for (const ch of Array.from(line)) {
      const punct = '，。、；：「」'.includes(ch);
      ctx.save(); ctx.translate(cx + (jitter ? (R() - 0.5) * jitter : 0), cy);
      if (punct) { ctx.font = `${size * 0.8}px ${font}`; ctx.fillText(ch === '「' ? '﹁' : ch === '」' ? '﹂' : ch, size * 0.28, -size * 0.25); }
      else ctx.fillText(ch, 0, 0);
      ctx.restore(); cy += punct ? size * 0.55 : size * 1.08;
    }
    cx -= size * lead;
  }
  ctx.restore();
}
