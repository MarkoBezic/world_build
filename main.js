import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// ─── Noise ────────────────────────────────────────────────────────────────────
const hash    = (x, y) => Math.abs((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1);
const lerp    = (a, b, t) => a + (b - a) * t;
const smooth  = t => t * t * (3 - 2 * t);
const noise2D = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  return lerp(lerp(hash(ix,iy), hash(ix+1,iy), fx), lerp(hash(ix,iy+1), hash(ix+1,iy+1), fx), fy);
};
const fbm = (x, y, oct = 8) => {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++, a *= 0.5, f *= 2.1) v += a * noise2D(x * f, y * f);
  return v;
};

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
let _seed = 0x9e3779b9;
const rng = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 0x100000000; };

// ─── Device detection ─────────────────────────────────────────────────────────
const isMobile = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

// ─── Loading ──────────────────────────────────────────────────────────────────
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
renderer.toneMappingExposure = 0.72;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ─── Scene & Camera ───────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb8a070, 0.0013);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 3000);
camera.rotation.order = 'YXZ';
camera.position.set(0, 2.5, 32);

// ─── Controls ─────────────────────────────────────────────────────────────────
const overlay   = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
const hint      = document.getElementById('hint');
let gameActive  = false;
let plControls  = null;
const keys      = {};

if (!isMobile) {
  overlay.innerHTML = `
    <h1>The Ancient Realm</h1>
    <p>Click to explore</p>
    <div class="keys">
      <div class="key" style="grid-column:2">W</div>
      <div class="key">A</div><div class="key">S</div><div class="key">D</div>
      <div class="key shift">⇧ Sprint</div>
      <div class="key wide">Esc — release cursor</div>
    </div>`;
  plControls = new PointerLockControls(camera, document.body);
  overlay.addEventListener('click', () => plControls.lock());
  plControls.addEventListener('lock',   () => { gameActive = true;  overlay.classList.add('hidden');    crosshair.classList.add('visible');    hint.classList.add('visible'); });
  plControls.addEventListener('unlock', () => { gameActive = false; overlay.classList.remove('hidden'); crosshair.classList.remove('visible'); hint.classList.remove('visible'); });
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup',   e => { keys[e.code] = false; });
} else {
  overlay.innerHTML = `
    <h1>The Ancient Realm</h1>
    <p>Tap to explore</p>
    <div class="mobile-hint"><span>Left — move</span><span>Right — look</span></div>`;
  overlay.addEventListener('click', () => { overlay.classList.add('hidden'); gameActive = true; });
}

// ─── Mobile touch ─────────────────────────────────────────────────────────────
const JMAX = 55;
const joy  = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
const look = { active: false, id: -1, lastX: 0, lastY: 0 };
let mYaw = 0, mPitch = 0;
const jBaseEl = document.getElementById('joystick-base');
const jKnobEl = document.getElementById('joystick-knob');

function syncJoyUI() {
  if (joy.active) {
    jBaseEl.style.display = 'block';
    jBaseEl.style.left = joy.baseX + 'px';
    jBaseEl.style.top  = joy.baseY + 'px';
    jKnobEl.style.transform = `translate(calc(-50% + ${joy.dx}px), calc(-50% + ${joy.dy}px))`;
  } else { jBaseEl.style.display = 'none'; }
}

if (isMobile) {
  const cv = renderer.domElement;
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!joy.active && t.clientX < innerWidth * 0.5) {
        Object.assign(joy, { active: true, id: t.identifier, baseX: t.clientX, baseY: t.clientY, dx: 0, dy: 0 });
        syncJoyUI();
      } else if (!look.active) {
        Object.assign(look, { active: true, id: t.identifier, lastX: t.clientX, lastY: t.clientY });
      }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy.active && t.identifier === joy.id) {
        joy.dx = Math.max(-JMAX, Math.min(JMAX, t.clientX - joy.baseX));
        joy.dy = Math.max(-JMAX, Math.min(JMAX, t.clientY - joy.baseY));
        syncJoyUI();
      } else if (look.active && t.identifier === look.id) {
        mYaw   -= (t.clientX - look.lastX) * 0.004;
        mPitch -= (t.clientY - look.lastY) * 0.004;
        mPitch  = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, mPitch));
        look.lastX = t.clientX; look.lastY = t.clientY;
      }
    }
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy.active  && t.identifier === joy.id)  { Object.assign(joy, { active: false, dx: 0, dy: 0 }); syncJoyUI(); }
      if (look.active && t.identifier === look.id) { look.active = false; }
    }
  }, { passive: false });
}

// ─── Sky — golden hour / misty morning ───────────────────────────────────────
const sky = new Sky();
sky.scale.setScalar(20000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value       = 10.0;   // thick atmospheric haze
skyU.rayleigh.value        = 3.5;    // heavy scattering → warm orange horizon
skyU.mieCoefficient.value  = 0.012;  // fine particle haze
skyU.mieDirectionalG.value = 0.90;   // tight forward glow around sun disc
const sunDir = new THREE.Vector3();
// Sun low in the southeast — elevation 20°, produces long dramatic castle shadows
sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(70), THREE.MathUtils.degToRad(160));
skyU.sunPosition.value.copy(sunDir);

setProgress(10);

// ─── Lighting — golden hour palette ──────────────────────────────────────────
// Warm amber sky dome, dark moss ground bounce
const hemi = new THREE.HemisphereLight(0xffc870, 0x2a3010, 1.9);
scene.add(hemi);

// Subtle warm fill for shadow regions
const ambLight = new THREE.AmbientLight(0x3c2418, 0.55);
scene.add(ambLight);

// Primary sun — deep orange-gold, low angle for long shadow drama
const sunLight = new THREE.DirectionalLight(0xff8c30, 5.0);
sunLight.position.copy(sunDir).multiplyScalar(900);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.near   = 1;
sunLight.shadow.camera.far    = 2500;
sunLight.shadow.camera.left   = sunLight.shadow.camera.bottom = -700;
sunLight.shadow.camera.right  = sunLight.shadow.camera.top   =  700;
sunLight.shadow.bias          = -0.0004;
scene.add(sunLight);

// Cool blue sky-bounce from the shadow hemisphere (northwest of sun)
const fillLight = new THREE.DirectionalLight(0x3060c0, 0.65);
fillLight.position.set(-sunDir.x, Math.abs(sunDir.y) * 0.6, -sunDir.z);
scene.add(fillLight);

setProgress(15);

// ─── World constants ──────────────────────────────────────────────────────────
const WORLD = 1200;
const SEGS  = 340;
const NS    = 0.0034;
const HS    = 62;

// Castle clearing — due north of spawn so the player walks straight to it
const CX = 0, CZ_C = -370, CASTLE_BASE_H = 5;
const CLR_IN = 130, CLR_OUT = 215;

const clearBlend = (x, z) => {
  const d = Math.hypot(x - CX, z - CZ_C);
  if (d <= CLR_IN)  return 0;
  if (d >= CLR_OUT) return 1;
  return smooth((d - CLR_IN) / (CLR_OUT - CLR_IN));
};

const getH = (x, z) => {
  let h = fbm(x * NS, z * NS) * HS;
  // Flat basin around player spawn
  const startD = Math.hypot(x, z) / 62;
  h *= Math.min(1, Math.max(0, startD - 0.25));
  // Flatten castle clearing
  return lerp(CASTLE_BASE_H, h, clearBlend(x, z));
};

// ─── Terrain ──────────────────────────────────────────────────────────────────
const terrGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEGS, SEGS);
terrGeo.rotateX(-Math.PI / 2);

const tPos   = terrGeo.attributes.position;
const vColor = new Float32Array(tPos.count * 3);
const colTmp = new THREE.Color();
const cA = new THREE.Color(), cB = new THREE.Color();

for (let i = 0; i < tPos.count; i++) {
  const x = tPos.getX(i), z = tPos.getZ(i);
  const h = getH(x, z);
  tPos.setY(i, h);

  const n  = h / HS;
  const nv = noise2D(x * 0.028, z * 0.028);
  const nv2 = noise2D(x * 0.009 + 7.3, z * 0.009 + 2.8);
  const dc  = Math.hypot(x - CX, z - CZ_C);

  if (dc < CLR_IN * 1.25) {
    // Dry earth / castle grounds
    cA.setRGB(0.55, 0.48, 0.30); cB.setRGB(0.44, 0.39, 0.23);
    colTmp.lerpColors(cA, cB, nv * 0.7 + nv2 * 0.3);
  } else if (n < 0.015) {
    colTmp.setRGB(0.38 + nv*0.09, 0.60 + nv*0.06, 0.16 + nv*0.04);
  } else if (n < 0.22) {
    colTmp.setRGB(0.18 + nv*0.07 + nv2*0.04, 0.37 + nv*0.06, 0.11 + nv*0.04);
  } else if (n < 0.50) {
    colTmp.setRGB(0.26 + nv*0.06, 0.33 + nv*0.05, 0.15 + nv*0.04);
  } else {
    colTmp.setRGB(0.53 + nv*0.07, 0.49 + nv*0.05, 0.38 + nv*0.04);
  }
  vColor[i*3] = colTmp.r; vColor[i*3+1] = colTmp.g; vColor[i*3+2] = colTmp.b;
}

terrGeo.setAttribute('color', new THREE.BufferAttribute(vColor, 3));
terrGeo.computeVertexNormals();

const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.96, metalness: 0.0,
}));
terrain.receiveShadow = true;
scene.add(terrain);

setProgress(35);

// ─── Pond ─────────────────────────────────────────────────────────────────────
const pondGeo = new THREE.CircleGeometry(22, 64);
pondGeo.rotateX(-Math.PI / 2);
const pondMat = new THREE.MeshStandardMaterial({
  color: 0x1e5a82, roughness: 0.04, metalness: 0.18,
  transparent: true, opacity: 0.90,
});
const pond = new THREE.Mesh(pondGeo, pondMat);
pond.position.y = 0.22;
scene.add(pond);
const shoreGeo = new THREE.RingGeometry(21.5, 26, 64);
shoreGeo.rotateX(-Math.PI / 2);
const shore = new THREE.Mesh(shoreGeo, new THREE.MeshStandardMaterial({ color: 0x2c2418, roughness: 0.97 }));
shore.position.y = 0.06;
scene.add(shore);

setProgress(42);

// ─── Instanced Trees ──────────────────────────────────────────────────────────
const MAX_PINES = 1200;
const MAX_OAKS  = 1060;

const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3618, roughness: 0.96 });
const pineLeafMat0 = new THREE.MeshStandardMaterial({ color: 0x1a4022, roughness: 0.88 });
const pineLeafMat1 = new THREE.MeshStandardMaterial({ color: 0x1e3612, roughness: 0.89 });
const pineLeafMat2 = new THREE.MeshStandardMaterial({ color: 0x142e18, roughness: 0.90 });
const oakTrunkMat  = new THREE.MeshStandardMaterial({ color: 0x4a2c0c, roughness: 0.97 });
const oakLeafMatA  = new THREE.MeshStandardMaterial({ color: 0x2a5a14, roughness: 0.87 });
const oakLeafMatB  = new THREE.MeshStandardMaterial({ color: 0x3a7020, roughness: 0.87 });
const oakLeafMatC  = new THREE.MeshStandardMaterial({ color: 0x4a6018, roughness: 0.88 });

const pineTrunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.31, 1, 7),  pineTrunkMat, MAX_PINES);
const pineC0IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8),                pineLeafMat0, MAX_PINES);
const pineC1IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8),                pineLeafMat1, MAX_PINES);
const pineC2IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8),                pineLeafMat2, MAX_PINES);
const oakTrunkIM  = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.41, 1, 8),  oakTrunkMat,  MAX_OAKS);
const oakCapAIM   = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7),             oakLeafMatA,  MAX_OAKS);
const oakCapBIM   = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7),             oakLeafMatB,  MAX_OAKS);
const oakCapCIM   = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7),             oakLeafMatC,  MAX_OAKS);

const allIMs = [pineTrunkIM, pineC0IM, pineC1IM, pineC2IM, oakTrunkIM, oakCapAIM, oakCapBIM, oakCapCIM];
allIMs.forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });

const dummy = new THREE.Object3D();
let pines = 0, oaks = 0;

for (let attempt = 0; attempt < 26000; attempt++) {
  if (pines >= MAX_PINES && oaks >= MAX_OAKS) break;
  const x = (rng() - 0.5) * WORLD * 0.94;
  const z = (rng() - 0.5) * WORLD * 0.94;
  const h = getH(x, z);

  if (x*x + z*z < 25*25) continue;
  if (h < 1.0 || h > 54) continue;
  if (Math.hypot(x - CX, z - CZ_C) < CLR_IN + 12) continue; // trees grow right to clearing edge

  const wantPine = h > 22;

  if (wantPine && pines < MAX_PINES) {
    const s = 3.0 + rng() * 3.4, th = s * 1.1, ry = rng() * Math.PI * 2;
    const jx = (rng()-0.5)*0.6, jz = (rng()-0.5)*0.6;
    dummy.position.set(x+jx, h+th*0.5, z+jz); dummy.scale.set(s*0.52, th, s*0.52); dummy.rotation.y=ry; dummy.updateMatrix();
    pineTrunkIM.setMatrixAt(pines, dummy.matrix);
    [[1.9,0],[1.45,1],[1.0,2]].forEach(([r,t]) => {
      dummy.position.set(x+jx, h+th+t*1.45*s, z+jz);
      dummy.scale.set(r*s, 2.3*s, r*s);
      dummy.rotation.y = ry + t * 0.5;
      dummy.updateMatrix();
      [pineC0IM, pineC1IM, pineC2IM][t].setMatrixAt(pines, dummy.matrix);
    });
    pines++;
  } else if (!wantPine && oaks < MAX_OAKS) {
    const s = 2.5 + rng() * 2.8, th = s * 0.82, ry = rng() * Math.PI * 2;
    dummy.position.set(x, h+th*0.5, z); dummy.scale.set(s*0.43, th, s*0.43); dummy.rotation.y=ry; dummy.updateMatrix();
    oakTrunkIM.setMatrixAt(oaks, dummy.matrix);
    const crA = (1.6 + rng()*0.8)*s;
    dummy.position.set(x+(rng()-0.5)*s*0.4, h+th+crA*0.55, z+(rng()-0.5)*s*0.4); dummy.scale.set(crA, crA*0.85, crA); dummy.rotation.y=ry; dummy.updateMatrix();
    oakCapAIM.setMatrixAt(oaks, dummy.matrix);
    const crB = (1.3 + rng()*0.7)*s;
    dummy.position.set(x+(rng()-0.5)*s*0.5, h+th+crA*0.72+crB*0.4, z+(rng()-0.5)*s*0.5); dummy.scale.set(crB, crB*0.75, crB); dummy.rotation.y=ry; dummy.updateMatrix();
    oakCapBIM.setMatrixAt(oaks, dummy.matrix);
    const crC = (0.9 + rng()*0.5)*s;
    dummy.position.set(x+(rng()-0.5)*s*0.6, h+th+crA*0.65+crC*0.5, z+(rng()-0.5)*s*0.6); dummy.scale.set(crC, crC*0.70, crC); dummy.rotation.y=ry; dummy.updateMatrix();
    oakCapCIM.setMatrixAt(oaks, dummy.matrix);
    oaks++;
  }
}
// Dense perimeter ring — oaks placed radially around the clearing to create
// a dramatic wall of trees the player walks through before the castle reveals
for (let i = 0; i < 230 && oaks < MAX_OAKS; i++) {
  const angle = (i / 230) * Math.PI * 2 + rng() * 0.20;
  const r = CLR_IN + 4 + rng() * 42;
  const x = CX + Math.cos(angle) * r;
  const z = CZ_C + Math.sin(angle) * r;
  if (Math.abs(x) > WORLD * 0.47 || Math.abs(z) > WORLD * 0.47) continue;
  const h = getH(x, z);
  if (h < 0.5) continue;
  const s = 3.4 + rng() * 2.6, th = s * 0.84, ry = rng() * Math.PI * 2;
  dummy.position.set(x, h+th*0.5, z); dummy.scale.set(s*0.44, th, s*0.44); dummy.rotation.y=ry; dummy.updateMatrix();
  oakTrunkIM.setMatrixAt(oaks, dummy.matrix);
  const crA = (1.7 + rng()*0.7)*s;
  dummy.position.set(x+(rng()-0.5)*s*0.3, h+th+crA*0.55, z+(rng()-0.5)*s*0.3);
  dummy.scale.set(crA, crA*0.88, crA); dummy.rotation.y=ry; dummy.updateMatrix();
  oakCapAIM.setMatrixAt(oaks, dummy.matrix);
  const crB = (1.2 + rng()*0.6)*s;
  dummy.position.set(x+(rng()-0.5)*s*0.4, h+th+crA*0.72+crB*0.4, z+(rng()-0.5)*s*0.4);
  dummy.scale.set(crB, crB*0.78, crB); dummy.rotation.y=ry; dummy.updateMatrix();
  oakCapBIM.setMatrixAt(oaks, dummy.matrix);
  const crC = (0.8 + rng()*0.5)*s;
  dummy.position.set(x+(rng()-0.5)*s*0.5, h+th+crA*0.68+crC*0.45, z+(rng()-0.5)*s*0.5);
  dummy.scale.set(crC, crC*0.72, crC); dummy.rotation.y=ry; dummy.updateMatrix();
  oakCapCIM.setMatrixAt(oaks, dummy.matrix);
  oaks++;
}

pineTrunkIM.count=pines; pineC0IM.count=pines; pineC1IM.count=pines; pineC2IM.count=pines;
oakTrunkIM.count=oaks; oakCapAIM.count=oaks; oakCapBIM.count=oaks; oakCapCIM.count=oaks;
allIMs.forEach(m => m.instanceMatrix.needsUpdate = true);

setProgress(60);

// ─── Rocks ────────────────────────────────────────────────────────────────────
const MAX_ROCKS = 300;
const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7060, roughness: 0.97, metalness: 0.03 });
const rockIM  = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), rockMat, MAX_ROCKS);
rockIM.castShadow = rockIM.receiveShadow = true;
scene.add(rockIM);
let rocks = 0;
for (let i = 0; i < MAX_ROCKS * 5 && rocks < MAX_ROCKS; i++) {
  const x = (rng()-0.5)*WORLD*0.90, z = (rng()-0.5)*WORLD*0.90;
  const h = getH(x, z);
  if (h < 0.5) continue;
  const s = 0.28 + rng() * 1.4;
  dummy.position.set(x, h + s*0.38, z);
  dummy.rotation.set(rng()*Math.PI, rng()*Math.PI, rng()*Math.PI);
  dummy.scale.set(s*(0.8+rng()*0.4), s*(0.7+rng()*0.5), s*(0.8+rng()*0.4));
  dummy.updateMatrix();
  rockIM.setMatrixAt(rocks++, dummy.matrix);
}
rockIM.count = rocks;
rockIM.instanceMatrix.needsUpdate = true;

// ─── Grass tufts ──────────────────────────────────────────────────────────────
const MAX_GRASS = 14000;
const grassIM   = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.7, 1.05),
  new THREE.MeshStandardMaterial({ color: 0x4a8030, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.25 }),
  MAX_GRASS * 2
);
grassIM.receiveShadow = true;
scene.add(grassIM);
let gCount = 0;
for (let i = 0; i < MAX_GRASS && gCount < MAX_GRASS * 2 - 2; i++) {
  const angle = rng()*Math.PI*2;
  const r = 8 + rng()*rng()*420;
  const x = Math.cos(angle)*r + (rng()-0.5)*150;
  const z = Math.sin(angle)*r + (rng()-0.5)*150;
  if (x < -WORLD/2+8 || x > WORLD/2-8 || z < -WORLD/2+8 || z > WORLD/2-8) continue;
  if (Math.hypot(x - CX, z - CZ_C) < CLR_IN * 1.05) continue;
  const h = getH(x, z) + 0.46;
  for (let p = 0; p < 2; p++) {
    dummy.position.set(x + (rng()-0.5)*0.3, h, z + (rng()-0.5)*0.3);
    dummy.rotation.set(0, p*Math.PI/2 + rng()*0.7, 0);
    dummy.scale.setScalar(0.7 + rng()*0.8);
    dummy.updateMatrix();
    grassIM.setMatrixAt(gCount++, dummy.matrix);
  }
}
grassIM.count = gCount;
grassIM.instanceMatrix.needsUpdate = true;

setProgress(73);

// ─── Castle ───────────────────────────────────────────────────────────────────
const stoneMat     = new THREE.MeshStandardMaterial({ color: 0x9a8878, roughness: 0.97, metalness: 0.01 });
const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x6a5848, roughness: 0.98, metalness: 0.01 });
const roofMat      = new THREE.MeshStandardMaterial({ color: 0x383850, roughness: 0.85, metalness: 0.06 });
const woodMat      = new THREE.MeshStandardMaterial({ color: 0x6b3e1a, roughness: 0.96, metalness: 0.0  });

function mkMesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m); return m;
}
function box(x, y, z, w, h, d, mat) {
  const m = mkMesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); return m;
}
function cyl(x, y, z, rt, rb, h, seg, mat) {
  const m = mkMesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); return m;
}
function cone(x, y, z, r, h, seg, mat) {
  const m = mkMesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z); return m;
}

// Row of merlons (battlements) along a wall top
function battlements(cx, cy, cz, length, thick, axis, mat) {
  const mW = 1.7, mH = 2.8, gap = 2.3, total = mW + gap;
  const count = Math.max(1, Math.floor(length / total));
  const start = -(count * total - gap) / 2;
  for (let i = 0; i < count; i++) {
    const p = start + i * total + mW * 0.5;
    if (axis === 'x') box(cx + p, cy + mH*0.5, cz, mW, mH, thick, mat);
    else              box(cx, cy + mH*0.5, cz + p, thick, mH, mW, mat);
  }
}

const BY = CASTLE_BASE_H;

// Outer wall dimensions
const wallH = 14, wallT = 4.5, wallW = 195, wallD = 155;
const gateW = 16;
const tR = 9.5, tH = 25; // corner tower radius & height

// North outer wall
box(CX, BY + wallH*0.5, CZ_C - wallD*0.5, wallW, wallH, wallT, stoneMat);
battlements(CX, BY + wallH, CZ_C - wallD*0.5, wallW, wallT, 'x', darkStoneMat);

// South outer wall — split for gatehouse opening
const swHalf = (wallW - gateW) * 0.5;
box(CX - gateW*0.5 - swHalf*0.5, BY + wallH*0.5, CZ_C + wallD*0.5, swHalf, wallH, wallT, stoneMat);
box(CX + gateW*0.5 + swHalf*0.5, BY + wallH*0.5, CZ_C + wallD*0.5, swHalf, wallH, wallT, stoneMat);
battlements(CX - gateW*0.5 - swHalf*0.5, BY + wallH, CZ_C + wallD*0.5, swHalf, wallT, 'x', darkStoneMat);
battlements(CX + gateW*0.5 + swHalf*0.5, BY + wallH, CZ_C + wallD*0.5, swHalf, wallT, 'x', darkStoneMat);

// West & East outer walls
box(CX - wallW*0.5, BY + wallH*0.5, CZ_C, wallT, wallH, wallD, stoneMat);
battlements(CX - wallW*0.5, BY + wallH, CZ_C, wallD, wallT, 'z', darkStoneMat);
box(CX + wallW*0.5, BY + wallH*0.5, CZ_C, wallT, wallH, wallD, stoneMat);
battlements(CX + wallW*0.5, BY + wallH, CZ_C, wallD, wallT, 'z', darkStoneMat);

// 4 Corner towers
[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([tx, tz]) => {
  const tcx = CX + tx*wallW*0.5, tcz = CZ_C + tz*wallD*0.5;
  cyl(tcx, BY + tH*0.5, tcz, tR, tR*1.13, tH, 12, stoneMat);
  cyl(tcx, BY + tH + 1.6, tcz, tR*1.1, tR*1.1, 3.2, 12, darkStoneMat);
  cone(tcx, BY + tH + 3.2 + 7, tcz, tR + 1.2, 14, 12, roofMat);
  // Arrow-slit windows on tower
  for (let fi = 0; fi < 3; fi++) {
    const wy = BY + 6 + fi * 6;
    [0, 1, 2, 3].forEach(si => {
      const ang = si * Math.PI * 0.5;
      const wm = box(tcx + Math.cos(ang)*tR*0.92, wy, tcz + Math.sin(ang)*tR*0.92, 0.8, 2.2, 0.4, darkStoneMat);
      wm.rotation.y = ang;
    });
  }
});

// Gatehouse — twin flanking towers straddling south gate opening
const ghH = wallH + 6;
[-1, 1].forEach(side => {
  const gx = CX + side * (gateW*0.5 + 5);
  cyl(gx, BY + ghH*0.5, CZ_C + wallD*0.5, 6, 6.8, ghH, 12, stoneMat);
  cyl(gx, BY + ghH + 1.6, CZ_C + wallD*0.5, 6.3, 6.3, 3.2, 12, darkStoneMat);
  cone(gx, BY + ghH + 3.2 + 6, CZ_C + wallD*0.5, 7, 12, 12, roofMat);
});
// Gatehouse arch & portcullis lintel
box(CX, BY + wallH + 3.5, CZ_C + wallD*0.5, gateW, 7, wallT, stoneMat);
// Gate doors (wooden panels)
[-1, 1].forEach(side => {
  const gd = new THREE.Mesh(new THREE.BoxGeometry(6, wallH - 0.5, 0.5), woodMat);
  gd.position.set(CX + side*3.8, BY + (wallH - 0.5)*0.5 + 0.25, CZ_C + wallD*0.5 - 0.4);
  gd.castShadow = gd.receiveShadow = true;
  scene.add(gd);
});

// ─── Hollow Keep — four wall segments leave a walkable interior ──────────────
const keepW = 56, keepD = 44, keepH = 44, wt = 5;
const keepDoorW = 10, keepDoorH = 12;
const keepX = CX, keepZ = CZ_C - wallD*0.5 + 18 + keepD*0.5;

// Perimeter walls — south wall split around the entrance doorway
box(keepX, BY + keepH*0.5, keepZ - keepD*0.5 + wt*0.5,
    keepW, keepH, wt, stoneMat);                                              // north wall
box(keepX + keepW*0.5 - wt*0.5, BY + keepH*0.5, keepZ,
    wt, keepH, keepD, stoneMat);                                              // east wall
box(keepX - keepW*0.5 + wt*0.5, BY + keepH*0.5, keepZ,
    wt, keepH, keepD, stoneMat);                                              // west wall
const sSegW = keepW*0.5 - keepDoorW*0.5;
box(keepX - keepDoorW*0.5 - sSegW*0.5, BY + keepH*0.5,
    keepZ + keepD*0.5 - wt*0.5, sSegW, keepH, wt, stoneMat);               // south-left
box(keepX + keepDoorW*0.5 + sSegW*0.5, BY + keepH*0.5,
    keepZ + keepD*0.5 - wt*0.5, sSegW, keepH, wt, stoneMat);               // south-right
box(keepX, BY + keepDoorH + (keepH - keepDoorH)*0.5,
    keepZ + keepD*0.5 - wt*0.5,
    keepDoorW, keepH - keepDoorH, wt, stoneMat);                             // arch header

// Interior stone floor slab
box(keepX, BY + 0.2, keepZ, keepW - wt*2, 0.4, keepD - wt*2, darkStoneMat);

// Arrow-slit markers on outer faces (4 floors)
for (let f = 0; f < 4; f++) {
  const wy = BY + 8 + f * 9;
  [-15, -5, 5, 15].forEach(wx => {
    box(keepX + wx, wy, keepZ - keepD*0.5 - 0.1, 1.6, 3.0, 0.5, darkStoneMat);
  });
  [-10, 0, 10].forEach(wz => {
    box(keepX + keepW*0.5 + 0.1, wy, keepZ + wz, 0.5, 3.0, 1.6, darkStoneMat);
    box(keepX - keepW*0.5 - 0.1, wy, keepZ + wz, 0.5, 3.0, 1.6, darkStoneMat);
  });
}

// Battlements on all four wall tops
battlements(keepX, BY + keepH, keepZ - keepD*0.5, keepW, wt, 'x', darkStoneMat);
battlements(keepX, BY + keepH, keepZ + keepD*0.5, keepW, wt, 'x', darkStoneMat);
battlements(keepX - keepW*0.5, BY + keepH, keepZ, keepD, wt, 'z', darkStoneMat);
battlements(keepX + keepW*0.5, BY + keepH, keepZ, keepD, wt, 'z', darkStoneMat);

// Corner turrets
const ktR = 6.5, ktH = keepH + 13;
[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([tx, tz]) => {
  const tcx = keepX + tx*keepW*0.5, tcz = keepZ + tz*keepD*0.5;
  cyl(tcx, BY + ktH*0.5, tcz, ktR, ktR*1.1, ktH, 10, darkStoneMat);
  cyl(tcx, BY + ktH + 1.6, tcz, ktR + 0.5, ktR + 0.5, 3.2, 10, stoneMat);
  cone(tcx, BY + ktH + 3.2 + 8, tcz, ktR + 1.2, 16, 10, roofMat);
});

// ─── Interior Staircase — rises along east interior wall heading north ────────
// 28 steps carry the player from ground (BY) to the battlement deck (BY+keepH)
const stairCount = 28;
const stairStepH = keepH / stairCount;                          // height per step
const stairStepD = (keepD - wt * 2) / stairCount;              // depth per step
const stairW     = 5.5;
const stairX     = keepX + keepW * 0.5 - wt - stairW * 0.5;   // flush with east interior face
const stairZS    = keepZ + keepD * 0.5 - wt - stairStepD * 0.5; // southernmost step
const stairZN    = stairZS - (stairCount - 1) * stairStepD;     // northernmost step

for (let s = 0; s < stairCount; s++) {
  box(stairX,
      BY + stairStepH * (s + 0.5),
      stairZS - s * stairStepD,
      stairW, stairStepH, stairStepD,
      darkStoneMat);
}

// Inner great hall (attached to keep south face)
const hallW = 40, hallD = 28, hallH = 20;
box(keepX, BY + hallH*0.5, keepZ + keepD*0.5 + hallD*0.5, hallW, hallH, hallD, stoneMat);
battlements(keepX, BY + hallH, keepZ + keepD*0.5 + hallD, hallW, wallT, 'x', darkStoneMat);
battlements(keepX - hallW*0.5, BY + hallH, keepZ + keepD*0.5 + hallD*0.5, hallD, wallT, 'z', darkStoneMat);
battlements(keepX + hallW*0.5, BY + hallH, keepZ + keepD*0.5 + hallD*0.5, hallD, wallT, 'z', darkStoneMat);

// Courtyard well
cyl(CX + 22, BY + 1.8, CZ_C + 28, 2.2, 2.2, 3.6, 10, stoneMat);
cyl(CX + 22, BY + 5.4, CZ_C + 28, 2.5, 2.5, 0.6, 10, darkStoneMat);
// Well roof support posts
[-1, 1].forEach(side => {
  cyl(CX + 22 + side*2, BY + 5.7 + 1.5, CZ_C + 28, 0.2, 0.2, 3.0, 6, woodMat);
});
box(CX + 22, BY + 9.0, CZ_C + 28, 5.5, 0.4, 2.0, woodMat);

// ─── Ruined chapel — crumbled west-wing outbuilding ──────────────────────────
const chX = CX - 52, chZ = CZ_C - 22;
box(chX,      BY + 11,  chZ,       3.5, 22, 32, stoneMat);   // west wall — full height survives
box(chX + 14, BY + 6.5, chZ - 14,  28,  13, 3.5, stoneMat);  // north wall — half collapsed
box(chX + 8,  BY + 3.5, chZ + 14,  18,   7, 3.5, stoneMat);  // south wall — low rubble
box(chX + 22, BY + 8,   chZ,        3.5, 16, 16, stoneMat);  // east corner — partially standing
// Fallen column drums on the chapel floor
for (let i = 0; i < 6; i++) {
  cyl(chX + 5 + i*3.8 + (rng()-0.5)*1.5,
      BY + 0.9 + rng()*0.4,
      chZ - 4 + (rng()-0.5)*8,
      0.85, 0.95, 1.8 + rng()*0.8, 8, darkStoneMat);
}

// ─── Arrow slits on main curtain walls ───────────────────────────────────────
// North outer wall — 5 slits
for (let i = 0; i < 5; i++) {
  box(CX - wallW*0.3 + i*(wallW*0.15), BY + 8, CZ_C - wallD*0.5 - 0.1, 1.4, 3.0, 0.5, darkStoneMat);
}
// East outer wall — 4 slits
for (let i = 0; i < 4; i++) {
  box(CX + wallW*0.5 + 0.1, BY + 8, CZ_C - wallD*0.3 + i*(wallD*0.2), 0.5, 3.0, 1.4, darkStoneMat);
}
// West outer wall — 4 slits
for (let i = 0; i < 4; i++) {
  box(CX - wallW*0.5 - 0.1, BY + 8, CZ_C - wallD*0.3 + i*(wallD*0.2), 0.5, 3.0, 1.4, darkStoneMat);
}

// ─── Courtyard props ──────────────────────────────────────────────────────────
// Campfire ring — 8 small stones around a char patch
const cfX = CX - 18, cfZ = CZ_C + 38;
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const cr = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat);
  cr.position.set(cfX + Math.cos(a)*1.8, BY + 0.22, cfZ + Math.sin(a)*1.8);
  cr.rotation.set(rng()*Math.PI, rng()*Math.PI, rng()*Math.PI);
  cr.castShadow = cr.receiveShadow = true;
  scene.add(cr);
}
box(cfX, BY + 0.28, cfZ, 0.7, 0.56, 0.7, darkStoneMat);  // charred embers

// Barrel cluster against east inner wall
[-2.6, 0, 2.6].forEach(ox => {
  cyl(CX + wallW*0.5 - wallT - 5, BY + 1.9, CZ_C + 22 + ox, 1.0, 1.1, 3.8, 10, woodMat);
});

// ─── Ivy — instanced planes climbing keep and hall exterior walls ─────────────
const MAX_IVY = 320;
const ivyIM = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.88, 1.18),
  new THREE.MeshStandardMaterial({ color: 0x1e5010, roughness: 0.94, side: THREE.DoubleSide, alphaTest: 0.15 }),
  MAX_IVY
);
ivyIM.receiveShadow = true;
scene.add(ivyIM);
let ivyCount = 0;

function scatterIvy(wallCX, wallCZ, axis, faceSign, span) {
  const passes = Math.floor(span / 1.4) * 3;
  for (let i = 0; i < passes && ivyCount < MAX_IVY; i++) {
    const t  = (rng() - 0.5) * span;
    const iy = BY + 0.15 + rng() * 8.8;
    const s  = 0.5 + rng() * 0.95;
    const posX = axis === 'x' ? wallCX + t + (rng()-0.5)*0.3 : wallCX + faceSign * 0.08;
    const posZ = axis === 'x' ? wallCZ + faceSign * 0.08     : wallCZ + t + (rng()-0.5)*0.3;
    dummy.position.set(posX, iy, posZ);
    dummy.rotation.set(
      (rng()-0.5)*0.55,
      axis === 'x'
        ? (faceSign > 0 ? 0          : Math.PI)
        : (faceSign > 0 ? Math.PI*0.5 : -Math.PI*0.5),
      (rng()-0.5)*0.68
    );
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    ivyIM.setMatrixAt(ivyCount++, dummy.matrix);
  }
}

// Keep exterior — all four faces
scatterIvy(keepX,          keepZ + keepD*0.5,  'x', +1, keepW - wt*2);  // south (skip door)
scatterIvy(keepX,          keepZ - keepD*0.5,  'x', -1, keepW);          // north
scatterIvy(keepX + keepW*0.5, keepZ,           'z', +1, keepD);          // east
scatterIvy(keepX - keepW*0.5, keepZ,           'z', -1, keepD);          // west
// Great hall exterior
scatterIvy(keepX,          keepZ + keepD*0.5 + hallD, 'x', +1, hallW);
scatterIvy(keepX - hallW*0.5, keepZ + keepD*0.5 + hallD*0.5, 'z', -1, hallD);
scatterIvy(keepX + hallW*0.5, keepZ + keepD*0.5 + hallD*0.5, 'z', +1, hallD);

ivyIM.count = ivyCount;
ivyIM.instanceMatrix.needsUpdate = true;

// ─── Rubble — inside courtyard and scattered around clearing perimeter ────────
for (let i = 0; i < 40; i++) {
  let bx, bz;
  if (i < 16) {
    // Inside courtyard — random rubble piles near walls
    bx = CX + (rng()-0.5) * (wallW - wallT*4);
    bz = CZ_C + (rng()-0.5) * (wallD - wallT*4);
    // Skip over well and campfire zones
    if (Math.hypot(bx - (CX+22), bz - (CZ_C+28)) < 6) continue;
  } else {
    const angle = rng()*Math.PI*2, r = 78 + rng()*62;
    bx = CX + Math.cos(angle)*r;
    bz = CZ_C + Math.sin(angle)*r;
  }
  if (Math.abs(bx) > WORLD*0.47 || Math.abs(bz) > WORLD*0.47) continue;
  const bh = getH(bx, bz);
  const bs = 0.35 + rng()*1.9;
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(bs, 1), rockMat);
  boulder.position.set(bx, bh + bs*0.35, bz);
  boulder.rotation.set(rng()*Math.PI, rng()*Math.PI, rng()*Math.PI);
  boulder.castShadow = boulder.receiveShadow = true;
  scene.add(boulder);
}

// ─── Collision volumes ────────────────────────────────────────────────────────
// AABB obstacles [minX, maxX, minZ, maxZ] — outer curtain walls + keep walls
const collBoxes = [
  // Outer curtain — north wall
  [CX - wallW*0.5,             CX + wallW*0.5,             CZ_C - wallD*0.5 - wallT*0.5, CZ_C - wallD*0.5 + wallT*0.5],
  // Outer curtain — south wall (split for gate opening)
  [CX - wallW*0.5,             CX - gateW*0.5,             CZ_C + wallD*0.5 - wallT*0.5, CZ_C + wallD*0.5 + wallT*0.5],
  [CX + gateW*0.5,             CX + wallW*0.5,             CZ_C + wallD*0.5 - wallT*0.5, CZ_C + wallD*0.5 + wallT*0.5],
  // Outer curtain — east / west walls
  [CX + wallW*0.5 - wallT*0.5, CX + wallW*0.5 + wallT*0.5, CZ_C - wallD*0.5,            CZ_C + wallD*0.5],
  [CX - wallW*0.5 - wallT*0.5, CX - wallW*0.5 + wallT*0.5, CZ_C - wallD*0.5,            CZ_C + wallD*0.5],
  // Keep — north wall
  [keepX - keepW*0.5,          keepX + keepW*0.5,          keepZ - keepD*0.5,             keepZ - keepD*0.5 + wt],
  // Keep — east / west walls
  [keepX + keepW*0.5 - wt,     keepX + keepW*0.5,          keepZ - keepD*0.5,             keepZ + keepD*0.5],
  [keepX - keepW*0.5,          keepX - keepW*0.5 + wt,     keepZ - keepD*0.5,             keepZ + keepD*0.5],
  // Keep — south wall (split for doorway)
  [keepX - keepW*0.5,          keepX - keepDoorW*0.5,      keepZ + keepD*0.5 - wt,        keepZ + keepD*0.5],
  [keepX + keepDoorW*0.5,      keepX + keepW*0.5,          keepZ + keepD*0.5 - wt,        keepZ + keepD*0.5],
];
// Cylinder obstacles [cx, cz, radius] — towers and keep turrets
const collCyls = [
  // Outer corner towers
  [CX - wallW*0.5, CZ_C - wallD*0.5, tR], [CX + wallW*0.5, CZ_C - wallD*0.5, tR],
  [CX - wallW*0.5, CZ_C + wallD*0.5, tR], [CX + wallW*0.5, CZ_C + wallD*0.5, tR],
  // Gatehouse flanking towers
  [CX - (gateW*0.5 + 5), CZ_C + wallD*0.5, 6], [CX + (gateW*0.5 + 5), CZ_C + wallD*0.5, 6],
  // Keep corner turrets
  [keepX - keepW*0.5, keepZ - keepD*0.5, ktR], [keepX + keepW*0.5, keepZ - keepD*0.5, ktR],
  [keepX - keepW*0.5, keepZ + keepD*0.5, ktR], [keepX + keepW*0.5, keepZ + keepD*0.5, ktR],
];

function isColliding(px, pz) {
  for (const b of collBoxes) {
    const cx = Math.max(b[0], Math.min(b[1], px));
    const cz = Math.max(b[2], Math.min(b[3], pz));
    if ((px - cx)*(px - cx) + (pz - cz)*(pz - cz) < PLAYER_R * PLAYER_R) return true;
  }
  for (const c of collCyls) {
    const dx = px - c[0], dz = pz - c[1], r = PLAYER_R + c[2];
    if (dx*dx + dz*dz < r*r) return true;
  }
  return false;
}

// Wall-slide: try full move, then X-only, then Z-only before giving up
function resolveMove(ox, oz, dx, dz) {
  if (!isColliding(ox + dx, oz + dz)) return [ox + dx, oz + dz];
  if (!isColliding(ox + dx, oz))      return [ox + dx, oz];
  if (!isColliding(ox, oz + dz))      return [ox,      oz + dz];
  return [ox, oz];
}

// ─── Particles ────────────────────────────────────────────────────────────────
const DUST_N = 200, SPORE_N = 180;

// Per-particle base positions and phase offsets (kept for animation)
const dustBase  = new Float32Array(DUST_N  * 3);
const dustPhase = new Float32Array(DUST_N);
const dustPos   = new Float32Array(DUST_N  * 3);

for (let i = 0; i < DUST_N; i++) {
  // Random position inside the hollow keep interior
  const x = keepX - keepW*0.5 + wt + rng() * (keepW - wt*2);
  const y = BY + 0.6 + rng() * (keepH * 0.85);
  const z = keepZ - keepD*0.5 + wt + rng() * (keepD - wt*2);
  dustBase[i*3]=x; dustBase[i*3+1]=y; dustBase[i*3+2]=z;
  dustPos [i*3]=x; dustPos [i*3+1]=y; dustPos [i*3+2]=z;
  dustPhase[i] = rng() * Math.PI * 2;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.07, color: 0xffe8a0, transparent: true, opacity: 0.52,
  depthWrite: false, sizeAttenuation: true,
}));
scene.add(dustPoints);

// Forest spores — spread through woodland outside the clearing
const sporeBase  = new Float32Array(SPORE_N * 3);
const sporePhase = new Float32Array(SPORE_N);
const sporePos   = new Float32Array(SPORE_N * 3);
let si = 0;
while (si < SPORE_N) {
  const angle = rng() * Math.PI * 2;
  const r     = 30 + rng() * 360;
  const sx    = CX + Math.cos(angle) * r;
  const sz    = CZ_C + Math.sin(angle) * r;
  if (Math.abs(sx) > WORLD*0.46 || Math.abs(sz) > WORLD*0.46) continue;
  if (Math.hypot(sx - CX, sz - CZ_C) < CLR_OUT + 20) continue;  // stay in forest
  const sy = getH(sx, sz) + 0.5 + rng() * 5;
  sporeBase[si*3]=sx; sporeBase[si*3+1]=sy; sporeBase[si*3+2]=sz;
  sporePos [si*3]=sx; sporePos [si*3+1]=sy; sporePos [si*3+2]=sz;
  sporePhase[si] = rng() * Math.PI * 2;
  si++;
}
const sporeGeo = new THREE.BufferGeometry();
sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
const sporePoints = new THREE.Points(sporeGeo, new THREE.PointsMaterial({
  size: 0.15, color: 0xc8f0a0, transparent: true, opacity: 0.38,
  depthWrite: false, sizeAttenuation: true,
}));
scene.add(sporePoints);

setProgress(100);

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ─── Render loop ──────────────────────────────────────────────────────────────
let lastTime = performance.now();
const _right = new THREE.Vector3();
const _fwd   = new THREE.Vector3();
let firstFrame = true;
let elapsed    = 0;
let bobPhase   = 0;
let smoothY    = 2.5;
const vel      = new THREE.Vector3();
const PLAYER_R = 1.2;

// Returns the walkable floor height at world position (px, pz).
// Checks the staircase ramp first, then keep wall-walks, then terrain.
function getFloorH(px, pz) {
  // Staircase: smooth ramp from ground (BY) to battlement deck (BY+keepH)
  if (px >= stairX - stairW*0.5 - 0.5 && px <= stairX + stairW*0.5 + 0.5 &&
      pz <= stairZS + stairStepD      && pz >= stairZN - stairStepD) {
    const t = Math.max(0, Math.min(1, (stairZS - pz) / (stairZS - stairZN)));
    return BY + t * keepH;
  }
  // Keep wall-walks at battlement level (east, west, north, south segments)
  const kTop = BY + keepH;
  if (px >= keepX + keepW*0.5 - wt - 0.3 && px <= keepX + keepW*0.5 + 0.3 &&
      pz >= keepZ - keepD*0.5 - 0.3   && pz <= keepZ + keepD*0.5 + 0.3) return kTop; // east
  if (px >= keepX - keepW*0.5 - 0.3   && px <= keepX - keepW*0.5 + wt + 0.3 &&
      pz >= keepZ - keepD*0.5 - 0.3   && pz <= keepZ + keepD*0.5 + 0.3) return kTop; // west
  if (px >= keepX - keepW*0.5 - 0.3   && px <= keepX + keepW*0.5 + 0.3 &&
      pz >= keepZ - keepD*0.5 - 0.3   && pz <= keepZ - keepD*0.5 + wt + 0.3) return kTop; // north
  if (px >= keepX - keepW*0.5 - 0.3   && px < keepX - keepDoorW*0.5 &&
      pz >= keepZ + keepD*0.5 - wt - 0.3 && pz <= keepZ + keepD*0.5 + 0.3) return kTop; // south-left
  if (px >  keepX + keepDoorW*0.5     && px <= keepX + keepW*0.5 + 0.3 &&
      pz >= keepZ + keepD*0.5 - wt - 0.3 && pz <= keepZ + keepD*0.5 + 0.3) return kTop; // south-right
  return getH(px, pz);
}

function moveAndFollow(delta, moving, speed) {
  const p = camera.position;
  p.x = Math.max(-WORLD*0.5 + 4, Math.min(WORLD*0.5 - 4, p.x));
  p.z = Math.max(-WORLD*0.5 + 4, Math.min(WORLD*0.5 - 4, p.z));
  const targetY = getFloorH(p.x, p.z) + 1.72;
  const dy = targetY - smoothY;
  if (dy > 0) {
    smoothY += dy * Math.min(1, delta * 14);
  } else {
    smoothY = Math.max(targetY, smoothY - 10 * delta);
  }
  // Head-bob: amplitude scales with actual speed; second harmonic adds organic feel
  if (moving && speed > 0.5) {
    bobPhase += delta * speed * 0.9;
    const amp = Math.min(0.065, 0.040 + speed * 0.0009);
    p.y = smoothY + Math.sin(bobPhase) * amp + Math.sin(bobPhase * 0.48) * amp * 0.22;
  } else {
    // Smooth decay rather than hard stop
    bobPhase *= Math.max(0, 1 - delta * 8);
    p.y = smoothY + Math.sin(bobPhase) * 0.008;
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (firstFrame) {
    firstFrame = false;
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 900);
  }

  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += delta;

  if (gameActive) {
    if (!isMobile) {
      const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
      const speed  = sprint ? 24 : 10;

      // Flat camera forward/right (ignores pitch for movement)
      _right.setFromMatrixColumn(camera.matrix, 0);
      _fwd.crossVectors(camera.up, _right);

      const fw = (keys['KeyW']||keys['ArrowUp']    ? 1 : 0) - (keys['KeyS']||keys['ArrowDown']  ? 1 : 0);
      const rt = (keys['KeyD']||keys['ArrowRight'] ? 1 : 0) - (keys['KeyA']||keys['ArrowLeft']  ? 1 : 0);
      const desX = (_fwd.x * fw + _right.x * rt) * speed;
      const desZ = (_fwd.z * fw + _right.z * rt) * speed;

      // Inertia: accelerate toward desired, decelerate faster when no input
      const hasInput = fw !== 0 || rt !== 0;
      vel.x += (desX - vel.x) * Math.min(1, delta * (hasInput ? 9 : 14));
      vel.z += (desZ - vel.z) * Math.min(1, delta * (hasInput ? 9 : 14));

      // Wall-slide collision resolution
      const ox = camera.position.x, oz = camera.position.z;
      const dx = vel.x * delta,     dz = vel.z * delta;
      const [nx, nz] = resolveMove(ox, oz, dx, dz);
      if (Math.abs(dx) > 0.0001 && nx === ox) vel.x = 0; // wall in X — kill that component
      if (Math.abs(dz) > 0.0001 && nz === oz) vel.z = 0; // wall in Z — kill that component
      camera.position.x = nx; camera.position.z = nz;

      const spd    = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const moving = spd > 0.25;
      moveAndFollow(delta, moving, spd);
    } else {
      camera.rotation.y = mYaw;
      camera.rotation.x = mPitch;
      const moving = joy.active && (joy.dx !== 0 || joy.dy !== 0);
      if (moving) {
        const mspeed = 10;
        _right.setFromMatrixColumn(camera.matrix, 0);
        _fwd.crossVectors(camera.up, _right);
        const mdx = (-(joy.dy/JMAX) * _fwd.x + (joy.dx/JMAX) * _right.x) * mspeed * delta;
        const mdz = (-(joy.dy/JMAX) * _fwd.z + (joy.dx/JMAX) * _right.z) * mspeed * delta;
        const [mnx, mnz] = resolveMove(camera.position.x, camera.position.z, mdx, mdz);
        camera.position.x = mnx; camera.position.z = mnz;
      }
      moveAndFollow(delta, moving, moving ? 10 : 0);
    }
  }

  // Animate water
  pondMat.color.setHSL(0.575, 0.55, 0.20 + Math.sin(elapsed * 0.9) * 0.022);
  pondMat.roughness = 0.04 + Math.sin(elapsed * 1.4) * 0.025;

  // Animate dust motes — slow brownian drift within the keep interior
  const dustAttr = dustGeo.attributes.position;
  for (let i = 0; i < DUST_N; i++) {
    const ph = dustPhase[i];
    dustAttr.setXYZ(i,
      dustBase[i*3]   + Math.sin(elapsed*0.28 + ph)        * 0.20,
      dustBase[i*3+1] + Math.sin(elapsed*0.20 + ph*1.30)   * 0.14,
      dustBase[i*3+2] + Math.cos(elapsed*0.24 + ph*0.85)   * 0.20
    );
  }
  dustAttr.needsUpdate = true;

  // Animate forest spores — gentle multi-frequency float and drift
  const sporeAttr = sporeGeo.attributes.position;
  for (let i = 0; i < SPORE_N; i++) {
    const ph = sporePhase[i];
    sporeAttr.setXYZ(i,
      sporeBase[i*3]   + Math.sin(elapsed*0.12 + ph)        * 1.5,
      sporeBase[i*3+1] + Math.sin(elapsed*0.09 + ph*1.20)   * 1.1
                       + Math.sin(elapsed*0.04 + ph*0.38)   * 2.6,
      sporeBase[i*3+2] + Math.cos(elapsed*0.11 + ph*0.95)   * 1.5
    );
  }
  sporeAttr.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();
