// Empty Corridor Camcorder — seekable Three.js corridor driven by one paused GSAP timeline.
// All state derives from timeline-owned values; no clocks, no rAF loops, seeded noise only.
import * as THREE from 'three';

const gsap = window.gsap;
const W = 1280, H = 720, DUR = 3, FPS = 30;

// ---------- palette (scene roles) ----------
const C = {
  void: '#0E1215',      // far darkness / fog
  wall: '#2A3239',      // low-saturation wall
  wallTop: '#3A444B',
  carpet: '#2C2E2B',    // low-saturation carpet
  frame: '#8E9488',     // repeating doorframe trim
  lamp: '#F5F4E8',      // foreground / practical lamps
  door: '#323B42',      // unlit doors
  active: '#76E1CB',    // the one changed detail
  ink: '#111722',       // glyph ink on the lit door
  secondary: '#294359',
};

// ---------- seeded PRNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- corridor grid ----------
const CW = 3.0;      // corridor width
const CH = 2.6;      // corridor height
const MOD = 2.5;     // module spacing (frames + lamps)
const Z0 = 1.5;      // threshold wall plane
const ZEND = -32;    // far end
const EYE = 1.58;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.void);
scene.fog = new THREE.Fog(C.void, 4, 26);

const camera = new THREE.PerspectiveCamera(64, W / H, 0.05, 80);
camera.rotation.order = 'YXZ';

function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

// Baked indirect light: one module of lamp pool is painted into each texture and tiled on the grid.
const rnd = mulberry32(147);
const floorTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = C.carpet; g.fillRect(0, 0, w, h);
  const pool = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.62);
  pool.addColorStop(0, 'rgba(245,244,232,0.16)');
  pool.addColorStop(1, 'rgba(245,244,232,0)');
  g.fillStyle = pool; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5 ? 'rgba(255,255,240,0.035)' : 'rgba(0,0,0,0.06)';
    g.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
}, 1, (Z0 - ZEND) / MOD);

const wallTex = canvasTex(256, 256, (g, w, h) => {
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, C.wallTop); v.addColorStop(0.55, C.wall); v.addColorStop(1, '#20272C');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  const pool = g.createRadialGradient(w / 2, 0, 4, w / 2, 0, w * 0.7);
  pool.addColorStop(0, 'rgba(245,244,232,0.14)'); pool.addColorStop(1, 'rgba(245,244,232,0)');
  g.fillStyle = pool; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1A2025'; g.fillRect(0, h - 14, w, 14); // baseboard
  for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(rnd() * w, rnd() * h, 1, 2); }
}, (Z0 - ZEND) / MOD, 1);

const ceilTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#1D2429'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
}, 2, (Z0 - ZEND) / MOD * 2);

const len = Z0 - ZEND, midZ = (Z0 + ZEND) / 2;
const basic = (o) => new THREE.MeshBasicMaterial(o);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(CW, len), basic({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, midZ); scene.add(floor);
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CW, len), basic({ map: ceilTex }));
ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CH, midZ); scene.add(ceil);
const wallL = new THREE.Mesh(new THREE.PlaneGeometry(len, CH), basic({ map: wallTex }));
wallL.rotation.y = Math.PI / 2; wallL.position.set(-CW / 2, CH / 2, midZ); scene.add(wallL);
const wallR = new THREE.Mesh(new THREE.PlaneGeometry(len, CH), basic({ map: wallTex.clone() }));
wallR.material.map.needsUpdate = true;
wallR.rotation.y = -Math.PI / 2; wallR.position.set(CW / 2, CH / 2, midZ); scene.add(wallR);
const endWall = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), basic({ color: '#141A1E' }));
endWall.position.set(0, CH / 2, ZEND + 0.01); scene.add(endWall);

// Threshold: an antechamber wall with a doorway the camera walks through.
const threshMat = basic({ color: '#252D33' });
const tW = 1.3, tH = 2.15;
const sideW = (CW + 2 - tW) / 2;
const tl1 = new THREE.Mesh(new THREE.PlaneGeometry(sideW, CH), threshMat);
tl1.position.set(-(tW / 2 + sideW / 2), CH / 2, Z0); scene.add(tl1);
const tl2 = tl1.clone(); tl2.position.x = tW / 2 + sideW / 2; scene.add(tl2);
const tl3 = new THREE.Mesh(new THREE.PlaneGeometry(tW, CH - tH), threshMat);
tl3.position.set(0, tH + (CH - tH) / 2, Z0); scene.add(tl3);
// antechamber behind camera start (so walls exist on early frames)
const anteFloor = new THREE.Mesh(new THREE.PlaneGeometry(CW + 2, 4), basic({ color: '#24262A' }));
anteFloor.rotation.x = -Math.PI / 2; anteFloor.position.set(0, 0, Z0 + 2); scene.add(anteFloor);
const anteCeil = new THREE.Mesh(new THREE.PlaneGeometry(CW + 2, 4), basic({ color: '#171C20' }));
anteCeil.rotation.x = Math.PI / 2; anteCeil.position.set(0, CH, Z0 + 2); scene.add(anteCeil);
for (const s of [-1, 1]) {
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(4, CH), basic({ color: '#1E252A' }));
  aw.rotation.y = -s * Math.PI / 2; aw.position.set(s * (CW / 2 + 1), CH / 2, Z0 + 2); scene.add(aw);
}
const frameMat = basic({ color: C.frame });
function ring(z, w, h, t, mat) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, t, t), mat); top.position.set(0, h - t / 2, 0); g.add(top);
  const l = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), mat); l.position.set(-w / 2 + t / 2, h / 2, 0); g.add(l);
  const r = l.clone(); r.position.x = w / 2 - t / 2; g.add(r);
  g.position.z = z; scene.add(g); return g;
}
ring(Z0 - 0.02, tW + 0.12, tH + 0.06, 0.07, frameMat); // threshold trim

// Repeating corridor coordinate: frame ring + ceiling lamp per module.
const lampMat = basic({ color: C.lamp, fog: true });
for (let z = Z0 - MOD; z > ZEND + 0.5; z -= MOD) {
  ring(z, CW, CH, 0.06, frameMat);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.22), lampMat);
  lamp.position.set(0, CH - 0.02, z + MOD / 2); scene.add(lamp);
}

// Doors: same module, three on the right (C1..C3), two on the left; only C3 is lit.
function labelTex(text, fg, bg) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = '700 54px "Courier New", Courier, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
  });
}
const DW = 1.0, DH = 2.05;
function door(side, z, label, lit) {
  const x = side * (CW / 2 - 0.012);
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), basic({ color: lit ? C.active : C.door }));
  panel.position.y = DH / 2; grp.add(panel);
  const trimMat = basic({ color: C.frame });
  const tt = 0.05;
  const top = new THREE.Mesh(new THREE.BoxGeometry(DW + 2 * tt, tt, 0.03), trimMat); top.position.set(0, DH + tt / 2, 0.01); grp.add(top);
  const l = new THREE.Mesh(new THREE.BoxGeometry(tt, DH, 0.03), trimMat); l.position.set(-DW / 2 - tt / 2, DH / 2, 0.01); grp.add(l);
  const r = l.clone(); r.position.x = DW / 2 + tt / 2; grp.add(r);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.04), basic({ color: lit ? '#3E6F66' : '#5A615C' }));
  knob.position.set(side > 0 ? -0.38 : 0.38, 1.0, 0.02); grp.add(knob);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16),
    basic({ map: labelTex(label, lit ? C.ink : C.lamp, lit ? C.active : '#1A2126') }));
  sign.position.set(0, DH + 0.2, 0.015); grp.add(sign);
  scene.add(grp);
  return { grp, panel };
}
door(1, -0.6, 'C1', false);
door(-1, -2.1, 'B1', false);
door(1, -3.4, 'C2', false);
door(-1, -6.0, 'B2', false);
const C3Z = -8.6;
const c3 = door(1, C3Z, 'C3', true);
door(-1, -11.2, 'B3', false);

// Lit-door spill on the carpet (practical light, no flashes).
const spillTex = canvasTex(256, 256, (g, w, h) => {
  const r = g.createRadialGradient(w, h / 2, 6, w, h / 2, w);
  r.addColorStop(0, 'rgba(118,225,203,0.55)'); r.addColorStop(1, 'rgba(118,225,203,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.8),
  basic({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
spill.rotation.x = -Math.PI / 2; spill.position.set(CW / 2 - 0.8, 0.005, C3Z); scene.add(spill);
const wallSpill = new THREE.Mesh(new THREE.PlaneGeometry(2.2, CH),
  basic({ map: spillTex.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
wallSpill.material.map.needsUpdate = true;
wallSpill.rotation.y = Math.PI / 2; wallSpill.rotation.z = 0; wallSpill.position.set(-CW / 2 + 0.01, CH / 2, C3Z);
scene.add(wallSpill);

// Glyph on C3: an idea (one node) becomes a connected system (three linked nodes).
const glyphCanvas = document.createElement('canvas');
glyphCanvas.width = 256; glyphCanvas.height = 256;
const gctx = glyphCanvas.getContext('2d');
const glyphTex = new THREE.CanvasTexture(glyphCanvas);
glyphTex.colorSpace = THREE.SRGBColorSpace;
const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), basic({ map: glyphTex, transparent: true }));
glyph.position.set(0, 1.38, 0.02);
c3.grp.add(glyph);
const N = [[128, 62], [62, 184], [194, 184]];
function drawGlyph(nodes, edges) {
  gctx.clearRect(0, 0, 256, 256);
  gctx.strokeStyle = C.ink; gctx.fillStyle = C.ink; gctx.lineWidth = 12; gctx.lineCap = 'round';
  const E = [[0, 1], [0, 2], [1, 2]];
  E.forEach(([a, b], i) => {
    const p = Math.min(1, Math.max(0, edges * 3 - i));
    if (p <= 0) return;
    gctx.beginPath(); gctx.moveTo(N[a][0], N[a][1]);
    gctx.lineTo(N[a][0] + (N[b][0] - N[a][0]) * p, N[a][1] + (N[b][1] - N[a][1]) * p); gctx.stroke();
  });
  N.forEach(([x, y], i) => {
    const s = i === 0 ? 1 : Math.min(1, Math.max(0, nodes * 2 - (i - 1)));
    if (s <= 0) return;
    gctx.beginPath(); gctx.arc(x, y, (i === 0 ? 20 : 16) * s, 0, Math.PI * 2); gctx.fill();
  });
  glyphTex.needsUpdate = true;
}

// ---------- timeline-owned state ----------
const S = {
  t: 0,          // absolute time (handheld breathing, timecode)
  z: 3.5,        // camera dolly along the corridor grid
  yaw: 0,        // carried view direction; turns toward C3
  fov: 64,       // camcorder zoom
  shake: 1,      // handheld amplitude (settles at the anomaly)
  nodes: 0,      // satellite nodes appear
  edges: 0,      // connections draw
  doorGlow: 0.55 // lit door brightness ramp (slow, no flash)
};
const START_Z = 3.5;
const panelBase = new THREE.Color(C.active);
const panelDim = new THREE.Color('#3D6F66');
const tmpCol = new THREE.Color();

function render() {
  const dist = START_Z - S.z;               // footfalls are tied to distance travelled
  const phase = dist / 0.72 * Math.PI;
  const breath = 1 - Math.min(1, Math.max(0, (S.t - 2.0) / 0.6));
  const bobY = Math.abs(Math.sin(phase)) * 0.028 * S.shake;
  const swayX = Math.sin(phase * 0.5) * 0.02 * S.shake;
  camera.position.set(swayX + 0.08 * (S.yaw / -0.22), EYE + bobY - 0.014 * S.shake, S.z);
  camera.rotation.y = S.yaw + Math.sin(phase * 0.5) * 0.006 * S.shake + Math.sin(S.t * 2.3) * 0.003 * breath;
  camera.rotation.x = -0.015 + Math.sin(phase) * 0.004 * S.shake + Math.sin(S.t * 1.7) * 0.002 * breath;
  camera.rotation.z = Math.sin(phase * 0.5) * 0.006 * S.shake;
  if (camera.fov !== S.fov) { camera.fov = S.fov; camera.updateProjectionMatrix(); }

  tmpCol.copy(panelDim).lerp(panelBase, S.doorGlow);
  c3.panel.material.color.copy(tmpCol);
  spill.material.opacity = 0.35 + 0.65 * S.doorGlow;
  wallSpill.material.opacity = 0.12 + 0.25 * S.doorGlow;
  drawGlyph(S.nodes, S.edges);
  renderer.render(scene, camera);

  // recorder overlay (DOM), derived from the same state
  const f = Math.round(S.t * FPS);
  const fr = (22 + f) % 30, secs = 14 + Math.floor((22 + f) / 30);
  tc.textContent = `SP 00:07:${String(secs).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
  recDot.style.opacity = (Math.floor(S.t * 2) % 2 === 0) ? '1' : '0.25';
}

const tc = document.getElementById('tc');
const recDot = document.getElementById('recdot');

// ---------- one paused GSAP timeline ----------
const tl = gsap.timeline({ paused: true, onUpdate: render, defaults: { overwrite: false } });
tl.to(S, { t: DUR, duration: DUR, ease: 'none' }, 0);
// continuous walking pace through the threshold, then a natural slow-down before the anomaly
tl.to(S, { z: -1.0, duration: 1.4, ease: 'none' }, 0);
tl.to(S, { z: -3.25, duration: 1.1, ease: 'sine.out' }, 1.4);
tl.to(S, { yaw: -0.22, duration: 1.0, ease: 'sine.inOut' }, 1.45);
tl.to(S, { fov: 52, duration: 0.8, ease: 'sine.inOut' }, 1.8);
tl.to(S, { shake: 0, duration: 1.0, ease: 'sine.out' }, 1.6);
tl.to(S, { doorGlow: 1, duration: 0.7, ease: 'sine.inOut' }, 1.6);
tl.to(S, { nodes: 1, duration: 0.35, ease: 'power2.out' }, 1.95);
tl.to(S, { edges: 1, duration: 0.45, ease: 'sine.inOut' }, 2.15);
// overlay copy
tl.fromTo('#cap', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0.15);
tl.fromTo('#cap2', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'sine.out' }, 1.95);
tl.set({}, {}, DUR);

window.__timelines = window.__timelines || {};
window.__timelines.video = tl;

drawGlyph(0, 0);
tl.seek(0, false);
render();

window.addEventListener('hf-seek', (e) => {
  const t = e && e.detail && typeof e.detail.time === 'number' ? e.detail.time : null;
  if (t !== null) tl.seek(t, false);
  render();
});
