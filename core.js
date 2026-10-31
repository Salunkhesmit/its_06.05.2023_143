/* ================================================================
   core.js — shared helpers, Anime.js adapter, scene observer.
   Exposes window.Love for every other script. No build step needed.
   ================================================================ */
(function () {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
const isMobile = () => window.innerWidth < 768;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const AN = window.anime || null;
const V4 = !!(AN && typeof AN.animate === 'function');
const V3 = !!(AN && typeof AN === 'function' && !V4);

if (!V4 && !V3) document.documentElement.classList.add('no-anim');

function easeName(n) {
  if (!n) return 'linear';
  if (V4 || n === 'linear') return n;
  return 'ease' + n.charAt(0).toUpperCase() + n.slice(1);
}
function normParams(p) {
  if (V4) return p;
  const o = Object.assign({}, p);
  if (o.ease) { o.easing = easeName(o.ease); delete o.ease; }
  return o;
}

const A = {
  animate(targets, params) {
    if (!targets) return null;
    if (typeof targets === 'string' && !document.querySelector(targets)) return null;
    const p = normParams(params || {});
    try {
      if (V4) return AN.animate(targets, p);
      if (V3) return AN(Object.assign({ targets }, p));
    } catch (e) { /* silently ignore */ }
    return null;
  },
  stagger(v, o) {
    if (AN && typeof AN.stagger === 'function') return AN.stagger(v, o);
    return (el, i) => (typeof v === 'number' ? v * i : 0);
  },
  timeline(opts) {
    opts = opts || {};
    let inner = null;
    try {
      if (V4 && typeof AN.createTimeline === 'function') inner = AN.createTimeline(opts);
      else if (V3 && AN.timeline) inner = AN.timeline(opts);
    } catch (e) { inner = null; }

    const queue = [];
    const api = {
      add(targets, params, position) {
        const pos = position || 0;
        if (inner) {
          try {
            if (V4) inner.add(targets, normParams(params || {}), pos);
            else inner.add(Object.assign({ targets }, normParams(params || {})), pos);
          } catch (e) {}
        } else {
          queue.push({ targets, params: params || {}, position: pos });
        }
        return api;
      },
      play() {
        if (inner) { if (inner.play) inner.play(); return api; }
        queue.forEach(q => {
          const p = Object.assign({}, q.params);
          p.delay = (p.delay || 0) + q.position;
          A.animate(q.targets, p);
        });
        return api;
      }
    };
    return api;
  }
};

const sceneHandlers = new WeakMap();
const observed = new WeakSet();

const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target;
    if (observed.has(el)) return;
    observed.add(el);
    const fn = sceneHandlers.get(el);
    if (fn) fn();
    io.unobserve(el);
  });
}, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

function onScene(el, fn) {
  if (!el) return;
  sceneHandlers.set(el, fn);
  io.observe(el);
}

function revealGroup(scope, selector, opts) {
  opts = opts || {};
  const els = $$(selector, scope);
  if (!els.length) return;
  A.animate(els, {
    opacity: [0, 1],
    y: [opts.y === undefined ? 36 : opts.y, 0],
    scale: [opts.scale === undefined ? 1 : opts.scale, 1],
    duration: opts.duration || 1150,
    delay: A.stagger(opts.stagger || 130, { start: opts.start || 0 }),
    ease: opts.ease || 'outExpo'
  });
}

/* ---- tiny rAF tween for plain state objects (works even if Anime fails) ---- */
const EASE = {
  linear: t => t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outQuad: t => 1 - (1 - t) * (1 - t),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
};
function tween(obj, props, opts) {
  opts = opts || {};
  const dur = Math.max(1, opts.duration || 1000);
  const ease = EASE[opts.ease] || EASE.outCubic;
  const keys = Object.keys(props), from = {};
  let start = 0, dead = false;
  function step(now) {
    if (dead) return;
    const t = clamp((now - start) / dur, 0, 1), e = ease(t);
    keys.forEach(k => { obj[k] = lerp(from[k], props[k], e); });
    if (opts.onUpdate) opts.onUpdate(obj);
    if (t < 1) requestAnimationFrame(step); else if (opts.onDone) opts.onDone(obj);
  }
  setTimeout(function () {
    if (dead) return;
    keys.forEach(k => { from[k] = obj[k]; });
    start = performance.now();
    requestAnimationFrame(step);
  }, opts.delay || 0);
  return { cancel() { dead = true; } };
}

window.Love = { $, $$, clamp, lerp, rand, smoothstep, isMobile, REDUCED, A, V4, V3, tween, onScene, revealGroup, sceneHandlers, io };
})();
