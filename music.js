/* music.js — ambient pad + soft bells (Web Audio), toggle button, chapter ducking. Preserved from the prototype. */
(function(){
'use strict';
const {$,rand}=window.Love;
const Music = (function () {
  let ac = null, master = null, padBus = null, started = false, muted = false;
  let chordTimer = null, bellTimer = null;
  let chordIdx = 0;
  let targetLevel = 0.16;
  let currentLevel = 0;

  const CHORDS = [
    [261.63, 329.63, 392.00, 493.88], // Cmaj7
    [220.00, 261.63, 329.63, 392.00], // Am7
    [174.61, 220.00, 261.63, 329.63], // Fmaj7
    [196.00, 246.94, 293.66, 392.00]  // G
  ];
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66];

  function impulse(dur, decay) {
    const rate = ac.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = ac.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    ac = new AC();

    master = ac.createGain();
    master.gain.value = 0.0001;
    master.connect(ac.destination);

    const conv = ac.createConvolver();
    conv.buffer = impulse(3.4, 2.8);
    const wet = ac.createGain();
    wet.gain.value = 0.6;
    conv.connect(wet);
    wet.connect(master);

    padBus = ac.createGain();
    padBus.gain.value = 0.9;
    padBus.connect(conv);
    padBus.connect(master);

    return true;
  }

  function playChord(freqs, at, dur) {
    freqs.forEach(function (f, i) {
      const o = ac.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = ac.createGain();
      const peak = 0.085 / (1 + i * 0.42);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + dur * 0.38);
      g.gain.linearRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(padBus);
      o.start(at);
      o.stop(at + dur + 0.15);
    });
  }

  function playBell(at) {
    const f = PENTA[Math.floor(Math.random() * PENTA.length)];
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;

    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.005;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.05, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 3.6);

    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.0001, at);
    g2.gain.linearRampToValueAtTime(0.014, at + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);

    o.connect(g); g.connect(padBus);
    o2.connect(g2); g2.connect(padBus);

    o.start(at); o.stop(at + 4);
    o2.start(at); o2.stop(at + 2.6);
  }

  function scheduleChords() {
    if (!ac) return;
    const at = ac.currentTime + 0.05;
    playChord(CHORDS[chordIdx], at, 9.6);
    chordIdx = (chordIdx + 1) % CHORDS.length;
    chordTimer = setTimeout(scheduleChords, 7400);
  }

  function scheduleBells() {
    if (!ac) return;
    if (!muted && Math.random() < 0.75) {
      playBell(ac.currentTime + 0.05);
    }
    bellTimer = setTimeout(scheduleBells, rand(4200, 9000));
  }

  function fadeTo(v, dur) {
    if (!master || !ac) return;
    const now = ac.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(Math.max(0.0001, v), now + dur);
  }

  function start() {
    if (started) return;
    if (!init()) return;
    started = true;
    if (ac.state === 'suspended') ac.resume();
    scheduleChords();
    scheduleBells();
    fadeTo(targetLevel, 3.2);
    const btn = $('#musicToggle');
    if (btn) btn.classList.add('on');
  }

  function toggle() {
    if (!started) { start(); return; }
    muted = !muted;
    fadeTo(muted ? 0.0001 : targetLevel, 0.9);
    const btn = $('#musicToggle');
    if (btn) btn.classList.toggle('on', !muted);
  }

  function setLevel(v) {
    targetLevel = v;
    if (!started || muted) return;
    fadeTo(v, 2.4);
  }

  return { start, toggle, setLevel, isStarted: () => started };
})();

/* music toggle button */
(function musicUI() {
  const btn = $('#musicToggle');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    Music.toggle();
  });

  // start after the first real user interaction (browser autoplay policy)
  const kick = () => {
    Music.start();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
    window.removeEventListener('touchstart', kick);
    window.removeEventListener('wheel', kick);
  };
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('keydown', kick);
  window.addEventListener('touchstart', kick, { passive: true });
  window.addEventListener('wheel', kick, { passive: true });
})();

/* duck the music during the emotional chapters */
(function musicDucking() {
  const soft = [$('#heart2heart'), $('#becoming'), $('#teaser'), $('#final')];
  const obs = new IntersectionObserver((entries) => {
    let anySoft = false;
    entries.forEach((en) => {
      en.target.dataset.soft = en.isIntersecting ? '1' : '0';
    });
    soft.forEach((el) => { if (el && el.dataset.soft === '1') anySoft = true; });
    Music.setLevel(anySoft ? 0.095 : 0.16);
  }, { threshold: 0.3 });

  soft.forEach((el) => { if (el) obs.observe(el); });
})();
})();
