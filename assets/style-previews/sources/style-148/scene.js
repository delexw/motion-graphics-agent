// Brick Miniature preview — "An idea becomes a connected system".
// Three.js owns the visual scene; one paused GSAP timeline owns every animated property.
// All state is derived from timeline time, so direct / forward / backward seeks give the same frame.
import { technology as THREE } from "./technology-three_js-2QTVNm/index.js";

const gsap = window.gsap;
const W = 1280, H = 720, DURATION = 3;

// ---- Brick module (1 unit = one stud pitch) -------------------------------------------
const PITCH = 1;
const BRICK_H = 1.2;          // classic brick height = 1.2 x pitch
const STUD_R = 0.3, STUD_H = 0.2;
const GAP = 0.04;             // moulding gap so seams between bricks stay visible
const PLATE_T = 0.32;

const COLORS = {
  plate: "#3D8B57",      // baseplate (ground group)
  pier: "#F3F5F6",       // white piers
  idea: "#FFC52E",       // the idea brick
  deckLower: "#005885",  // active / approved accent
  deckUpper: "#0A6A9E",  // interlocking top course
  guide: "#FFE08A",
};

// ---- Renderer ---------------------------------------------------------------------------
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();

// Deterministic studio environment for plastic reflections (no external HDR files).
{
  const envScene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: 0x6a5a58, side: THREE.BackSide })
  );
  envScene.add(room);
  const panel = (w, h, pos, rot, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); envScene.add(m);
  };
  panel(18, 10, [0, 9.5, 0], [Math.PI / 2, 0, 0], 0xffffff);
  panel(10, 6, [-19.5, 4, 4], [0, Math.PI / 2, 0], 0xfff1e6);
  panel(8, 5, [8, 3, 19.5], [0, Math.PI, 0], 0xffd2c4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
}

scene.add(new THREE.HemisphereLight(0xffffff, 0xc94a33, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(-10, 24, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 300);
const LOOK = new THREE.Vector3(-1, 5.6, 0);

// ---- Geometry ---------------------------------------------------------------------------
const studGeo = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 28);
const plastic = (hex) => new THREE.MeshPhysicalMaterial({
  color: hex, roughness: 0.3, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.16, envMapIntensity: 0.75,
});
const MATS = Object.fromEntries(Object.entries(COLORS).filter(([k]) => k !== "guide").map(([k, v]) => [k, plastic(v)]));

// Studs are instanced on the shared module spacing: centre of every cell of a w x d footprint.
function studs(w, d, topY, mat) {
  const mesh = new THREE.InstancedMesh(studGeo, mat, w * d);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) {
    m.makeTranslation((ix - w / 2 + 0.5) * PITCH, topY + STUD_H / 2, (iz - d / 2 + 0.5) * PITCH);
    mesh.setMatrixAt(i++, m);
  }
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// A brick: origin at the centre of its bottom face so position = footprint centre + course height.
function brick(w, d, matKey) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w - GAP, BRICK_H - 0.01, d - GAP), MATS[matKey]);
  body.position.y = BRICK_H / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body, studs(w, d, BRICK_H, MATS[matKey]));
  scene.add(g);
  return g;
}

// Baseplate: 28 x 8 studs, empty at the start.
const BASE_W = 28, BASE_D = 8;
{
  const plate = new THREE.Mesh(new THREE.BoxGeometry(BASE_W, PLATE_T, BASE_D), MATS.plate);
  plate.position.y = -PLATE_T / 2;
  plate.receiveShadow = true; plate.castShadow = true;
  scene.add(plate, studs(BASE_W, BASE_D, 0, MATS.plate));
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ opacity: 0.24 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -PLATE_T;
  catcher.receiveShadow = true;
  scene.add(catcher);
}

// Alignment guide: a thin outline frame drawn around a target footprint.
function guide(w, d, x, y, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.guide, transparent: true, opacity: 0, depthWrite: false });
  const t = 0.12, hgt = 0.04;
  const bar = (bw, bd, px, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, hgt, bd), mat); m.position.set(px, 0, pz); g.add(m); };
  bar(w + t, t, 0, -d / 2); bar(w + t, t, 0, d / 2); bar(t, d + t, -w / 2, 0); bar(t, d + t, w / 2, 0);
  g.position.set(x, y + 0.02, z);
  g.renderOrder = 2;
  scene.add(g);
  return mat;
}

// ---- Assembly layout (every footprint lands on whole-stud coordinates) -----------------
const PIER_X = [-10, 0, 10];          // 2x2 piers on stud columns
const PIER_LEVELS = 4;
const DECK_Y = PIER_LEVELS * BRICK_H; // 4.8
const LOWER = [-8, 0, 8];             // 2x8 bricks: [-12,-4], [-4,4], [4,12] — each seated on one pier
const UPPER = [-5, 5];                // 2x10 bricks: [-10,0], [0,10] — straddle the lower seams at x=±4

const piers = PIER_X.map((x, p) => Array.from({ length: PIER_LEVELS }, (_, L) => {
  const b = brick(2, 2, p === 0 && L === PIER_LEVELS - 1 ? "idea" : "pier");
  b.position.set(x, L * BRICK_H, 0);
  return b;
}));
const lower = LOWER.map((x) => { const b = brick(8, 2, "deckLower"); b.position.set(x, DECK_Y, 0); return b; });
const upper = UPPER.map((x) => { const b = brick(10, 2, "deckUpper"); b.position.set(x, DECK_Y + BRICK_H, 0); return b; });
const lowerGuides = LOWER.map((x) => guide(8, 2, x, DECK_Y + STUD_H, 0));
const upperGuides = UPPER.map((x) => guide(10, 2, x, DECK_Y + BRICK_H + STUD_H, 0));

// ---- Render trigger ---------------------------------------------------------------------
const cam = { x: -9.6, y: 17.4, z: 40 };
function render() {
  camera.position.set(cam.x, cam.y, cam.z);
  camera.lookAt(LOOK);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
}
let queued = false;
const schedule = () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; render(); }); } };
// A proxy whose setter fires whenever the timeline renders, so any seek repaints the canvas.
const clock = { _t: 0, get t() { return this._t; }, set t(v) { this._t = v; schedule(); } };

// ---- One paused, seekable GSAP timeline -------------------------------------------------
const tl = gsap.timeline({ paused: true, defaults: { overwrite: false } });
tl.fromTo(clock, { t: 0 }, { t: DURATION, duration: DURATION, ease: "none" }, 0);

// Camera: slow tabletop push-in, settled by 2.6 s.
tl.fromTo(cam, { x: -9.6, y: 17.4, z: 40 }, { x: -8, y: 16, z: 36, duration: 2.6, ease: "sine.inOut" }, 0);

// Title card (separate card, never on studs).
const card = document.getElementById("card");
const pill = document.getElementById("pill");
tl.fromTo(card, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, 0.1);

// Stage 0 (0–0.2 s): empty stud grid. Piers drop straight down onto stud columns.
const hidden = (obj, at) => { obj.visible = false; tl.set(obj, { visible: true }, at); };
piers.forEach((col, p) => col.forEach((b, L) => {
  const isIdea = p === 0 && L === PIER_LEVELS - 1;
  const start = isIdea ? 0.86 : 0.2 + p * 0.12 + L * 0.1;
  const y = L * BRICK_H;
  hidden(b, start);
  tl.fromTo(b.position, { y: y + (isIdea ? 3.2 : 2.2) }, { y, duration: isIdea ? 0.22 : 0.18, ease: "power2.in" }, start);
  if (isIdea) tl.to(b.scale, { keyframes: [{ x: 1.06, y: 0.9, z: 1.06, duration: 0.05 }, { x: 1, y: 1, z: 1, duration: 0.12, ease: "back.out(2)" }] }, start + 0.22);
}));

// Course builder: 1) incoming slide along the X axis at hover height,
// 2) alignment hold over the outlined footprint, 3) seat straight down onto the studs.
function course(bricks, targets, baseY, guides, t0, slideDur, seatAt) {
  bricks.forEach((b, i) => {
    const sStart = t0 + i * 0.07;
    hidden(b, sStart);
    tl.fromTo(b.position, { x: targets[i] + 34 }, { x: targets[i], duration: slideDur, ease: "power3.out" }, sStart);
    const seat = seatAt + i * 0.05;
    tl.fromTo(b.position, { y: baseY + 1.0 }, { y: baseY, duration: 0.12, ease: "power2.in", immediateRender: false }, seat);
    tl.set(b.position, { y: baseY + 1.0 }, sStart); // hover height while sliding (restored on backward seeks)
    tl.to(b.scale, { keyframes: [{ y: 0.93, duration: 0.04 }, { y: 1, duration: 0.09, ease: "power2.out" }] }, seat + 0.12);
  });
  guides.forEach((m, i) => {
    tl.fromTo(m, { opacity: 0 }, { opacity: 0.95, duration: 0.16, ease: "power1.out" }, t0 + slideDur - 0.25 + i * 0.04);
    tl.to(m, { opacity: 0, duration: 0.1, ease: "power1.in" }, seatAt + i * 0.05 + 0.06);
  });
}
course(lower, LOWER, DECK_Y, lowerGuides, 1.0, 0.6, 1.74);
course(upper, UPPER, DECK_Y + BRICK_H, upperGuides, 1.8, 0.45, 2.34);

// Pill appears inside the already-complete card once the bridge is seated.
tl.fromTo(pill, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, 2.42);

window.__timelines = window.__timelines || {};
window.__timelines.video = tl;

const repaint = () => render();
window.addEventListener("hf-seek", repaint);
document.addEventListener("hf-seek", repaint);
tl.seek(0, false);
render();
