// Glass Studio Product — style-164 motion preview scene.
// Three.js owns rendering; one paused GSAP timeline (window.__timelines.video) owns every animated value.
// All visuals are a pure function of timeline time: render() reads state S only.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const gsap = window.gsap;
const W = 1280, H = 720;

const COL = {
  active: new THREE.Color('#76E1CB'),
  secondary: new THREE.Color('#294359'),
  link: new THREE.Color('#9AA9B6'),
  shell: new THREE.Color('#A9D6E8'),
  pearl: new THREE.Color('#DDE3E8'),
};

// ---------- renderer / camera ----------
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x070a10, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
// Stationary studio backdrop (screen-fixed, not tone mapped): dark graphite-blue sweep + one faint vertical studio strip.
function backdropTexture() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(W * 0.64, H * 0.44, 0, W * 0.64, H * 0.44, W * 0.62);
  gr.addColorStop(0, '#22324A'); gr.addColorStop(0.5, '#141e2d'); gr.addColorStop(1, '#070A10');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(1110, 0, 6, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = backdropTexture();
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
// Shift the projection so the product sits right of centre and the left studio plane stays clean for copy.
camera.setViewOffset(W, H, -175, 10, W, H);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(-4, 6, 5);
scene.add(key);
const rimLight = new THREE.DirectionalLight(0xbfe8ff, 1.2);
rimLight.position.set(5, 2, -4);
scene.add(rimLight);
scene.add(new THREE.AmbientLight(0x6f87a0, 0.35));

// ---------- shell geometry (capsule with wall thickness, split into back / front halves) ----------
const R = 1.0, HH = 0.22, T = 0.055;
function profile(r) {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r), -HH + Math.sin(a) * r)); }
  for (let i = 1; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r), HH + Math.sin(a) * r)); }
  return pts;
}
const outerFront = new THREE.LatheGeometry(profile(R), 48, -Math.PI / 2, Math.PI);
const innerFront = new THREE.LatheGeometry(profile(R - T), 48, -Math.PI / 2, Math.PI);
const outerBack = new THREE.LatheGeometry(profile(R), 48, Math.PI / 2, Math.PI);
const innerBack = new THREE.LatheGeometry(profile(R - T), 48, Math.PI / 2, Math.PI);

function stadium(r) {
  const s = new THREE.Shape();
  s.absarc(0, HH, r, 0, Math.PI, false);
  s.absarc(0, -HH, r, Math.PI, Math.PI * 2, false);
  s.closePath();
  return s;
}
const lipShape = stadium(R);
lipShape.holes.push(new THREE.Path(stadium(R - T).getPoints(48)));
const lipGeo = new THREE.ShapeGeometry(lipShape, 48);

const glassMat = (opacity) => new THREE.MeshPhysicalMaterial({
  color: COL.shell, transparent: true, opacity, roughness: 0.04, metalness: 0,
  clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4,
  side: THREE.DoubleSide, depthWrite: false,
});

// Fresnel silhouette: keeps the outline readable on the dark studio ground.
const rimVS = `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const rimFS = `uniform float uRim; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main(){ float f = 1.0-abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 3.2)*uRim; gl_FragColor = vec4(uColor, a); }`;
const makeRim = () => new THREE.ShaderMaterial({
  uniforms: { uRim: { value: 0 }, uColor: { value: new THREE.Color('#E8F6FF') } },
  vertexShader: rimVS, fragmentShader: rimFS, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

// Controlled reflection strips: one broad sweeping band + one narrow fixed studio strip.
const sweepVS = `varying vec3 vW; varying vec3 vN; varying vec3 vV;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const sweepFS = `uniform float uSweep; uniform float uBroad; uniform float uNarrow; varying vec3 vW; varying vec3 vN; varying vec3 vV;
void main(){
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float d = dot(vW.xy, normalize(vec2(1.0, 0.34)));
  float broad = smoothstep(0.34, 0.0, abs(d - uSweep)) * uBroad * 0.30;
  float narrow = smoothstep(0.035, 0.0, abs(d + 0.80)) * smoothstep(-0.1, 0.6, vW.y) * uNarrow * 0.85;
  float edge = smoothstep(0.022, 0.0, abs(d - 0.86)) * smoothstep(0.2, -0.4, vW.y) * uNarrow * 0.45;
  float a = (broad + narrow + edge) * pow(facing, 0.6);
  gl_FragColor = vec4(vec3(1.0), a);
}`;
const sweepMat = new THREE.ShaderMaterial({
  uniforms: { uSweep: { value: -2.2 }, uBroad: { value: 0 }, uNarrow: { value: 0 } },
  vertexShader: sweepVS, fragmentShader: sweepFS, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.FrontSide,
});

const product = new THREE.Group();
scene.add(product);

const backHalf = new THREE.Group();
const frontHalf = new THREE.Group();
product.add(backHalf, frontHalf);

const backOuterMat = glassMat(0.10), backInnerMat = glassMat(0.06);
const frontOuterMat = glassMat(0.13), frontInnerMat = glassMat(0.07);
const backRimMat = makeRim(), frontRimMat = makeRim();
const lipMat = new THREE.MeshStandardMaterial({ color: '#CFEFFF', transparent: true, opacity: 0, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false, emissive: '#5c8ca8', emissiveIntensity: 0.4 });

function addMesh(parent, geo, mat, order) { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; parent.add(m); return m; }
addMesh(backHalf, innerBack, backInnerMat, 1);
addMesh(backHalf, outerBack, backOuterMat, 2);
addMesh(backHalf, outerBack, backRimMat, 3);
addMesh(frontHalf, innerFront, frontInnerMat, 10);
addMesh(frontHalf, lipGeo, lipMat, 11);
addMesh(frontHalf, outerFront, frontOuterMat, 12);
addMesh(frontHalf, outerFront, frontRimMat, 13);
const sweepMesh = addMesh(frontHalf, outerFront, sweepMat, 14);
sweepMesh.scale.setScalar(1.002);

// ---------- seat (open slot + collar) on the front half's upper-right shoulder ----------
const seatDir = new THREE.Vector3(0.56, 0.6, 0.57).normalize();
const seatPos = new THREE.Vector3(0, HH, 0).addScaledVector(seatDir, R);
const qZ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), seatDir);
const qY = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), seatDir);

const collarMat = new THREE.MeshStandardMaterial({ color: COL.secondary.clone(), roughness: 0.3, metalness: 0.6, emissive: COL.active.clone(), emissiveIntensity: 0 });
const collar = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.03, 16, 56), collarMat);
collar.position.copy(seatPos).addScaledVector(seatDir, 0.012);
collar.quaternion.copy(qZ);
collar.renderOrder = 15;
frontHalf.add(collar);
const slotMat = new THREE.MeshBasicMaterial({ color: '#05080d', transparent: true, opacity: 0 });
const slot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), slotMat);
slot.position.copy(seatPos).addScaledVector(seatDir, 0.006);
slot.quaternion.copy(qZ);
slot.renderOrder = 15;
frontHalf.add(slot);

// ---------- component cartridge (glass sleeve + opaque active core) ----------
const cartridge = new THREE.Group();
const cartGlassMat = glassMat(0.0);
cartGlassMat.side = THREE.FrontSide;
const cartRimMat = makeRim();
const cartGeo = new THREE.CapsuleGeometry(0.115, 0.36, 8, 24);
const cartGlass = new THREE.Mesh(cartGeo, cartGlassMat); cartGlass.renderOrder = 21;
const cartRim = new THREE.Mesh(cartGeo, cartRimMat); cartRim.renderOrder = 22;
const cartCoreMat = new THREE.MeshStandardMaterial({ color: COL.active, emissive: COL.active, emissiveIntensity: 0.25, roughness: 0.35, transparent: true, opacity: 0 });
const cartCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 6, 16), cartCoreMat); cartCore.renderOrder = 20;
cartridge.add(cartCore, cartGlass, cartRim);
product.add(cartridge);
const cartEnd = seatPos.clone().addScaledVector(seatDir, 0.2);
const cartStart = seatPos.clone().addScaledVector(seatDir, 1.05).add(new THREE.Vector3(0.45, 0.05, -0.1));
const cartSpinAxis = new THREE.Vector3(0.3, 0.2, 1).normalize();

// ---------- opaque internals: the "idea" core + four seated nodes + links ----------
const internals = new THREE.Group();
product.add(internals);
const coreMat = new THREE.MeshPhysicalMaterial({ color: '#4cc9b0', emissive: '#2A8F7C', emissiveIntensity: 0.35, roughness: 0.22, clearcoat: 0.8, transparent: true, opacity: 0 });
const core = new THREE.Mesh(new THREE.SphereGeometry(0.19, 40, 28), coreMat);
internals.add(core);
const nodeMat = new THREE.MeshPhysicalMaterial({ color: COL.pearl, roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0 });
const nodeBase = [
  new THREE.Vector3(-0.56, 0.39, 0.12),
  new THREE.Vector3(0.56, 0.45, -0.14),
  new THREE.Vector3(-0.33, -0.56, -0.12),
  new THREE.Vector3(0.33, -0.61, 0.16),
];
const nodes = nodeBase.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 20), nodeMat); internals.add(m); return m; });
const linkMat = new THREE.MeshStandardMaterial({ color: COL.link, roughness: 0.45, metalness: 0.2, transparent: true, opacity: 0 });
const liveMat = new THREE.MeshStandardMaterial({ color: COL.link.clone(), roughness: 0.35, metalness: 0.1, emissive: COL.active.clone(), emissiveIntensity: 0, transparent: true, opacity: 0 });
const cyl = new THREE.CylinderGeometry(0.026, 0.026, 1, 12);
// endpoints: -1 = core, else node index
const linkDefs = [[0, -1], [-1, 1, 'live'], [0, 2], [-1, 2], [-1, 3], [1, 3]];
const links = linkDefs.map((d) => { const m = new THREE.Mesh(cyl, d[2] ? liveMat : linkMat); internals.add(m); return { m, a: d[0], b: d[1] }; });
// a thin conduit from the live node up to the seat, revealed when the component seats
const conduitMat = new THREE.MeshBasicMaterial({ color: COL.active, transparent: true, opacity: 0 });
const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), conduitMat);
internals.add(conduit);

// ---------- studio floor: contact shadow + soft active glow ----------
function floorTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  let gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  gr.addColorStop(0, 'rgba(118,225,203,0.28)'); gr.addColorStop(1, 'rgba(118,225,203,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  gr = g.createRadialGradient(256, 256, 0, 256, 256, 150);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const floorMat = new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false, opacity: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -HH - R - 0.08;
floor.renderOrder = 0;
scene.add(floor);

// ---------- animated state (single owner: GSAP timeline) ----------
const S = {
  rim: 0, glass: 0, lip: 0, interior: 0, sweep: -2.2, broad: 0, narrow: 0,
  open: 0, spread: 0, cart: 0, cartVis: 0, seat: 0, pulse: 0, link: 0,
  yaw: 0.62, elev: 1.35, dist: 8.6, floor: 0, scale: 0.94,
};

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion();
function placeBetween(mesh, a, b) {
  tmpA.subVectors(b, a); const len = tmpA.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(up, tmpA.normalize());
  mesh.scale.set(1, len, 1);
}
const nodePos = nodeBase.map((v) => v.clone());
const corePos = new THREE.Vector3();
const target = new THREE.Vector3(0, -0.05, 0);

function render() {
  // camera: close three-quarter orbit
  camera.position.set(Math.sin(S.yaw) * S.dist, S.elev, Math.cos(S.yaw) * S.dist);
  camera.lookAt(target);

  product.scale.setScalar(S.scale);

  // shell: silhouette first, then body, then thickness lip during the open view
  backRimMat.uniforms.uRim.value = S.rim * 0.9;
  frontRimMat.uniforms.uRim.value = S.rim * 1.25;
  backOuterMat.opacity = 0.10 * S.glass; backInnerMat.opacity = 0.06 * S.glass;
  frontOuterMat.opacity = 0.13 * S.glass; frontInnerMat.opacity = 0.07 * S.glass;
  lipMat.opacity = 0.18 * S.glass + 0.55 * S.lip;
  sweepMat.uniforms.uSweep.value = S.sweep;
  sweepMat.uniforms.uBroad.value = S.broad;
  sweepMat.uniforms.uNarrow.value = S.narrow;

  // shallow component view: front half slides forward along +Z, slight tilt
  frontHalf.position.set(0.04 * S.open, 0.02 * S.open, 0.5 * S.open);
  frontHalf.rotation.y = 0.12 * S.open;

  // internals spread a little while open, then re-seat
  const k = 1 + 0.16 * S.spread;
  corePos.set(0, 0, 0.06 * S.spread);
  core.position.copy(corePos);
  nodes.forEach((n, i) => { nodePos[i].copy(nodeBase[i]).multiplyScalar(k); nodePos[i].z += (i % 2 ? -0.08 : 0.1) * S.spread; n.position.copy(nodePos[i]); });
  links.forEach((l) => placeBetween(l.m, l.a < 0 ? corePos : nodePos[l.a], l.b < 0 ? corePos : nodePos[l.b]));
  const io = S.interior;
  coreMat.opacity = io; nodeMat.opacity = io; linkMat.opacity = io; liveMat.opacity = io;
  core.scale.setScalar(0.6 + 0.4 * io + 0.12 * S.pulse);
  liveMat.color.copy(COL.link).lerp(COL.active, S.link);
  liveMat.emissiveIntensity = 0.55 * S.link;
  coreMat.emissiveIntensity = 0.35 + 0.45 * S.link;

  // conduit live node -> seat (in product space; seat lives on frontHalf so follow its offset)
  tmpB.copy(seatPos).add(frontHalf.position).addScaledVector(seatDir, -0.04);
  placeBetween(conduit, nodePos[1], tmpB);
  conduitMat.opacity = 0.85 * S.link;

  // seat
  slotMat.opacity = S.glass;
  collarMat.color.copy(COL.secondary).lerp(COL.active, S.seat);
  collarMat.emissiveIntensity = 0.15 + 0.6 * S.seat + 0.6 * S.pulse;
  collar.scale.setScalar(1 + 0.18 * S.pulse);

  // cartridge travels in and joins at the seat
  const c = S.cart;
  cartridge.position.lerpVectors(cartStart, cartEnd, c);
  tmpQ.setFromAxisAngle(cartSpinAxis, (1 - c) * 1.1);
  cartridge.quaternion.copy(tmpQ).multiply(qY);
  cartGlassMat.opacity = 0.2 * S.cartVis;
  cartRimMat.uniforms.uRim.value = 1.2 * S.cartVis;
  cartCoreMat.opacity = S.cartVis;
  cartCoreMat.emissiveIntensity = 0.25 + 0.8 * S.pulse + 0.3 * S.seat;

  floorMat.opacity = S.floor;
  renderer.render(scene, camera);
}

// ---------- one paused, seekable GSAP timeline ----------
const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' }, onUpdate: render });

// camera: continuous slow three-quarter orbit (settles by 2.6s)
tl.to(S, { yaw: 0.4, elev: 1.05, dist: 8.0, duration: 2.6, ease: 'sine.inOut' }, 0);
tl.to(S, { scale: 1, duration: 0.6, ease: 'power3.out' }, 0);
// 1. silhouette first
tl.to(S, { rim: 1, duration: 0.45, ease: 'power2.out' }, 0.0);
tl.to(S, { floor: 1, duration: 0.5, ease: 'sine.out' }, 0.1);
tl.to(S, { glass: 1, narrow: 1, duration: 0.4, ease: 'sine.out' }, 0.3);
// 2. one broad reflection sweeps across the shell (quiet, single pass)
tl.fromTo(S, { broad: 0 }, { broad: 1, duration: 0.15, ease: 'none' }, 0.45);
tl.to(S, { sweep: 2.2, duration: 0.85, ease: 'power1.inOut' }, 0.45);
tl.to(S, { broad: 0, duration: 0.15, ease: 'none' }, 1.15);
// 3. interior forms come up through the shell
tl.to(S, { interior: 1, duration: 0.4, ease: 'power2.out' }, 0.6);
// 4. shallow component view opens
tl.to(S, { open: 1, lip: 1, spread: 1, duration: 0.5, ease: 'power3.out' }, 0.95);
tl.to(S, { cartVis: 1, duration: 0.3, ease: 'sine.out' }, 1.0);
tl.to(S, { cart: 0.55, duration: 0.55, ease: 'power2.out' }, 1.0);
// 5. close and join at the seat (contact at 2.05s)
tl.to(S, { open: 0, lip: 0, spread: 0, duration: 0.5, ease: 'power3.inOut' }, 1.5);
tl.to(S, { cart: 1, duration: 0.5, ease: 'power3.in' }, 1.55);
tl.to(S, { seat: 1, link: 1, duration: 0.3, ease: 'power2.out' }, 2.05);
tl.to(S, { pulse: 1, duration: 0.08, ease: 'power2.out' }, 2.05);
tl.to(S, { pulse: 0, duration: 0.4, ease: 'power2.out' }, 2.13);

// copy on the clean left studio plane
tl.fromTo('#kicker', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0.1);
tl.fromTo('#l1', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 0.18);
tl.fromTo('#l2', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 0.28);
tl.fromTo('#sub', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 2.1);
tl.set({}, {}, 3);

window.__timelines = window.__timelines || {};
window.__timelines.video = tl;

tl.seek(0, false);
render();
window.addEventListener('hf-seek', (e) => {
  const t = e && e.detail && typeof e.detail.time === 'number' ? e.detail.time : null;
  if (t !== null) tl.seek(t, false);
  render();
});
window.__renderAt = (t) => { tl.seek(t, false); render(); };
