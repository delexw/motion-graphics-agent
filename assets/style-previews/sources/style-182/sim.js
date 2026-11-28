// Seeded, baked agent simulation for "An idea becomes a connected system".
// Pure function of its constants: every step is precomputed once; drawing reads baked steps only.
(function (root) {
  var FIELD = { x: 80, y: 120, w: 760, h: 500 };
  var R = 64;          // link radius (rule: builder links idea if d < r)
  var SENSE = 210;     // builder only seeks an idea it can sense
  var STEPS = 36;      // baked interaction steps
  var SPEED = 5.2;     // px per step, max

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedPositions(rand, n, existing, minD) {
    var out = [], tries = 0;
    while (out.length < n && tries < 5000) {
      tries++;
      var p = { x: FIELD.x + 40 + rand() * (FIELD.w - 80), y: FIELD.y + 40 + rand() * (FIELD.h - 80) };
      var ok = true, all = existing.concat(out);
      for (var i = 0; i < all.length; i++) {
        var dx = all[i].x - p.x, dy = all[i].y - p.y;
        if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
      }
      if (ok) out.push(p);
    }
    return out;
  }

  function bake(seed) {
    var rand = mulberry32(seed);
    var ideas = seedPositions(rand, 9, [], 120);
    var builders = seedPositions(rand, 14, ideas, 70);
    var agents = [];
    ideas.forEach(function (p, i) { agents.push({ id: 'i' + i, kind: 'idea', x: p.x, y: p.y }); });
    builders.forEach(function (p, i) { agents.push({ id: 'b' + i, kind: 'builder', x: p.x, y: p.y }); });

    var steps = [];
    var cur = agents.map(function (a) { return { x: a.x, y: a.y }; });
    var linkBorn = {}; // "bi-ij" -> step index
    for (var s = 0; s <= STEPS; s++) {
      // links from current positions
      var links = [];
      for (var b = 0; b < agents.length; b++) {
        if (agents[b].kind !== 'builder') continue;
        for (var i = 0; i < agents.length; i++) {
          if (agents[i].kind !== 'idea') continue;
          var dx = cur[i].x - cur[b].x, dy = cur[i].y - cur[b].y;
          var key = b + '-' + i;
          if (linkBorn[key] !== undefined || dx * dx + dy * dy < R * R) {
            if (linkBorn[key] === undefined) linkBorn[key] = s;
            links.push({ b: b, i: i, born: linkBorn[key] });
          }
        }
      }
      // components (union-find)
      var parent = agents.map(function (_, k) { return k; });
      function find(k) { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; }
      links.forEach(function (l) { parent[find(l.b)] = find(l.i); });
      var size = {};
      agents.forEach(function (_, k) { var r = find(k); size[r] = (size[r] || 0) + 1; });
      var comp = agents.map(function (_, k) { return find(k); });
      var bins = [0, 0, 0]; // agents in systems of size 1, 2-3, 4+
      agents.forEach(function (_, k) { var n = size[comp[k]]; bins[n === 1 ? 0 : n <= 3 ? 1 : 2]++; });
      var systems = 0; Object.keys(size).forEach(function (r) { if (size[r] > 1) systems++; });
      steps.push({ pos: cur.map(function (p) { return { x: p.x, y: p.y }; }), links: links, comp: comp, size: size, bins: bins, systems: systems });

      if (s === STEPS) break;
      // rule: each builder moves toward the nearest idea it can sense, stops just inside r
      var next = cur.map(function (p) { return { x: p.x, y: p.y }; });
      for (var b2 = 0; b2 < agents.length; b2++) {
        if (agents[b2].kind !== 'builder') continue;
        var best = -1, bd = SENSE;
        for (var i2 = 0; i2 < agents.length; i2++) {
          if (agents[i2].kind !== 'idea') continue;
          var d = Math.hypot(cur[i2].x - cur[b2].x, cur[i2].y - cur[b2].y);
          if (d < bd) { bd = d; best = i2; }
        }
        if (best < 0) continue;
        var stopAt = R * 0.62;
        if (bd <= stopAt) continue;
        var mv = Math.min(SPEED, bd - stopAt);
        next[b2].x += (cur[best].x - cur[b2].x) / bd * mv;
        next[b2].y += (cur[best].y - cur[b2].y) / bd * mv;
      }
      cur = next;
    }
    return { agents: agents, steps: steps, R: R, SENSE: SENSE, STEPS: STEPS, FIELD: FIELD };
  }

  var api = { bake: bake };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AgentSim = api;
})(this);
