import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// ─── Noise ───────────────────────────────────────────────────────────────────
const hash    = (x, y) => Math.abs((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1);
const lerp    = (a, b, t) => a + (b - a) * t;
const smooth  = t => t * t * (3 - 2 * t);
const noise2D = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  return lerp(
    lerp(hash(ix, iy),   hash(ix + 1, iy),   fx),
    lerp(hash(ix, iy+1), hash(ix + 1, iy+1), fx),
    fy
  );
};
const fbm = (x, y, oct = 6) => {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++, a *= 0.5, f *= 2.1) v += a * noise2D(x * f, y * f);
  return v;
};

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
let _seed = 0x9e3779b9;
const rng = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 0x100000000; };

// ─── Loading progress ─────────────────────────────────────────────────────────
const loadingEl  = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const setProgress = pct => { loadingBar.style.width = pct + '%'; };

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ─── Scene & Camera ───────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9bbfd8, 0.005);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);
// Start at edge of clearing, eye height, looking into the forest
camera.position.set(0, 2.5, 32);

// ─── First-person controls ────────────────────────────────────────────────────
const controls = new PointerLockControls(camera, document.body);

const overlay    = document.getElementById('overlay');
const crosshair  = document.getElementById('crosshair');
const hint       = document.getElementById('hint');

overlay.addEventListener('click', () => controls.lock());

controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  crosshair.classList.add('visible');
  hint.classList.add('visible');
});
controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden');
  crosshair.classList.remove('visible');
  hint.classList.remove('visible');
});

// Keyboard state
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// ─── Sky ──────────────────────────────────────────────────────────────────────
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value      = 3.5;
skyU.rayleigh.value       = 1.4;
skyU.mieCoefficient.value = 0.005;
skyU.mieDirectionalG.value = 0.82;

const sunDir = new THREE.Vector3();
sunDir.setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - 42),  // elevation
  THREE.MathUtils.degToRad(188)        // azimuth
);
skyU.sunPosition.value.copy(sunDir);

setProgress(15);

// ─── Lighting ─────────────────────────────────────────────────────────────────
// Sky colour top → ground colour bottom; provides natural fill on shadow sides
const hemi = new THREE.HemisphereLight(0xc8dff0, 0x4a6630, 1.1);
scene.add(hemi);

const sunLight = new THREE.DirectionalLight(0xfff0d8, 2.6);
sunLight.position.copy(sunDir).multiplyScalar(500);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near   = 10;
sunLight.shadow.camera.far    = 900;
sunLight.shadow.camera.left   = sunLight.shadow.camera.bottom = -220;
sunLight.shadow.camera.right  = sunLight.shadow.camera.top   =  220;
sunLight.shadow.bias          = -0.0004;
scene.add(sunLight);


// ─── Terrain ──────────────────────────────────────────────────────────────────
const WORLD  = 400;   // world size in units
const SEGS   = 280;   // vertex grid resolution
const NS     = 0.009; // noise spatial scale
const HS     = 38;    // max height scale

// Continuous height function used for both mesh and tree placement
const getH = (x, z) => {
  let h = fbm(x * NS, z * NS) * HS;
  // Flatten the central meadow
  const d = Math.sqrt(x * x + z * z) / 55;
  return h * Math.min(1, Math.max(0, d - 0.3));
};

const terrGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEGS, SEGS);
terrGeo.rotateX(-Math.PI / 2);

const pos    = terrGeo.attributes.position;
const vColor = new Float32Array(pos.count * 3);
const colTmp = new THREE.Color();

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  const h = getH(x, z);
  pos.setY(i, h);

  const n = h / HS;
  if      (n < 0.04) colTmp.setRGB(0.42, 0.60, 0.20);  // bright meadow
  else if (n < 0.30) colTmp.setRGB(0.23, 0.41, 0.13);  // forest floor
  else if (n < 0.62) colTmp.setRGB(0.30, 0.37, 0.18);  // upper woodland
  else               colTmp.setRGB(0.50, 0.46, 0.36);  // rocky summit
  vColor[i * 3]     = colTmp.r;
  vColor[i * 3 + 1] = colTmp.g;
  vColor[i * 3 + 2] = colTmp.b;
}

terrGeo.setAttribute('color', new THREE.BufferAttribute(vColor, 3));
terrGeo.computeVertexNormals();

const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.93,
  metalness: 0.0,
}));
terrain.receiveShadow = true;
scene.add(terrain);

setProgress(40);

// ─── Pond ─────────────────────────────────────────────────────────────────────
const pondGeo = new THREE.CircleGeometry(16, 56);
pondGeo.rotateX(-Math.PI / 2);
const pondMat = new THREE.MeshStandardMaterial({
  color: 0x2a6a90,
  roughness: 0.06,
  metalness: 0.08,
  transparent: true,
  opacity: 0.88,
});
const pond = new THREE.Mesh(pondGeo, pondMat);
pond.position.y = 0.18;
scene.add(pond);

// Shoreline dark ring
const shoreGeo = new THREE.RingGeometry(15.5, 19, 56);
shoreGeo.rotateX(-Math.PI / 2);
const shore = new THREE.Mesh(shoreGeo, new THREE.MeshStandardMaterial({
  color: 0x3a3220, roughness: 0.95
}));
shore.position.y = 0.05;
scene.add(shore);

setProgress(55);

// ─── Instanced Trees ──────────────────────────────────────────────────────────
const MAX_PINES = 380;
const MAX_OAKS  = 260;

const mats = {
  pineTrunk:  new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.93 }),
  pineLeaf:   new THREE.MeshStandardMaterial({ color: 0x1a4020, roughness: 0.88 }),
  oakTrunk:   new THREE.MeshStandardMaterial({ color: 0x4a2c0c, roughness: 0.95 }),
  oakLeafA:   new THREE.MeshStandardMaterial({ color: 0x2e5c18, roughness: 0.87 }),
  oakLeafB:   new THREE.MeshStandardMaterial({ color: 0x3a7020, roughness: 0.87 }),
};

// Pine: trunk + 3 cone tiers
const pineTrunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6),  mats.pineTrunk, MAX_PINES);
const pineC0IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),                mats.pineLeaf,  MAX_PINES);
const pineC1IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),                mats.pineLeaf,  MAX_PINES);
const pineC2IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),                mats.pineLeaf,  MAX_PINES);

// Oak: trunk + 2 canopy spheres (different materials for colour variation)
const oakTrunkIM  = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 1, 7),  mats.oakTrunk,  MAX_OAKS);
const oakCapAIM   = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 6),              mats.oakLeafA,  MAX_OAKS);
const oakCapBIM   = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 6),              mats.oakLeafB,  MAX_OAKS);

const allIMs = [pineTrunkIM, pineC0IM, pineC1IM, pineC2IM, oakTrunkIM, oakCapAIM, oakCapBIM];
allIMs.forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });

const dummy = new THREE.Object3D();
let pines = 0, oaks = 0;

for (let attempt = 0; attempt < 8000; attempt++) {
  if (pines >= MAX_PINES && oaks >= MAX_OAKS) break;

  const x  = (rng() - 0.5) * WORLD * 0.92;
  const z  = (rng() - 0.5) * WORLD * 0.92;
  const h  = getH(x, z);
  const d2 = x * x + z * z;

  if (d2 < 22 * 22) continue;   // keep meadow clear
  if (h < 1.2)       continue;   // no trees on flat lowland
  if (h > 33)        continue;   // no trees above treeline

  const wantPine = h > 16;

  if (wantPine && pines < MAX_PINES) {
    const s = 2.8 + rng() * 2.8;
    const th = s * 1.1;
    const ry = rng() * Math.PI * 2;
    const jx = (rng() - 0.5) * 0.5, jz = (rng() - 0.5) * 0.5;

    dummy.position.set(x + jx, h + th * 0.5, z + jz);
    dummy.scale.set(s * 0.55, th, s * 0.55);
    dummy.rotation.y = ry; dummy.updateMatrix();
    pineTrunkIM.setMatrixAt(pines, dummy.matrix);

    const cIMs = [pineC0IM, pineC1IM, pineC2IM];
    for (let t = 0; t < 3; t++) {
      const cr = (1.85 - t * 0.42) * s;
      const cy = h + th + t * 1.35 * s;
      dummy.position.set(x + jx, cy, z + jz);
      dummy.scale.set(cr, 2.1 * s, cr);
      dummy.rotation.y = ry; dummy.updateMatrix();
      cIMs[t].setMatrixAt(pines, dummy.matrix);
    }
    pines++;

  } else if (!wantPine && oaks < MAX_OAKS) {
    const s  = 2.2 + rng() * 2.2;
    const th = s * 0.85;
    const ry = rng() * Math.PI * 2;

    dummy.position.set(x, h + th * 0.5, z);
    dummy.scale.set(s * 0.45, th, s * 0.45);
    dummy.rotation.y = ry; dummy.updateMatrix();
    oakTrunkIM.setMatrixAt(oaks, dummy.matrix);

    const crA = (1.5 + rng() * 0.7) * s;
    dummy.position.set(x + (rng() - 0.5) * s * 0.4, h + th + crA * 0.55, z + (rng() - 0.5) * s * 0.4);
    dummy.scale.set(crA, crA * 0.85, crA);
    dummy.rotation.y = ry; dummy.updateMatrix();
    oakCapAIM.setMatrixAt(oaks, dummy.matrix);

    const crB = (1.2 + rng() * 0.6) * s;
    dummy.position.set(x + (rng() - 0.5) * s * 0.5, h + th + crA * 0.7 + crB * 0.4, z + (rng() - 0.5) * s * 0.5);
    dummy.scale.set(crB, crB * 0.75, crB);
    dummy.rotation.y = ry; dummy.updateMatrix();
    oakCapBIM.setMatrixAt(oaks, dummy.matrix);

    oaks++;
  }
}

// Commit counts and matrices
pineTrunkIM.count = pines; pineC0IM.count = pines; pineC1IM.count = pines; pineC2IM.count = pines;
oakTrunkIM.count  = oaks;  oakCapAIM.count = oaks; oakCapBIM.count = oaks;
allIMs.forEach(m => { m.instanceMatrix.needsUpdate = true; });

setProgress(80);

// ─── Rocks ────────────────────────────────────────────────────────────────────
const MAX_ROCKS = 140;
const rockIM = new THREE.InstancedMesh(
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.MeshStandardMaterial({ color: 0x7a7060, roughness: 0.96, metalness: 0.04 }),
  MAX_ROCKS
);
rockIM.castShadow = rockIM.receiveShadow = true;
scene.add(rockIM);

let rocks = 0;
for (let i = 0; i < MAX_ROCKS * 4 && rocks < MAX_ROCKS; i++) {
  const x = (rng() - 0.5) * WORLD * 0.88;
  const z = (rng() - 0.5) * WORLD * 0.88;
  const h = getH(x, z);
  if (h < 0.6) continue;
  const s = 0.28 + rng() * 1.0;
  dummy.position.set(x, h + s * 0.4, z);
  dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  rockIM.setMatrixAt(rocks++, dummy.matrix);
}
rockIM.count = rocks;
rockIM.instanceMatrix.needsUpdate = true;

// ─── Grass tufts ──────────────────────────────────────────────────────────────
// Flat crossed quads as simple billboard grass blades in the clearing
const MAX_GRASS  = 2000;
const grassMat   = new THREE.MeshStandardMaterial({
  color: 0x4a8030, roughness: 0.95, side: THREE.DoubleSide,
  alphaTest: 0.3,
});
const grassPlane = new THREE.PlaneGeometry(0.6, 0.9);
const grassIM    = new THREE.InstancedMesh(grassPlane, grassMat, MAX_GRASS * 2);
grassIM.receiveShadow = true;
scene.add(grassIM);

let gCount = 0;
for (let i = 0; i < MAX_GRASS; i++) {
  // Polar sampling to concentrate grass in the clearing
  const angle = rng() * Math.PI * 2;
  const r     = rng() * 18;
  const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
  const h = getH(x, z) + 0.42;

  for (let pass = 0; pass < 2; pass++) {
    dummy.position.set(x, h, z);
    dummy.rotation.set(0, pass * Math.PI / 2 + rng() * 0.6, 0);
    dummy.scale.setScalar(0.6 + rng() * 0.6);
    dummy.updateMatrix();
    grassIM.setMatrixAt(gCount++, dummy.matrix);
  }
}
grassIM.count = gCount;
grassIM.instanceMatrix.needsUpdate = true;

setProgress(100);

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ─── Render loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let firstFrame = true;
let elapsed = 0;
let bobPhase = 0;

// Smooth camera Y to avoid snapping on steep terrain
let smoothY = 2.5;

function animate() {
  requestAnimationFrame(animate);

  if (firstFrame) {
    firstFrame = false;
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 900);
  }

  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;

  // ── Player movement ─────────────────────────────────────────────────────────
  if (controls.isLocked) {
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed  = sprint ? 20 : 8;
    const moving =
      keys['KeyW'] || keys['ArrowUp']   ||
      keys['KeyS'] || keys['ArrowDown'] ||
      keys['KeyA'] || keys['ArrowLeft'] ||
      keys['KeyD'] || keys['ArrowRight'];

    if (keys['KeyW'] || keys['ArrowUp'])    controls.moveForward( speed * delta);
    if (keys['KeyS'] || keys['ArrowDown'])  controls.moveForward(-speed * delta);
    if (keys['KeyA'] || keys['ArrowLeft'])  controls.moveRight(  -speed * delta);
    if (keys['KeyD'] || keys['ArrowRight']) controls.moveRight(   speed * delta);

    // Clamp to world boundary
    const p = camera.position;
    p.x = Math.max(-WORLD / 2 + 4, Math.min(WORLD / 2 - 4, p.x));
    p.z = Math.max(-WORLD / 2 + 4, Math.min(WORLD / 2 - 4, p.z));

    // Terrain-follow: smoothly track ground height
    const groundH = getH(p.x, p.z);
    const targetY = groundH + 1.72;
    smoothY += (targetY - smoothY) * Math.min(1, delta * 14);

    // Head bob while walking
    if (moving) {
      const bobSpeed = sprint ? 14 : 9;
      bobPhase += delta * bobSpeed;
      p.y = smoothY + Math.sin(bobPhase) * 0.055;
    } else {
      bobPhase = 0;
      p.y = smoothY;
    }
  }

  // Subtle pond shimmer
  pondMat.color.setHSL(0.575, 0.52, 0.225 + Math.sin(elapsed * 0.7) * 0.018);

  renderer.render(scene, camera);
}

animate();
