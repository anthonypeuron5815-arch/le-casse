/* ── Petits outils partagés ─────────────────── */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/** 12345 -> "12 345 €" (espace insécable fine) */
export const money = (n) =>
  Math.max(0, Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';

/** 15.94 -> "15,94 s" */
export const secs = (t, d = 2) => t.toFixed(d).replace('.', ',') + ' s';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand  = (a, b) => a + Math.random() * (b - a);
export const pick  = (arr) => arr[(Math.random() * arr.length) | 0];

export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Stockage local tolérant aux pannes ─────── */
const KEY = 'lecasse.v1';
let cache = null;

export function store() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { cache = {}; }
  return cache;
}

export function save(patch) {
  const s = store();
  Object.assign(s, patch);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* mode privé */ }
  return s;
}

export function wipe() {
  cache = {};
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/* ── Couleurs joueurs ───────────────────────── */
export const PALETTE = [
  { key: 'gold',   hex: '#FFC53D', glow: 'rgba(255,197,61,.30)',  dim: 'rgba(255,197,61,.20)',  soft: 'rgba(255,197,61,.11)'  },
  { key: 'blue',   hex: '#38BDF8', glow: 'rgba(56,189,248,.30)',  dim: 'rgba(56,189,248,.20)',  soft: 'rgba(56,189,248,.11)'  },
  { key: 'green',  hex: '#22E39A', glow: 'rgba(34,227,154,.30)',  dim: 'rgba(34,227,154,.20)',  soft: 'rgba(34,227,154,.11)'  },
  { key: 'violet', hex: '#C084FC', glow: 'rgba(192,132,252,.32)', dim: 'rgba(192,132,252,.21)', soft: 'rgba(192,132,252,.12)' },
  { key: 'orange', hex: '#FF7A45', glow: 'rgba(255,122,69,.30)',  dim: 'rgba(255,122,69,.20)',  soft: 'rgba(255,122,69,.11)'  }
];

export const applyColor = (node, i) => {
  const c = PALETTE[i % PALETTE.length];
  node.style.setProperty('--pc', c.hex);
  node.style.setProperty('--pc-glow', c.glow);
  node.style.setProperty('--pc-dim', c.dim);
  node.style.setProperty('--pc-soft', c.soft);
  return c;
};
