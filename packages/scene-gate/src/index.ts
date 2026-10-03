import * as THREE from 'three';

export const GATE_LOOP_SECONDS = 8;
export const GATE_FPS = 30;
export type GateScene = {
  renderAt: (seconds: number) => void;
  resize: (width: number, height: number, pixelRatio?: number) => void;
  setCameraOffset: (x: number, y: number) => void;
  resetCamera: () => void;
  dispose: () => void;
};

/** A visual study of the gate. It carries no game state or story authority. */
export function createGateScene(canvas: HTMLCanvasElement, width: number, height: number): GateScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06111b');
  scene.fog = new THREE.FogExp2('#142635', 0.024);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 110);
  const ambient = new THREE.AmbientLight('#b6cddd', 1.25);
  scene.add(ambient);
  const moonLight = new THREE.DirectionalLight('#c6dfeb', 1.8);
  moonLight.position.set(0, 11, -8);
  scene.add(moonLight);
  const warmLight = new THREE.PointLight('#bc9a71', 14, 12);
  warmLight.position.set(0, 2.1, 0.5);
  scene.add(warmLight);

  const mat = (color: string, roughness = 1, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const stone = mat('#222c33');
  const stoneTop = mat('#5a6770');
  const timber = mat('#261d23');
  const timberEdge = mat('#6b4c48');
  const roof = mat('#152733', 0.9);
  const roofEdge = mat('#8e9294', 0.8);
  const pale = new THREE.MeshBasicMaterial({ color: '#e8f0ec', toneMapped: false });
  const water = new THREE.MeshStandardMaterial({ color: '#0b2535', metalness: 0.26, roughness: 0.27, side: THREE.DoubleSide });
  const glint = new THREE.MeshBasicMaterial({ color: '#78a6b1', transparent: true, opacity: 0.24, depthWrite: false });
  const mistMat = new THREE.MeshBasicMaterial({ color: '#abc3c8', transparent: true, opacity: 0.065, depthWrite: false, side: THREE.DoubleSide });
  const petalMat = new THREE.MeshBasicMaterial({ color: '#aa8796', transparent: true, opacity: 0.64, depthWrite: false, side: THREE.DoubleSide });
  const branchMat = mat('#281f28');
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
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
  function mountain(points: number[], z: number, color: string) {
    const shape = new THREE.Shape();
    shape.moveTo(-35, -4);
    for (let i = 0; i < points.length; i += 2) shape.lineTo(points[i]!, points[i + 1]!);
    shape.lineTo(35, -4);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true }));
    mesh.position.z = z;
    scene.add(mesh);
  }

  // Three depth planes frame the central gate without defining any canon geography.
  mountain([-35, 3, -29, 5.5, -23, 3.7, -17, 7.1, -10, 3.8, -4, 5.5, 2, 2.4, 8, 6.3, 14, 4.2, 21, 6.5, 28, 3.8, 35, 5], -27, '#132834');
  mountain([-35, 0, -28, 2.1, -21, 4.5, -15, 2.4, -9, 5.4, -3, 1.2, 5, 4.5, 12, 2.6, 19, 5.8, 27, 2.3, 35, 4.1], -19, '#0c1c29');
  mountain([-35, -1, -25, 1.6, -19, 3.4, -12, 0.4, -6, 2.5, 1, -0.2, 8, 2.7, 16, 0.6, 22, 3.4, 29, 0.7, 35, 1.2], -11, '#0a1924');

  const moon = new THREE.Mesh(new THREE.CircleGeometry(1.32, 64), pale);
  moon.position.set(3.6, 8.55, -23);
  scene.add(moon);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.38, 2.85, 64), new THREE.MeshBasicMaterial({ color: '#a8c4cc', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  halo.position.set(3.6, 8.55, -23.1);
  scene.add(halo);
  softLight(3.6, 8.55, -22.9, 6.8, 6.8, '#b6d1dd', 0.26);
  softLight(0, 5.0, -5, 1.8, 11.0, '#c4e4ec', 0.17);
  softLight(0, 2.6, -1.8, 5.5, 5.5, '#f6e0bd', 0.28);
  softLight(0, 1.5, 0.8, 2.0, 2.9, '#f5d3a1', 0.16);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.08 + i * 0.085, 3.5 + i * 0.37), new THREE.MeshBasicMaterial({ color: '#bfd6df', transparent: true, opacity: 0.16 - i * 0.025, depthWrite: false, side: THREE.DoubleSide }));
      fall.position.set(side * (10.3 + i * 0.2), 1.7, -15.8 + i * 0.06);
      scene.add(fall);
    }
    softLight(side * 10.4, 1.2, -15.5, 2.2, 4.8, '#bed4da', 0.21);
    softLight(side * 7.5, 0.5, -4.8, 7.2, 2.4, '#b9d2d8', 0.14);
    softLight(side * 14, 0.1, -9, 10, 3.2, '#afc8d0', 0.1);
  }

  // The path and the gate are actual geometry; restricted camera motion exposes parallax.
  box(6.8, 0.75, 4.4, stone, 0, -0.36, -0.3);
  box(7.25, 0.16, 4.7, stoneTop, 0, 0.05, -0.3);
  for (let i = 0; i < 8; i++) {
    const z = 2.0 + i * 0.58;
    box(6.8 - i * 0.2, 0.22, 0.52, i % 2 ? stone : stoneTop, 0, -0.14 - i * 0.13, z);
  }
  for (const x of [-2.25, 2.25]) {
    box(0.39, 4.65, 0.46, timber, x, 2.46, 0.35);
    box(0.51, 0.17, 0.55, timberEdge, x, 4.74, 0.35);
    cylinder(0.34, 0.72, stone, x, 0.37, 0.35);
  }
  box(6.2, 0.32, 0.55, timber, 0, 4.37, 0.32);
  box(5.3, 0.58, 0.32, timber, 0, 3.98, 0.33);
  for (const side of [-1, 1]) {
    const wing = box(2.75, 0.26, 2.25, roof, side * 1.64, 5.02, 0.18);
    wing.rotation.z = side * 0.15;
    const eave = box(2.9, 0.085, 2.38, roofEdge, side * 1.76, 4.91, 0.18);
    eave.rotation.z = side * 0.15;
    box(0.18, 0.7, 0.23, roofEdge, side * 3.06, 5.19, 0.18).rotation.z = side * 0.4;
  }
  box(1.35, 0.25, 0.5, roof, 0, 5.26, 0.18);
  box(1.26, 0.055, 0.58, roofEdge, 0, 5.13, 0.18);
  for (const x of [-1.6, 1.6]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.105, 9, 7), new THREE.MeshBasicMaterial({ color: '#f8d8a6', toneMapped: false }));
    lantern.position.set(x, 3.74, 0.64);
    scene.add(lantern);
    softLight(x, 3.74, 0.72, 1.2, 1.2, '#f7ba75', 0.42);
  }

  for (const side of [-1, 1]) {
    const bank = box(15, 0.65, 20, mat(side < 0 ? '#101c23' : '#11232b'), side * 11.8, -1.12, 4.4);
    bank.rotation.y = side * 0.07;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 16), water);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(side * 7.75, -0.66, 5.2);
    scene.add(pool);
    for (let i = 0; i < 16; i++) {
      const line = box(0.7 + (i % 5) * 0.2, 0.008, 0.014, glint, side * (4.2 + (i % 4) * 1.0), -0.63, -0.5 + i * 0.74);
      line.rotation.y = side * 0.14;
    }
    // Sparse angular trees and plum, dark enough to frame rather than dominate.
    for (let i = 0; i < 3; i++) {
      const tree = new THREE.Group();
      tree.position.set(side * (8.5 + i * 3), -0.55, -2.8 - i * 3.4);
      scene.add(tree);
      cylinder(0.12, 1.7 + i * 0.25, branchMat, 0, 0.8, 0, tree);
      for (let k = 0; k < 4; k++) {
        const limb = cylinder(0.035, 1.0, branchMat, (k % 2 ? 1 : -1) * 0.38, 1.35 + k * 0.16, 0, tree);
        limb.rotation.z = (k % 2 ? -1 : 1) * 0.65;
      }
    }
  }

  const mistBands: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(20 + i * 4, 0.78 + i * 0.28), mistMat.clone());
    band.position.set(0, 0.4 + i * 0.25, -5 - i * 2.4);
    scene.add(band);
    mistBands.push(band);
  }
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 3.5;
    softLight(x, -0.45 + (i % 3) * 0.16, -1.4 - (i % 4) * 2.1, 8.0, 1.8, '#bacbd0', 0.1);
  }
  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.025 + (i % 3) * 0.008, 5), petalMat);
    mesh.position.set(Math.sin(i * 34.73) * 7, 0.7 + (i % 9) * 0.44, 2 + Math.cos(i * 12.13) * 4.5);
    scene.add(mesh);
    petals.push(mesh);
  }
  let offsetX = 0;
  let offsetY = 0;
  let disposed = false;
  function resize(nextWidth: number, nextHeight: number, pixelRatio = 1) {
    if (disposed) return;
    renderer.setPixelRatio(Math.min(2, Math.max(0.5, pixelRatio)));
    renderer.setSize(Math.max(1, nextWidth), Math.max(1, nextHeight), false);
    camera.aspect = nextWidth / Math.max(1, nextHeight);
    camera.fov = camera.aspect < 0.8 ? 51 : 34;
    camera.updateProjectionMatrix();
  }
  function renderAt(seconds: number) {
    if (disposed) return;
    const t = ((seconds % GATE_LOOP_SECONDS) + GATE_LOOP_SECONDS) % GATE_LOOP_SECONDS;
    const phase = t / GATE_LOOP_SECONDS * Math.PI * 2;
    camera.position.set(Math.sin(phase) * 0.13 + offsetX, 4.25 + Math.sin(phase + 0.8) * 0.035 + offsetY, 22.5);
    camera.lookAt(offsetX * 0.18, 2.45 + offsetY * 0.12, -1.0);
    mistBands.forEach((band, i) => {
      band.position.x = Math.sin(phase + i * 1.7) * (0.28 + i * 0.09);
      (band.material as THREE.MeshBasicMaterial).opacity = 0.04 + 0.025 * (0.5 + 0.5 * Math.sin(phase + i));
    });
    petals.forEach((petal, i) => {
      const drift = phase + i * 2.399;
      petal.position.x = Math.sin(i * 34.73) * 7 + Math.sin(drift) * 0.28;
      petal.position.y = 0.7 + (i % 9) * 0.44 + Math.sin(drift) * 0.12;
      petal.rotation.z = Math.sin(drift) * 0.7;
    });
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(material => materials.add(material));
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    softTexture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  resize(width, height);
  renderAt(0);
  return {
    renderAt, resize,
    setCameraOffset(x, y) { offsetX = THREE.MathUtils.clamp(x, -1.0, 1.0); offsetY = THREE.MathUtils.clamp(y, -0.38, 0.38); },
    resetCamera() { offsetX = 0; offsetY = 0; },
    dispose,
  };
}
