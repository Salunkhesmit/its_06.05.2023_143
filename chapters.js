/* ================================================================
   chapters.js — per-chapter DOM logic (Anime.js + vanilla JS).
   3D scenes live in scenes3d.js and read the state objects set here.
   All personal content (letters, photos, password) lives in config.js.
   ================================================================ */
(function () {
'use strict';
const { $, $$, clamp, lerp, rand, smoothstep, isMobile, REDUCED, A, V3, V4, onScene, revealGroup } = window.Love;
const Love = window.Love;
const CFG = window.LOVE_CONFIG || {};
const root = document.documentElement;
const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

/* ---------------------------------------------------------------
   HERO PARTICLE FIELD (soft pink hearts drifting in the background)
   --------------------------------------------------------------- */
const HEART_PATH = (function () {
  const raw = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const x = Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
    raw.push([x, y]);
  }
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  raw.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const s = 2 / Math.max(maxX - minX, maxY - minY);
  const ox = -((minX + maxX) / 2) * s;
  const oy = -((minY + maxY) / 2) * s;
  const p = new Path2D();
  raw.forEach(([x, y], i) => {
    const px = x * s + ox, py = y * s + oy;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  });
  p.closePath();
  return p;
})();

const SPRITE_CACHE = {};
function heartSprite(size, fill, glow) {
  const key = size + '|' + fill + '|' + glow;
  if (SPRITE_CACHE[key]) return SPRITE_CACHE[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  grad.addColorStop(0, glow);
  grad.addColorStop(0.42, glow.replace(/[\d.]+\)$/, '0.14)'));
  grad.addColorStop(1, 'rgba(255,170,195,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const half = size * 0.20;
  g.save();
  g.translate(cx, cy);
  g.scale(half, half);
  g.fillStyle = fill;
  g.fill(HEART_PATH);
  g.restore();
  SPRITE_CACHE[key] = c;
  return c;
}

const SPRITE_SOFT   = heartSprite(128, 'rgba(238,128,160,.72)', 'rgba(240,150,180,.40)');
const SPRITE_BRIGHT = heartSprite(128, 'rgba(255,255,255,.95)', 'rgba(255,150,185,.55)');
const SPRITE_GOLD   = heartSprite(128, 'rgba(222,178,128,.85)', 'rgba(232,196,156,.45)');

function HeroField(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let parts = [];
  let rafId = null;
  let t0 = performance.now();
  const state = { reveal: 0, mx: 0, my: 0, tmx: 0, tmy: 0, auto: 0 };
  const FOV = 820;

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, Math.min(r.height, window.innerHeight * 1.05));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }
  function build() {
    const n = isMobile() ? 60 : 150;
    const base = Math.min(W, H);
    parts = [];
    for (let i = 0; i < n; i++) {
      const z = rand(-320, 720);
      const ang = rand(0, Math.PI * 2);
      const rad = Math.pow(Math.random(), 0.62) * base * 0.92;
      parts.push({
        x: Math.cos(ang) * rad * 1.25, y: Math.sin(ang) * rad * 0.95, z: z,
        s: rand(0.45, 1.65), a: rand(0.22, 0.95), phase: rand(0, Math.PI * 2),
        drift: rand(0.4, 1.5), delay: rand(0, 0.62), gold: Math.random() < 0.12
      });
    }
  }
  function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    state.mx = lerp(state.mx, state.tmx, 0.045);
    state.my = lerp(state.my, state.tmy, 0.045);
    if (isMobile()) state.auto = t * 0.00016;
    const cx = W / 2 + state.mx * 42;
    const cy = H * 0.42 + state.my * 30;
    const rotY = t * 0.00009 + (isMobile() ? state.auto : 0) * 0.4;
    const cr = Math.cos(rotY), sr = Math.sin(rotY);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const dx = Math.cos(t * 0.00052 + p.phase * 1.31) * 15 * p.drift;
      const dy = Math.sin(t * 0.00061 + p.phase) * 15 * p.drift;
      const rx = p.x * cr - p.z * sr * 0.42;
      const rz = p.z * cr + p.x * sr * 0.42;
      const persp = FOV / (FOV + rz);
      if (persp <= 0.05) continue;
      const sx = cx + (rx + dx) * persp;
      const sy = cy + (p.y + dy) * persp;
      if (sx < -160 || sx > W + 160 || sy < -160 || sy > H + 160) continue;
      const local = clamp((state.reveal - p.delay) / 0.42, 0, 1);
      if (local <= 0.001) continue;
      const eased = local * local * (3 - 2 * local);
      const depthNorm = clamp((persp - 0.5) / 1.15, 0, 1);
      const alpha = p.a * eased * (0.22 + 0.78 * depthNorm);
      if (alpha < 0.004) continue;
      const size = p.s * 30 * persp;
      const spr = p.gold ? SPRITE_GOLD : (depthNorm > 0.72 ? SPRITE_BRIGHT : SPRITE_SOFT);
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(spr, sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(frame);
  }
  function start() { if (rafId) return; t0 = performance.now(); rafId = requestAnimationFrame(frame); }
  function stop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (state.reveal > 0 || started()) start(); });
  let _s = false; const started = () => _s;
  resize();
  return { state, start() { _s = true; start(); }, stop, resize };
}

/* ---------------------------------------------------------------
   CHAPTER 1 — THE OPENING: bow, arrow, cracked heart, parchment
   One state machine, run once per page session:
     intro -> aim -> flying -> impact -> drop -> unroll -> done   (or skipped)
   Nothing here is reset by scrolling or resizing.
   --------------------------------------------------------------- */
(function heroSection() {
  const canvas = $('#heroCanvas');
  if (!canvas) return;
  const field = HeroField(canvas);
  const HS = window.HeroState || { emerge: 1, calm: 0, beatScale: 1, kick: 0, kdx: 0, kdy: 0, rect: { cx: 0, cy: 0, r: 0, ok: false } };
  const HK = window.HeartKit;
  const hero = $('#hero'), host = $('#hero3d'), black = $('#heroBlack'), cue = $('#scrollCue');
  const l1 = $('#heroLine1'), l2 = $('#heroLine2');
  const sc = $('#shootCanvas'), hint = $('#aimHint'), skipBtn = $('#skipOpen');
  const parch = $('#parchment'), pSheet = $('#parchSheet'), pInner = $('#parchInner');
  const ctx = sc ? sc.getContext('2d') : null;
  const D = REDUCED ? 0.45 : 1;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const unlock = () => root.classList.remove('intro-lock');
  let phase = 'intro';

  /* ---- letter text (editable in config.js) ---- */
  (function fillLetter() {
    const L = CFG.openingLetter || {};
    const t = $('#parchTitle'), b = $('#parchBody'), s = $('#parchSign');
    if (!t || !b || !s) return;
    t.textContent = L.title || '';
    (L.paragraphs || []).forEach((txt) => { const p = document.createElement('p'); p.textContent = txt; b.appendChild(p); });
    s.textContent = L.sign || '';
  })();

  /* ---- heart outline (same curve as the 3D heart) ---- */
  const POLY = [], POLYI = [];
  if (HK && HK.outlineX) {
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * TAU, x = HK.outlineX(t), y = HK.outlineY(t) + HK.Y_SHIFT;
      POLY.push([x, y]); POLYI.push([x * 0.985, y * 0.985]);
    }
  }
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function rayHeart(ox, oy, dx, dy) {
    const R = HS.rect; let best = Infinity;
    for (let i = 0; i < POLY.length; i++) {
      const a = POLY[i], b = POLY[(i + 1) % POLY.length];
      const ax = R.cx + a[0] * R.r * 0.985, ay = R.cy - a[1] * R.r * 0.985;
      const ex = R.cx + b[0] * R.r * 0.985 - ax, ey = R.cy - b[1] * R.r * 0.985 - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - ox) * ey - (ay - oy) * ex) / den;
      const u = ((ax - ox) * dy - (ay - oy) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best === Infinity ? null : best;
  }

  /* ---- drawing surface ---- */
  let W = 0, H = 0, DPR = 1;
  function resizeCanvas() {
    if (!sc) return;
    W = host.clientWidth || window.innerWidth; H = host.clientHeight || window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    sc.width = Math.floor(W * DPR); sc.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ---- interaction state ---- */
  const aim = { x: 0, y: 0, has: false };
  const fx = { bow: 0, out: 0, pull: 0, vib: 0, arrowFade: 1 };
  let arrow = null, crack = null, misses = 0;
  const crackG = { g: 0 };
  const parts = [], rings = [];
  const ARR = 86;
  const bowK = () => clamp(Math.min(W, H) / 620, 0.78, 1.15);
  const bowPos = () => [Math.max(48, W * 0.1), H - Math.max(70, H * 0.13)];

  function setAimFromEvent(e) {
    const r = sc.getBoundingClientRect();
    aim.x = e.clientX - r.left; aim.y = e.clientY - r.top; aim.has = true;
  }
  if (sc) {
    sc.addEventListener('pointermove', (e) => { if (phase === 'aim') setAimFromEvent(e); });
    sc.addEventListener('pointerdown', (e) => {
      if (phase !== 'aim') return;
      setAimFromEvent(e);
      if (e.pointerType !== 'mouse') { try { sc.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    sc.addEventListener('pointerup', (e) => { if (phase !== 'aim') return; setAimFromEvent(e); fire(); });
    sc.addEventListener('keydown', (e) => {
      if (phase !== 'aim') return;
      const step = 28;
      if (!aim.has) { aim.x = HS.rect.cx; aim.y = HS.rect.cy; aim.has = true; }
      if (e.key === 'ArrowLeft') aim.x -= step;
      else if (e.key === 'ArrowRight') aim.x += step;
      else if (e.key === 'ArrowUp') aim.y -= step;
      else if (e.key === 'ArrowDown') aim.y += step;
      else if (e.key === 'Enter' || e.key === ' ') { fire(); }
      else return;
      e.preventDefault();
    });
  }

  function fire() {
    if (phase !== 'aim' || arrow) return;
    const R = HS.rect; if (!R.ok) return;
    const k = bowK(), b = bowPos();
    let dx = aim.x - b[0], dy = aim.y - b[1];
    const d = Math.hypot(dx, dy);
    if (d < 30) return;
    dx /= d; dy /= d;
    const L = ARR * k;
    const hit = rayHeart(b[0], b[1], dx, dy);
    arrow = {
      dx: dx, dy: dy, L: L, s: L - 48 * k, speed: 2300 * Math.max(0.85, k) * (REDUCED ? 1.3 : 1),
      hit: hit, hitS: hit == null ? null : hit + 12 * k, maxS: Math.hypot(W, H) * 1.15,
      stuck: false, ang: Math.atan2(dy, dx)
    };
    fx.pull = 0; fx.vib = 1;
    phase = 'flying';
    hint.style.opacity = 0;
  }

  function onImpact() {
    const R = HS.rect, a = arrow;
    phase = 'impact'; a.stuck = true;
    const hx = bowPos()[0] + a.dx * a.hit, hy = bowPos()[1] + a.dy * a.hit;
    const lx = (hx - R.cx) / R.r, ly = -(hy - R.cy) / R.r;
    crack = makeCrack(lx, ly, a.dx, -a.dy);
    crackG.g = 0;
    Love.tween(crackG, { g: 1 }, { duration: 2100 * D, ease: 'outCubic' });
    HS.kdx = a.dx; HS.kdy = a.dy;
    Love.tween(HS, { kick: 1 }, { duration: 70, ease: 'outQuad', onDone: () => Love.tween(HS, { kick: 0 }, { duration: 700 * D, ease: 'outCubic' }) });
    Love.tween(HS, { beatScale: 0.4 }, { duration: 600 * D, ease: 'outCubic' });
    rings.push({ x: hx, y: hy, t: 0 }); rings.push({ x: hx, y: hy, t: -0.18 });
    burst(hx, hy, REDUCED ? 6 : 18);
    setTimeout(startDrop, 1500 * D);
  }

  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(70, 260);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, rot: rand(0, TAU), vr: rand(-4, 4),
        size: rand(5, 11), life: 0, max: rand(0.9, 1.7), heart: Math.random() < 0.7,
        col: ['#e8809b', '#f6a3b8', '#d9486b', '#efd9bb', '#fff0e0'][Math.floor(Math.random() * 5)]
      });
    }
  }

  /* ---- procedural crack that starts exactly at the impact point ---- */
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeCrack(ix, iy, bx, by) {
    const rng = mulberry(Math.floor((ix * 977 + iy * 1301 + 7) * 1000));
    const branches = [], base = Math.atan2(by, bx);
    function grow(x, y, ang, len, depth, t0, span) {
      const pts = [[x, y]]; let a = ang, L = 0, guard = 0;
      const step = 0.055 + rng() * 0.03;
      while (L < len && guard++ < 90) {
        a += (rng() - 0.5) * 0.85;
        x += Math.cos(a) * step; y += Math.sin(a) * step; L += step;
        pts.push([x, y]);
        if (L > 0.15 && !inPoly(x, y, POLYI)) break;
      }
      branches.push({ pts: pts, t0: t0, span: span, w: depth === 0 ? 1 : depth === 1 ? 0.62 : 0.4 });
      if (depth < 2) {
        for (let k = 3; k < pts.length - 1; k++) {
          if (rng() < (depth === 0 ? 0.2 : 0.1)) {
            const side = rng() < 0.5 ? -1 : 1, p = pts[k], q = pts[k + 1];
            const a0 = Math.atan2(q[1] - p[1], q[0] - p[0]) + side * (0.55 + rng() * 0.55);
            grow(p[0], p[1], a0, len * (0.3 + rng() * 0.25), depth + 1, t0 + span * (k / (pts.length - 1)), span * 0.5);
          }
        }
      }
    }
    const n = 6;
    for (let i = 0; i < n; i++) {                 // fan out through the heart, away from where the arrow came from
      const a = base + (i / (n - 1) - 0.5) * 3.0 + (rng() - 0.5) * 0.5;
      grow(ix, iy, a, 1.0 + rng() * 0.9, 0, 0, 0.62 + rng() * 0.2);
    }
    let end = 0; branches.forEach((b) => { end = Math.max(end, b.t0 + b.span); });
    branches.forEach((b) => { b.t0 /= end; b.span /= end; });
    return { ix: ix, iy: iy, branches: branches };
  }
  function drawCrack(R) {
    const g = crackG.g;
    ctx.save();
    ctx.beginPath();
    POLY.forEach((p, i) => { const x = R.cx + p[0] * R.r * 0.99, y = R.cy - p[1] * R.r * 0.99; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.clip();
    const ix = R.cx + crack.ix * R.r, iy = R.cy - crack.iy * R.r;
    const grd = ctx.createRadialGradient(ix, iy, 0, ix, iy, R.r * 0.95);
    grd.addColorStop(0, 'rgba(255,236,214,' + (0.5 * Math.min(1, g * 3)).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(255,236,214,0)');
    ctx.fillStyle = grd; ctx.fillRect(R.cx - R.r * 1.2, R.cy - R.r * 1.2, R.r * 2.4, R.r * 2.4);
    const s = R.r / 150;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    crack.branches.forEach((b) => {
      const f = clamp((g - b.t0) / b.span, 0, 1); if (f <= 0) return;
      const n = b.pts.length - 1, fi = n * f, i0 = Math.min(n, Math.floor(fi)), fr = fi - i0;
      const pts = [];
      for (let i = 0; i <= i0; i++) pts.push([R.cx + b.pts[i][0] * R.r, R.cy - b.pts[i][1] * R.r]);
      if (i0 < n) {
        const p = b.pts[i0], q = b.pts[i0 + 1];
        pts.push([R.cx + lerp(p[0], q[0], fr) * R.r, R.cy - lerp(p[1], q[1], fr) * R.r]);
      }
      if (pts.length < 2) return;
      const path = () => { ctx.beginPath(); pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); };
      path(); ctx.strokeStyle = 'rgba(88,12,40,.55)'; ctx.lineWidth = (3.2 * b.w + 0.6) * s; ctx.stroke();
      ctx.save(); ctx.translate(-0.5 * s, -0.5 * s);
      path(); ctx.strokeStyle = 'rgba(255,240,222,.95)'; ctx.lineWidth = (1.5 * b.w + 0.3) * s; ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  /* ---- bow & arrow drawing ---- */
  function arrowShape(x0, x1) {              // along +x, tail at x0, tip at x1
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1 - 9, 0);
    ctx.strokeStyle = '#b98b58'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#f3dcae'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#e8809b';                // fletching
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 - 7, -6); ctx.lineTo(x0 + 11, -3); ctx.lineTo(x0 + 11, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 - 7, 6); ctx.lineTo(x0 + 11, 3); ctx.lineTo(x0 + 11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9486b';                // head
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1 - 13, -5.5); ctx.lineTo(x1 - 9, 0); ctx.lineTo(x1 - 13, 5.5); ctx.closePath(); ctx.fill();
  }
  function drawBow(bx, by, ang, k, alpha, pull, withArrow) {
    ctx.save(); ctx.translate(bx, by); ctx.rotate(ang); ctx.scale(k, k); ctx.globalAlpha = alpha;
    const halfH = 56, tipX = -16, grip = 14;
    const limb = () => { ctx.beginPath(); ctx.moveTo(tipX, -halfH); ctx.bezierCurveTo(grip + 22, -halfH * 0.55, grip + 22, halfH * 0.55, tipX, halfH); };
    ctx.lineCap = 'round';
    limb(); ctx.strokeStyle = 'rgba(120,50,80,.18)'; ctx.lineWidth = 9; ctx.stroke();
    limb(); ctx.strokeStyle = '#b4647f'; ctx.lineWidth = 6; ctx.stroke();
    limb(); ctx.strokeStyle = '#f5c3cf'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#e9c98f';
    [-halfH, halfH].forEach((y) => { ctx.beginPath(); ctx.arc(tipX, y, 3.6, 0, TAU); ctx.fill(); });
    const vib = Math.sin(performance.now() * 0.06) * 3 * fx.vib;
    const nx = tipX - pull * 32;
    ctx.beginPath(); ctx.moveTo(tipX, -halfH); ctx.lineTo(nx + vib * 0.3, vib); ctx.lineTo(tipX, halfH);
    ctx.strokeStyle = '#8a5a66'; ctx.lineWidth = 1.3; ctx.stroke();
    if (withArrow) arrowShape(nx, nx + ARR);
    ctx.restore();
  }
  function drawHeartBit(x, y, size, rot, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(size / 2, size / 2);
    ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill(HEART_PATH); ctx.restore();
  }

  /* ---- main drawing loop (runs only while the hero is on screen) ---- */
  let last = 0, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    const R = HS.rect;
    if (!aim.has && R.ok) { aim.x = R.cx; aim.y = R.cy; }
    if (phase === 'done' || phase === 'skipped') placeStatic();

    if (R.ok && crack) drawCrack(R);

    // rings + bits
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt / 0.9; if (r.t < 0) continue;
      if (r.t >= 1) { rings.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - r.t) * 0.7; ctx.strokeStyle = '#fff0e0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, 10 + r.t * 90, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += 300 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const a = 1 - p.life / p.max;
      if (p.heart) drawHeartBit(p.x, p.y, p.size, p.rot, p.col, a);
      else { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.22, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }

    const k = bowK(), b = bowPos();
    // arrow in flight / embedded
    if (arrow) {
      const a = arrow;
      if (!a.stuck) {
        a.s += a.speed * dt;
        if (a.hitS != null && a.s >= a.hitS) { a.s = a.hitS; onImpact(); }
        else if (a.hitS == null && a.s - a.L > a.maxS) {
          arrow = null; misses++; phase = 'aim';
          if (misses >= 3) skipBtn.hidden = false;
          Love.tween(fx, { pull: 0.9 }, { duration: 380, delay: 260, ease: 'outCubic' });
          hint.style.opacity = 1;
        }
      }
      if (arrow) {
        const tx = b[0] + a.dx * (a.s - a.L), ty = b[1] + a.dy * (a.s - a.L);
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(a.ang); ctx.globalAlpha = fx.arrowFade; ctx.scale(k, k);
        arrowShape(0, ARR); ctx.restore();
      }
    }
    // bow + aim guide
    if (fx.bow > 0.01) {
      fx.vib *= 0.93;
      const off = fx.out;
      const bx = b[0] - off * 150, by = b[1] + off * 110;
      const alpha = fx.bow * (1 - off);
      let ang = -0.8;
      if (aim.has) ang = Math.atan2(aim.y - by, aim.x - bx);
      const nocked = phase === 'aim' && !arrow;
      drawBow(bx, by, ang, k, alpha, fx.pull, nocked);
      if (nocked && fx.pull > 0.5) {
        const dx = Math.cos(ang), dy = Math.sin(ang), s0 = ARR * k - 16 * k;
        ctx.fillStyle = '#d9486b';
        for (let s = s0 + 18; s < s0 + 640; s += 17) {
          ctx.globalAlpha = alpha * 0.8 * (1 - (s - s0) / 640);
          ctx.beginPath(); ctx.arc(bx + dx * s, by + dy * s, 2.2, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = '#d9486b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(aim.x, aim.y, 11, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(aim.x, aim.y, 2, 0, TAU); ctx.fillStyle = '#d9486b'; ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }
  if (sc) {
    new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 }).observe(hero);
  }

  /* ---- parchment: rolled -> falls -> lands -> unrolls (DOM, so the text stays crisp) ---- */
  const ROD = 18;
  let Wp = 400, Hs = 300, RW = 150, sizeU = 0;
  function measure() {
    Wp = Math.min(window.innerWidth * 0.88, 410);
    parch.style.setProperty('--pw', Wp + 'px');
    Hs = pInner.offsetHeight;
    RW = clamp(HS.rect.r * 0.95, 110, 170);
  }
  function setSize(u) {
    sizeU = u;
    parch.style.width = lerp(RW, Wp, u).toFixed(1) + 'px';
    pSheet.style.height = lerp(0, Hs, u).toFixed(1) + 'px';
  }
  function place(cx, cy, rot, s) {
    const w = lerp(RW, Wp, sizeU), h = ROD * 2 + lerp(0, Hs, sizeU);
    parch.style.transform = 'translate3d(' + (cx - w / 2).toFixed(1) + 'px,' + (cy - h / 2).toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + s.toFixed(3) + ')';
  }
  function landTop() { const R = HS.rect; return Math.max(R.cy + R.r * 0.95 + 40, H * 0.58); }
  function placeStatic() {
    if (phase !== 'done') return;
    const h = ROD * 2 + Hs;
    place(HS.rect.cx || W / 2, landTop() + h / 2, 0, 1);
  }
  function fitHero() { hero.style.minHeight = Math.max(window.innerHeight, landTop() + ROD * 2 + Hs + 110) + 'px'; }

  function startDrop() {
    if (phase !== 'impact') return;
    phase = 'drop';
    sc.classList.remove('armed');
    hint.style.opacity = 0; skipBtn.hidden = true;
    Love.tween(fx, { out: 1 }, { duration: 950 * D, ease: 'inOutCubic' });            // the bow slips away
    Love.tween(fx, { arrowFade: 0 }, { duration: 800 * D, ease: 'inOutSine' });        // the arrow dissolves into sparkles
    if (arrow) { const b = bowPos(), a = arrow; for (let i = 0; i < 10; i++) { const s = a.s - a.L * Math.random(); burst(b[0] + a.dx * s, b[1] + a.dy * s, 1); } }
    measure(); setSize(0);
    parch.classList.add('show');
    const R0 = HS.rect, sx = R0.cx, sy = R0.cy + R0.r * 0.2;
    const T0 = performance.now(), FALL = 1250 * D, LAND = 560 * D, UNROLL = 1500 * D;
    const bounce = (u) => (u < 0.45 ? 14 * Math.sin((u / 0.45) * Math.PI) : u < 0.75 ? 5 * Math.sin(((u - 0.45) / 0.3) * Math.PI) : 0);
    let unrolled = false;
    (function step(now) {
      const t = now - T0, R = HS.rect, lt = landTop(), landC = lt + ROD;
      if (t < FALL) {
        const u = t / FALL, e = u * u;
        place(lerp(sx, R.cx, u) + Math.sin(u * Math.PI * 1.4) * 20 * (1 - u), lerp(sy, landC, e), lerp(-42, 6, u) + Math.sin(u * 9) * 7 * (1 - u), lerp(0.3, 1, Math.pow(u, 0.6)));
      } else if (t < FALL + LAND) {
        const u = (t - FALL) / LAND;
        place(R.cx, landC - bounce(u), lerp(6, 0, u), 1);
      } else {
        phase = 'unroll';
        const u = clamp((t - FALL - LAND) / UNROLL, 0, 1), e = 1 - Math.pow(1 - u, 3);
        setSize(e);
        place(R.cx, lt + (ROD * 2 + lerp(0, Hs, e)) / 2, 0, 1);
        if (u > 0.25 && !unrolled) { unrolled = true; parch.classList.add('unrolled'); }
        if (u >= 1) { finish(); return; }
      }
      requestAnimationFrame(step);
    })(T0);
  }
  function finish() {
    phase = 'done';
    measure(); setSize(1);
    parch.classList.add('read'); parch.setAttribute('aria-hidden', 'false');
    fitHero(); unlock();
    A.animate(cue, { opacity: [0, 1], duration: 1400, delay: 900, ease: 'outExpo' });
    if (!(V3 || V4)) cue.style.opacity = '1';
  }
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (phase === 'done' || phase === 'unroll') { measure(); if (phase === 'done') { setSize(1); fitHero(); } }
  }, { passive: true });

  /* ---- skipping (never trap the visitor) ---- */
  function skipOpening() {
    if (phase === 'done' || phase === 'skipped' || phase === 'drop' || phase === 'unroll') return;
    phase = 'skipped';
    sc.classList.remove('armed'); hint.style.opacity = 0; skipBtn.hidden = true;
    Love.tween(fx, { out: 1 }, { duration: 700, ease: 'inOutCubic' });
    unlock();
    A.animate(cue, { opacity: [0, 1], duration: 1200, delay: 300, ease: 'outExpo' });
    if (!(V3 || V4)) cue.style.opacity = '1';
  }
  skipBtn.addEventListener('click', skipOpening);

  /* ---- intro: heart emerges, words appear, then the bow arrives ---- */
  let started = false, tries = 0;
  function beginAim() {
    if (!(HK && POLY.length && HS.rect && HS.rect.ok)) {
      if (++tries < 4) { setTimeout(beginAim, 900); return; }
      skipOpening(); return;                 // no WebGL: fall back to a normal page
    }
    phase = 'aim';
    Love.tween(HS, { calm: 1 }, { duration: 900, ease: 'outCubic' });
    Love.tween(fx, { bow: 1 }, { duration: 1000 * D, ease: 'outCubic' });
    Love.tween(fx, { pull: 0.9 }, { duration: 700 * D, delay: 700 * D, ease: 'outCubic' });
    hint.textContent = coarse ? 'Drag to aim · release to shoot' : 'Move to aim · click to shoot';
    hint.style.transition = 'opacity .8s ease'; hint.style.opacity = 1;
    sc.classList.add('armed');
    setTimeout(() => { if (phase === 'aim') skipBtn.hidden = false; }, 16000);
  }
  function intro() {
    if (started) return;
    started = true;
    field.start();
    Love.tween(HS, { emerge: 1 }, { duration: 3800 * D, delay: 600 * D, ease: 'inOutSine' });
    setTimeout(() => { if (black) black.classList.add('gone'); }, 2200 * D);
    Love.tween(field.state, { reveal: 1 }, { duration: 3000 * D, delay: 3200 * D, ease: 'outQuad' });
    A.animate(l1, { opacity: [0, 1], y: [24, 0], duration: 1400, delay: 3600 * D, ease: 'outExpo' });
    A.animate(l2, { opacity: [0, 1], y: [24, 0], duration: 1400, delay: 4150 * D, ease: 'outExpo' });
    setTimeout(beginAim, 5000 * D);
  }
  if (!isMobile()) {
    window.addEventListener('mousemove', (e) => {
      field.state.tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      field.state.tmy = (e.clientY / window.innerHeight - 0.5) * 2;
      HS.tmx = field.state.tmx; HS.tmy = field.state.tmy;
    }, { passive: true });
  }
  resizeCanvas();
  if (document.readyState === 'complete') setTimeout(intro, 200);
  else window.addEventListener('load', () => setTimeout(intro, 200));
  setTimeout(intro, 1800);      // safety net
})();


/* ---------------------------------------------------------------
   CHAPTER 2 — YOU ARE MY WORLD
   Words float in depth, catch the light under the pointer and lean
   toward it. Hover (or tap on touch) wakes the 3D heart's heartbeat.
   --------------------------------------------------------------- */
(function worldSection() {
  const stage = $('#worldStage');
  if (!stage) return;

  const WORDS = [
    { text: 'My Peace',            a: -90,  r: 0.36, z: 120 },
    { text: 'My Comfort',          a: -32,  r: 0.44, z: -90 },
    { text: 'My Favourite Person', a:  32,  r: 0.38, z: 180 },
    { text: 'My Home',             a:  90,  r: 0.44, z: -50 },
    { text: 'My Safe Place',       a: 150,  r: 0.36, z: 95 },
    { text: 'My Future',           a: 212,  r: 0.44, z: -150 }
  ];
  const slots = [];
  WORDS.forEach((w, i) => {
    const slot = document.createElement('div');
    slot.className = 'word-slot';
    const el = document.createElement('span');
    el.className = 'word';
    el.style.setProperty('--i', i);
    el.textContent = w.text;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    slot.appendChild(el);
    stage.appendChild(slot);
    slots.push({ slot, el, cfg: w, index: i });
  });

  function layout() {
    const rect = stage.getBoundingClientRect();
    const R = Math.min(rect.width * 0.42, rect.height * 0.46);
    const mob = isMobile();
    slots.forEach((s) => {
      const rad = (s.cfg.a * Math.PI) / 180;
      const rr = R * s.cfg.r / 0.4;
      const x = Math.cos(rad) * rr * (mob ? 0.86 : 1);
      const y = Math.sin(rad) * rr * (mob ? 0.62 : 0.72);
      const z = mob ? s.cfg.z * 0.5 : s.cfg.z;
      s.slot.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z.toFixed(1) + 'px)';
    });
  }
  layout();
  window.addEventListener('resize', layout, { passive: true });

  const emit = (index, on, el) => window.dispatchEvent(new CustomEvent('world:focus', { detail: { index, on, el } }));
  let active = null, releaseT = 0;
  function deactivate(s) {
    if (!s) return;
    s.el.classList.remove('active');
    emit(s.index, false, s.el);
    if (active === s) active = null;
  }
  function activate(s) {
    clearTimeout(releaseT);
    if (active === s) return;
    if (active) deactivate(active);
    active = s;
    s.el.classList.add('active');
    emit(s.index, true, s.el);
  }

  slots.forEach((s) => {
    s.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') activate(s); });
    s.el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') deactivate(s);
      s.el.style.setProperty('--rx', '0deg'); s.el.style.setProperty('--ry', '0deg'); s.el.style.setProperty('--mx', '50%'); s.el.style.setProperty('--my', '40%');
    });
    // the highlight follows the pointer across the glass, and the word leans toward it
    s.el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || REDUCED) return;
      const r = s.el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      s.el.style.setProperty('--mx', (px * 100).toFixed(0) + '%'); s.el.style.setProperty('--my', (py * 100).toFixed(0) + '%');
      s.el.style.setProperty('--ry', ((px - 0.5) * 14).toFixed(1) + 'deg'); s.el.style.setProperty('--rx', ((0.5 - py) * 10).toFixed(1) + 'deg');
    });
    // touch: tap to wake the heart, tap again (or wait) to let it rest
    s.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (active === s) deactivate(s); else { activate(s); releaseT = setTimeout(() => deactivate(s), 6000); }
    });
    s.el.addEventListener('focus', () => activate(s));
    s.el.addEventListener('blur', () => deactivate(s));
    s.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(s); } });
  });

  // the whole stage drifts a few degrees toward the pointer
  if (!REDUCED) {
    stage.style.transition = 'transform .8s cubic-bezier(.22,.61,.36,1)';
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      stage.style.transform = 'rotateY(' + (nx * 6).toFixed(2) + 'deg) rotateX(' + (-ny * 4).toFixed(2) + 'deg)';
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { stage.style.transform = ''; });
  }

  onScene($('#world'), () => {
    $('#world3d') && $('#world3d').classList.add('is-in');
    A.animate('#world .chapter', { opacity: [0, 1], y: [24, 0], duration: 1000, ease: 'outExpo' });
    A.animate('#world .sub', { opacity: [0, 1], y: [30, 0], duration: 1100, delay: 900, ease: 'outExpo' });
    slots.forEach((s) => s.el.classList.add('is-in'));
    setTimeout(() => slots.forEach((s) => s.el.classList.add('settled')), 2600);
  });
})();


/* ---------------------------------------------------------------
   CHAPTER 3 — THE MEMORY CAPSULE
   Sealed behind a date (config.js → unlockDate). VISUAL PROTOTYPE ONLY:
   nothing here is real security.
   --------------------------------------------------------------- */
(function capsuleSection() {
  const capsule = $('#capsuleEl'), lid = $('#capsuleLid'), inner = $('#capsuleInner');
  const outro = $('#capsuleOutro'), flash = $('#capsuleFilmFlash');
  const lock = $('#capsuleLock'), shackle = $('#lockShackle'), hint = $('#lockHint');
  const relock = $('#capsuleRelock'), relockBtn = $('#relockBtn');
  const dd = $('#dateDD'), mm = $('#dateMM'), yy = $('#dateYYYY');
  const pick = $('#datePick'), nativeDate = $('#dateNative'), go = $('#lockGo');
  const lidLabel = lid ? $('.lid-label', lid) : null;
  if (!capsule || !lock) return;

  if (CFG.capsulePrompt) $('#lockPrompt').textContent = CFG.capsulePrompt;

  // photo + caption (config.js → capsule)
  const photo = $('#capsulePhoto'), cap = $('#capsuleCaption');
  if (photo && CFG.capsule) {
    photo.alt = CFG.capsule.alt || '';
    photo.onerror = function () { photo.onerror = null; photo.src = 'https://picsum.photos/seed/capsule/800/600'; };
    photo.src = CFG.capsule.photo;
  }
  if (cap) cap.textContent = (CFG.capsule && CFG.capsule.caption) || '';

  const fields = [dd, mm, yy];
  let state = 'locked', busy = false;

  if (!REDUCED) {
    A.animate(capsule, { translateY: [0, -6, 0], rotateY: [-2, 2, -2], duration: 9000, loop: true, ease: 'inOutSine' });
  }

  const say = (msg, bad) => { hint.textContent = msg; hint.classList.toggle('bad', !!bad); };
  const sweep = () => A.animate(flash, { opacity: [0, 1, 0], translateX: ['-110%', '110%'], duration: REDUCED ? 400 : 1400, ease: 'inOutSine' });

  fields.forEach((f, i) => {
    f.addEventListener('input', () => {
      f.value = f.value.replace(/\D/g, '').slice(0, f.maxLength);
      if (f.value.length === f.maxLength && fields[i + 1]) fields[i + 1].focus();
      if (state === 'locked') say('Type it, or pick it from the calendar.');
    });
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !f.value && fields[i - 1]) { fields[i - 1].focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    f.addEventListener('paste', (e) => {
      const txt = (e.clipboardData || window.clipboardData).getData('text');
      const m = txt.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/);
      if (!m) return;
      e.preventDefault();
      let [d, mo, y] = [m[1], m[2], m[3]];
      if (d.length === 4) [d, y] = [y, d];
      dd.value = d.slice(-2).padStart(2, '0'); mm.value = mo.padStart(2, '0'); yy.value = y.slice(-4);
    });
  });

  pick.addEventListener('click', () => {
    try { if (nativeDate.showPicker) nativeDate.showPicker(); else nativeDate.focus(); } catch (e) { nativeDate.focus(); }
  });
  nativeDate.addEventListener('change', () => {
    const m = nativeDate.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    yy.value = m[1]; mm.value = m[2]; dd.value = m[3];
    setTimeout(submit, 280);
  });

  function readDate() {
    const d = parseInt(dd.value, 10), m = parseInt(mm.value, 10), y = parseInt(yy.value, 10);
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return null;
    const t = new Date(y, m - 1, d);
    if (t.getFullYear() !== y || t.getMonth() !== m - 1 || t.getDate() !== d) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function shake() {
    A.animate(lock, { x: [0, -9, 9, -6, 6, 0], duration: 520, ease: 'outQuad' });
    A.animate(shackle, { rotate: [0, -8, 8, -4, 0], duration: 520, ease: 'outQuad' });
  }

  function submit() {
    if (busy || state !== 'locked') return;
    const iso = readDate();
    if (!iso) { say('Please enter a real date — day · month · year.', true); shake(); return; }
    if (CFG.unlockDate && iso !== CFG.unlockDate) {
      say(CFG.capsuleHint || 'Not quite… try again.', true); shake();
      fields.forEach(f => { f.value = ''; }); dd.focus();
      return;
    }
    unlock();
  }
  go.addEventListener('click', submit);
  nativeDate.setAttribute('tabindex', '-1');

  function unlock() {
    busy = true; state = 'open';
    say('');
    lock.classList.add('opening');
    shackle.classList.add('open');
    fields.forEach(f => f.blur());
    if (lidLabel) lidLabel.textContent = 'Capsule · Open';

    A.animate(capsule, { scale: [1, 1.04, 1], duration: 700, delay: 300, ease: 'outBack' });
    A.animate(lock, { opacity: [1, 0], scale: [1, 0.94], duration: 620, delay: 560, ease: 'inOutSine',
      complete: () => { lock.hidden = true; lock.classList.remove('opening'); lock.style.opacity = ''; lock.style.transform = ''; } });
    A.animate('.lid-seal', { scale: [1, 2.2, 1], opacity: [1, 0.6, 1], duration: 900, delay: 300, ease: 'outQuad' });
    setTimeout(sweep, 500);
    A.animate(lid, { translateY: -18, rotateX: -118, opacity: [1, 0.15], duration: 1050, delay: 760, ease: 'outExpo' });
    capsule.classList.add('is-open');
    A.animate(inner, { opacity: [0, 1], translateY: [26, 0], duration: 1000, delay: 1300, ease: 'outExpo' });
    A.animate('.capsule-inner .frag', { opacity: [0, 1], scale: [0.8, 1], duration: 700, delay: A.stagger(110, { start: 1700 }), ease: 'outBack' });

    setTimeout(() => {
      relock.hidden = false;
      A.animate(relock, { opacity: [0, 1], y: [18, 0], duration: 1100, ease: 'outExpo' });
      A.animate(outro, { opacity: [0, 1], translateY: [30, 0], duration: 1200, delay: 500, ease: 'outExpo' });
      busy = false;
    }, 2300);
  }

  function relockIt() {
    if (busy || state !== 'open') return;
    busy = true; state = 'locked';
    A.animate(relock, { opacity: [1, 0], y: [0, 10], duration: 500, ease: 'inOutSine', complete: () => { relock.hidden = true; } });
    A.animate(outro, { opacity: [1, 0], duration: 600, ease: 'inOutSine' });
    A.animate('.capsule-inner .frag', { opacity: 0, duration: 400 });
    A.animate(inner, { opacity: [1, 0], translateY: [0, 16], duration: 700, delay: 150, ease: 'inOutSine' });
    setTimeout(sweep, 350);
    A.animate(lid, { translateY: 0, rotateX: 0, opacity: 1, duration: 1000, delay: 500, ease: 'inOutCubic' });
    if (lidLabel) setTimeout(() => { lidLabel.textContent = 'Capsule · Locked'; }, 900);
    A.animate('.lid-seal', { scale: [1, 2.2, 1], duration: 900, delay: 1100, ease: 'outQuad' });
    setTimeout(() => {
      capsule.classList.remove('is-open');
      fields.forEach(f => { f.value = ''; });
      nativeDate.value = '';
      lock.hidden = false;
      shackle.classList.remove('open');
      say('Type it, or pick it from the calendar.');
      A.animate(lock, { opacity: [0, 1], scale: [0.94, 1], duration: 800, ease: 'outExpo' });
      A.animate(capsule, { scale: [1, 0.985, 1], duration: 600, delay: 450, ease: 'outBack' });
      busy = false;
    }, 1500);
  }
  relockBtn.addEventListener('click', relockIt);

  capsule.addEventListener('click', (e) => {
    if (state !== 'locked' || e.target.closest('#capsuleLock')) return;
    (fields.find(f => !f.value) || dd).focus();
  });

  onScene($('#capsule'), () => {
    A.animate('#capsule .chapter', { opacity: [0, 1], y: [24, 0], duration: 1000, ease: 'outExpo' });
    A.animate(capsule, { opacity: [0, 1], scale: [0.86, 1], duration: 1400, delay: 260, ease: 'outExpo' });
    setTimeout(sweep, 500);
  });
  if (!(V3 || V4)) { relock.hidden = true; }
})();


/* ---------------------------------------------------------------
   CHAPTER 4 — THINGS I CHOOSE
   Choices are not hovered, they are MADE: press and hold the glowing
   one until its ring fills. Each choice lights the thread to the next
   and fills the heart. (Enter / Space held works too.)
   --------------------------------------------------------------- */
(function chooseSection() {
  const field = $('#chooseField'), stage = $('#chooseStage');
  if (!field || !stage) return;
  const items = $$('.choose-item', field).map((el, i) => ({
    el, vis: el.querySelector('.choose-vis'), num: el.querySelector('.choose-num'), i,
    x: +el.dataset.x, y: +el.dataset.y, mx: +(el.dataset.mx || el.dataset.x), z: +el.dataset.z, done: false, p: 0
  }));
  const total = items.length;
  const hint = $('#chooseHint'), heart = $('#chooseHeart'), fill = $('#chFill');
  const pathBase = $('#cpBase'), pathProg = $('#cpProg');
  const HOLD = REDUCED ? 450 : 900;
  let count = 0, holdI = -1, holdStart = 0, holdRaf = 0, inView = false, live = false, hintT = 0;
  let tx = 0, ty = 0, cx = 0, cy = 0;

  function buildPath() {
    const mob = isMobile(), P = items.map((it) => [mob ? it.mx : it.x, it.y]);
    let d = 'M' + P[0][0] + ' ' + P[0][1];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + c1[0].toFixed(2) + ' ' + c1[1].toFixed(2) + ',' + c2[0].toFixed(2) + ' ' + c2[1].toFixed(2) + ',' + p2[0] + ' ' + p2[1];
    }
    pathBase.setAttribute('d', d); pathProg.setAttribute('d', d);
  }
  buildPath();
  window.addEventListener('resize', buildPath, { passive: true });

  function say(msg, ms) {
    hint.textContent = msg; hint.classList.add('show'); clearTimeout(hintT);
    if (ms) hintT = setTimeout(() => hint.classList.remove('show'), ms);
  }
  function setRing(it, p) { it.p = p; it.num.style.setProperty('--p', p.toFixed(3)); }

  /* depth planes: unmade choices sit back and soften; the next one comes forward */
  function apply() {
    const mob = isMobile(), zk = mob ? 0.5 : 1;
    items.forEach((it) => {
      const z0 = it.z * zk, isNext = it.i === count && !it.done;
      let oz = z0, s = 1, op, bl;
      if (it.done) { oz = z0 + 30 * zk; s = 1.04; op = 1; bl = 0; }
      else if (isNext) { oz = z0 + 70 * zk; s = 1.08; op = 1; bl = 0; }
      else { op = 0.62 + 0.3 * clamp((z0 + 160) / 320, 0, 1); bl = Math.max(0, (-z0 - 20) / 160) * 0.7; }
      it.el.style.setProperty('--bz', z0.toFixed(0) + 'px');
      const st = it.vis.style;
      st.setProperty('--oz', (oz - z0).toFixed(0) + 'px'); st.setProperty('--ox', '0px'); st.setProperty('--oy', '0px');
      st.setProperty('--s', s); st.setProperty('--op', op.toFixed(2)); st.setProperty('--bl', bl.toFixed(1) + 'px');
      it.el.classList.toggle('is-next', isNext);
      it.el.classList.toggle('is-chosen', it.done);
    });
  }

  function burstAt(it) {
    const b = document.createElement('span');
    b.className = 'choose-burst';
    for (let k = 0; k < (REDUCED ? 3 : 7); k++) {
      const h = document.createElement('i');
      h.textContent = Math.random() < 0.5 ? '\u2665' : '\u2661';
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), r = rand(40, 90);
      h.style.setProperty('--dx', (Math.cos(a) * r).toFixed(0) + 'px');
      h.style.setProperty('--dy', (Math.sin(a) * r).toFixed(0) + 'px');
      h.style.setProperty('--rot', rand(-40, 40).toFixed(0) + 'deg');
      b.appendChild(h);
    }
    it.vis.appendChild(b);
    setTimeout(() => b.remove(), 1500);
  }

  function commit(i) {
    const it = items[i];
    if (!it || it.done || i !== count) return;
    it.done = true; count++;
    setRing(it, 1);
    burstAt(it);
    pathProg.style.strokeDashoffset = (1 - (count <= 1 ? 0 : (count - 1) / (total - 1))).toFixed(3);
    fill.style.transform = 'translateY(' + (100 - (count / total) * 100).toFixed(1) + '%)';
    if (count === 1) say('Keep going.', 2200); else hint.classList.remove('show');
    if (count === total) {
      field.classList.add('done'); heart.classList.add('full');
      pathProg.style.strokeDashoffset = '0';
    }
    apply();
  }

  function endHold(finished) {
    cancelAnimationFrame(holdRaf);
    if (holdI >= 0) {
      const it = items[holdI];
      it.el.classList.remove('is-hold');
      if (!finished) { const o = { p: it.p }; Love.tween(o, { p: 0 }, { duration: 320, ease: 'outQuad', onUpdate: () => { if (!it.done) setRing(it, o.p); } }); }
    }
    holdI = -1;
  }
  function tickHold() {
    holdRaf = requestAnimationFrame(tickHold);
    const it = items[holdI], p = clamp((performance.now() - holdStart) / HOLD, 0, 1);
    setRing(it, p);
    if (p >= 1) { const i = holdI; endHold(true); commit(i); }
  }
  function startHold(i) {
    if (holdI >= 0 || !live) return;
    const it = items[i];
    if (it.done) return;
    if (i !== count) {                                  // not their turn yet: a gentle nudge
      it.el.classList.remove('nudge'); void it.el.offsetWidth; it.el.classList.add('nudge');
      say('One at a time — start with the glowing one.', 2600);
      return;
    }
    holdI = i; holdStart = performance.now();
    it.el.classList.add('is-hold');
    tickHold();
  }

  items.forEach((it) => {
    it.el.tabIndex = 0;
    it.el.setAttribute('role', 'button');
    it.el.setAttribute('aria-label', it.el.textContent.replace(/^\d+/, '').trim() + ' — press and hold to choose');
    it.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { it.el.setPointerCapture(e.pointerId); } catch (err) {}
      startHold(it.i);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => it.el.addEventListener(ev, () => { if (holdI === it.i) endHold(false); }));
    it.el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); startHold(it.i); } });
    it.el.addEventListener('keyup', (e) => { if ((e.key === 'Enter' || e.key === ' ') && holdI === it.i) endHold(false); });
    it.el.addEventListener('blur', () => { if (holdI === it.i) endHold(false); });
  });

  // the stage leans toward the pointer (desktop) and with the scroll (everywhere)
  field.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || REDUCED) return;
    const r = field.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }, { passive: true });
  field.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  (function tick() {
    requestAnimationFrame(tick);
    if (!inView || REDUCED) return;
    cx = lerp(cx, tx, 0.06); cy = lerp(cy, ty, 0.06);
    const r = field.getBoundingClientRect();
    const scr = clamp((r.top + r.height / 2) / window.innerHeight - 0.5, -1, 1);
    stage.style.transform = 'rotateY(' + (cx * 6).toFixed(2) + 'deg) rotateX(' + (-cy * 4 + scr * 4).toFixed(2) + 'deg)';
  })();
  new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0.15 }).observe(field);
  apply();

  onScene($('#choose'), () => {
    A.animate('#choose .chapter', { opacity: [0, 1], y: [22, 0], duration: 900, ease: 'outExpo' });
    A.animate('#choose .headline', { opacity: [0, 1], y: [34, 0], duration: 1200, delay: 180, ease: 'outExpo' });
    field.classList.add('live');
    setTimeout(() => { live = true; field.classList.add('settled'); say('Press and hold to choose.'); }, 1700);
  });
})();


/* ---- CHAPTER 5 — I'M STILL BECOMING (+ envelope + closing lines) ---- */

(function becomingSection() {
  const track = $('#becomeTrack');
  if (!track) return;

  onScene($('#becoming'), () => {
    A.animate('#becoming .chapter', { opacity: [0, 1], y: [22, 0], duration: 900, ease: 'outExpo' });
    A.animate('#becoming .headline', { opacity: [0, 1], y: [34, 0], duration: 1200, delay: 160, ease: 'outExpo' });

    // the rail grows (a real element, so it animates reliably)
    let rail = track.querySelector('.become-rail');
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'become-rail';
      rail.style.cssText =
        'position:absolute;left:19px;top:6px;bottom:6px;width:2px;border-radius:2px;' +
        'background:linear-gradient(180deg, rgba(217,72,107,0), rgba(217,72,107,.8) 12%, rgba(184,138,94,.85) 55%, rgba(232,128,155,.85) 88%, rgba(217,72,107,0));' +
        'transform-origin:top;transform:scaleY(0);';
      if (isMobile()) rail.style.left = '14px';
      track.appendChild(rail);
    }
    A.animate(rail, { scaleY: [0, 1], duration: 1900, delay: 340, ease: 'outExpo' });
    A.animate($$('.become-node', track), { opacity: [0, 1], x: [-30, 0], duration: 1050, delay: A.stagger(340, { start: 520 }), ease: 'outExpo' });
    A.animate('#becoming .become-pledge .big', { opacity: [0, 1], y: [40, 0], duration: 1500, delay: 2500, ease: 'outExpo' });
    A.animate('#becoming .become-pledge .sub', { opacity: [0, 1], y: [30, 0], duration: 1300, delay: 3100, ease: 'outExpo' });
  });

  // closing lines that follow the chapter — each fades in as it is reached
  const lines = $$('#afterBecoming p');
  if (lines.length) {
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        A.animate(en.target, { opacity: [0, 1], y: [28, 0], duration: 1200, ease: 'outExpo' });
        if (!(V3 || V4)) en.target.style.opacity = '1';
      });
    }, { threshold: 0.4, rootMargin: '0px 0px -6% 0px' });
    lines.forEach((p) => io.observe(p));
  }
})();

/* ---- the 3D envelope ---- */
(function envelopeSection() {
  const env = $('#envelope'), stage = $('#envStage'), hintEl = $('#envHint'), emo = $('#envEmojis');
  if (!env || !stage) return;

  // letter text (config.js → envelopeLetter)
  const L = CFG.envelopeLetter || {};
  $('#envTitle').textContent = L.title || '';
  $('#envSign').textContent = L.sign || '';
  const body = $('#envBody');
  (L.paragraphs || []).forEach((t) => { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); });

  const EMOJIS = ['\uD83D\uDC97', '\uD83D\uDC8B', '\uD83D\uDC96', '\uD83D\uDE18', '\u2764\uFE0F', '\uD83D\uDC95', '\uD83D\uDE1A', '\uD83D\uDC9D'];
  let open = false, busy = false;

  function burst() {
    if (!emo.animate) return;
    const n = REDUCED ? 5 : 16;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      emo.appendChild(s);
      const dx = rand(-170, 170), dy = -rand(150, 330), rot = rand(-35, 35), dur = rand(2200, 3400);
      const a = s.animate([
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
        { transform: 'translate(calc(-50% + ' + (dx * 0.25) + 'px),' + (dy * 0.3) + 'px) scale(1) rotate(' + (rot * 0.3) + 'deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(calc(-50% + ' + dx + 'px),' + dy + 'px) scale(.9) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: dur, delay: i * 70, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      a.onfinish = () => s.remove();
    }
  }
  function toggle() {
    if (busy) return;
    busy = true; open = !open;
    env.classList.toggle('is-open', open);
    env.setAttribute('aria-expanded', open ? 'true' : 'false');
    env.setAttribute('aria-label', open ? 'Close the letter' : 'Open the letter');
    hintEl.textContent = open ? 'Tap to close' : 'Tap to open';
    if (open) setTimeout(burst, REDUCED ? 120 : 650);
    setTimeout(() => { busy = false; }, REDUCED ? 200 : 1100);
  }
  env.addEventListener('click', toggle);
  env.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

  // gentle tilt toward the pointer (desktop)
  if (!REDUCED) {
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      stage.style.setProperty('--tx', (((e.clientX - r.left) / r.width - 0.5) * 14).toFixed(1) + 'deg');
      stage.style.setProperty('--ty', (-((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1) + 'deg');
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { stage.style.setProperty('--tx', '0deg'); stage.style.setProperty('--ty', '0deg'); });
  }

  onScene($('#envWrap'), () => {
    A.animate('#envWrap', { opacity: [0, 1], y: [40, 0], duration: 1300, ease: 'outExpo' });
  });
})();


/* ---------------------------------------------------------------
   CHAPTER 6 — THE TWO HEARTS: mood
   Darkens as the scene approaches, brightens as the two hearts meet.
   A fixed veil does the colour work; the page's text colour follows it
   (via --ink-rgb) so everything stays readable the whole way through.
   --------------------------------------------------------------- */
(function moodSection() {
  const veil = $('#moodVeil'), dist = $('#distance');
  if (!veil || !dist) return;
  const sticky = $('.distance-sticky', dist);
  const MS = window.MoodState = { dark: 0, P: 0 };
  const DARK_INK = [255, 240, 245], LIGHT_INK = [255, 240, 245];   // text is light on the deep-rose theme in every state
  let lastDark = -1, ticking = false;

  function update() {
    ticking = false;
    const vh = window.innerHeight, r = dist.getBoundingClientRect();
    const approach = smooth(clamp((vh * 0.95 - r.top) / (vh * 0.95), 0, 1));
    const P = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    const bright = smooth(clamp((P - 0.5) / 0.45, 0, 1));
    const dark = approach * (1 - bright);
    MS.dark = dark; MS.P = P;
    if (Math.abs(dark - lastDark) < 0.003) return;
    lastDark = dark;
    veil.style.opacity = (dark * 0.94).toFixed(3);
    const k = smooth(clamp(dark / 0.55, 0, 1));     // text flips to light well before the veil is fully dark
    const c = DARK_INK.map((v, i) => Math.round(lerp(v, LIGHT_INK[i], k)));
    root.style.setProperty('--ink-rgb', c[0] + ' ' + c[1] + ' ' + c[2]);
    if (sticky) {
      sticky.style.setProperty('--dark', dark.toFixed(3));
      sticky.style.setProperty('--dshadow', '40 14 34');
    }
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req, { passive: true });
  update();
})();


/* ---------------------------------------------------------------
   CHAPTER 7 — GALLERY: three drag-to-rotate 3D photo spheres
   Data: config.js → gallery.categories. Pure CSS 3D, ~20 tiles per sphere.
   --------------------------------------------------------------- */
(function gallerySection() {
  const stage = $('#galStage'), sphere = $('#galSphere'), scaleEl = $('#galScale'), tabsEl = $('#galTabs');
  if (!stage || !sphere) return;
  const G = CFG.gallery || {}, cats = G.categories || [];
  if (!cats.length) return;
  const lb = { root: $('#lightbox'), img: $('#lbImg'), cap: $('#lbCap'), close: $('#lbClose'), prev: $('#lbPrev'), next: $('#lbNext') };

  const view = cats.map(() => ({ rx: -10, ry: 0, vx: 0, vy: 0 }));    // each sphere remembers its own orientation
  let cur = 0, tiles = [], R = 220, lbIndex = -1, paused = false, dragging = false, swapping = false;
  let moved = 0, lx = 0, ly = 0, raf = 0, lastT = 0, inView = false, lastFocus = null;
  const tabEls = [];

  /* tabs */
  cats.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gal-tab'; b.textContent = c.label;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    b.addEventListener('click', () => select(i));
    tabsEl.appendChild(b); tabEls.push(b);
  });

  /* Fibonacci distribution -> every photo gets an even patch of the sphere */
  function fib(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, lat = Math.asin(y) * 180 / Math.PI, lon = (i * 137.50776405) % 360;
      const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
      out.push({ lat, lon, v: [Math.cos(a) * Math.sin(b), -Math.sin(a), Math.cos(a) * Math.cos(b)] });
    }
    return out;
  }
  function build() {
    sphere.innerHTML = ''; tiles = [];
    const items = cats[cur].items || [], n = items.length, pos = fib(n);
    const w = stage.clientWidth, h = stage.clientHeight;
    R = clamp(Math.min(w * 0.42, h * 0.43), 120, 310);
    const size = Math.round(clamp(Math.sqrt((4 * Math.PI * R * R) / n) * 0.74, 54, 150));
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'gal-tile'; el.dataset.i = i;
      el.style.width = el.style.height = size + 'px';
      el.style.marginLeft = el.style.marginTop = (-size / 2) + 'px';
      el.style.transform = 'rotateY(' + pos[i].lon.toFixed(2) + 'deg) rotateX(' + pos[i].lat.toFixed(2) + 'deg) translateZ(' + R.toFixed(0) + 'px)';
      const im = document.createElement('img');
      im.alt = it.caption || ''; im.loading = 'lazy'; im.decoding = 'async'; im.draggable = false;
      im.onerror = function () { im.onerror = null; im.src = G.fallback ? G.fallback(i) : ''; };
      im.src = it.src;
      el.appendChild(im); sphere.appendChild(el);
      tiles.push({ el, v: pos[i].v, z: 0 });
    });
  }

  function select(idx) {
    if (idx === cur || swapping) return;
    swapping = true;
    tabEls.forEach((b, i) => b.setAttribute('aria-selected', i === idx ? 'true' : 'false'));
    scaleEl.classList.add('swap-out');
    setTimeout(() => {
      cur = idx; build();
      requestAnimationFrame(() => { scaleEl.classList.remove('swap-out'); });
      setTimeout(() => { swapping = false; }, 520);
    }, REDUCED ? 60 : 400);
  }

  /* render loop (only while the sphere is on screen) */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    const st = view[cur];
    if (!paused && !dragging) {
      st.ry += st.vy; st.rx = clamp(st.rx + st.vx, -75, 75);
      st.vx *= 0.94; st.vy *= 0.94;
      if (!REDUCED && Math.abs(st.vx) + Math.abs(st.vy) < 0.05) st.ry += 5 * dt;     // gentle float when idle
    }
    const bob = REDUCED ? 0 : Math.sin(now / 1700) * 6;
    sphere.style.transform = 'translateY(' + bob.toFixed(1) + 'px) rotateX(' + st.rx.toFixed(2) + 'deg) rotateY(' + st.ry.toFixed(2) + 'deg)';
    const rx = st.rx * Math.PI / 180, ry = st.ry * Math.PI / 180;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i], z1 = -t.v[0] * sy + t.v[2] * cy, z2 = t.v[1] * sx + z1 * cx;
      t.z = z2;
      const k = smoothstep(-0.15, 0.65, z2);
      t.el.style.opacity = (0.05 + 0.95 * k).toFixed(2);
      t.el.style.pointerEvents = z2 > 0.05 ? 'auto' : 'none';
    }
  }
  new IntersectionObserver((es) => {
    inView = es[0].isIntersecting;
    if (inView && !raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!inView && raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '120px 0px' }).observe(stage);

  /* drag to rotate; a short, still press opens the photo under the pointer */
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
    view[cur].vx = view[cur].vy = 0;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    const st = view[cur];
    st.ry += dx * 0.35; st.rx = clamp(st.rx - dy * 0.35, -75, 75);
    st.vy = clamp(dx * 0.35, -8, 8); st.vx = clamp(-dy * 0.35, -8, 8);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (e.type === 'pointerup' && moved < 7) {
      const el = document.elementFromPoint(e.clientX, e.clientY), tile = el && el.closest && el.closest('.gal-tile');
      if (tile) openBox(+tile.dataset.i);
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', (e) => {
    const st = view[cur];
    if (e.key === 'ArrowLeft') st.vy = -4; else if (e.key === 'ArrowRight') st.vy = 4;
    else if (e.key === 'ArrowUp') st.vx = 3; else if (e.key === 'ArrowDown') st.vx = -3;
    else if (e.key === 'Enter' || e.key === ' ') {
      let best = 0; tiles.forEach((t, i) => { if (t.z > tiles[best].z) best = i; });
      openBox(best);
    } else return;
    e.preventDefault();
  });

  /* lightbox: the sphere is paused (never reset) while it is open, so closing returns to the exact same view */
  function showItem(i) {
    const items = cats[cur].items, n = items.length;
    lbIndex = (i + n) % n;
    const it = items[lbIndex];
    lb.img.onerror = function () { lb.img.onerror = null; if (G.fallback) lb.img.src = G.fallback(lbIndex); };
    lb.img.src = it.src; lb.img.alt = it.caption || ''; lb.cap.textContent = it.caption || '';
  }
  function openBox(i) {
    paused = true; view[cur].vx = view[cur].vy = 0;
    lastFocus = document.activeElement;
    showItem(i);
    lb.root.hidden = false; root.classList.add('lb-open');
    requestAnimationFrame(() => { lb.root.classList.add('show'); lb.close.focus({ preventScroll: true }); });
  }
  function closeBox() {
    if (lb.root.hidden) return;
    lb.root.classList.remove('show'); root.classList.remove('lb-open');
    setTimeout(() => { lb.root.hidden = true; paused = false; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }, REDUCED ? 30 : 360);
  }
  lb.close.addEventListener('click', closeBox);
  lb.prev.addEventListener('click', () => showItem(lbIndex - 1));
  lb.next.addEventListener('click', () => showItem(lbIndex + 1));
  lb.root.addEventListener('click', (e) => { if (e.target === lb.root) closeBox(); });
  document.addEventListener('keydown', (e) => {
    if (lb.root.hidden) return;
    if (e.key === 'Escape') closeBox();
    else if (e.key === 'ArrowLeft') showItem(lbIndex - 1);
    else if (e.key === 'ArrowRight') showItem(lbIndex + 1);
  });

  let rsT = 0;
  window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(build, 150); }, { passive: true });
  build();

  onScene($('#gallery'), () => {
    A.animate('#gallery .chapter', { opacity: [0, 1], y: [22, 0], duration: 900, ease: 'outExpo' });
    A.animate('#galTabs', { opacity: [0, 1], y: [20, 0], duration: 1000, delay: 250, ease: 'outExpo' });
    A.animate('#galStage', { opacity: [0, 1], scale: [0.88, 1], duration: 1500, delay: 400, ease: 'outExpo' });
    A.animate('#galHint', { opacity: [0, 1], duration: 1000, delay: 1400, ease: 'outExpo' });
  });
})();


/* ---- THE SURPRISE (formerly the teaser) ---- */

(function surpriseSection() {
  onScene($('#teaser'), () => {
    A.animate('#teaser .teaser-orn', { opacity: [0, 1], scale: [0.8, 1], duration: 1300, ease: 'outExpo' });
    A.animate('#teaserMsg p', { opacity: [0, 1], y: [26, 0], duration: 1200, delay: A.stagger(520, { start: 700 }), ease: 'outExpo' });
    if (!(V3 || V4)) $$('#teaserMsg p').forEach((p) => { p.style.opacity = '1'; });
  });
})();

/* ---- THE MISCHIEF ---- */

(function mischiefSection() {
  const btnRn = $('#btnRn');
  const btnYes = $('#btnYes');
  const reaction = $('#mischiefReaction');
  const reveal = $('#mischiefReveal');
  if (!btnRn || !btnYes) return;

  let dodges = 0, lastDodge = 0, gone = false;
  const MAX_DODGES = 5;

  function dodge() {
    if (gone) return;
    const now = performance.now();
    if (now - lastDodge < 320) return;
    lastDodge = now;
    if (dodges >= MAX_DODGES) { vanish(); return; }
    dodges++;
    const wrap = btnRn.parentElement;
    const wr = wrap.getBoundingClientRect();
    const br = btnRn.getBoundingClientRect();
    const maxX = Math.max(40, (wr.width - br.width) / 2 - 10);
    const maxY = Math.max(34, (wr.height - br.height) / 2 - 10);
    A.animate(btnRn, { x: rand(-maxX, maxX), y: rand(-maxY, maxY), rotate: rand(-15, 15), scale: rand(0.9, 1.08), duration: 520, ease: 'outBack' });
  }
  function vanish() {
    if (gone) return;
    gone = true;
    A.animate(btnRn, {
      opacity: [1, 0], scale: [1, 0.5], rotate: [0, 24], duration: 620, ease: 'inBack',
      complete: () => { btnRn.style.pointerEvents = 'none'; btnRn.style.visibility = 'hidden'; }
    });
    btnYes.classList.add('highlight');
    A.animate(btnYes, { scale: [1, 1.09, 1], duration: 900, delay: 400, ease: 'outElastic(1, .6)' });
  }

  btnRn.addEventListener('pointerenter', dodge);
  btnRn.addEventListener('pointerdown', (e) => { e.preventDefault(); dodge(); });
  btnRn.addEventListener('click', (e) => { e.preventDefault(); dodge(); });
  btnRn.addEventListener('touchstart', (e) => { e.preventDefault(); dodge(); }, { passive: false });

  const showNow = (el) => { el.hidden = false; el.style.opacity = '1'; };
  btnYes.addEventListener('click', () => {
    if (btnYes.dataset.chosen === '1') return;
    btnYes.dataset.chosen = '1';
    btnYes.classList.remove('highlight');
    A.animate(btnYes, { scale: [1, 1.12, 1], duration: 750, ease: 'outElastic(1,.6)' });

    reaction.hidden = false;
    if (V3 || V4) A.animate(reaction, { opacity: [0, 1], y: [22, 0], scale: [0.94, 1], duration: 1300, ease: 'outExpo' });
    else reaction.style.opacity = '1';

    const READ_TIME = REDUCED ? 1400 : 3400;
    setTimeout(() => {
      reveal.hidden = false;
      reveal.style.opacity = '1';
      const lines = $$('p:not(.next-teaser-line)', reveal);
      const tease = $('#nextTeaser');
      if (!(V3 || V4)) { lines.forEach(showNow); tease.hidden = false; tease.style.opacity = '1'; $('#sealCard').style.opacity = '1'; $$('.seal-redact i').forEach(i => { i.style.transform = 'none'; }); return; }
      A.animate(lines, { opacity: [0, 1], y: [20, 0], duration: 1000, delay: A.stagger(480), ease: 'outExpo' });
      const t0 = 480 * lines.length + 1100;
      tease.hidden = false;
      A.animate(tease, { opacity: [0, 1], y: [26, 0], duration: 1300, delay: t0, ease: 'outExpo' });
      A.animate('#sealCard', { opacity: [0, 1], scale: [0.92, 1], rotateX: [14, 0], duration: 1500, delay: t0 + 700, ease: 'outExpo' });
      A.animate('.seal-redact i', { scaleX: [0, 1], duration: 900, delay: A.stagger(160, { start: t0 + 1500 }), ease: 'outExpo' });
      setTimeout(() => { const c = $('#sealCard'); if (c) c.classList.add('live'); }, t0 + 1500);
    }, READ_TIME);
  });

  const seal = $('#sealCard');
  if (seal && !REDUCED) {
    seal.addEventListener('pointermove', (e) => {
      const r = seal.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      seal.style.setProperty('--ry', (px * 12).toFixed(2) + 'deg');
      seal.style.setProperty('--rx', (-py * 9).toFixed(2) + 'deg');
      seal.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(0) + '%');
    });
    seal.addEventListener('pointerleave', () => { seal.style.setProperty('--ry', '0deg'); seal.style.setProperty('--rx', '0deg'); });
  }

  onScene($('#mischief'), () => {
    A.animate('#mischief .mischief-title', { opacity: [0, 1], y: [30, 0], scale: [0.94, 1], duration: 1200, ease: 'outExpo' });
    A.animate('#mischiefButtons .mbtn', { opacity: [0, 1], y: [26, 0], scale: [0.9, 1], duration: 1000, delay: A.stagger(200, { start: 400 }), ease: 'outBack' });
  });
})();

/* ---------------------------------------------------------------
   FINAL REVEAL — only at the real end of the page
   The heart and every final line stay hidden (but keep their space,
   so nothing jumps) until the visitor has scrolled to the very bottom.
   It plays once and never restarts.
   --------------------------------------------------------------- */
(function finalSection() {
  const section = $('#final');
  if (!section) return;
  const FS = window.FinalState || {};
  let played = false, ticking = false;

  function atEnd() {
    const doc = document.documentElement, vh = window.innerHeight;
    const reached = window.scrollY + vh >= doc.scrollHeight - 24;       // tolerance for mobile toolbars / sub-pixel scroll
    const r = section.getBoundingClientRect();
    return reached && r.top < vh * 0.5 && r.bottom > vh * 0.5;
  }
  function play() {
    played = true;
    window.removeEventListener('scroll', req); window.removeEventListener('resize', req);
    FS.armed = true;
    const D = REDUCED ? 0.3 : 1;
    Love.tween(FS, { gather: 1 },  { duration: 3800 * D, delay: 200,        ease: 'linear' });
    Love.tween(FS, { merge: 1 },   { duration: 1800 * D, delay: 2700 * D,   ease: 'inOutSine' });
    Love.tween(FS, { bloom: 1 },   { duration: 2200 * D, delay: 3900 * D,   ease: 'outCubic' });
    Love.tween(FS, { beatAmp: 1 }, { duration: 1800 * D, delay: 5600 * D,   ease: 'inOutSine' });

    const base = REDUCED ? 900 : 5600;
    A.animate('#fLine1', { opacity: [0, 1], y: [30, 0], duration: 1500, delay: base,        ease: 'outExpo' });
    A.animate('#fLine2', { opacity: [0, 1], y: [30, 0], duration: 1500, delay: base + 1300, ease: 'outExpo' });
    A.animate('#fLine3', { opacity: [0, 1], y: [30, 0], duration: 1500, delay: base + 2600, ease: 'outExpo' });
    A.animate('#fLove',  { opacity: [0, 1], y: [40, 0], scale: [0.88, 1], duration: 2100, delay: base + 4200, ease: 'outExpo' });
    A.animate('#fPs',    { opacity: [0, 1], y: [22, 0], duration: 1500, delay: base + 6000, ease: 'outExpo' });
    if (!(V3 || V4)) $$('.final-line, .final-love, .final-ps', section).forEach((el) => { el.style.opacity = '1'; });
    if (!REDUCED) {
      setTimeout(() => {
        A.animate('#fLove', { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'], duration: 9000, loop: true, ease: 'inOutSine' });
      }, base + 6300);
    }
  }
  function check() { ticking = false; if (!played && atEnd()) play(); }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req, { passive: true });
})();

/* ---------------------------------------------------------------
   CHAPTER BRIDGES — every chapter eases in and out of the next
   --------------------------------------------------------------- */
(function bridges() {
  const targets = $$('.scene').filter(s => s.id !== 'hero').map(s => ({ s, inner: $('.scene-inner, .final-inner', s) })).filter(o => o.inner);
  const dist = $('#distance'), dist3d = $('#distance3d'), fin3d = $('#final3d');
  let ticking = false;
  function update() {
    ticking = false;
    const vh = window.innerHeight;
    targets.forEach((o) => {
      const r = o.s.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) return;
      const e = smooth(clamp((vh - r.top) / (vh * 0.5), 0, 1));
      const x = smooth(clamp(r.bottom / (vh * 0.5), 0, 1));
      const op = Math.min(e, x);
      if (op > 0.995) { o.inner.style.opacity = ''; o.inner.style.transform = ''; }
      else {
        o.inner.style.opacity = op.toFixed(3);
        if (!REDUCED) o.inner.style.transform = 'translate3d(0,' + ((1 - e) * 36 - (1 - x) * 18).toFixed(1) + 'px,0)';
      }
    });
    if (dist && dist3d) {
      const r = dist.getBoundingClientRect();
      dist3d.style.opacity = Math.min(smooth(clamp((vh - r.top) / (vh * 0.6), 0, 1)), smooth(clamp(r.bottom / (vh * 0.6), 0, 1))).toFixed(3);
    }
    if (fin3d) {
      const r = $('#final').getBoundingClientRect();
      fin3d.style.opacity = smooth(clamp((vh - r.top) / (vh * 0.6), 0, 1)).toFixed(3);
    }
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req, { passive: true });
  update();
})();

/* ---------------------------------------------------------------
   BOOT
   --------------------------------------------------------------- */
window.addEventListener('load', () => {
  if (!V4 && !V3) {                     // Anime failed to load: never leave content hidden
    $$('.rv, .hero-copy .hl, .scroll-cue, .capsule-outro, .teaser-msg p').forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
    const b = $('#heroBlack'); if (b) b.classList.add('gone');
  }
});
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
})();