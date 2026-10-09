import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const GATE_LOOP_SECONDS = 8;
export const GATE_FPS = 30;
export type GateEnvironment = { landscape: string; portrait: string };
export type GateScene = {
  readonly ready: Promise<void>;
  renderAt: (seconds: number) => void;
  resize: (width: number, height: number, pixelRatio?: number) => void;
  setCameraOffset: (x: number, y: number) => void;
  resetCamera: () => void;
  dispose: () => void;
};
export type GateSceneOptions = { preserveDrawingBuffer?: boolean };

function paintInkLandscape(canvas: HTMLCanvasElement, aspect: number): void {
  const height = 1440;
  const width = Math.round(height * THREE.MathUtils.clamp(aspect, 0.5, 2));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const w = width;
  const h = height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#07121e');
  gradient.addColorStop(0.34, '#293a49');
  gradient.addColorStop(0.57, '#8a9aa0');
  gradient.addColorStop(0.72, '#bdc3bc');
  gradient.addColorStop(1, '#172936');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const moonX = w * 0.72;
  const moonY = h * 0.2;
  const moonR = h * 0.072;
  const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.7, moonX, moonY, moonR * 5.8);
  halo.addColorStop(0, 'rgba(226,235,227,.42)');
  halo.addColorStop(0.34, 'rgba(177,200,207,.16)');
  halo.addColorStop(1, 'rgba(146,177,191,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fillStyle = '#e6e9dd';
  ctx.shadowColor = 'rgba(230,239,229,.5)';
  ctx.shadowBlur = moonR * 0.55;
  ctx.fill();
  ctx.shadowBlur = 0;
  for (let i = 0; i < 18; i++) {
    const x = moonX + (random() - 0.5) * moonR * 1.55;
    const y = moonY + (random() - 0.5) * moonR * 1.55;
    const r = moonR * (0.018 + random() * 0.055);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(107,130,139,${0.08 + random() * 0.11})`;
    ctx.fill();
  }

  // Broad cloud strokes soften the moon and keep the center of the frame open.
  for (let i = 0; i < 30; i++) {
    const y = h * (0.19 + random() * 0.39);
    const x = -w * 0.08 + random() * w * 1.16;
    const span = w * (0.06 + random() * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + span * 0.28, y - h * 0.025, x + span * 0.65, y + h * 0.03, x + span, y - h * 0.008);
    ctx.strokeStyle = `rgba(210,222,220,${0.025 + random() * 0.045})`;
    ctx.lineWidth = h * (0.018 + random() * 0.04);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(206,222,223,.28)';
    ctx.shadowBlur = h * 0.022;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  const layers = [
    { base: 0.59, peak: 0.25, color: '#172735', stroke: 'rgba(174,196,199,.2)' },
    { base: 0.65, peak: 0.2, color: '#20323e', stroke: 'rgba(186,201,199,.22)' },
    { base: 0.72, peak: 0.145, color: '#2b3b43', stroke: 'rgba(202,211,204,.25)' },
  ];
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]!;
    const points: Array<{ x: number; y: number }> = [];
    const count = Math.max(12, Math.round(w / 115));
    for (let i = 0; i <= count; i++) {
      const x = -w * 0.08 + (w * 1.16 * i) / count;
      const edgeBoost = i < 3 || i > count - 3 ? 0.55 : 1;
      const peak = layer.peak * h * edgeBoost * (0.35 + random() * 0.8);
      const y = layer.base * h - peak;
      points.push({ x, y });
    }
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, h * 0.79);
    ctx.lineTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1]!;
      const current = points[i]!;
      const midX = (previous.x + current.x) / 2;
      const midY = (previous.y + current.y) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
    }
    ctx.lineTo(points.at(-1)!.x, h * 0.79);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < Math.round(w / 5); i++) {
      const index = Math.floor(random() * (points.length - 2));
      const ridge = points[index]!;
      const x = ridge.x + random() * w * 0.09;
      const y = ridge.y + random() * h * 0.21;
      ctx.beginPath();
      ctx.moveTo(ridge.x, ridge.y + h * 0.015);
      ctx.quadraticCurveTo(x - w * 0.018, y, x, y + h * (0.018 + random() * 0.035));
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = h * (0.0007 + random() * 0.0016);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Waterfalls descend from the side ridges. Broken strokes imitate ink on absorbent paper.
  for (const side of [-1, 1]) {
    const x = side < 0 ? w * 0.17 : w * 0.86;
    for (let i = 0; i < 13; i++) {
      const startX = x + (random() - 0.5) * w * 0.035;
      const endX = startX + (random() - 0.5) * w * 0.05;
      ctx.beginPath();
      ctx.moveTo(startX, h * (0.39 + random() * 0.06));
      ctx.bezierCurveTo(startX - side * w * 0.015, h * 0.53, endX + side * w * 0.018, h * 0.61, endX, h * (0.69 + random() * 0.035));
      ctx.strokeStyle = `rgba(226,232,222,${0.12 + random() * 0.2})`;
      ctx.lineWidth = w * (0.0012 + random() * 0.0022);
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(226,235,226,.45)';
      ctx.shadowBlur = h * 0.012;
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  const mist = ctx.createLinearGradient(0, h * 0.52, 0, h * 0.78);
  mist.addColorStop(0, 'rgba(200,215,210,0)');
  mist.addColorStop(0.46, 'rgba(215,224,215,.34)');
  mist.addColorStop(1, 'rgba(204,218,211,.12)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, h * 0.49, w, h * 0.32);
  const beam = ctx.createLinearGradient(w * 0.5 - w * 0.035, 0, w * 0.5 + w * 0.035, 0);
  beam.addColorStop(0, 'rgba(246,225,184,0)');
  beam.addColorStop(0.5, 'rgba(255,242,212,.23)');
  beam.addColorStop(1, 'rgba(246,225,184,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(w * 0.46, h * 0.36, w * 0.08, h * 0.53);

  const waterGradient = ctx.createLinearGradient(0, h * 0.72, 0, h);
  waterGradient.addColorStop(0, 'rgba(181,199,196,.34)');
  waterGradient.addColorStop(0.22, '#334650');
  waterGradient.addColorStop(1, '#0b1a25');
  ctx.fillStyle = waterGradient;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  for (let i = 0; i < Math.round(w / 4); i++) {
    const y = h * (0.75 + random() * 0.24);
    const centerBias = Math.max(0, 1 - Math.abs(random() - 0.5) * 5.5);
    const span = w * (0.015 + random() * 0.13) * (0.25 + centerBias);
    const x = w * 0.5 + (random() - 0.5) * w * 0.75;
    ctx.beginPath();
    ctx.moveTo(x - span * 0.5, y);
    ctx.quadraticCurveTo(x, y + (random() - 0.5) * 4, x + span * 0.5, y);
    ctx.strokeStyle = `rgba(${centerBias > 0.72 ? '226,211,178' : '185,205,207'},${0.035 + random() * 0.15})`;
    ctx.lineWidth = 1 + random() * 4;
    ctx.stroke();
  }
  // Fine paper grain is seeded so any timestamp produces the same plate.
  for (let i = 0; i < Math.round(w * h / 580); i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(236,231,215,.025)' : 'rgba(1,8,15,.035)';
    ctx.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2);
  }
}

/** A visual study of the gate. It carries no game state or story authority. */
export function createGateScene(canvas: HTMLCanvasElement, width: number, height: number, environment?: GateEnvironment, options: GateSceneOptions = {}): GateScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: options.preserveDrawingBuffer ?? false });
  try {
    return createGateSceneWithRenderer(renderer, width, height, environment);
  } catch (error) {
    try { renderer.dispose(); } catch { /* Release the context even if renderer cleanup fails. */ }
    try { renderer.forceContextLoss(); } catch { /* The browser may already have lost it. */ }
    throw error;
  }
}

function createGateSceneWithRenderer(renderer: THREE.WebGLRenderer, width: number, height: number, environment?: GateEnvironment): GateScene {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06111b');
  scene.fog = new THREE.FogExp2('#142635', 0.024);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 110);
  const ambient = new THREE.AmbientLight('#c5d0ce', 1.55);
  scene.add(ambient);
  const moonLight = new THREE.DirectionalLight('#d8ded2', 2.1);
  moonLight.position.set(-5, 11, 9);
  scene.add(moonLight);
  const warmLight = new THREE.PointLight('#bc9a71', 14, 12);
  warmLight.position.set(0, 2.1, 0.5);
  scene.add(warmLight);

  const surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = surfaceCanvas.height = 256;
  const surfaceContext = surfaceCanvas.getContext('2d');
  if (!surfaceContext) throw new Error('2D canvas is unavailable');
  surfaceContext.fillStyle = '#d4d0c6';
  surfaceContext.fillRect(0, 0, 256, 256);
  let surfaceSeed = 0x45d9f3b;
  const surfaceRandom = () => {
    surfaceSeed = (Math.imul(surfaceSeed, 1664525) + 1013904223) >>> 0;
    return surfaceSeed / 0x100000000;
  };
  for (let i = 0; i < 18000; i++) {
    const alpha = 0.025 + surfaceRandom() * 0.07;
    surfaceContext.fillStyle = surfaceRandom() > 0.52 ? `rgba(25,34,39,${alpha})` : `rgba(255,248,226,${alpha})`;
    surfaceContext.fillRect(surfaceRandom() * 256, surfaceRandom() * 256, 1 + surfaceRandom() * 2, 1 + surfaceRandom() * 2);
  }
  for (let i = 0; i < 96; i++) {
    const y = surfaceRandom() * 256;
    surfaceContext.beginPath();
    surfaceContext.moveTo(0, y);
    surfaceContext.bezierCurveTo(70, y + (surfaceRandom() - 0.5) * 7, 180, y + (surfaceRandom() - 0.5) * 7, 256, y + (surfaceRandom() - 0.5) * 5);
    surfaceContext.strokeStyle = `rgba(34,40,42,${0.025 + surfaceRandom() * 0.045})`;
    surfaceContext.lineWidth = 0.5 + surfaceRandom() * 1.2;
    surfaceContext.stroke();
  }
  const surfaceTexture = new THREE.CanvasTexture(surfaceCanvas);
  surfaceTexture.colorSpace = THREE.SRGBColorSpace;
  surfaceTexture.wrapS = surfaceTexture.wrapT = THREE.RepeatWrapping;
  const mat = (color: string, roughness = 1, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, map: surfaceTexture, roughnessMap: surfaceTexture, bumpMap: surfaceTexture, bumpScale: 0.024, flatShading: true });
  const stone = mat('#536269');
  const stoneTop = mat('#899394');
  const stairStone = mat('#626e73');
  const stairEdge = mat('#999e9b');
  const timber = mat('#403c3b');
  const timberEdge = mat('#81746b');
  const roof = mat('#303e40', 0.98);
  const roofEdge = mat('#8c938b', 0.92);
  const mistMat = new THREE.MeshBasicMaterial({ color: '#abc3c8', transparent: true, opacity: 0.065, depthWrite: false, side: THREE.DoubleSide });
  const petalMat = new THREE.MeshBasicMaterial({ color: '#b58a99', transparent: true, opacity: 0.46, depthWrite: false, side: THREE.DoubleSide });
  const softCanvas = document.createElement('canvas');
  softCanvas.width = softCanvas.height = 256;
  const softContext = softCanvas.getContext('2d');
  if (!softContext) throw new Error('2D canvas is unavailable');
  const softGradient = softContext.createRadialGradient(128, 128, 6, 128, 128, 127);
  softGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  softGradient.addColorStop(0.28, 'rgba(255,255,255,0.53)');
  softGradient.addColorStop(1, 'rgba(255,255,255,0)');
  softContext.fillStyle = softGradient;
  softContext.fillRect(0, 0, 256, 256);
  const softTexture = new THREE.CanvasTexture(softCanvas);
  function softLight(x: number, y: number, z: number, width: number, height: number, color: string, opacity: number) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sprite.position.set(x, y, z);
    sprite.scale.set(width, height, 1);
    scene.add(sprite);
    return sprite;
  }

  function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.024), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function cylinder(radius: number, h: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, h, 7), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function stairFoundation() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -2.55, -0.03, 1.52,  2.55, -0.03, 1.52,
       3.45, -0.88, 7.88, -3.45, -0.88, 7.88,
      -2.55, -1.1, 1.52,  2.55, -1.1, 1.52,
       3.45, -1.1, 7.88, -3.45, -1.1, 7.88,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
      3, 7, 6, 3, 6, 2,
      0, 1, 5, 0, 5, 4,
    ]);
    geometry.computeVertexNormals();
    const foundation = new THREE.Mesh(geometry, stone);
    scene.add(foundation);
    return foundation;
  }
  function rock(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation: number) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), stone);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rotation * 0.35, rotation, rotation * 0.18);
    scene.add(mesh);
    return mesh;
  }
  function curvedRoof(width: number, depth: number, centerY: number, rise: number, centerX = 0, centerZ = 0) {
    const half = width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -0.04);
    shape.quadraticCurveTo(-half * 0.84, 0.02, -half * 0.66, 0.19);
    shape.quadraticCurveTo(0, rise, half * 0.66, 0.19);
    shape.quadraticCurveTo(half * 0.84, 0.02, half, -0.04);
    shape.lineTo(half * 0.96, -0.22);
    shape.quadraticCurveTo(0, rise - 0.2, -half * 0.96, -0.22);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
    });
    geometry.translate(centerX, centerY, centerZ - depth / 2);
    const mesh = new THREE.Mesh(geometry, roof);
    scene.add(mesh);
    const outline = [
      new THREE.Vector3(centerX - half, centerY - 0.04, centerZ + depth / 2 + 0.02),
      new THREE.Vector3(centerX - half * 0.84, centerY + 0.02, centerZ + depth / 2 + 0.02),
      new THREE.Vector3(centerX - half * 0.66, centerY + 0.19, centerZ + depth / 2 + 0.02),
      new THREE.Vector3(centerX, centerY + rise, centerZ + depth / 2 + 0.02),
      new THREE.Vector3(centerX + half * 0.66, centerY + 0.19, centerZ + depth / 2 + 0.02),
      new THREE.Vector3(centerX + half * 0.84, centerY + 0.02, centerZ + depth / 2 + 0.02),
      new THREE.Vector3(centerX + half, centerY - 0.04, centerZ + depth / 2 + 0.02),
    ];
    const fascia = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline), 32, 0.025, 5, false), roofEdge);
    scene.add(fascia);
  }
  const inkCanvas = document.createElement('canvas');
  const inkTexture = new THREE.CanvasTexture(inkCanvas);
  inkTexture.colorSpace = THREE.SRGBColorSpace;
  inkTexture.generateMipmaps = true;
  inkTexture.minFilter = THREE.LinearMipmapLinearFilter;
  const inkPlateMaterial = new THREE.MeshBasicMaterial({ map: inkTexture, toneMapped: false, depthWrite: true, side: THREE.DoubleSide, fog: false });
  const inkPlate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), inkPlateMaterial);
  inkPlate.renderOrder = -1;
  scene.add(inkPlate);
  softLight(0, 2.6, -1.8, 5.5, 5.5, '#f6e0bd', 0.28);
  softLight(0, 5.4, -2.4, 0.72, 11.5, '#d6d7c9', 0.24);
  softLight(0, 1.5, 0.8, 2.0, 2.9, '#f5d3a1', 0.16);
  softLight(-7.5, 0.5, -4.8, 7.2, 2.4, '#b9d2d8', 0.1);
  softLight(7.5, 0.5, -4.8, 7.2, 2.4, '#b9d2d8', 0.1);

  // The threshold sits on stone piers; a filled stair causeway carries it into the lake.
  box(8.1, 0.75, 4.4, stone, 0, -0.36, -0.3);
  box(8.45, 0.16, 4.7, stoneTop, 0, 0.05, -0.3);
  const pierGeometry = new THREE.CylinderGeometry(0.42, 0.68, 1.18, 7);
  for (const x of [-3.15, 3.15]) {
    for (const z of [-1.48, 0.88]) {
      const pier = new THREE.Mesh(pierGeometry, stone);
      pier.position.set(x, -0.98, z);
      pier.rotation.y = (x * z) * 0.018;
      scene.add(pier);
    }
  }
  stairFoundation();
  for (const side of [-1, 1]) {
    rock(side * 3.78, -0.84, 1.3, 0.86, 0.32, 0.78, side * 0.72);
    rock(side * 3.55, -0.88, 7.18, 0.68, 0.26, 0.56, side * 0.41);
  }
  const stairCount = 9;
  for (let i = 0; i < stairCount; i++) {
    const progress = i / (stairCount - 1);
    const width = 5.1 + progress * 1.8;
    const top = 0.13 - progress * 0.85;
    const z = 1.86 + i * 0.61;
    box(width, 0.16, 0.71, stairStone, 0, top - 0.08, z);
    box(width * 0.99, 0.055, 0.1, stairEdge, 0, top - 0.035, z + 0.3);
    for (const side of [-1, 1]) {
      box(0.18, 0.18, 0.68, i % 3 === 0 ? stoneTop : stone, side * (width / 2 - 0.09), top + 0.08, z);
    }
  }
  box(7.0, 0.16, 0.84, stoneTop, 0, -0.8, 7.55);
  rock(-3.2, -0.85, 7.74, 0.58, 0.24, 0.5, 0.23);
  rock(3.35, -0.86, 7.76, 0.6, 0.24, 0.5, -0.37);
  for (const x of [-2.25, 2.25]) {
    box(0.39, 4.65, 0.46, timber, x, 2.46, 0.35);
    box(0.51, 0.17, 0.55, timberEdge, x, 4.74, 0.35);
    box(0.065, 3.5, 0.035, timberEdge, x, 2.5, 0.595);
    cylinder(0.34, 0.72, stone, x, 0.37, 0.35);
  }
  box(6.2, 0.32, 0.55, timber, 0, 4.37, 0.32);
  box(5.78, 0.24, 0.58, timber, 0, 4.83, 0.32);
  box(5.94, 0.07, 0.64, timberEdge, 0, 4.985, 0.32);
  for (const x of [-2.25, 2.25]) {
    box(0.7, 0.1, 0.94, timberEdge, x, 4.99, 0.32);
    box(0.42, 0.22, 0.76, timber, x, 5.15, 0.32);
  }
  box(5.3, 0.58, 0.32, timber, 0, 3.98, 0.33);
  box(1.8, 0.39, 0.07, timberEdge, 0, 3.98, 0.52);
  box(1.58, 0.23, 0.035, timber, 0, 3.98, 0.574);
  for (const x of [-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72]) box(0.035, 0.13, 0.022, roofEdge, x, 3.98, 0.599);
  curvedRoof(7.15, 2.3, 5.02, 0.79);
  for (const side of [-1, 1]) {
    box(0.34, 4.22, 0.4, timber, side * 3.72, 2.26, 0.18);
    box(0.46, 0.18, 0.48, timberEdge, side * 3.72, 4.42, 0.18);
    cylinder(0.29, 0.58, stone, side * 3.72, 0.37, 0.18);
    curvedRoof(4.35, 1.72, 4.82, 0.43, side * 2.48, 0.12);
  }
  curvedRoof(4.85, 1.78, 5.76, 0.61);
  curvedRoof(2.7, 1.28, 6.34, 0.43);
  box(0.22, 0.42, 0.24, roofEdge, 0, 7.08, 0.18);
  for (const x of [-3.18, -1.6, 1.6, 3.18]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.105, 9, 7), new THREE.MeshBasicMaterial({ color: '#f8d8a6', toneMapped: false }));
    lantern.position.set(x, Math.abs(x) > 2.5 ? 3.82 : 3.74, 0.64);
    scene.add(lantern);
    softLight(x, Math.abs(x) > 2.5 ? 3.82 : 3.74, 0.72, 1.2, 1.2, '#f7ba75', 0.42);
  }

  const mistBands: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(34 + i * 5, 1.2 + i * 0.34), mistMat.clone());
    band.position.set(0, 0.4 + i * 0.25, -5 - i * 2.4);
    scene.add(band);
    mistBands.push(band);
  }
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 3.5;
    softLight(x, -0.45 + (i % 3) * 0.16, -1.4 - (i % 4) * 2.1, 8.0, 1.8, '#bacbd0', 0.1);
  }
  const petals: Array<{ mesh: THREE.Mesh; x: number; y: number; z: number; phase: number }> = [];
  for (let i = 0; i < 20; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (3.0 + (i % 5) * 0.78);
    const y = 0.55 + (i % 7) * 0.49;
    const z = -1.2 + (i % 6) * 1.72;
    const radius = i < 6 ? 0.085 + (i % 3) * 0.018 : 0.052 + (i % 3) * 0.012;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 7), petalMat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    petals.push({ mesh, x, y, z, phase: i * 2.399 });
  }
  let offsetX = 0;
  let offsetY = 0;
  let disposed = false;
  let requestedBackdropUrl: string | null = null;
  let activeBackdropTexture: THREE.Texture | null = null;
  let backdropGeneration = 0;
  let backdropReady: Promise<void> = Promise.resolve();
  const textureLoader = new THREE.TextureLoader();
  function loadBackdrop(aspect: number) {
    const url = environment ? (aspect < 0.8 ? environment.portrait : environment.landscape) : null;
    if (!url) {
      paintInkLandscape(inkCanvas, aspect);
      inkTexture.needsUpdate = true;
      return;
    }
    if (url === requestedBackdropUrl) return;
    requestedBackdropUrl = url;
    const generation = ++backdropGeneration;
    backdropReady = textureLoader.loadAsync(url).then(texture => {
      if (disposed || generation !== backdropGeneration) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      activeBackdropTexture?.dispose();
      activeBackdropTexture = texture;
      inkPlateMaterial.map = texture;
      inkPlateMaterial.needsUpdate = true;
    }).catch(error => {
      if (disposed || generation !== backdropGeneration) return;
      if (generation === backdropGeneration) requestedBackdropUrl = null;
      throw error;
    });
  }
  function resize(nextWidth: number, nextHeight: number, pixelRatio = 1) {
    if (disposed) return;
    const safeWidth = Math.max(1, Number.isFinite(nextWidth) ? nextWidth : 1);
    const safeHeight = Math.max(1, Number.isFinite(nextHeight) ? nextHeight : 1);
    const safePixelRatio = Number.isFinite(pixelRatio) ? pixelRatio : 1;
    renderer.setPixelRatio(Math.min(2, Math.max(0.5, safePixelRatio)));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.fov = camera.aspect < 0.8 ? 60 : 46;
    camera.updateProjectionMatrix();
    const reference = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 110);
    reference.position.set(0, 4.25, 22.5);
    reference.lookAt(0, 4.0, -1.0);
    reference.updateMatrixWorld();
    const plateDistance = 43;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(reference.quaternion);
    inkPlate.position.copy(reference.position).addScaledVector(forward, plateDistance);
    inkPlate.quaternion.copy(reference.quaternion);
    const plateHeight = 2 * plateDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    inkPlate.scale.set(plateHeight * camera.aspect * 1.05, plateHeight * 1.05, 1);
    loadBackdrop(camera.aspect);
  }
  function renderAt(seconds: number) {
    if (disposed || !Number.isFinite(seconds)) return;
    const t = ((seconds % GATE_LOOP_SECONDS) + GATE_LOOP_SECONDS) % GATE_LOOP_SECONDS;
    const phase = t / GATE_LOOP_SECONDS * Math.PI * 2;
    camera.position.set(Math.sin(phase) * 0.78 + offsetX, 4.25 + Math.sin(phase + 0.8) * 0.12 + offsetY, 22.5);
    camera.lookAt(offsetX * 0.18, 3.95 + offsetY * 0.12, -1.0);
    mistBands.forEach((band, i) => {
      band.position.x = Math.sin(phase + i * 1.7) * (0.58 + i * 0.16);
      (band.material as THREE.MeshBasicMaterial).opacity = 0.03 + 0.045 * (0.5 + 0.5 * Math.sin(phase + i));
    });
    petals.forEach(({ mesh, x, y, z, phase: petalPhase }) => {
      const drift = phase + petalPhase;
      mesh.position.set(x + Math.sin(drift) * 0.72, y + Math.sin(drift + 0.9) * 0.24, z);
      mesh.rotation.z = Math.sin(drift) * 0.8;
    });
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    backdropGeneration++;
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse(object => {
      const resourceObject = object as THREE.Object3D & { geometry?: unknown; material?: unknown };
      if (resourceObject.geometry instanceof THREE.BufferGeometry) geometries.add(resourceObject.geometry);
      const attached = resourceObject.material;
      const list = Array.isArray(attached) ? attached : [attached];
      list.forEach(material => { if (material instanceof THREE.Material) materials.add(material); });
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    activeBackdropTexture?.dispose();
    inkTexture.dispose();
    surfaceTexture.dispose();
    softTexture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  resize(width, height);
  renderAt(0);
  return {
    get ready() { return backdropReady; },
    renderAt, resize,
    setCameraOffset(x, y) {
      if (Number.isFinite(x)) offsetX = THREE.MathUtils.clamp(x, -1.0, 1.0);
      if (Number.isFinite(y)) offsetY = THREE.MathUtils.clamp(y, -0.38, 0.38);
    },
    resetCamera() { offsetX = 0; offsetY = 0; },
    dispose,
  };
}
