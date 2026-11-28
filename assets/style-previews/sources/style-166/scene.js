/* Pixel Sprites in Lit 3D (style-166) — "An idea becomes a connected system".
 * Three.js owns the lit, depth-tested scene; GSAP owns every animated value through
 * one paused timeline (window.__timelines.video). The WebGL frame is a pure function
 * of the GSAP-owned state object, redrawn on every timeline render and on hf-seek.
 * No clocks, tickers, randomness or carried simulation state. */
(function () {
  'use strict';
  var THREE = window.THREE;
  var W = 1280, H = 720, DURATION = 3;

  // ---------- deterministic helpers ----------
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(a, b, v) { var t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }

  // ---------- renderer ----------
  var canvas = document.getElementById('stage');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f1c2b, 15, 36);

  var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 80);

  function canvasTex(w, h, draw, pixel) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); draw(g, w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (pixel) {
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    } else {
      t.anisotropy = 4;
    }
    t.needsUpdate = true;
    return t;
  }

  // ---------- sky ----------
  scene.background = canvasTex(4, 256, function (g, w, h) {
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0E1A2A'); gr.addColorStop(1, '#1D3247');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  // ---------- floor (moonlit stone street) ----------
  var floorTex = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = '#2A3F52'; g.fillRect(0, 0, w, h);
    var k = 0;
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
      var v = hash(++k);
      var off = (y % 2) * 32;
      g.fillStyle = 'rgb(' + Math.round(70 + v * 14) + ',' + Math.round(92 + v * 14) + ',' + Math.round(112 + v * 12) + ')';
      g.fillRect(((x * 64 + off) % w) + 3, y * 64 + 3, 58, 58);
      if (off) { g.fillRect(0, y * 64 + 3, 29, 58); }
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10, 5);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 18),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 3);
  floor.receiveShadow = true; scene.add(floor);

  // ---------- back wall (brick) ----------
  var brickTex = canvasTex(256, 128, function (g, w, h) {
    g.fillStyle = '#0E1A28'; g.fillRect(0, 0, w, h);
    var k = 50;
    for (var r = 0; r < 8; r++) for (var c = -1; c < 8; c++) {
      var v = hash(++k);
      g.fillStyle = 'rgb(' + Math.round(30 + v * 12) + ',' + Math.round(48 + v * 12) + ',' + Math.round(68 + v * 12) + ')';
      g.fillRect(c * 32 + (r % 2) * 16 + 2, r * 16 + 2, 28, 12);
    }
  });
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
  brickTex.repeat.set(9, 3);
  var wall = new THREE.Mesh(new THREE.BoxGeometry(30, 4.2, 0.4),
    new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 }));
  wall.position.set(0, 2.1, -4.2); wall.receiveShadow = true; scene.add(wall);
  var coping = new THREE.Mesh(new THREE.BoxGeometry(30, 0.18, 0.6), new THREE.MeshStandardMaterial({ color: 0x18283A, roughness: 0.8 }));
  coping.position.set(0, 4.29, -4.1); scene.add(coping);

  // ---------- far skyline (depth plane) ----------
  var windowTex = canvasTex(64, 128, function (g, w, h) {
    g.fillStyle = '#0C1726'; g.fillRect(0, 0, w, h);
    var k = 900;
    for (var y = 6; y < h - 6; y += 12) for (var x = 6; x < w - 6; x += 12) {
      var v = hash(++k);
      if (v > 0.72) { g.fillStyle = v > 0.94 ? '#5FC3EE' : '#C9A060'; g.fillRect(x, y, 5, 6); }
    }
  }, true);
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  var skyline = new THREE.Group();
  for (var b = 0; b < 12; b++) {
    var bw = 2.6 + hash(b + 3) * 2.4, bh = 7 + hash(b + 17) * 6;
    var tx = windowTex.clone(); tx.needsUpdate = true; tx.repeat.set(bw / 2, bh / 4);
    var bm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 2), new THREE.MeshBasicMaterial({ map: tx, color: 0xb0bccb }));
    bm.position.set(-22 + b * 4 + hash(b + 40) * 1.2, bh / 2, -16 - hash(b + 60) * 3);
    skyline.add(bm);
  }
  scene.add(skyline);

  // ---------- mid-ground crates ----------
  var crateMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });
  [[-4.8, 0.9, -3.4], [-3.9, 0.65, -3.5], [5.6, 0.9, -3.4], [-4.6, 0.6, -3.2]].forEach(function (c, i) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(c[1], c[1], c[1]), crateMat);
    m.position.set(c[0], c[1] / 2 + (i === 3 ? 0.9 : 0), c[2]); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  });

  // ---------- overhead beam: source of the projected floor shadow ----------
  var beamMat = new THREE.MeshStandardMaterial({ color: 0x1a2533, roughness: 0.8 });
  var beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 7.4), beamMat);
  beam.position.set(-2.4, 3.6, -0.5); beam.castShadow = true; scene.add(beam);

  // ---------- foreground pillar (occluder) ----------
  var pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x0f1822, roughness: 0.75 }));
  pillar.position.set(-0.11, 4.5, 3.0); pillar.castShadow = true; scene.add(pillar);
  var pillarBase = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.85), new THREE.MeshStandardMaterial({ color: 0x18283A, roughness: 0.8 }));
  pillarBase.position.set(-0.11, 0.175, 3.0); scene.add(pillarBase);

  // ---------- practical street lamp ----------
  var lampX = 2.95, lampZ = -0.3;
  var ironMat = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.6, metalness: 0.2 });
  var post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.45, 0.14), ironMat);
  post.position.set(3.7, 1.725, lampZ); post.castShadow = true; scene.add(post);
  var arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), ironMat);
  arm.position.set(3.3, 3.42, lampZ); scene.add(arm);
  var housing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.36), ironMat);
  housing.position.set(lampX, 3.3, lampZ); scene.add(housing);
  var bulbMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0xFFD27A, toneMapped: false }));
  bulbMesh.position.set(lampX, 3.17, lampZ); scene.add(bulbMesh);
  var lampLight = new THREE.PointLight(0xFFB04A, 22, 9, 1.6);
  lampLight.position.set(lampX, 2.95, lampZ + 0.15); scene.add(lampLight);
  var coneMat = new THREE.MeshBasicMaterial({ color: 0xFFC870, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  var cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 3.05, 32, 1, true), coneMat);
  cone.position.set(lampX, 3.1 - 1.525, lampZ); scene.add(cone);
  var poolTex = canvasTex(128, 128, function (g, w, h) {
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,200,112,0.85)'); gr.addColorStop(0.55, 'rgba(255,176,74,0.28)'); gr.addColorStop(1, 'rgba(255,176,74,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  var poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  var pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.set(lampX, 0.012, lampZ + 0.3); scene.add(pool);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0x4a6a8a, 0x101820, 0.7));
  var moon = new THREE.DirectionalLight(0x9fb8d8, 1.5);
  moon.target.position.set(-1, 0, 0);
  moon.position.set(-1 + 0.8, 10, 1.6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -12; moon.shadow.camera.right = 12;
  moon.shadow.camera.top = 12; moon.shadow.camera.bottom = -12;
  moon.shadow.camera.near = 0.5; moon.shadow.camera.far = 30;
  moon.shadow.bias = -0.0008;
  scene.add(moon); scene.add(moon.target);
  // world-space footprint of the beam shadow on the actor path (z = 0.3)
  var SHADOW_X = -2.4 - 0.08 * 3.5, SHADOW_HALF = 0.36;

  // ---------- network panel on the wall ----------
  var PZ = -3.98;
  var panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.75, 0.06), new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.7 }));
  panel.position.set(1.5, 2.75, PZ); scene.add(panel);
  var frameMat = new THREE.MeshBasicMaterial({ color: 0x2E4A62 });
  [[1.5, 3.6, 3.6, 0.05], [1.5, 1.9, 3.6, 0.05], [-0.28, 2.75, 0.05, 1.75], [3.28, 2.75, 0.05, 1.75]].forEach(function (f) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(f[2], f[3]), frameMat); m.position.set(f[0], f[1], PZ + 0.035); scene.add(m);
  });
  var NODES = [[0.2, 2.8], [1.0, 2.8], [1.0, 2.2], [1.8, 2.2], [2.2, 3.3], [2.9, 2.6]];
  var EDGES = [[[2.9, 2.6], [2.2, 2.6]], [[2.2, 2.6], [2.2, 3.3]], [[2.2, 3.3], [1.0, 3.3]], [[1.0, 3.3], [1.0, 2.8]],
               [[1.0, 2.8], [0.2, 2.8]], [[1.0, 2.8], [1.0, 2.2]], [[1.0, 2.2], [1.8, 2.2]]];
  var dimMat = new THREE.MeshBasicMaterial({ color: 0x1D3247 });
  var liveMat = new THREE.MeshBasicMaterial({ color: 0x5FC3EE, toneMapped: false });
  var coreMat = new THREE.MeshBasicMaterial({ color: 0xC9F0FF, toneMapped: false });
  var nodeDimMat = new THREE.MeshBasicMaterial({ color: 0x2E4A62 });
  var unitPlane = new THREE.PlaneGeometry(1, 1); unitPlane.translate(0.5, 0, 0);
  var squarePlane = new THREE.PlaneGeometry(1, 1);
  var edgeMeshes = EDGES.map(function (e) {
    var dx = e[1][0] - e[0][0], dy = e[1][1] - e[0][1], len = Math.hypot(dx, dy) + 0.06, ang = Math.atan2(dy, dx);
    var dim = new THREE.Mesh(unitPlane, dimMat);
    dim.position.set(e[0][0] - Math.cos(ang) * 0.03, e[0][1] - Math.sin(ang) * 0.03, PZ + 0.04);
    dim.rotation.z = ang; dim.scale.set(len, 0.07, 1); scene.add(dim);
    var live = new THREE.Mesh(unitPlane, liveMat);
    live.position.set(dim.position.x, dim.position.y, PZ + 0.05); live.rotation.z = ang; live.scale.set(0.0001, 0.07, 1);
    live.visible = false; scene.add(live);
    return { mesh: live, len: len };
  });
  var nodeMeshes = NODES.map(function (n, i) {
    var size = i === 1 ? 0.16 : 0.24;
    var dim = new THREE.Mesh(squarePlane, nodeDimMat); dim.position.set(n[0], n[1], PZ + 0.06); dim.scale.set(size, size, 1); scene.add(dim);
    var live = new THREE.Mesh(squarePlane, liveMat); live.position.set(n[0], n[1], PZ + 0.07); scene.add(live);
    var core = new THREE.Mesh(squarePlane, coreMat); core.position.set(n[0], n[1], PZ + 0.08); scene.add(core);
    return { live: live, core: core, size: size };
  });

  // ---------- pixel sprite actor (nearest-neighbour atlas) ----------
  var PAL = { h: '#FFD27A', H: '#C98A2E', s: '#F2C9A0', e: '#142536', c: '#B9D5DE', b: '#005885', B: '#003A5C', l: '#142536', k: '#0A1018' };
  var UPPER = [
    '....hhhh....', '...hhhhhh...', '..hhhhhhhhh.', '..Hhhhssss..', '..Hhsssses..', '..Hhssssss..', '...Hsssss...',
    '....cccc....', '...bbbbbb...', '...bbbbbbb..', '...bbbbbbb..', '...bbbbbb...', '...bbbbbb...'];
  var LEGS = {
    stand: ['...lllll....', '...ll.ll....', '...ll.ll....', '...ll.ll....', '...kkkkkkk..'],
    contact: ['...lllllll..', '..ll....ll..', '.ll......ll.', '.ll......ll.', 'kk.......kkk'],
    pass: ['...llllll...', '....llll....', '....ll.ll...', '....ll..ll..', '...kkk..kk..']
  };
  var ARMS = {
    neutral: [[5, 9, 'B'], [5, 10, 'B'], [5, 11, 'B'], [5, 12, 's']],
    fwd: [[6, 9, 'B'], [7, 10, 'B'], [8, 11, 'B'], [9, 12, 's']],
    back: [[5, 9, 'B'], [4, 10, 'B'], [3, 11, 'B'], [2, 12, 's']],
    up: [[7, 8, 'B'], [8, 7, 'B'], [9, 6, 'B'], [10, 5, 's'], [8, 4, 's'], [8, 3, 'e']]
  };
  var FRAMES = [['stand', 'neutral'], ['contact', 'fwd'], ['pass', 'neutral'], ['contact', 'back'], ['pass', 'neutral'], ['stand', 'up']];
  var FW = 12, FH = 18;
  var actorTex = canvasTex(FW * FRAMES.length, FH, function (g) {
    FRAMES.forEach(function (fr, f) {
      var rows = UPPER.concat(LEGS[fr[0]]).map(function (r) { return r.split(''); });
      ARMS[fr[1]].forEach(function (a) { rows[a[1]][a[0]] = a[2]; });
      rows.forEach(function (row, y) { row.forEach(function (ch, x) {
        if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(f * FW + x, y, 1, 1); }
      }); });
    });
  }, true);
  actorTex.repeat.set(1 / FRAMES.length, 1);
  var actorMat = new THREE.MeshBasicMaterial({ map: actorTex, alphaTest: 0.5, toneMapped: false, fog: false });
  var actorGeo = new THREE.PlaneGeometry(FW * 0.1, FH * 0.1); actorGeo.translate(0, FH * 0.05, 0); // feet at y = 0
  var actor = new THREE.Mesh(actorGeo, actorMat);
  var ACTOR_Z = 0.3; actor.position.set(-3.8, 0, ACTOR_Z); scene.add(actor);

  // separate world-space contact shadow
  var blobTex = canvasTex(64, 32, function (g, w, h) {
    var gr = g.createRadialGradient(32, 16, 0, 32, 16, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, 0.5); g.translate(0, 16); g.restore();
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  var blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
  var blob = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.42), blobMat);
  blob.rotation.x = -Math.PI / 2; blob.position.set(-3.8, 0.014, ACTOR_Z + 0.05); scene.add(blob);

  // idea bulb sprite above the actor
  var BULB = ['..yyyy..', '.yYYYYy.', 'yYYwwYYy', 'yYYwwYYy', 'yYYYYYYy', '.yYYYYy.', '..yyyy..', '..gggg..', '...gg...'];
  var BPAL = { y: '#FFB04A', Y: '#FFD27A', w: '#FFF4D6', g: '#7A8A99' };
  var bulbTex = canvasTex(8, 9, function (g) {
    BULB.forEach(function (r, y) { r.split('').forEach(function (ch, x) { if (BPAL[ch]) { g.fillStyle = BPAL[ch]; g.fillRect(x, y, 1, 1); } }); });
  }, true);
  var ideaGeo = new THREE.PlaneGeometry(0.8, 0.9); ideaGeo.translate(0, 0.45, 0);
  var idea = new THREE.Mesh(ideaGeo, new THREE.MeshBasicMaterial({ map: bulbTex, alphaTest: 0.5, toneMapped: false, fog: false }));
  idea.position.set(3.1, 1.95, ACTOR_Z + 0.02); idea.visible = false; scene.add(idea);
  var haloTex = canvasTex(64, 64, function (g) {
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,210,122,0.8)'); gr.addColorStop(1, 'rgba(255,210,122,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  var halo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.position.set(3.1, 2.38, ACTOR_Z - 0.02); halo.visible = false; scene.add(halo);

  // data spark from the idea to the wall system (pixel packet + two trailing pixels)
  var SPARK_A = new THREE.Vector3(3.1, 2.45, ACTOR_Z), SPARK_B = new THREE.Vector3(2.9, 2.6, PZ + 0.09);
  var sparkMat = new THREE.MeshBasicMaterial({ color: 0xFFD27A, toneMapped: false, fog: false });
  var sparks = [0, 1, 2].map(function (i) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.14 - i * 0.03, 0.14 - i * 0.03, 0.14 - i * 0.03), sparkMat);
    m.visible = false; scene.add(m); return m;
  });

  // ---------- GSAP-owned state ----------
  var state = { camX: -1.4, actorX: -3.8, pose: 0, boost: 0, bulb: 0, spark: 0,
    e0: 0, e1: 0, e2: 0, e3: 0, e4: 0, e5: 0, e6: 0, n0: 0, n1: 0, n2: 0, n3: 0, n4: 0, n5: 0 };

  var COOL = new THREE.Color(0.80, 0.86, 0.96), WARM = new THREE.Color(1.0, 0.94, 0.82), tint = new THREE.Color();

  function render() {
    var s = state;
    camera.position.set(s.camX, 1.8, 9);
    camera.lookAt(s.camX, 1.25, 0);
    camera.updateMatrixWorld();

    // actor: pose steps derived from travelled distance so feet stay planted
    var ax = s.actorX, frame;
    if (s.pose >= 1.5) frame = 5;
    else if (s.pose >= 0.5 || ax <= -3.799) frame = 0;
    else frame = 1 + (Math.floor((ax + 3.8) / 0.36) % 4);
    actorTex.offset.set(frame / FRAMES.length, 0);
    actor.position.x = ax;

    var shadowF = 1 - smooth(SHADOW_HALF - 0.1, SHADOW_HALF + 0.1, Math.abs(ax - SHADOW_X));
    var lampF = (1 - smooth(0.3, 2.8, Math.abs(ax - lampX))) * (0.75 + 0.25 * s.boost);
    tint.copy(COOL).lerp(WARM, lampF).multiplyScalar(1 - 0.45 * shadowF);
    actorMat.color.copy(tint);

    var stride = (frame === 1 || frame === 3) ? 1.15 : 0.95;
    blob.position.x = ax + 0.05;
    blob.scale.set(stride, 1, 1);
    blobMat.opacity = 0.5 + 0.2 * lampF;

    // practical light
    lampLight.intensity = 22 + 12 * s.boost;
    coneMat.opacity = 0.09 + 0.06 * s.boost;
    poolMat.opacity = 0.32 + 0.18 * s.boost;

    // idea bulb
    idea.visible = s.bulb > 0.001; halo.visible = idea.visible;
    idea.scale.set(s.bulb, s.bulb, 1);
    halo.material.opacity = 0.7 * s.bulb;

    // spark
    for (var i = 0; i < sparks.length; i++) {
      var p = s.spark - i * 0.08;
      sparks[i].visible = s.spark > 0.001 && s.spark < 0.999 && p > 0;
      sparks[i].position.lerpVectors(SPARK_A, SPARK_B, clamp01(p));
    }

    // network
    for (var e = 0; e < edgeMeshes.length; e++) {
      var v = s['e' + e]; edgeMeshes[e].mesh.visible = v > 0.001;
      edgeMeshes[e].mesh.scale.x = Math.max(0.0001, edgeMeshes[e].len * v);
    }
    for (var n = 0; n < nodeMeshes.length; n++) {
      var nv = s['n' + n], nm = nodeMeshes[n];
      nm.live.visible = nm.core.visible = nv > 0.001;
      var sz = nm.size * (0.4 + 0.6 * nv) * (nv > 0.001 ? 1 : 0);
      nm.live.scale.set(sz + 0.0001, sz + 0.0001, 1);
      nm.core.scale.set(sz * 0.45 + 0.0001, sz * 0.45 + 0.0001, 1);
    }

    renderer.render(scene, camera);
  }

  // GSAP getter/setter driver: every timeline render (seek, scrub, play) schedules exactly one redraw
  var queued = false, driverValue = 0;
  function schedule() { if (!queued) { queued = true; queueMicrotask(function () { queued = false; render(); }); } }
  var driver = { v: function (val) { if (arguments.length === 0) return driverValue; driverValue = val; schedule(); } };

  var tl = gsap.timeline({ paused: true });
  tl.to(driver, { v: DURATION, duration: DURATION, ease: 'none' }, 0);
  tl.fromTo('#title-card', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.32, ease: 'power2.out' }, 0);
  // camera trucks right with the actor (keyed on the same timeline)
  tl.to(state, { camX: 1.4, duration: 2.2, ease: 'sine.inOut' }, 0);
  // walk: through the beam shadow (~0.37s), behind the pillar (~0.85–1.15s), ease to a stop under the lamp
  tl.to(state, { actorX: 2.0, duration: 1.4, ease: 'none' }, 0.1);
  tl.to(state, { actorX: 3.0, duration: 0.45, ease: 'power2.out' }, 1.5);
  tl.set(state, { pose: 1 }, 1.95);
  tl.set(state, { pose: 2 }, 2.02);
  tl.to(state, { boost: 1, duration: 0.3, ease: 'power2.out' }, 1.92);
  tl.to(state, { bulb: 1, duration: 0.16, ease: 'steps(4)' }, 1.98);
  tl.to(state, { spark: 1, duration: 0.17, ease: 'power1.in' }, 2.04);
  // system connects from the node the spark reaches
  tl.to(state, { n5: 1, duration: 0.06, ease: 'steps(3)' }, 2.2);
  tl.to(state, { e0: 1, duration: 0.08, ease: 'none' }, 2.2);
  tl.to(state, { e1: 1, duration: 0.06, ease: 'none' }, 2.28);
  tl.to(state, { n4: 1, duration: 0.06, ease: 'steps(3)' }, 2.34);
  tl.to(state, { e2: 1, duration: 0.09, ease: 'none' }, 2.34);
  tl.to(state, { e3: 1, duration: 0.04, ease: 'none' }, 2.43);
  tl.to(state, { n1: 1, duration: 0.06, ease: 'steps(3)' }, 2.47);
  tl.to(state, { e4: 1, duration: 0.08, ease: 'none' }, 2.47);
  tl.to(state, { e5: 1, duration: 0.06, ease: 'none' }, 2.47);
  tl.to(state, { n2: 1, duration: 0.06, ease: 'steps(3)' }, 2.53);
  tl.to(state, { e6: 1, duration: 0.07, ease: 'none' }, 2.53);
  tl.to(state, { n0: 1, duration: 0.06, ease: 'steps(3)' }, 2.55);
  tl.to(state, { n3: 1, duration: 0.06, ease: 'steps(3)' }, 2.6);

  window.__timelines = window.__timelines || {};
  window.__timelines.video = tl;

  function seekRender(ev) {
    var t = ev && ev.detail && typeof ev.detail.time === 'number' ? ev.detail.time : null;
    if (t !== null) tl.seek(Math.max(0, Math.min(DURATION, t)), false);
    render();
  }
  window.addEventListener('hf-seek', seekRender);
  document.addEventListener('hf-seek', seekRender);
  window.__renderVideoFrame = function () { render(); };

  // precompile and draw the first frame
  renderer.compile(scene, camera);
  tl.seek(0, false);
  render();
})();
