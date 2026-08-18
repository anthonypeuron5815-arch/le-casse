/* ── Moteur de jeu : butin, alarme, zone parfaite, événements ──
      Aucune dépendance au DOM : testable et réutilisable.       */

import { rand, clamp } from './util.js';

export const MODES = {
  classic: {
    id: 'classic', label: 'CLASSIQUE',
    alarm: () => 6.5 + Math.pow(Math.random(), 0.85) * 15.5,   // ~6,5 s → 22 s
    perfectWindow: 1.6,
    fakeChance: 0.25,          // une fausse alarme de temps en temps
    maxEvents: 1,
    eventTypes: ['fake']
  },
  chaos: {
    id: 'chaos', label: 'CHAOS',
    alarm: () => 4.5 + Math.pow(Math.random(), 1.15) * 17,     // plus tôt, plus instable
    perfectWindow: 1.25,
    fakeChance: 1,
    maxEvents: 3,
    eventTypes: ['fake', 'fake', 'vault', 'black']
  }
};

export const ROUND_BONUS = 500;      // prime du plus gros coup de la manche
export const PERFECT_MULT = 2;       // zone parfaite : butin doublé
const HARD_CAP = 27;                 // aucune manche ne dépasse 27 s

/** Vitesse d'accumulation du butin, en € par seconde. */
export const rate = (t) => 100 + 44 * t;

/** Butin théorique atteint à t secondes (sans événement). */
export const potAt = (t) => 100 * t + 22 * t * t;

/* ═══════════════════════════════════════════ */

export class Game {
  constructor({ names, mode = 'classic', rounds = 5 }) {
    this.mode = MODES[mode] ? mode : 'classic';
    this.cfg = MODES[this.mode];
    this.totalRounds = rounds;
    this.roundIndex = 0;
    this.players = names.map((name, i) => ({
      id: i, name: name.trim() || `Joueur ${i + 1}`, color: i,
      total: 0, perfects: 0, caughts: 0, lost: 0, bestRound: 0,
      ratioSum: 0, rounds: 0
    }));
    this.history = [];
    this.round = null;
  }

  get isLastRound() { return this.roundIndex >= this.totalRounds - 1; }

  /** Prépare la manche suivante (alarme tirée, événements planifiés). */
  newRound() {
    const cfg = this.cfg;
    const alarm = clamp(cfg.alarm(), 4, HARD_CAP);
    const perfectFrom = Math.max(0.8, alarm - cfg.perfectWindow);

    const events = [];
    if (Math.random() < cfg.fakeChance || cfg.id === 'chaos') {
      const n = cfg.id === 'chaos'
        ? 1 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0)
        : 1;
      const types = [...cfg.eventTypes];
      for (let i = 0; i < Math.min(n, cfg.maxEvents); i++) {
        const type = types.splice((Math.random() * types.length) | 0, 1)[0] || 'fake';
        // jamais collé à la vraie alarme : la fausse doit rester crédible
        const latest = alarm - (type === 'fake' ? 1.6 : 2.4);
        if (latest < 1.8) continue;
        events.push({ type, at: rand(1.8, latest), fired: false });
      }
      events.sort((a, b) => a.at - b.at);
      // on évite deux événements superposés
      for (let i = 1; i < events.length; i++) {
        if (events[i].at - events[i - 1].at < 2.2) events[i].skip = true;
      }
    }

    this.round = {
      n: this.roundIndex + 1,
      alarm, perfectFrom,
      events: events.filter(e => !e.skip),
      t: 0, pot: 0, mult: 1, blindUntil: 0,
      running: false, done: false, endReason: null,
      players: this.players.map(p => ({
        id: p.id, name: p.name, color: p.color,
        down: true, exit: null, gain: 0, perfect: false, caught: false,
        potential: 0, bonus: 0
      }))
    };
    return this.round;
  }

  /** Avance la manche de `dt` secondes. Renvoie la liste des faits marquants. */
  tick(dt) {
    const r = this.round;
    if (!r || !r.running || r.done) return [];
    const out = [];

    r.t += dt;
    r.pot += rate(r.t) * dt * r.mult;

    for (const e of r.events) {
      if (!e.fired && r.t >= e.at) {
        e.fired = true;
        if (e.type === 'fake') out.push({ kind: 'fake' });
        if (e.type === 'vault') { r.mult = 2; r.multUntil = r.t + 3; out.push({ kind: 'event', type: 'vault' }); }
        if (e.type === 'black') { r.blindUntil = r.t + 2.6; out.push({ kind: 'event', type: 'black' }); }
      }
    }
    if (r.mult > 1 && r.t > r.multUntil) { r.mult = 1; out.push({ kind: 'eventEnd', type: 'vault' }); }
    if (r.blindUntil && r.t > r.blindUntil) { r.blindUntil = 0; out.push({ kind: 'eventEnd', type: 'black' }); }

    if (r.t >= r.alarm) {
      this._end('alarm');
      out.push({ kind: 'alarm' });
    }
    return out;
  }

  /** Un joueur retire son doigt. */
  release(id) {
    const r = this.round;
    if (!r || !r.running || r.done) return null;
    const p = r.players.find(x => x.id === id);
    if (!p || !p.down) return null;

    p.down = false;
    p.exit = r.t;
    p.gain = Math.round(r.pot);
    p.perfect = r.t >= r.perfectFrom;
    if (p.perfect) p.gain = Math.round(r.pot * PERFECT_MULT);

    if (r.players.every(x => !x.down)) this._end('clear');
    return p;
  }

  _end(reason) {
    const r = this.round;
    if (r.done) return;
    r.done = true;
    r.running = false;
    r.endReason = reason;
    r.finalPot = Math.round(r.pot);

    for (const p of r.players) {
      if (p.down) {
        p.down = false;
        p.caught = true;
        p.gain = 0;
        p.potential = r.finalPot;
        p.exit = null;
      }
    }

    // prime du plus gros coup de la manche
    const top = Math.max(0, ...r.players.map(p => p.gain));
    if (top > 0) for (const p of r.players) if (p.gain === top) { p.bonus = ROUND_BONUS; p.best = true; }
  }

  /** Clôt la manche et reporte les scores. */
  commitRound() {
    const r = this.round;
    if (!r || r.committed) return r;
    r.committed = true;

    for (const rp of r.players) {
      const p = this.players[rp.id];
      const won = rp.gain + rp.bonus;
      p.total += won;
      p.rounds += 1;
      if (rp.perfect) p.perfects += 1;
      if (rp.caught) { p.caughts += 1; p.lost = Math.max(p.lost, rp.potential); }
      p.bestRound = Math.max(p.bestRound, won);
      p.ratioSum += rp.caught ? 1 : clamp(rp.exit / r.alarm, 0, 1);
    }
    this.history.push(r);
    this.roundIndex += 1;
    return r;
  }

  /** Classement courant, du plus riche au moins riche. */
  standings() {
    return [...this.players].sort((a, b) => b.total - a.total || b.bestRound - a.bestRound);
  }

  /** Statistiques agrégées pour les trophées. */
  stats() {
    return this.players.map(p => ({
      ...p, avgRatio: p.rounds ? p.ratioSum / p.rounds : 1
    }));
  }
}
