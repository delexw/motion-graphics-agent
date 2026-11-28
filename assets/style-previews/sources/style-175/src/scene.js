// Neon Glass Tubes — "An idea becomes a connected system"
// Three.js scene. Every visual value is derived from the shared `state`
// object, which is owned exclusively by the paused GSAP timeline in index.html.
// renderAt() is pure with respect to state: no clocks, no accumulators, no randomness.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const W = 1280, H = 720;
// Illustration (SVG px) -> world: 100px = 1 unit, floor at SVG y=520, tubes on z=0.
const P = (x, y, z = 0) => new THREE.Vector3((x - 640) / 100, (520 - y) / 100, z);

const COL = {
  teal: new THREE.Color('#76E1CB'),
  pink: new THREE.Color('#FF5FA2'),
  amber: new THREE.Color('#FFE38A'),
  dim: new THREE.Color('#294359'),
  wallTop: new THREE.Color('#070A12'),
  wallLow: new THREE.Color('#16203A'),
  floor: new THREE.Color('#0B111C'),
};

// ---------- continuous tube paths (rounded bends, no gaps) ----------
function roundedPolyline(pts, r = 0.12) {
  const path = new THREE.CurvePath();
  let cur = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (!c) { path.add(new THREE.LineCurve3(cur, b.clone())); break; }
    const inDir = b.clone().sub(a).normalize();
    const outDir = c.clone().sub(b).normalize();
    const rr = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const p1 = b.clone().addScaledVector(inDir, -rr);
    const p2 = b.clone().addScaledVector(outDir, rr);
    path.add(new THREE.LineCurve3(cur, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  return path;
}

function bulbCurve() {
  // Arc centre/radius derived from the illustration's bulb path.
  const cx = 640, cy = 320.2, R = 72;
  const pts = [];
  const arc = (a0, a1, n) => {
    for (let i = 0; i < n; i++) {
      const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * (i / n));
      pts.push(P(cx + R * Math.cos(a), cy + R * Math.sin(a)));
    }
  };
  const cubic = (p0, p1, p2, p3, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / n, u = 1 - t;
      const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
      const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
      pts.push(P(x, y));
    }
  };
  // Start at the left junction (172.2deg), clockwise over the top to the right shoulder.
  arc(172.2, 393.6, 90);
  cubic([700, 360], [684, 382], [678, 400], [678, 422], 16);
  // bottom line of the bulb (the centripetal spline rounds its two corners slightly)
  for (let i = 0; i < 12; i++) pts.push(P(678 - (76 * i) / 12, 422));
  cubic([602, 422], [602, 400], [596, 382], [580, 360], 16);
  arc(146.4, 172.2, 10);
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
}

const GAS_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const GAS_FRAG = /* glsl */`
  uniform vec3 uColor; uniform vec3 uDim; uniform float uProg; uniform float uGain;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float lit = uProg <= 0.0 ? 0.0 : 1.0 - smoothstep(uProg - 0.006, uProg + 0.002, vUv.x);
    float head = (uProg > 0.0 && uProg < 0.999) ? exp(-pow((uProg - vUv.x) / 0.025, 2.0)) : 0.0;
    // gas core: whiter in the centre of the bore, saturated toward the glass edge
    vec3 core = mix(uColor, vec3(1.0, 0.99, 0.96), pow(facing, 4.0) * 0.75);
    vec3 off = uDim * (0.22 + 0.25 * facing);
    vec3 col = mix(off, core * (1.6 + 1.2 * facing) * uGain, lit) + head * vec3(1.6) * lit;
    gl_FragColor = vec4(col, 1.0);
  }`;

const GLASS_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uProg;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 N = normalize(vN), V = normalize(vV);
    float f = 1.0 - abs(dot(N, V));
    float fres = pow(f, 2.2);
    vec3 L = normalize(vec3(-0.4, 0.8, 0.6));
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 48.0);
    float lit = uProg <= 0.0 ? 0.0 : 1.0 - smoothstep(uProg - 0.01, uProg + 0.01, vUv.x);
    vec3 glass = vec3(0.62, 0.72, 0.84);
    vec3 col = mix(glass, uColor * 1.3, lit * 0.75) * (0.18 + 1.1 * fres) + vec3(spec) * 0.9;
    float a = clamp(0.10 + 0.65 * fres + spec * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }`;

const N_EMIT = 48;
const RECEIVER_VERT = /* glsl */`
  varying vec3 vW; varying vec2 vUv;
  void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RECEIVER_HEAD = /* glsl */`
  uniform vec3 uEP[${N_EMIT}]; uniform vec3 uEC[${N_EMIT}];
  varying vec3 vW; varying vec2 vUv;`;

const FLOOR_FRAG = RECEIVER_HEAD + /* glsl */`
  uniform vec3 uBase;
  void main(){
    vec3 glow = vec3(0.0);
    for (int i = 0; i < ${N_EMIT}; i++){
      vec3 d = vW - vec3(uEP[i].x, 0.0, uEP[i].z);
      float h = uEP[i].y;
      // anisotropic falloff: glossy floor streaks the light toward the viewer
      float r2 = d.x*d.x*1.0 + d.z*d.z*0.22 + h*h*0.55;
      glow += uEC[i] / (1.0 + r2 * 9.0);
    }
    float toward = smoothstep(-0.7, 3.5, vW.z);
    float a = mix(0.50, 0.86, toward);
    vec3 col = uBase + glow * 0.16;
    gl_FragColor = vec4(col, clamp(a + dot(glow, vec3(0.05)), 0.0, 1.0));
  }`;

const WALL_FRAG = RECEIVER_HEAD + /* glsl */`
  uniform vec3 uTop; uniform vec3 uLow;
  void main(){
    vec3 base = mix(uLow, uTop, smoothstep(0.0, 4.6, vW.y));
    vec3 glow = vec3(0.0);
    for (int i = 0; i < ${N_EMIT}; i++){
      vec3 d = vW - uEP[i];
      glow += uEC[i] / (1.0 + dot(d, d) * 14.0);
    }
    gl_FragColor = vec4(base + glow * 0.11, 1.0);
  }`;

export function createScene(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = COL.wallTop.clone();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 60);
  camera.position.set(2.4, 1.25, 9.0);
  camera.lookAt(0.45, 1.5, 0);

  const emitP = Array.from({ length: N_EMIT }, () => new THREE.Vector3(0, -50, 0));
  const emitC = Array.from({ length: N_EMIT }, () => new THREE.Vector3());

  // ---------- receivers ----------
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 12),
    new THREE.ShaderMaterial({
      vertexShader: RECEIVER_VERT, fragmentShader: WALL_FRAG,
      uniforms: { uEP: { value: emitP }, uEC: { value: emitC }, uTop: { value: COL.wallTop }, uLow: { value: COL.wallLow } },
    }));
  wall.position.set(0, 5.4, -0.7);
  scene.add(wall);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 16),
    new THREE.ShaderMaterial({
      vertexShader: RECEIVER_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: true,
      uniforms: { uEP: { value: emitP }, uEC: { value: emitC }, uBase: { value: COL.floor } },
    }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 7.3);
  floor.renderOrder = 1;
  scene.add(floor);
  // thin skirting line where wall meets floor
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(30, 0.015, 0.02), new THREE.MeshBasicMaterial({ color: COL.dim }));
  skirt.position.set(0, 0.008, -0.69);
  scene.add(skirt);

  // ---------- tubes ----------
  const sign = new THREE.Group();
  const runs = {}; // name -> { gas, glass, curve, color }
  const GAS_R = 0.03, GLASS_R = 0.058;

  function addRun(name, curve, color, segs, closed = false) {
    const gasMat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERT, fragmentShader: GAS_FRAG, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color }, uDim: { value: COL.dim }, uProg: { value: 0 }, uGain: { value: 1 } },
    });
    const glassMat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERT, fragmentShader: GLASS_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: color }, uProg: { value: 0 } },
    });
    const gas = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, GAS_R, 12, closed), gasMat);
    const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, GLASS_R, 16, closed), glassMat);
    glass.renderOrder = 3; gas.renderOrder = 2;
    sign.add(gas, glass);
    // end caps (electrode bulbs) keep open runs physically closed
    if (!closed) {
      for (const t of [0, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(GLASS_R, 16, 12), glassMat);
        cap.position.copy(curve.getPointAt(t)); cap.renderOrder = 3; sign.add(cap);
      }
    }
    runs[name] = { gasMat, glassMat, curve, color };
    return runs[name];
  }

  function addRing(name, cx, cy, color) {
    const R = 0.18;
    const gasMat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERT, fragmentShader: GAS_FRAG, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color }, uDim: { value: COL.dim }, uProg: { value: 0 }, uGain: { value: 1 } },
    });
    const glassMat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERT, fragmentShader: GLASS_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: color }, uProg: { value: 0 } },
    });
    const gas = new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 12, 64), gasMat);
    const glass = new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 16, 64), glassMat);
    // start the ring's lit sweep at the joint facing the run
    const rot = cx < 640 ? 0 : Math.PI;
    for (const m of [gas, glass]) { m.position.copy(P(cx, cy)); m.rotation.z = rot; }
    glass.renderOrder = 3; gas.renderOrder = 2;
    sign.add(gas, glass);
    const curve = { getPointAt: (t) => P(cx, cy).add(new THREE.Vector3(Math.cos(rot + t * Math.PI * 2) * R, Math.sin(rot + t * Math.PI * 2) * R, 0)) };
    runs[name] = { gasMat, glassMat, curve, color };
  }

  addRing('nodeL', 262, 230, COL.pink);
  addRun('runL', roundedPolyline([P(280, 230), P(420, 230), P(420, 330), P(568.7, 330)]), COL.teal, 360);
  addRun('bulb', bulbCurve(), COL.teal, 480, true);
  addRun('base1', roundedPolyline([P(610, 440), P(670, 440)]), COL.teal, 40);
  addRun('base2', roundedPolyline([P(618, 458), P(662, 458)]), COL.teal, 40);
  addRun('spark', roundedPolyline([P(628, 330), P(640, 306), P(652, 330)], 0.03), COL.amber, 80);
  addRun('runR', roundedPolyline([P(711.3, 330), P(860, 330), P(860, 230), P(1000, 230)]), COL.teal, 360);
  addRing('nodeR', 1018, 230, COL.pink);
  // unlit branches (the rest of the system, still dark)
  addRun('dimL', roundedPolyline([P(420, 330), P(420, 440), P(160, 440)]), COL.dim, 300);
  addRun('dimR', roundedPolyline([P(860, 330), P(860, 440), P(1120, 440)]), COL.dim, 300);

  // junction collars where runs meet (glass sleeves) + standoff mounts to the wall
  const collarMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3A4E66') });
  for (const [x, y] of [[420, 330], [860, 330], [568.7, 330], [711.3, 330]]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.ShaderMaterial({
      vertexShader: GAS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: COL.teal }, uProg: { value: 0 } } }));
    c.position.copy(P(x, y)); c.renderOrder = 3; sign.add(c);
  }
  const mountMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2A3446') });
  for (const [x, y] of [[350, 230], [420, 280], [490, 330], [790, 330], [860, 280], [930, 230], [290, 440], [990, 440], [640, 248], [640, 458]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.7, 8), mountMat);
    m.rotation.x = Math.PI / 2; m.position.copy(P(x, y, -0.35)); sign.add(m);
  }
  // hanging wires from the illustration
  for (const [x, y0, y1] of [[280, 190, 222], [1000, 190, 222], [640, 210, 246]]) {
    const len = (y1 - y0) / 100;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6), mountMat);
    m.position.copy(P(x, (y0 + y1) / 2)); sign.add(m);
  }
  scene.add(sign);

  // mirrored sign under the glossy floor = reflected shape on the receiver surface
  const mirror = sign.clone(true);
  mirror.scale.y = -1;
  mirror.traverse((o) => { if (o.isMesh) o.renderOrder = 0; });
  scene.add(mirror);

  // ---------- emitters for local coloured light on receivers ----------
  const emitterPlan = [];
  const plan = (name, n, gain = 1) => { for (let i = 0; i < n; i++) emitterPlan.push({ name, f: (i + 0.5) / n, gain }); };
  plan('nodeL', 3, 1.1); plan('runL', 9); plan('bulb', 14); plan('base1', 2, 0.7); plan('base2', 2, 0.7);
  plan('spark', 3, 1.2); plan('runR', 9); plan('nodeR', 3, 1.1);
  emitterPlan.length = Math.min(emitterPlan.length, N_EMIT);
  emitterPlan.forEach((e, i) => { emitP[i].copy(runs[e.name].curve.getPointAt(e.f)); });

  // ---------- post ----------
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.95, 0.55, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const LIT = ['nodeL', 'runL', 'bulb', 'base1', 'base2', 'spark', 'runR', 'nodeR'];
  function renderNow() {
    for (const k of LIT) {
      const p = state[k];
      runs[k].gasMat.uniforms.uProg.value = p;
      runs[k].glassMat.uniforms.uProg.value = p;
      // ignition flutter for the first instants of each run, keyed to its own progress (deterministic)
      runs[k].gasMat.uniforms.uGain.value = p > 0 && p < 0.12 ? 0.75 + 0.25 * Math.abs(Math.sin(p * 120.0)) : 1.0;
    }
    emitterPlan.forEach((e, i) => {
      const lit = THREE.MathUtils.clamp((state[e.name] - e.f) / 0.08, 0, 1);
      const c = runs[e.name].color;
      emitC[i].set(c.r, c.g, c.b).multiplyScalar(lit * e.gain * 2.2);
    });
    composer.render();
  }
  renderNow();
  return { renderNow };
}
