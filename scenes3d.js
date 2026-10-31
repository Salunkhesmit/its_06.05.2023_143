/* ================================================================
   scenes3d.js — Three.js scenes for chapters 1, 2, 6 and 11.
   Each scene owns a lazy WebGL stage (renderer exists only while the
   section is near the viewport) and reads shared state objects that
   chapters.js drives: HeroState, WorldState, FinalState.
   ================================================================ */
(function () {
'use strict';
const HK = window.HeartKit, L = window.Love, T = window.THREE;
if (!HK || !L || !T) return;
const { $, $$, clamp, lerp, rand, smoothstep, isMobile, REDUCED } = L;
const TAU = Math.PI * 2;
const fract = v => v - Math.floor(v);

/* =========================== CHAPTER 1 — OPENING HEART ===========================
   The heart sits above the middle of the screen (the parchment lands below it).
   HeroState.rect exposes the heart's live screen position/size so the bow-and-arrow
   layer (chapters.js) can hit-test it and draw the crack at the real impact point. */
const HeroState = window.HeroState = {
  emerge: 0, tmx: 0, tmy: 0, mx: 0, my: 0,
  calm: 0,            // 0..1  heart stops swaying once the game starts (keeps the crack aligned)
  beatScale: 1,       // heartbeat strength (softens after the hit)
  kick: 0, kdx: 0, kdy: 0,   // impact jolt (0..1) and its screen direction
  rect: { cx: 0, cy: 0, r: 0, ok: false }
};
(function () {
  const host = $('#hero3d'); if (!host) return;
  const S = HK.stage(host, { fov: 32, z: 10, target: $('#hero'), margin: '0px' });
  const H = HK.heart({ transparent: true });
  const mat = H.userData.material;
  const halo = HK.glow(0xff7aa2, 0); halo.position.z = -1.6;
  S.scene.add(H, halo);
  const lt = S.lights;
  const v1 = new T.Vector3(), v2 = new T.Vector3();

  S.onFrame = function () {
    const e = HeroState.emerge, t = S.time;
    const eo = 1 - Math.pow(1 - e, 2.4);
    const lightK = smoothstep(0.05, 0.95, e);
    const vis = S.visible(0);
    const sc = Math.min(1.2, vis.w * 0.26);
    const beatAmp = smoothstep(0.93, 1, e);
    const b = REDUCED ? 0 : HK.beat(t, 64) * beatAmp * HeroState.beatScale;
    const calm = HeroState.calm;

    HK.pump(H, lerp(0.8, 1, eo) * sc, b);
    S.camera.position.z = lerp(12.5, 10, eo);

    // heart centre sits ~38% down the first screen; impact jolt nudges it away from the arrow
    const yOff = vis.h * 0.12;
    const k = HeroState.kick * sc * 0.14;
    H.position.set(HeroState.kdx * k, yOff - HeroState.kdy * k, 0);
    halo.position.x = H.position.x; halo.position.y = H.position.y;

    const sweep = smoothstep(0.05, 0.85, e), settle = smoothstep(0.8, 1, e);
    lt.rim.position.set(lerp(lerp(-9, 9, sweep), 5, settle), lerp(1.5, 1, settle), lerp(2, -3, settle));
    lt.rim.intensity = lerp(2.4 * Math.sin(Math.PI * sweep), 1.1, settle);
    lt.key.intensity = 1.5 * lightK; lt.fill.intensity = 0.5 * lightK; lt.amb.intensity = 0.4 * lightK;
    mat.opacity = smoothstep(0, 0.5, e);
    mat.envMapIntensity = 1.15 * lightK;
    mat.emissiveIntensity = 0.5 * lightK + 0.25 * b;

    halo.scale.setScalar(7 * sc);
    halo.material.opacity = (0.22 + 0.2 * b) * smoothstep(0.25, 1, e);

    HeroState.mx = lerp(HeroState.mx, HeroState.tmx, 0.05);
    HeroState.my = lerp(HeroState.my, HeroState.tmy, 0.05);
    const sway = 1 - calm;
    H.rotation.y = (HeroState.mx * 0.24 + Math.sin(t * 0.3) * 0.05) * sway + Math.sin(t * 0.3) * 0.015 * calm;
    H.rotation.x = -HeroState.my * 0.12 * sway;

    // live screen rect of the heart (host pixels) — consumed by the opening interaction
    S.camera.updateMatrixWorld();
    v1.set(H.position.x, H.position.y, 0).project(S.camera);
    v2.set(H.position.x + H.scale.x, H.position.y, 0).project(S.camera);
    const R = HeroState.rect;
    R.cx = (v1.x * 0.5 + 0.5) * S.w;
    R.cy = (-v1.y * 0.5 + 0.5) * S.h;
    R.r = Math.abs((v2.x * 0.5 + 0.5) * S.w - R.cx);
    R.ok = e > 0.985 && S.active;
  };
})();

/* =========================== CHAPTER 2 — YOU ARE MY WORLD =========================== */
const WorldState = window.WorldState = { active: -1, el: null, amp: 0, phase: 0 };
(function () {
  const host = $('#world3d'); if (!host) return;
  const S = HK.stage(host, { fov: 36, z: 11, target: $('#world') });
  const H = HK.heart(); S.scene.add(H);

  // independent orbital rings (they never share the heart's transform)
  const rings = new T.Group(); S.scene.add(rings);
  const ringMat = new T.MeshBasicMaterial({ color: 0xe27a9c, transparent: true, opacity: 0.5, blending: T.NormalBlending, depthWrite: false });
  const spec = [
    { r: 2.1, tilt: [1.15, 0.2], speed: 0.32 },
    { r: 2.7, tilt: [0.35, 0.9], speed: -0.22 },
    { r: 3.3, tilt: [-0.75, 0.5], speed: 0.16 }
  ];
  const ringObjs = spec.map(function (s, i) {
    const pivot = new T.Group();
    pivot.rotation.set(s.tilt[0], s.tilt[1], 0);
    const spin = new T.Group();
    spin.add(new T.Mesh(new T.TorusGeometry(s.r, 0.014, 8, 160), ringMat));
    const beadMat = new T.MeshStandardMaterial({ color: 0xf08aa8, emissive: 0x7a1a3c, emissiveIntensity: 0.7, roughness: 0.4 });
    for (let k = 0; k < 2; k++) {                       // tiny orbiting hearts
      const bead = new T.Mesh(HK.geometry('lo'), beadMat);
      const a = (k / 2) * TAU + i;
      bead.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r, 0);
      bead.scale.setScalar(0.1);
      spin.add(bead);
    }
    pivot.add(spin); rings.add(pivot);
    return { spin, speed: s.speed };
  });

  const BPM = [52, 60, 84, 64, 56, 72];                 // every word has its own pulse
  const AMP = [0.9, 0.8, 1.15, 0.85, 0.8, 1];
  window.addEventListener('world:focus', function (ev) {
    const d = ev.detail || {};
    if (d.on) { WorldState.active = d.index; WorldState.el = d.el; WorldState.phase = 0; }   // hover = first beat starts immediately
    else if (WorldState.active === d.index) WorldState.active = -1;
  });

  S.onFrame = function () {
    const dt = S.dt, on = WorldState.active >= 0;
    WorldState.amp += ((on ? 1 : 0) - WorldState.amp) * (1 - Math.exp(-dt * (on ? 10 : 3)));
    if (on && !REDUCED) WorldState.phase += (dt * BPM[WorldState.active]) / 60;
    const amp = on ? AMP[WorldState.active] : 1;
    const b = REDUCED ? 0.6 * WorldState.amp : HK.beatPhase(WorldState.phase) * WorldState.amp;

    const vis = S.visible(0);
    const sc = (vis.h * 0.27) / 1.81;
    H.rotation.set(0, 0, 0);                            // orientation is fixed — never rotates
    HK.pump(H, sc * (1 + 0.006 * Math.sin(S.time * 1.1)), b, amp);
    S.lights.key.intensity = 1.5 + 0.9 * b;
    H.userData.material.emissiveIntensity = 0.55 + 0.7 * b;

    const k = Math.min(sc / 1.05, (vis.w * 0.47) / 3.3);
    rings.scale.setScalar(k);
    ringObjs.forEach(function (r) { r.spin.rotation.z += dt * r.speed; });

    if (WorldState.el) WorldState.el.style.setProperty('--beat', (b * WorldState.amp).toFixed(3));
    if (!on && WorldState.amp < 0.01 && WorldState.el) { WorldState.el.style.setProperty('--beat', '0'); WorldState.el = null; }
  };
})();

/* =========================== CHAPTER 6 — THE DISTANCE =========================== */
(function () {
  const host = $('#distance3d'), wrap = $('#distance'); if (!host || !wrap) return;
  const sticky = $('.distance-sticky', wrap);
  const texts = $$('.distance-texts p', wrap).map(function (el) {
    return { el: el, a: parseFloat(el.dataset.th), b: parseFloat(el.dataset.end) };
  });
  const CAM_Z = 15.5;
  const S = HK.stage(host, { fov: 38, z: CAM_Z, target: wrap, margin: '240px 0px' });
  const world = new T.Group(); world.position.y = 0.55; S.scene.add(world);

  const HL = HK.heart({ transparent: true }), HR = HK.heart({ transparent: true });
  const gl = HK.glow(0xff6f9a, 0.5), gr = HK.glow(0xff6f9a, 0.5);
  world.add(HL, HR, gl, gr);

  /* the rest of the world: hundreds of small instanced hearts */
  const N = isMobile() ? 240 : 520;
  const smat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.05, emissive: 0x5a1230, emissiveIntensity: 0.9 });
  const inst = new T.InstancedMesh(HK.geometry('lo'), smat, N);
  inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
  inst.frustumCulled = false;
  world.add(inst);
  const palette = [0xff9ab5, 0xe75480, 0xffc2d4, 0xe8c49c, 0xc03a68, 0xff7aa2].map(function (c) { return new T.Color(c); });
  const D = [];
  for (let i = 0; i < N; i++) { D.push({}); inst.setColorAt(i, palette[i % palette.length]); }
  inst.instanceColor.needsUpdate = true;

  const G = { hw: 9.5, hh: 5.3, X0: 6.4, hs: 1, W0: 2 };
  function gen() {
    for (let i = 0; i < N; i++) {
      const d = D[i];
      let x, y, z, tries = 0;
      const corridor = i < N * 0.35;                    // a third of them live between the two hearts
      do {
        z = rand(-8, 3.2);
        const f = (CAM_Z - z) / CAM_Z;
        if (corridor) { x = rand(-G.X0, G.X0); y = rand(-G.hh * 0.5, G.hh * 0.5) * f; }
        else { x = rand(-1.05, 1.05) * G.hw * f; y = rand(-1, 1) * G.hh * 0.98 * f; }
        tries++;
      } while (tries < 14 && z > -3 && (Math.hypot(Math.abs(x) - G.X0, y) < 1.7 * G.hs));
      d.x = x; d.y = y; d.z = z;
      d.size = rand(0.09, 0.24); d.ph = rand(0, TAU); d.spin = rand(-1, 1);
      d.delay = Math.random(); d.ang = rand(0, TAU);
      d.dx = Math.cos(d.ang); d.dy = Math.sin(d.ang);
    }
  }
  S.onResize = function () {
    const v = S.visible(0);
    G.hw = v.w / 2; G.hh = v.h / 2;
    G.X0 = clamp(G.hw * 0.72, 2.0, 6.4);
    G.hs = clamp(G.X0 * 0.16, 0.5, 1);
    G.W0 = Math.min(2.0, G.hh * 0.38);
    gen();
  };
  gen();

  /* the single glowing thread — a thin square tube rebuilt every frame so it can weave and relax */
  const SEG = 220;
  function makeTube(r, color, opacity) {
    const pos = new Float32Array(SEG * 4 * 3), idx = [];
    for (let i = 0; i < SEG - 1; i++) for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = (i + 1) * 4 + k, d = (i + 1) * 4 + (k + 1) % 4;
      idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, blending: T.NormalBlending, depthWrite: false, side: T.DoubleSide }));
    m.frustumCulled = false;
    world.add(m);
    return { mesh: m, pos: pos, g: g, r: r };
  }
  const core = makeTube(0.024, 0xffd6e4, 0.95), halo = makeTube(0.13, 0xff7aa2, 0.2);
  const PALE = new T.Color(0xffe4ec), DEEP = new T.Color(0xd9486b), HPALE = new T.Color(0xff8fb0), HDEEP = new T.Color(0xe86a8e);
  const tip = HK.glow(0xffc2d4, 0), pulseA = HK.glow(0xff8fb0, 0), pulseB = HK.glow(0xff8fb0, 0);
  world.add(tip, pulseA, pulseB);

  const st = { P: 0, X: 6.4, hs: 1, weave: 1, t: 0 };
  function pathAt(u, out) {
    const xl = -st.X + st.hs * 0.82, xr = st.X - st.hs * 0.82;
    const env = Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.85);
    const W = G.W0 * st.weave, t = st.t;
    out[0] = lerp(xl, xr, u);
    out[1] = W * (0.8 * Math.sin(TAU * 1.35 * u + 0.6 + t * 0.35) + 0.35 * Math.sin(TAU * 3.1 * u + 1.7 - t * 0.5)) * env;
    out[2] = W * 1.1 * Math.sin(TAU * 1.8 * u + 1.1 + t * 0.28) * env;
    return out;
  }
  const pt = [0, 0, 0];
  function fillTube(tube, drawU) {
    const p = tube.pos, r = tube.r;
    for (let i = 0; i < SEG; i++) {
      pathAt(i / (SEG - 1), pt);
      const o = i * 12;
      p[o] = pt[0]; p[o + 1] = pt[1] + r; p[o + 2] = pt[2];
      p[o + 3] = pt[0]; p[o + 4] = pt[1]; p[o + 5] = pt[2] + r;
      p[o + 6] = pt[0]; p[o + 7] = pt[1] - r; p[o + 8] = pt[2];
      p[o + 9] = pt[0]; p[o + 10] = pt[1]; p[o + 11] = pt[2] - r;
    }
    tube.g.attributes.position.needsUpdate = true;
    tube.g.setDrawRange(0, Math.max(0, Math.floor(drawU * (SEG - 1)) - 1) * 24);
  }

  const dummy = new T.Object3D();
  const pz = [0, 0, 0];
  const mid = new T.Vector3();

  S.onFrame = function () {
    const t = S.time, dt = S.dt;
    st.t = t;
    // scroll progress (smoothed) drives everything so visuals and words stay in sync
    const r = wrap.getBoundingClientRect();
    const raw = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
    st.P += (raw - st.P) * (REDUCED ? 1 : 1 - Math.exp(-dt * 8));
    const P = st.P;

    /* the two main hearts arrive first — they fade in while the page darkens on approach */
    const pre = clamp(1 - r.top / (window.innerHeight * 0.9), 0, 1);
    const mainIn = smoothstep(0.35, 1, pre);
    const smallIn = smoothstep(0.05, 0.42, P);          // ...then the small hearts are introduced
    const draw = smoothstep(0.16, 0.6, P);              // the thread draws itself
    const close = smoothstep(0.42, 0.9, P);             // the two hearts drift together
    const quiet = smoothstep(0.46, 0.9, P);             // the small world falls away
    const sync = smoothstep(0.86, 0.93, P);             // final shared heartbeat
    const lt2 = smoothstep(0.5, 0.95, P);               // scene brightens: thread turns from pale to rose
    st.weave = 1 - 0.9 * smoothstep(0.45, 0.95, P);
    st.hs = G.hs;
    st.X = lerp(G.X0, 1.55 * G.hs, close);

    S.camera.position.z = lerp(CAM_Z, 13.2, smoothstep(0.55, 1, P));

    /* main hearts */
    const beatBase = 0.5 + 0.5 * sync;
    const bpm = 66, off = lerp(0.3, 0, sync);
    const bL = REDUCED ? 0 : HK.beat(t, bpm, 0) * beatBase;
    const bR = REDUCED ? 0 : HK.beat(t, bpm, off) * beatBase;
    HL.position.set(-st.X, 0, 0); HR.position.set(st.X, 0, 0);
    HK.pump(HL, G.hs * lerp(0.7, 1, mainIn), bL); HK.pump(HR, G.hs * lerp(0.7, 1, mainIn), bR);
    HL.userData.material.opacity = HR.userData.material.opacity = mainIn;
    const turn = lerp(0.5, 0.14, close);
    HL.rotation.y = turn + Math.sin(t * 0.3) * 0.05;
    HR.rotation.y = -turn - Math.sin(t * 0.3 + 1) * 0.05;
    HL.userData.material.emissiveIntensity = HR.userData.material.emissiveIntensity = lerp(0.45, 0.8, quiet);
    gl.position.set(-st.X, 0, -1); gr.position.set(st.X, 0, -1);
    const gs = lerp(4.2, 6.2, quiet) * G.hs;
    gl.scale.setScalar(gs * (1 + 0.12 * bL)); gr.scale.setScalar(gs * (1 + 0.12 * bR));
    gl.material.opacity = mainIn * lerp(0.3, 0.5, quiet) * (0.8 + 0.2 * bL);
    gr.material.opacity = mainIn * lerp(0.3, 0.5, quiet) * (0.8 + 0.2 * bR);

    /* lighting: the environment quiets, the connection glows */
    S.lights.amb.intensity = lerp(0.45, 0.3, quiet);
    S.lights.key.intensity = lerp(1.5, 1.1, quiet);
    smat.emissiveIntensity = lerp(0.9, 0.55, quiet);

    /* thread */
    fillTube(core, draw); fillTube(halo, draw);
    const pulse = sync * (0.5 + 0.5 * HK.beat(t, bpm, 0));
    core.mesh.material.color.lerpColors(PALE, DEEP, lt2);
    halo.mesh.material.color.lerpColors(HPALE, HDEEP, lt2);
    core.mesh.material.opacity = 0.85 + 0.15 * pulse;
    halo.mesh.material.opacity = 0.16 + 0.14 * pulse + 0.06 * quiet;
    const showTip = draw > 0.004 && draw < 0.996;
    if (showTip) { pathAt(draw, pt); tip.position.set(pt[0], pt[1], pt[2]); }
    tip.material.opacity = showTip ? 0.9 * mainIn : 0; tip.scale.setScalar(0.9 + 0.2 * Math.sin(t * 6));
    // after the heartbeat sync, light travels along the thread from both hearts
    const tp = fract((t * bpm) / 60);
    const showPulse = sync > 0.4 && tp < 0.55;
    if (showPulse) {
      const k = tp / 0.55;
      pathAt(k * 0.5, pt); pulseA.position.set(pt[0], pt[1], pt[2]);
      pathAt(1 - k * 0.5, pt); pulseB.position.set(pt[0], pt[1], pt[2]);
    }
    pulseA.material.opacity = pulseB.material.opacity = showPulse ? 0.9 * sync : 0;
    pulseA.scale.setScalar(0.7); pulseB.scale.setScalar(0.7);

    /* the surrounding world */
    const xl = -st.X + st.hs * 0.82, xr = st.X - st.hs * 0.82, span = xr - xl;
    for (let i = 0; i < N; i++) {
      const d = D[i];
      const f = (1 - smoothstep(d.delay * 0.55, d.delay * 0.55 + 0.4, quiet)) * smoothstep(d.delay * 0.6, d.delay * 0.6 + 0.4, smallIn);   // late introduction + fade-away
      let x = d.x + Math.sin(t * 0.4 + d.ph) * 0.12 + d.dx * (1 - f) * 2.2;
      let y = d.y + Math.sin(t * 0.5 + d.ph * 1.3) * 0.14 + d.dy * (1 - f) * 2.2;
      const z = d.z - (1 - f) * 3;
      const s = d.size * f;
      if (draw > 0.01 && s > 0.002) {                   // hearts part around the thread as it passes
        const u = (x - xl) / span;
        if (u > 0 && u < draw) {
          pathAt(u, pz);
          const dy = y - pz[1], dz = z - pz[2], dist = Math.hypot(dy, dz);
          if (dist < 1.0) { const k = (1 - dist / 1.0); y += (dy >= 0 ? 1 : -1) * k * k * 0.55; }
        }
      }
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.sin(t * 0.4 * d.spin + d.ph) * 0.9, Math.sin(t * 0.3 + d.ph) * 0.18);
      dummy.scale.setScalar(Math.max(s, 0.0001));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;

    /* words */
    texts.forEach(function (tx) {
      const fin = smoothstep(tx.a, tx.a + 0.05, P), fout = 1 - smoothstep(tx.b - 0.05, tx.b, P);
      const o = Math.min(fin, fout);
      tx.el.style.opacity = o.toFixed(3);
      tx.el.style.transform = 'translateY(' + ((1 - fin) * 14 - (1 - fout) * 8).toFixed(1) + 'px)';
      tx.el.style.visibility = o < 0.003 ? 'hidden' : 'visible';
    });
    if (sticky) sticky.style.setProperty('--quiet', quiet.toFixed(3));
  };
})();

/* =========================== CHAPTER 11 — FINAL HEART =========================== */
const FinalState = window.FinalState = { gather: 0, merge: 0, bloom: 0, beatAmp: 0, armed: false };   // armed = end of page reached
(function () {
  const host = $('#final3d'), section = $('#final'), ph = $('#finalHeart');
  if (!host || !section || !ph) return;
  const S = HK.stage(host, { fov: 34, z: 14, target: section, margin: '80px 0px' });
  const G = new T.Group(); S.scene.add(G);

  const core = HK.heart({ transparent: true }), mL = HK.heart({ transparent: true, quality: 'lo' }), mR = HK.heart({ transparent: true, quality: 'lo' });
  const halo = HK.glow(0xff7aa2, 0), flash = HK.glow(0xffc2d4, 0);
  halo.position.z = -1.3; flash.position.z = 0.8;
  G.add(halo, core, mL, mR, flash);

  /* a carefully defined, perfectly symmetric heart-shaped target distribution */
  const N = isMobile() ? 360 : 720, M = N >> 1;
  const arc = HK.arcTable(), tmp = [0, 0, 0];
  const targets = new Float32Array(N * 3), starts = new Float32Array(N * 3);
  const P = [];
  const rimN = Math.floor(M * 0.3);
  for (let m = 0; m < M; m++) {
    if (m < rimN) HK.heartPoint(arc.tAt((m + 0.5) / rimN), Math.PI / 2 + (Math.random() - 0.5) * 0.45, tmp);  // crisp silhouette
    else {
      const j = m - rimN;
      const t = arc.tAtArea(fract(0.5 + 0.7548776662 * j)), u = fract(0.5 + 0.5698402910 * j);
      let phi = Math.asin(Math.sqrt(u) * 0.985);
      if (j & 1) phi = Math.PI - phi;                   // front and back surfaces
      HK.heartPoint(t, phi, tmp);
    }
    [1, -1].forEach(function (sx, side) {               // mirrored => exact left/right symmetry
      const i = m * 2 + side;
      targets[i * 3] = tmp[0] * sx; targets[i * 3 + 1] = tmp[1]; targets[i * 3 + 2] = tmp[2];
      const rr = rand(6, 12), az = rand(0, TAU);
      starts[i * 3] = Math.cos(az) * rr; starts[i * 3 + 1] = Math.sin(az) * rr * 0.6; starts[i * 3 + 2] = rand(-5, 6);
      P.push({
        delay: Math.random() * 0.5, swirl: rand(-1.6, 1.6), ph: rand(0, TAU),
        size: (m < rimN ? 0.085 : 0.115) * rand(0.85, 1.25), rim: m < rimN
      });
    });
  }
  const pmat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.08, emissive: 0x5a1230, emissiveIntensity: 0.9 });
  const inst = new T.InstancedMesh(HK.geometry('lo'), pmat, N);
  inst.instanceMatrix.setUsage(T.DynamicDrawUsage); inst.frustumCulled = false;
  const pal = [0xff9ab5, 0xe75480, 0xffc2d4, 0xff7aa2, 0xe8c49c].map(function (c) { return new T.Color(c); });
  P.forEach(function (p, i) { inst.setColorAt(i, p.rim ? new T.Color(0xffd1e0) : pal[i % pal.length]); });
  inst.instanceColor.needsUpdate = true;
  G.add(inst);

  const dummy = new T.Object3D();
  const ease = function (x) { return x * x * (3 - 2 * x); };

  S.onFrame = function () {
    const t = S.time;
    inst.visible = FinalState.armed;
    // sit the heart exactly where the page reserves room for it
    const sr = section.getBoundingClientRect(), pr = ph.getBoundingClientRect();
    const vis = S.visible(0);
    const cx = (pr.left + pr.width / 2 - sr.left) / sr.width, cy = (pr.top + pr.height / 2 - sr.top) / sr.height;
    G.position.set((cx - 0.5) * vis.w, -(cy - 0.5) * vis.h, 0);
    const unit = Math.min(((pr.height / sr.height) * vis.h) / 1.81, vis.w * 0.28);

    const g = FinalState.gather, mg = FinalState.merge, bl = FinalState.bloom;
    const b = REDUCED ? 0 : HK.beat(t, 58) * FinalState.beatAmp;
    G.scale.setScalar(unit * (1 + 0.03 * b));
    G.rotation.y = Math.sin(t * 0.35) * 0.22;
    G.rotation.x = Math.sin(t * 0.27) * 0.05;

    /* the particles */
    for (let i = 0; i < N; i++) {
      const p = P[i];
      const local = clamp((g - p.delay) / (1 - p.delay * 0.9), 0, 1);
      const e = ease(local) * (2 - ease(local)) ; // soft in, firm landing
      const ang = (1 - e) * p.swirl;
      const sx = starts[i * 3], sy = starts[i * 3 + 1], sz = starts[i * 3 + 2];
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const k = 1 + 0.045 * b;
      const x = lerp(sx * ca - sy * sa, targets[i * 3] * k, e);
      const y = lerp(sx * sa + sy * ca, targets[i * 3 + 1] * k, e);
      const z = lerp(sz, targets[i * 3 + 2] * k, e);
      const shimmer = Math.sin(t * 0.9 + p.ph) * 0.012 * e;
      dummy.position.set(x + shimmer, y + shimmer, z);
      dummy.rotation.set(0, Math.sin(t * 0.5 + p.ph) * 0.5 * e, (1 - e) * p.swirl);
      dummy.scale.setScalar(p.size * (0.3 + 0.7 * smoothstep(0, 0.25, local)) * (1 + 0.2 * b));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;

    /* two hearts (from the distance chapter) merge into one */
    const sep = lerp(2.6, 0, smoothstep(0, 0.75, mg)), om = Math.sin(Math.PI * clamp(mg, 0, 1));
    mL.position.set(-sep, 0.05, 0.4); mR.position.set(sep, 0.05, 0.4);
    mL.scale.setScalar(0.5); mR.scale.setScalar(0.5);
    mL.userData.material.opacity = mR.userData.material.opacity = om;
    mL.visible = mR.visible = om > 0.01;
    const fl = Math.sin(Math.PI * clamp((mg - 0.7) / 0.3, 0, 1));
    flash.scale.setScalar(2 + 5 * fl); flash.material.opacity = 0.85 * fl;

    /* the solid, glossy heart that gives the mosaic real volume */
    const eb = 1 - Math.pow(1 - bl, 3);
    core.scale.setScalar(0.945 * lerp(0.6, 1, eb));
    core.userData.material.opacity = 0.9 * smoothstep(0, 0.7, bl);
    core.userData.material.emissiveIntensity = 0.5 + 0.5 * b;
    core.visible = bl > 0.002;
    halo.scale.setScalar(7.2);
    halo.material.opacity = (0.22 + 0.32 * b) * smoothstep(0.1, 1, bl);

    section.style.setProperty('--beat', b.toFixed(3));
  };
})();
})();