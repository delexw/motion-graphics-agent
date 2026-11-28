// Backlit Paper Lantern — procedural Three.js scene.
// Three opaque paper cutouts on separate depth planes, one hidden lamp behind them.
// Every visual value is read from window.__lantern, which only the paused GSAP
// timeline writes. No clocks, no RAF loop, no randomness: same time -> same frame.
import { technology as THREE } from "./technology-three_js-ZGqahE/index.js";

const W = 1280, H = 720;
const S = window.__lantern;

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// ---------- scene geometry (world units; ~121 px per unit at the paper planes) ----------
const Z_BULB = 0.0;      // LAYER 1: near paper (the idea)
const Z_WALL = -0.6;     // LAYER 2: far paper with a narrow opening
const Z_NET = -1.4;      // third outline (connected system), only seen through the opening
const Z_LAMP = -2.0;     // lamp, physically behind all three cutouts
const Z_BACK = -3.0;     // back wall of the lantern cavity
const CAM_X = -1.4, CAM_Y_REF = 0.5, CAM_Z_REF = 9.4;

// ---------- mask textures (Canvas 2D, built once, synchronously) ----------
function maskCanvas(w, h, draw, blurPx) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff";
  draw(ctx);
  return c;
}
function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
function maskSet(w, h, draw, softPx, haloPx) {
  return {
    mask: tex(maskCanvas(w, h, draw, 0)),
    soft: tex(maskCanvas(w, h, draw, softPx)),
    halo: tex(maskCanvas(w, h, draw, haloPx)),
  };
}

// LAYER 1 — bulb silhouette (subject: the idea). Drawn from the reference SVG path.
const BULB_PATH = "M470 230c-72 0-124 54-124 120 0 46 26 74 48 98 14 16 20 30 20 50h112c0-20 6-34 20-50 22-24 48-52 48-98 0-66-52-120-124-120z";
const bulbSvg = { x0: 290, y0: 170, w: 360, h: 430, scale: 2 };
const bulbWorld = { w: bulbSvg.w / 126, h: bulbSvg.h / 126, cx: -1.2, cy: 0.3 };
const bulbMasks = maskSet(bulbSvg.w * 2, bulbSvg.h * 2, (ctx) => {
  ctx.setTransform(2, 0, 0, 2, -bulbSvg.x0 * 2, -bulbSvg.y0 * 2);
  ctx.fill(new Path2D(BULB_PATH));
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  rr(420, 508, 100, 14, 7);
  rr(432, 528, 76, 14, 7);
}, 8, 36);

// LAYER 2 — far wall with a narrow slanted opening.
const wallB = { x0: -0.45, x1: 6.6, y0: -4.2, y1: 4.2, ppu: 160 };
const SLIT = [[2.36, 1.78], [2.70, 1.78], [3.14, -1.86], [2.80, -1.86]];
const wallW = Math.round((wallB.x1 - wallB.x0) * wallB.ppu), wallH = Math.round((wallB.y1 - wallB.y0) * wallB.ppu);
const wpx = (x) => (x - wallB.x0) * wallB.ppu, wpy = (y) => (wallB.y1 - y) * wallB.ppu;
const wallMasks = maskSet(wallW, wallH, (ctx) => {
  ctx.fillRect(wpx(0.0), -200, wallW + 400, wallH + 400);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  SLIT.forEach(([x, y], i) => (i ? ctx.lineTo(wpx(x), wpy(y)) : ctx.moveTo(wpx(x), wpy(y))));
  ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}, 4, 22);

// THIRD OUTLINE — connected system (nodes + links), aligned to read through the opening.
const r = (CAM_Z_REF - Z_NET) / (CAM_Z_REF - Z_WALL);
const proj = ([x, y]) => [CAM_X + (x - CAM_X) * r, CAM_Y_REF + (y - CAM_Y_REF) * r];
const slitMid = (y) => 2.53 + ((1.78 - y) / 3.64) * 0.44;
const NODES = [1.3, 0.62, -0.05, -0.72, -1.38].map((y) => proj([slitMid(y), y]));
const BRANCH = [[0, [1.9, 2.25]], [1, [3.55, 1.05]], [2, [1.6, -0.35]], [3, [3.8, -1.05]], [4, [2.2, -2.4]]]
  .map(([i, p]) => [i, proj(p)]);
const netB = { x0: 1.0, x1: 4.8, y0: -2.9, y1: 2.9, ppu: 200 };
const netW = Math.round((netB.x1 - netB.x0) * netB.ppu), netH = Math.round((netB.y1 - netB.y0) * netB.ppu);
const npx = (x) => (x - netB.x0) * netB.ppu, npy = (y) => (netB.y1 - y) * netB.ppu;
const netMasks = maskSet(netW, netH, (ctx) => {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineWidth = 0.05 * netB.ppu;
  ctx.beginPath();
  NODES.forEach(([x, y], i) => (i ? ctx.lineTo(npx(x), npy(y)) : ctx.moveTo(npx(x), npy(y))));
  ctx.stroke();
  BRANCH.forEach(([i, [x, y]]) => {
    ctx.beginPath(); ctx.moveTo(npx(NODES[i][0]), npy(NODES[i][1])); ctx.lineTo(npx(x), npy(y)); ctx.stroke();
    ctx.beginPath(); ctx.arc(npx(x), npy(y), 0.06 * netB.ppu, 0, Math.PI * 2); ctx.fill();
  });
  NODES.forEach(([x, y], i) => {
    ctx.beginPath(); ctx.arc(npx(x), npy(y), (i === 2 ? 0.105 : 0.085) * netB.ppu, 0, Math.PI * 2); ctx.fill();
  });
}, 3, 16);

// ---------- shaders ----------
const VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const NOISE = /* glsl */`
  float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y);
  }`;

// Opaque paper: dark body, faint fibre transmission where the lamp sits directly
// behind it, and a cut-edge rim whose width/falloff is layer-specific.
const PAPER_FRAG = /* glsl */`
  uniform sampler2D uMask, uSoft;
  uniform vec3 uLamp; uniform float uPower;
  uniform vec3 uPaperA, uPaperB, uRimCol, uTransCol;
  uniform float uRimK, uRimGain, uRimWidth, uTrans, uBodyK, uEdgeBase;
  varying vec2 vUv; varying vec3 vW;
  ${NOISE}
  void main() {
    float m = texture2D(uMask, vUv).r;
    if (m < 0.5) discard;
    float s = texture2D(uSoft, vUv).r;
    vec3 d = vW - uLamp;
    float dxy2 = dot(d.xy, d.xy);
    float depthF = 1.0 / (1.0 + 0.3 * d.z * d.z);
    float rimLamp = uPower * exp(-dxy2 * uRimK) * depthF;
    float rim = 1.0 - smoothstep(0.5, uRimWidth, s);
    float fibre = 0.78 + 0.44 * vnoise(vW.xy * 9.0) * (0.7 + 0.3 * vnoise(vW.xy * 31.0));
    float body = uTrans * uPower * exp(-dxy2 * uBodyK) * depthF * fibre;
    vec3 base = mix(uPaperB, uPaperA, clamp(0.55 * vUv.y + 0.45 * (1.0 - vUv.x), 0.0, 1.0));
    base *= 0.96 + 0.08 * vnoise(vW.xy * 22.0);
    vec3 col = base + uTransCol * body + uRimCol * rim * (rimLamp * uRimGain + uEdgeBase);
    gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
  }`;

// Light scattered around the cut edge, drawn on a plane just behind each paper layer.
const HALO_FRAG = /* glsl */`
  uniform sampler2D uMask, uHalo;
  uniform vec3 uLamp; uniform float uPower, uHaloK, uHaloGain;
  uniform vec3 uHaloCol;
  varying vec2 vUv; varying vec3 vW;
  void main() {
    float h = texture2D(uHalo, vUv).r;
    float m = texture2D(uMask, vUv).r;
    vec3 d = vW - uLamp;
    float lamp = uPower * exp(-dot(d.xy, d.xy) * uHaloK) / (1.0 + 0.3 * d.z * d.z);
    float a = h * (1.0 - m);
    gl_FragColor = vec4(uHaloCol * a * lamp * uHaloGain, 1.0);
  }`;

// Back wall of the cavity: lamp pool of warm light, faint teal spill once the system lights.
const BACK_FRAG = /* glsl */`
  uniform vec3 uLamp; uniform float uPower, uNet;
  uniform vec3 uBgTop, uBgBot, uLampCol, uTeal, uNetC;
  varying vec2 vUv; varying vec3 vW;
  void main() {
    vec3 base = mix(uBgBot, uBgTop, clamp(vUv.y * 1.2 - 0.1, 0.0, 1.0));
    vec3 d = vW - uLamp;
    float r2 = dot(d, d);
    float g = uPower * (0.8 * exp(-r2 * 0.42) + 0.35 / (1.0 + r2 * 0.25));
    vec2 n = vW.xy - uNetC;
    float spill = uNet * exp(-dot(n * vec2(2.2, 0.55), n * vec2(2.2, 0.55)));
    vec3 col = base + uLampCol * g * 0.74 + uTeal * spill * 0.16;
    gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
  }`;

const lampU = { value: new THREE.Vector3(S.lampX, S.lampY, Z_LAMP) };
const powerU = { value: 0 };
const netU = { value: 0 };

const C = {
  bgTop: hex("#121A27"), bgBot: hex("#0B1019"),
  lamp: hex("#FFC979"), lampPale: hex("#FFE2AE"), paperEdge: hex("#F5D9A0"),
  teal: hex("#76E1CB"),
};

function plane(w, h, cx, cy, z, mat, order = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(cx, cy, z);
  m.renderOrder = order;
  return m;
}
function paperMat(masks, o) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: PAPER_FRAG,
    uniforms: {
      uMask: { value: masks.mask }, uSoft: { value: masks.soft },
      uLamp: lampU, uPower: o.power || powerU,
      uPaperA: { value: o.paperA }, uPaperB: { value: o.paperB },
      uRimCol: { value: o.rimCol }, uTransCol: { value: o.transCol },
      uRimK: { value: o.rimK }, uRimGain: { value: o.rimGain }, uRimWidth: { value: o.rimWidth },
      uTrans: { value: o.trans }, uBodyK: { value: o.bodyK }, uEdgeBase: { value: o.edgeBase },
    },
  });
}
function haloMat(masks, o) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: HALO_FRAG,
    uniforms: {
      uMask: { value: masks.mask }, uHalo: { value: masks.halo },
      uLamp: lampU, uPower: o.power || powerU,
      uHaloK: { value: o.k }, uHaloGain: { value: o.gain }, uHaloCol: { value: o.col },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

const scene = new THREE.Scene();

// Back wall
scene.add(plane(34, 20, 0, 0, Z_BACK, new THREE.ShaderMaterial({
  vertexShader: VERT, fragmentShader: BACK_FRAG,
  uniforms: {
    uLamp: lampU, uPower: powerU, uNet: netU,
    uBgTop: { value: C.bgTop }, uBgBot: { value: C.bgBot },
    uLampCol: { value: C.lamp }, uTeal: { value: C.teal },
    uNetC: { value: new THREE.Vector2(NODES[2][0], NODES[2][1]) },
  },
})));

// Third outline: dark paper network, teal transmission scaled by netGlow
const netPower = { value: 0 };
const netCx = (netB.x0 + netB.x1) / 2, netCy = (netB.y0 + netB.y1) / 2;
const netWw = netB.x1 - netB.x0, netHw = netB.y1 - netB.y0;
scene.add(plane(netWw, netHw, netCx, netCy, Z_NET, paperMat(netMasks, {
  power: netPower, paperA: hex("#18222F"), paperB: hex("#121A25"),
  rimCol: C.teal, transCol: C.teal, rimK: 0.25, rimGain: 1.5, rimWidth: 0.98,
  trans: 0.25, bodyK: 0.3, edgeBase: 0.0,
})));
scene.add(plane(netWw, netHw, netCx, netCy, Z_NET - 0.03, haloMat(netMasks, {
  power: netPower, k: 0.2, gain: 1.35, col: C.teal,
}), 10));

// LAYER 2: far wall — crisper, tighter rim (closer to the lamp)
const wallCx = (wallB.x0 + wallB.x1) / 2, wallCy = (wallB.y0 + wallB.y1) / 2;
scene.add(plane(wallB.x1 - wallB.x0, wallB.y1 - wallB.y0, wallCx, wallCy, Z_WALL, paperMat(wallMasks, {
  paperA: hex("#2E3D52"), paperB: hex("#17202D"),
  rimCol: C.paperEdge, transCol: hex("#B9824A"), rimK: 0.42, rimGain: 1.75, rimWidth: 0.9,
  trans: 0.16, bodyK: 0.55, edgeBase: 0.05,
})));
scene.add(plane(wallB.x1 - wallB.x0, wallB.y1 - wallB.y0, wallCx, wallCy, Z_WALL - 0.03, haloMat(wallMasks, {
  k: 0.32, gain: 0.85, col: C.lamp,
}), 10));

// LAYER 1: near bulb — softer, broader rim and halo (farther from the lamp)
scene.add(plane(bulbWorld.w, bulbWorld.h, bulbWorld.cx, bulbWorld.cy, Z_BULB, paperMat(bulbMasks, {
  paperA: hex("#26364A"), paperB: hex("#1A2533"),
  rimCol: C.lampPale, transCol: hex("#A8703F"), rimK: 0.2, rimGain: 2.1, rimWidth: 0.97,
  trans: 0.2, bodyK: 0.35, edgeBase: 0.05,
})));
scene.add(plane(bulbWorld.w, bulbWorld.h, bulbWorld.cx, bulbWorld.cy, Z_BULB - 0.03, haloMat(bulbMasks, {
  k: 0.16, gain: 1.3, col: C.lamp,
}), 10));

// ---------- camera & renderer ----------
const camera = new THREE.PerspectiveCamera(33, W / H, 0.1, 60);
const target = new THREE.Vector3(-0.05, 0.05, -0.6);
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x0b1019, 1);

function render() {
  lampU.value.set(S.lampX, S.lampY, Z_LAMP);
  powerU.value = S.lampPower;
  netU.value = S.netGlow;
  netPower.value = S.netGlow * Math.max(S.lampPower, 0);
  camera.position.set(CAM_X, S.camY, S.camZ);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  renderer.render(scene, camera);
}

window.__lanternRender = render;
window.addEventListener("hf-seek", render);
// Compile shaders/upload textures now, then draw the frame at the timeline's current time.
renderer.compile(scene, camera);
render();
window.__lanternReady = true;
