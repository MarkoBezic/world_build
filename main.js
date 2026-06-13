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

// ─── Device detection ─────────────────────────────────────────────────────────
const isMobile = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

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
camera.rotation.order = 'YXZ';
camera.position.set(0, 2.5, 32);

// ─── Controls ─────────────────────────────────────────────────────────────────
const overlay   = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
const hint      = document.getElementById('hint');

let gameActive  = false;
let plControls  = null; // PointerLockControls — desktop only
const keys      = {};

if (!isMobile) {
  // ── Desktop ────────────────────────────────────────────────────────────────
  overlay.innerHTML = `
    <h1>Forest World</h1>
    <p>Click to explore</p>
    <div class="keys">
      <div class="key" style="grid-column:2">W</div>
      <div class="key">A</div><div class="key">S</div><div class="key">D</div>
      <div class="key shift">⇧ Sprint</div>
      <div class="key wide">Esc — release cursor</div>
    </div>`;

  plControls = new PointerLockControls(camera, document.body);
  overlay.addEventListener('click', () => plControls.lock());
  plControls.addEventListener('lock', () => {
    gameActive = true;
    overlay.classList.add('hidden');
    crosshair.classList.add('visible');
    hint.classList.add('visible');
  });
  plControls.addEventListener('unlock', () => {
    gameActive = false;
    overlay.classList.remove('hidden');
    crosshair.classList.remove('visible');
    hint.classList.remove('visible');
  });

  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup',   e => { keys[e.code] = false; });

} else {
  // ── Mobile ─────────────────────────────────────────────────────────────────
  overlay.innerHTML = `
    <h1>Forest World</h1>
    <p>Tap to explore</p>
    <div class="mobile-hint">
      <span>Left — move</span>
      <span>Right — look</span>
    </div>`;

  overlay.addEventListener('click', () => {
    overlay.classList.add('hidden');
    gameActive = true;
  });
}

// ─── Mobile touch ─────────────────────────────────────────────────────────────
const JMAX = 55;
const joy  = { active: false, id: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
const look = { active: false, id: -1, lastX: 0, lastY: 0 };
let mYaw   = 0;
let mPitch = 0;

const jBaseEl = document.getElementById('joystick-base');
const jKnobEl = document.getElementById('joystick-knob');

function syncJoyUI() {
  if (joy.active) {
    jBaseEl.style.display = 'block';
    jBaseEl.style.left = joy.baseX + 'px';
    jBaseEl.style.top  = joy.baseY + 'px';
    jKnobEl.style.transform = `translate(calc(-50% + ${joy.dx}px), calc(-50% + ${joy.dy}px))`;
  } else {
    jBaseEl.style.display = 'none';
  }
}

if (isMobile) {
  const cv = renderer.domElement;

  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!joy.active && t.clientX < innerWidth * 0.5) {
        Object.assign(joy, { active: true, id: t.identifier,
          baseX: t.clientX, baseY: t.clientY, dx: 0, dy: 0 });
        syncJoyUI();
      } else if (!look.active) {
        Object.assign(look, { active: true, id: t.identifier,
          lastX: t.clientX, lastY: t.clientY });
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
        look.lastX = t.clientX;
        look.lastY = t.clientY;
      }
    }
  }, { passive: false });

  cv.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy.active  && t.identifier === joy.id)  { Object.assign(joy,  { active: false, dx: 0, dy: 0 }); syncJoyUI(); }
      if (look.active && t.identifier === look.id) { look.active = false; }
    }
  }, { passive: false });
}

// ─── Sky ──────────────────────────────────────────────────────────────────────
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value       = 3.5;
skyU.rayleigh.value        = 1.4;
skyU.mieCoefficient.value  = 0.005;
skyU.mieDirectionalG.value = 0.82;

const sunDir = new THREE.Vector3();
sunDir.setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - 42),
  THREE.MathUtils.degToRad(188)
);
skyU.sunPosition.value.copy(sunDir);

setProgress(15);

// ─── Lighting ─────────────────────────────────────────────────────────────────
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
const WORLD  = 400;
const SEGS   = 280;
const NS     = 0.009;
const HS     = 38;

const getH = (x, z) => {
  let h = fbm(x * NS, z * NS) * HS;
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
  if      (n < 0.04) colTmp.setRGB(0.42, 0.60, 0.20);
  else if (n < 0.30) colTmp.setRGB(0.23, 0.41, 0.13);
  else if (n < 0.62) colTmp.setRGB(0.30, 0.37, 0.18);
  else               colTmp.setRGB(0.50, 0.46, 0.36);
  vColor[i * 3]     = colTmp.r;
  vColor[i * 3 + 1] = colTmp.g;
  vColor[i * 3 + 2] = colTmp.b;
}

terrGeo.setAttribute('color', new THREE.BufferAttribute(vColor, 3));
terrGeo.computeVertexNormals();

const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.93, metalness: 0.0,
}));
terrain.receiveShadow = true;
scene.add(terrain);

setProgress(40);

// ─── Pond ─────────────────────────────────────────────────────────────────────
const pondGeo = new THREE.CircleGeometry(16, 56);
pondGeo.rotateX(-Math.PI / 2);
const pondMat = new THREE.MeshStandardMaterial({
  color: 0x2a6a90, roughness: 0.06, metalness: 0.08, transparent: true, opacity: 0.88,
});
const pond = new THREE.Mesh(pondGeo, pondMat);
pond.position.y = 0.18;
scene.add(pond);

const shoreGeo = new THREE.RingGeometry(15.5, 19, 56);
shoreGeo.rotateX(-Math.PI / 2);
const shore = new THREE.Mesh(shoreGeo, new THREE.MeshStandardMaterial({ color: 0x3a3220, roughness: 0.95 }));
shore.position.y = 0.05;
scene.add(shore);

setProgress(55);

// ─── Instanced Trees ──────────────────────────────────────────────────────────
const MAX_PINES = 380;
const MAX_OAKS  = 260;

const mats = {
  pineTrunk: new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.93 }),
  pineLeaf:  new THREE.MeshStandardMaterial({ color: 0x1a4020, roughness: 0.88 }),
  oakTrunk:  new THREE.MeshStandardMaterial({ color: 0x4a2c0c, roughness: 0.95 }),
  oakLeafA:  new THREE.MeshStandardMaterial({ color: 0x2e5c18, roughness: 0.87 }),
  oakLeafB:  new THREE.MeshStandardMaterial({ color: 0x3a7020, roughness: 0.87 }),
};

const pineTrunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6),  mats.pineTrunk, MAX_PINES);
const pineC0IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),                mats.pineLeaf,  MAX_PINES);
const pineC1IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),                mats.pineLeaf,  MAX_PINES);
const pineC2IM    = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),                mats.pineLeaf,  MAX_PINES);
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
  if (d2 < 22 * 22) continue;
  if (h < 1.2 || h > 33) continue;
  const wantPine = h > 16;

  if (wantPine && pines < MAX_PINES) {
    const s = 2.8 + rng() * 2.8, th = s * 1.1, ry = rng() * Math.PI * 2;
    const jx = (rng() - 0.5) * 0.5, jz = (rng() - 0.5) * 0.5;
    dummy.position.set(x+jx, h+th*0.5, z+jz); dummy.scale.set(s*0.55, th, s*0.55); dummy.rotation.y=ry; dummy.updateMatrix();
    pineTrunkIM.setMatrixAt(pines, dummy.matrix);
    [[1.85,0],[1.43,1],[1.01,2]].forEach(([r,t]) => {
      dummy.position.set(x+jx, h+th+t*1.35*s, z+jz); dummy.scale.set(r*s, 2.1*s, r*s); dummy.rotation.y=ry; dummy.updateMatrix();
      [pineC0IM,pineC1IM,pineC2IM][t].setMatrixAt(pines, dummy.matrix);
    });
    pines++;
  } else if (!wantPine && oaks < MAX_OAKS) {
    const s = 2.2 + rng() * 2.2, th = s * 0.85, ry = rng() * Math.PI * 2;
    dummy.position.set(x, h+th*0.5, z); dummy.scale.set(s*0.45, th, s*0.45); dummy.rotation.y=ry; dummy.updateMatrix();
    oakTrunkIM.setMatrixAt(oaks, dummy.matrix);
    const crA = (1.5+rng()*0.7)*s;
    dummy.position.set(x+(rng()-0.5)*s*0.4, h+th+crA*0.55, z+(rng()-0.5)*s*0.4); dummy.scale.set(crA,crA*0.85,crA); dummy.rotation.y=ry; dummy.updateMatrix();
    oakCapAIM.setMatrixAt(oaks, dummy.matrix);
    const crB = (1.2+rng()*0.6)*s;
    dummy.position.set(x+(rng()-0.5)*s*0.5, h+th+crA*0.7+crB*0.4, z+(rng()-0.5)*s*0.5); dummy.scale.set(crB,crB*0.75,crB); dummy.rotation.y=ry; dummy.updateMatrix();
    oakCapBIM.setMatrixAt(oaks, dummy.matrix);
    oaks++;
  }
}

pineTrunkIM.count=pines; pineC0IM.count=pines; pineC1IM.count=pines; pineC2IM.count=pines;
oakTrunkIM.count=oaks;   oakCapAIM.count=oaks;  oakCapBIM.count=oaks;
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
  const x = (rng()-0.5)*WORLD*0.88, z = (rng()-0.5)*WORLD*0.88;
  const h = getH(x, z);
  if (h < 0.6) continue;
  const s = 0.28 + rng() * 1.0;
  dummy.position.set(x, h+s*0.4, z);
  dummy.rotation.set(rng()*Math.PI, rng()*Math.PI, rng()*Math.PI);
  dummy.scale.setScalar(s); dummy.updateMatrix();
  rockIM.setMatrixAt(rocks++, dummy.matrix);
}
rockIM.count = rocks;
rockIM.instanceMatrix.needsUpdate = true;

// ─── Grass tufts ──────────────────────────────────────────────────────────────
const MAX_GRASS = 2000;
const grassIM   = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.6, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x4a8030, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.3 }),
  MAX_GRASS * 2
);
grassIM.receiveShadow = true;
scene.add(grassIM);
let gCount = 0;
for (let i = 0; i < MAX_GRASS; i++) {
  const angle = rng()*Math.PI*2, r = rng()*18;
  const x = Math.cos(angle)*r, z = Math.sin(angle)*r;
  const h = getH(x, z) + 0.42;
  for (let p = 0; p < 2; p++) {
    dummy.position.set(x, h, z);
    dummy.rotation.set(0, p*Math.PI/2+rng()*0.6, 0);
    dummy.scale.setScalar(0.6+rng()*0.6); dummy.updateMatrix();
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
const clock   = new THREE.Clock();
const _right  = new THREE.Vector3();
const _fwd    = new THREE.Vector3();
let firstFrame = true;
let elapsed    = 0;
let bobPhase   = 0;
let smoothY    = 2.5;

function moveAndFollow(delta, moving, speed) {
  const p = camera.position;
  p.x = Math.max(-WORLD/2+4, Math.min(WORLD/2-4, p.x));
  p.z = Math.max(-WORLD/2+4, Math.min(WORLD/2-4, p.z));
  const targetY = getH(p.x, p.z) + 1.72;
  smoothY += (targetY - smoothY) * Math.min(1, delta * 14);
  if (moving) {
    bobPhase += delta * speed * 1.1;
    p.y = smoothY + Math.sin(bobPhase) * 0.055;
  } else {
    bobPhase = 0;
    p.y = smoothY;
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (firstFrame) {
    firstFrame = false;
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 900);
  }

  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;

  if (gameActive) {
    if (!isMobile) {
      // ── Desktop WASD ────────────────────────────────────────────────────────
      const sprint  = keys['ShiftLeft'] || keys['ShiftRight'];
      const speed   = sprint ? 20 : 8;
      const moving  = keys['KeyW']||keys['ArrowUp']||keys['KeyS']||keys['ArrowDown']||
                      keys['KeyA']||keys['ArrowLeft']||keys['KeyD']||keys['ArrowRight'];

      if (keys['KeyW']||keys['ArrowUp'])    plControls.moveForward( speed * delta);
      if (keys['KeyS']||keys['ArrowDown'])  plControls.moveForward(-speed * delta);
      if (keys['KeyA']||keys['ArrowLeft'])  plControls.moveRight(  -speed * delta);
      if (keys['KeyD']||keys['ArrowRight']) plControls.moveRight(   speed * delta);

      moveAndFollow(delta, moving, speed);

    } else {
      // ── Mobile touch ────────────────────────────────────────────────────────
      camera.rotation.y = mYaw;
      camera.rotation.x = mPitch;

      const moving = joy.active && (joy.dx !== 0 || joy.dy !== 0);
      if (moving) {
        const speed = 8;
        const jx = joy.dx / JMAX;
        const jy = joy.dy / JMAX;

        _right.setFromMatrixColumn(camera.matrix, 0);
        _fwd.crossVectors(camera.up, _right);

        camera.position.addScaledVector(_fwd,   -jy * speed * delta);
        camera.position.addScaledVector(_right,  jx * speed * delta);
      }

      moveAndFollow(delta, moving, 8);
    }
  }

  pondMat.color.setHSL(0.575, 0.52, 0.225 + Math.sin(elapsed * 0.7) * 0.018);
  renderer.render(scene, camera);
}

animate();
