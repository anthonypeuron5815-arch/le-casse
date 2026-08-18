/* ── Sons entièrement synthétisés (aucun asset, 100 % hors ligne)
      + retour haptique quand l'appareil le permet.            ── */

import { store, save } from './util.js';

let ctx = null;
let master = null;
let tension = null;          // nappe de tension pendant la manche

const prefs = () => {
  const s = store();
  return { sound: s.sound !== false, haptics: s.haptics !== false };
};

export const setPref = (k, v) => save({ [k]: v });
export const getPref = (k) => prefs()[k];

/** À appeler sur le premier geste utilisateur (iOS l'exige). */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // amorçage silencieux
    const o = ctx.createOscillator(); const g = ctx.createGain();
    g.gain.value = 0.0001; o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + 0.02);
  } catch { ctx = null; }
}

const ok = () => ctx && prefs().sound;

function tone({ freq = 440, to = null, dur = 0.18, type = 'sine', gain = 0.25, delay = 0, curve = 'exp' }) {
  if (!ok()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency[curve === 'lin' ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.25, gain = 0.2, delay = 0, hp = 400, lp = 6000 }) {
  if (!ok()) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f1 = ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
  const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass';  f2.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

/* ── Haptique ──────────────────────────────── */
export function buzz(pattern) {
  if (!prefs().haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* noop */ }
}

/* ── Effets de jeu ─────────────────────────── */
export const sfx = {
  tap()      { tone({ freq: 520, to: 720, dur: 0.07, type: 'triangle', gain: 0.13 }); buzz(8); },
  ui()       { tone({ freq: 300, to: 420, dur: 0.06, type: 'triangle', gain: 0.10 }); },

  count(n)   {
    tone({ freq: 380 + n * 60, dur: 0.14, type: 'square', gain: 0.16 });
    buzz(18);
  },

  go() {
    tone({ freq: 300, to: 900, dur: 0.35, type: 'sawtooth', gain: 0.16 });
    noise({ dur: 0.3, gain: 0.12, hp: 800 });
    buzz([25, 40, 55]);
  },

  /** nappe de tension : monte en fréquence tant que la manche tourne */
  startTension() {
    if (!ok() || tension) return;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    o.type = 'sawtooth'; o.frequency.value = 52;
    o2.type = 'sine';    o2.frequency.value = 78;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.2);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o.start(); o2.start();
    tension = { o, o2, g, f };
  },
  /** p = 0→1 : intensité de la tension */
  tension(p) {
    if (!tension || !ctx) return;
    const t = ctx.currentTime;
    tension.f.frequency.setTargetAtTime(700 + p * 2200, t, 0.4);
    tension.o.frequency.setTargetAtTime(50 + p * 26, t, 0.6);
    tension.g.gain.setTargetAtTime(0.045 + p * 0.075, t, 0.6);
  },
  stopTension() {
    if (!tension || !ctx) return;
    const { o, o2, g } = tension;
    tension = null;
    try {
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
      o.stop(ctx.currentTime + 0.4); o2.stop(ctx.currentTime + 0.4);
    } catch { /* noop */ }
  },

  cash() {
    tone({ freq: 1180, dur: 0.09, type: 'triangle', gain: 0.16 });
    tone({ freq: 1760, dur: 0.13, type: 'sine', gain: 0.12, delay: 0.05 });
    buzz(14);
  },

  perfect() {
    [0, 0.075, 0.15, 0.24].forEach((d, i) =>
      tone({ freq: [784, 1046, 1318, 1568][i], dur: 0.3, type: 'triangle', gain: 0.2, delay: d }));
    tone({ freq: 2093, dur: 0.5, type: 'sine', gain: 0.14, delay: 0.34 });
    noise({ dur: 0.5, gain: 0.07, hp: 2500, delay: 0.05 });
    buzz([30, 45, 30, 45, 90]);
  },

  alarm() {
    for (let i = 0; i < 5; i++) {
      tone({ freq: 880, to: 440, dur: 0.24, type: 'square', gain: 0.24, delay: i * 0.26, curve: 'lin' });
      tone({ freq: 442, to: 882, dur: 0.24, type: 'sawtooth', gain: 0.12, delay: i * 0.26 + 0.13, curve: 'lin' });
    }
    noise({ dur: 0.6, gain: 0.22, hp: 200, lp: 3000 });
    buzz([90, 60, 90, 60, 200]);
  },

  fake() {
    tone({ freq: 820, to: 500, dur: 0.2, type: 'square', gain: 0.2, curve: 'lin' });
    tone({ freq: 500, to: 820, dur: 0.2, type: 'square', gain: 0.16, delay: 0.2, curve: 'lin' });
    noise({ dur: 0.25, gain: 0.12, hp: 300 });
    buzz([60, 50, 60]);
  },

  event() {
    tone({ freq: 660, to: 990, dur: 0.22, type: 'triangle', gain: 0.16 });
    buzz([20, 30, 20]);
  },

  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      tone({ freq: f, dur: 0.55, type: 'triangle', gain: 0.18, delay: i * 0.11 }));
    noise({ dur: 0.8, gain: 0.06, hp: 3000, delay: 0.2 });
    buzz([40, 60, 40, 60, 40, 60, 180]);
  },

  lose() {
    tone({ freq: 300, to: 110, dur: 0.7, type: 'sawtooth', gain: 0.16, curve: 'lin' });
    buzz([120, 80, 160]);
  }
};

/** petit tic d'accumulation, de plus en plus nerveux */
sfx.tick = (p = 0) => {
  tone({ freq: 900 + p * 700, dur: 0.045, type: 'square', gain: 0.045 + p * 0.03 });
};
