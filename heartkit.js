/* ================================================================
   heartkit.js — shared real-3D heart toolkit (Three.js, no modules)
   - heartBuffers(): pure maths for an inflated, symmetric heart
   - HeartKit.heart(): glossy 3D heart mesh group
   - HeartKit.stage(): lazy WebGL stage (renderer only lives while visible)
   (Soft-pink revision: lighter rose material, softer environment, and
    normal-blended glows so they read on a light background.)
   - HeartKit.beat(): lub-dub heartbeat curve
   ================================================================ */
(function () {
'use strict';

const TAU = Math.PI * 2;
const DEPTH = 0.62;          // half-thickness of the heart (width is 2)
const Y_SHIFT = 0.155;       // centres the heart vertically

/* ---------- pure geometry maths (also unit-tested in Node) ---------- */
function outlineX(t) { const s = Math.sin(t); return s * s * s; }
function outlineY(t) {
  return (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
}
function outlineDX(t) { const s = Math.sin(t); return 3 * s * s * Math.cos(t); }
function outlineDY(t) {
  return (-13 * Math.sin(t) + 10 * Math.sin(2 * t) + 6 * Math.sin(3 * t) + 4 * Math.sin(4 * t)) / 16;
}

/* Surface point of the "inflated" heart. t: outline angle, phi: 0 = front pole, PI = back pole */
function heartPoint(t, phi, out) {
  const s = Math.sin(phi), c = Math.cos(phi);
  out[0] = s * outlineX(t);
  out[1] = s * outlineY(t) + Y_SHIFT;
  out[2] = DEPTH * c;
  return out;
}

function heartBuffers(segT, segP) {
  const rows = segP + 1, cols = segT + 1, nv = rows * cols;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = [];
  const tmp = [0, 0, 0];
  for (let j = 0; j <= segP; j++) {
    const u = j / segP, k = 2 * u - 1;
    // cluster rings towards the rim (phi = PI/2) where curvature is highest
    const phi = Math.PI / 2 + (Math.PI / 2) * Math.sign(k) * Math.pow(Math.abs(k), 1.35);
    const s = Math.sin(phi), c = Math.cos(phi);
    for (let i = 0; i <= segT; i++) {
      const t = (i / segT) * TAU, tt = t + 0.0007;       // offset avoids zero-length tangents at the cusp/tip
      const x0 = outlineX(t), y0 = outlineY(t);
      const dx = outlineDX(tt), dy = outlineDY(tt);
      const v = j * cols + i;
      heartPoint(t, phi, tmp);
      pos[v * 3] = tmp[0]; pos[v * 3 + 1] = tmp[1]; pos[v * 3 + 2] = tmp[2];
      let nx, ny, nz;
      if (s < 1e-4) { nx = 0; ny = 0; nz = c >= 0 ? 1 : -1; }
      else {
        nx = -DEPTH * s * s * dy;
        ny = DEPTH * s * s * dx;
        nz = s * c * (dx * y0 - dy * x0);
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        // make sure it points away from the centre
        if (nx * (s * x0) + ny * (s * y0) + nz * (DEPTH * c) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      }
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      uv[v * 2] = 0.5 + tmp[0] * 0.5; uv[v * 2 + 1] = 0.5 + tmp[1] * 0.5;
    }
  }
  for (let j = 0; j < segP; j++) {
    for (let i = 0; i < segT; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { pos, nor, uv, idx };
}

/* Outline parameter values spaced evenly by arc length (crisp rim) or by swept area (even fill) */
function arcTable(n) {
  n = n || 600;
  const ts = [0], ls = [0], as = [0];
  let px = outlineX(0), py = outlineY(0), len = 0, area = 0;
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * Math.PI;                       // right half only: x >= 0
    const x = outlineX(t), y = outlineY(t);
    len += Math.hypot(x - px, y - py);
    area += Math.abs(px * y - py * x) * 0.5;           // triangle swept from the centre
    ts.push(t); ls.push(len); as.push(area); px = x; py = y;
  }
  function invert(tab, frac) {
    const target = frac * tab[n];
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] < target) lo = m; else hi = m; }
    const span = tab[hi] - tab[lo] || 1;
    return ts[lo] + (ts[hi] - ts[lo]) * ((target - tab[lo]) / span);
  }
  return { total: len, area, tAt: f => invert(ls, f), tAtArea: f => invert(as, f) };
}

/* lub-dub: phase 0..1 -> 0..1 */
function beatPhase(p) {
  p = p - Math.floor(p);
  const lub = Math.exp(-Math.pow((p - 0.07) / 0.05, 2));
  const dub = 0.62 * Math.exp(-Math.pow((p - 0.30) / 0.06, 2));
  return Math.min(1, lub + dub);
}
function beat(t, bpm, offset) { return beatPhase((t * (bpm || 66)) / 60 + (offset || 0)); }

const pure = { heartPoint, heartBuffers, arcTable, beatPhase, outlineX, outlineY, DEPTH, Y_SHIFT };
if (typeof module !== 'undefined' && module.exports) module.exports = pure;   // Node test hook

const THREE = window.THREE;
if (!THREE) { window.HeartKit = null; return; }
const Love = window.Love;
const REDUCED = Love ? Love.REDUCED : false;
const isMobile = Love ? Love.isMobile : () => window.innerWidth < 768;

/* ---------- THREE helpers ---------- */
const geoCache = {};
function geometry(kind) {
  if (geoCache[kind]) return geoCache[kind];
  const q = kind === 'hi' ? [112, 56] : [40, 20];
  const b = heartBuffers(q[0], q[1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  geoCache[kind] = g;
  return g;
}

let bumpTex = null;
function bumpTexture() {
  if (bumpTex) return bumpTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {          // soft, silky grain
    const v = 100 + Math.random() * 56;
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.35)';
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, TAU); g.fill();
  }
  bumpTex = new THREE.CanvasTexture(c);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(2, 2);
  return bumpTex;
}

function material(o) {
  o = o || {};
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color || 0xe0486e,
    roughness: 0.34,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    sheen: 1,
    sheenColor: new THREE.Color(0xffa3bf),
    sheenRoughness: 0.5,
    emissive: o.emissive || 0x5a1230,
    emissiveIntensity: o.emissiveIntensity === undefined ? 0.5 : o.emissiveIntensity,
    envMapIntensity: 1.15,
    bumpMap: o.bump === false ? null : bumpTexture(),
    bumpScale: 0.6,
    transparent: !!o.transparent,
    opacity: o.opacity === undefined ? 1 : o.opacity
  });
  return m;
}

function heart(o) {
  o = o || {};
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geometry(o.quality || 'hi'), material(o));
  g.add(mesh);
  g.userData.mesh = mesh;
  g.userData.material = mesh.material;
  return g;
}

/* squash-and-stretch pump: b = 0..1 */
function pump(group, base, b, amp) {
  amp = amp === undefined ? 1 : amp;
  group.scale.set(base * (1 + 0.065 * b * amp), base * (1 + 0.065 * b * amp), base * (1 + 0.11 * b * amp));
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,.45)');
  r.addColorStop(0.6, 'rgba(255,255,255,.10)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
function glow(color, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: color === undefined ? 0xff4d86 : color,
    transparent: true, opacity: opacity === undefined ? 1 : opacity,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: false
  }));
  return s;
}

/* soft-box environment so the glossy surface has something to reflect */
function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshBasicMaterial({ color: 0x5b2a41, side: THREE.BackSide })));
  function box(w, h, col, k, x, y, z) {
    const c = new THREE.Color(col).multiplyScalar(k);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  }
  box(9, 6, 0xffe6ef, 7, -7, 8, 9);      // key
  box(5, 9, 0xe8c49c, 5, 10, 2, -7);     // warm rim
  box(10, 3, 0xffa0bf, 3.2, 0, -9, 5);   // pink bounce from below
  box(3, 3, 0xffffff, 6, 7, 3, 9);       // small hot highlight
  const rt = pm.fromScene(env, 0.035);
  pm.dispose();
  return rt;
}

/* ---------- lazy WebGL stage ---------- */
function stage(host, o) {
  o = o || {};
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov || 38, 1, 0.1, 200);
  camera.position.set(0, 0, o.z || 9);

  const amb = new THREE.AmbientLight(0xffd9e6, 0.28);
  const key = new THREE.DirectionalLight(0xfff0f5, 1.5); key.position.set(-3, 4, 6);
  const rim = new THREE.DirectionalLight(0xe8a8b8, 1.1); rim.position.set(5, 1, -3);
  const fill = new THREE.DirectionalLight(0xff5c8d, 0.45); fill.position.set(2, -4, 4);
  scene.add(amb, key, rim, fill);

  const api = {
    scene, camera, host, lights: { amb, key, rim, fill }, time: 0, dt: 0,
    w: 1, h: 1, aspect: 1, onFrame: null, onResize: null, active: false, renderer: null
  };
  let raf = 0, last = 0, envRT = null, ro = null;

  function visibleSize(zPlane) {                     // world size visible at z = zPlane
    const dist = camera.position.z - (zPlane || 0);
    const h = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
    return { w: h * camera.aspect, h };
  }
  api.visible = visibleSize;

  function resize() {
    if (!api.renderer) return;
    const w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight);
    api.w = w; api.h = h; api.aspect = w / h;
    camera.aspect = api.aspect; camera.updateProjectionMatrix();
    api.renderer.setSize(w, h, false);
    if (api.onResize) api.onResize(api);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    api.dt = dt;
    if (!REDUCED) api.time += dt;
    if (api.onFrame) api.onFrame(api);
    api.renderer.render(scene, camera);
  }

  function activate() {
    if (api.active) return;
    let r;
    try {
      r = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobile(), powerPreference: 'high-performance' });
    } catch (e) { host.classList.add('webgl-fail'); return; }
    api.active = true;
    api.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = o.exposure || 1.05;
    r.setClearColor(0x000000, 0);
    host.appendChild(r.domElement);
    envRT = makeEnv(r);
    scene.environment = envRT.texture;
    resize();
    if ('ResizeObserver' in window) { ro = new ResizeObserver(resize); ro.observe(host); }
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function deactivate() {
    if (!api.active) return;
    api.active = false;
    cancelAnimationFrame(raf);
    if (ro) { ro.disconnect(); ro = null; }
    scene.environment = null;
    if (envRT) { envRT.dispose(); envRT = null; }
    const r = api.renderer;
    api.renderer = null;
    if (r) { const c = r.domElement; r.dispose(); r.forceContextLoss(); if (c.parentNode) c.parentNode.removeChild(c); }
  }

  const target = o.target || host;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) activate(); else deactivate(); });
    }, { rootMargin: o.margin || '120px 0px' }).observe(target);
  } else activate();

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); } else if (api.active) { last = performance.now(); raf = requestAnimationFrame(loop); }
  });
  api.activate = activate; api.deactivate = deactivate;
  return api;
}

window.HeartKit = Object.assign({
  THREE, geometry, material, heart, pump, glow, stage, beat, DEPTH, Y_SHIFT
}, pure);
})();