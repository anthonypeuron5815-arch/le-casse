/* ══════════════════════════════════════════════════════════
   LE CASSE — orchestration : écrans, tactile, rendu
   ══════════════════════════════════════════════════════════ */

import { $, $$, el, money, secs, clamp, pick, store, save, wipe, applyColor, PALETTE } from './util.js';
import { unlock, sfx, buzz, getPref, setPref } from './audio.js';
import { Game, MODES, ROUND_BONUS, potAt } from './game.js';
import { comment, resetComments, roundQuote, TROPHIES, EVENTS, finalQuote } from './texts.js';

/* ── état applicatif ─────────────────────────── */
const S = {
  screen: 'home',
  mode: 'classic',
  count: 3,
  rounds: 5,
  names: [],
  game: null,
  phase: 'idle',            // idle | prep | countdown | running | over
  pads: [],
  pointers: new Map(),      // padIndex -> Set(pointerId)
  raf: 0,
  last: 0,
  nextTick: 0,
  cdTimer: 0
};

const DEFAULT_NAMES = ['Léo', 'Nina', 'Sam', 'Jade', 'Théo', 'Alix', 'Milo', 'Zoé'];

/* ── navigation ──────────────────────────────── */
function go(name) {
  if (S.screen === name) return;
  const from = $(`#screen-${S.screen}`);
  const to = $(`#screen-${name}`);
  if (from) {
    from.classList.remove('is-active');
    from.classList.add('is-leaving');
    setTimeout(() => from.classList.remove('is-leaving'), 240);
  }
  to.classList.add('is-active');
  to.querySelector('.scroll')?.scrollTo(0, 0);
  S.screen = name;
}

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function ask({ title, text, ok = 'Confirmer', cancel = 'Annuler' }) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    $('#modal-ok').querySelector('.btn-label').textContent = ok;
    $('#modal-cancel').textContent = cancel;
    m.classList.add('show');
    const done = (v) => { m.classList.remove('show'); resolve(v); };
    $('#modal-ok').onclick = () => { sfx.ui(); done(true); };
    $('#modal-cancel').onclick = () => { sfx.ui(); done(false); };
  });
}

/* ══════════════ ACCUEIL ══════════════ */
function refreshHome() {
  const s = store();
  const strip = $('#home-best');
  if (s.lastWinner) {
    strip.innerHTML = `Dernier vainqueur · <b>${escape(s.lastWinner)}</b> · ${money(s.lastAmount || 0)}`;
  } else {
    strip.textContent = '2 à 5 joueurs · 1 téléphone · 5 minutes';
  }
}

const escape = (str) => String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ══════════════ CRÉATION DE PARTIE ══════════════ */
function openSetup(mode) {
  S.mode = mode;
  const s = store();
  S.count = clamp(s.count || 3, 2, 5);
  S.rounds = s.rounds || 5;
  S.names = (s.names && s.names.length) ? [...s.names] : [...DEFAULT_NAMES];

  const chip = $('#setup-mode-chip');
  chip.textContent = MODES[mode].label;
  chip.classList.toggle('chaos', mode === 'chaos');

  buildCountSeg();
  buildRoundsSeg();
  buildPlayerRows();
  go('setup');
}

function buildCountSeg() {
  const seg = $('#count-seg');
  seg.innerHTML = '';
  for (let n = 2; n <= 5; n++) {
    const b = el('button', S.count === n ? 'on' : '', String(n));
    b.onclick = () => { sfx.tap(); S.count = n; buildCountSeg(); buildPlayerRows(); };
    seg.append(b);
  }
}

function buildRoundsSeg() {
  const seg = $('#rounds-seg');
  seg.innerHTML = '';
  [3, 5, 7].forEach((n) => {
    const b = el('button', S.rounds === n ? 'on' : '', `${n} manches`);
    b.onclick = () => { sfx.tap(); S.rounds = n; buildRoundsSeg(); };
    seg.append(b);
  });
}

function buildPlayerRows() {
  const box = $('#players-edit');
  box.innerHTML = '';
  for (let i = 0; i < S.count; i++) {
    const row = el('div', 'p-row');
    const c = PALETTE[i];
    const chip = el('div', 'p-chip', (S.names[i] || DEFAULT_NAMES[i] || '?').trim().charAt(0).toUpperCase() || '?');
    chip.style.background = `linear-gradient(140deg, ${c.hex}, ${c.hex}bb)`;
    chip.style.boxShadow = `0 6px 22px -10px ${c.hex}`;

    const input = el('input');
    input.type = 'text';
    input.maxLength = 12;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = DEFAULT_NAMES[i] || `Joueur ${i + 1}`;
    input.value = S.names[i] || '';
    input.oninput = () => {
      S.names[i] = input.value;
      chip.textContent = (input.value || input.placeholder).trim().charAt(0).toUpperCase() || '?';
    };
    input.onblur = () => window.scrollTo(0, 0);

    row.append(chip, input);
    box.append(row);
  }
}

function startGame() {
  const names = [];
  for (let i = 0; i < S.count; i++) names.push((S.names[i] || '').trim() || DEFAULT_NAMES[i] || `Joueur ${i + 1}`);
  save({ names: S.names.slice(0, S.count), count: S.count, rounds: S.rounds });
  S.game = new Game({ names, mode: S.mode, rounds: S.rounds });
  sfx.go();
  startRound();
}

/* ══════════════ PLATEAU ══════════════ */
const LAYOUT = {
  2: { rows: '1fr 1fr', cols: '1fr', flip: [0], cells: [null, null] },
  3: { rows: '1fr 1fr', cols: '1fr 1fr', flip: [0, 1], cells: [null, null, 'span 2'] },
  4: { rows: '1fr 1fr', cols: '1fr 1fr', flip: [0, 1], cells: [null, null, null, null] },
  5: { rows: '1fr 1fr 1fr', cols: '1fr 1fr', flip: [0, 1], cells: [null, null, null, null, 'span 2'], mid: [2, 3] }
};

function buildBoard() {
  const g = S.game;
  const r = g.newRound();
  const board = $('#board');
  const L = LAYOUT[r.players.length];

  board.innerHTML = '';
  board.className = `board board-${r.players.length}`;
  $('#screen-board').dataset.players = String(r.players.length);
  board.style.gridTemplateRows = L.rows;
  board.style.gridTemplateColumns = L.cols;

  S.pads = r.players.map((p, i) => {
    const pad = el('div', 'pad');
    if (L.flip.includes(i)) pad.classList.add('flip');
    if (L.cells[i]) pad.style.gridColumn = L.cells[i];
    if (L.mid?.includes(i)) pad.dataset.mid = i === L.mid[0] ? 'l' : 'r';
    applyColor(pad, p.color);

    const badge = el('div', 'pad-badge', money(g.players[p.id].total));
    if (!g.players[p.id].total) badge.style.opacity = '0';
    const name = el('div', 'pad-name', escape(p.name));
    const state = el('div', 'pad-state', 'Pose ton doigt');
    const cash = el('div', 'pad-money', '');
    cash.style.display = 'none';
    pad.append(badge, name, cash, state);

    bindPad(pad, i);
    board.append(pad);
    return { el: pad, name, state, cash, badge, player: p };
  });

  S.pointers = new Map();
  S.phase = 'prep';
  $('#hud-round').textContent = `MANCHE ${r.n}/${g.totalRounds}`;
  $('#vault').className = 'vault';
  $('#vault').style.opacity = '';
  $('#vault-label').textContent = 'BUTIN';
  $('#vault-amount').textContent = money(0);
  $('#vault-sub').textContent = 'Posez vos doigts';
  hideEvent();
  $('#alarm-flash').className = 'alarm-flash';
  $('#fake-flash').className = 'fake-flash';
  $('#countdown').className = 'countdown';
}

/* ── gestion tactile multi-doigts ────────────── */
function bindPad(pad, i) {
  const down = (id) => {
    if (!S.pointers.has(i)) S.pointers.set(i, new Set());
    const set = S.pointers.get(i);
    const wasEmpty = set.size === 0;
    set.add(id);
    if (wasEmpty) onPadDown(i);
  };
  const up = (id) => {
    const set = S.pointers.get(i);
    if (!set || !set.has(id)) return;
    set.delete(id);
    if (set.size === 0) onPadUp(i);
  };

  if (window.PointerEvent) {
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch { /* noop */ }
      down(e.pointerId);
    });
    const end = (e) => { e.preventDefault(); up(e.pointerId); };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', (e) => up(e.pointerId));
  } else {
    pad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) down(t.identifier);
    }, { passive: false });
    const end = (e) => { e.preventDefault(); for (const t of e.changedTouches) up(t.identifier); };
    pad.addEventListener('touchend', end, { passive: false });
    pad.addEventListener('touchcancel', end, { passive: false });
    // souris (test sur ordinateur)
    pad.addEventListener('mousedown', (e) => { e.preventDefault(); down('m'); });
    window.addEventListener('mouseup', () => up('m'));
  }
}

function onPadDown(i) {
  unlock();
  const pad = S.pads[i];
  if (!pad) return;
  if (S.phase === 'prep' || S.phase === 'countdown') {
    pad.el.classList.add('is-armed');
    pad.state.textContent = 'Prêt';
    sfx.tap();
    checkAllArmed();
  }
}

function onPadUp(i) {
  const pad = S.pads[i];
  if (!pad) return;

  if (S.phase === 'prep') {
    pad.el.classList.remove('is-armed');
    pad.state.textContent = 'Pose ton doigt';
    return;
  }
  if (S.phase === 'countdown') {
    pad.el.classList.remove('is-armed');
    pad.state.textContent = 'Pose ton doigt';
    abortCountdown();
    return;
  }
  if (S.phase === 'running') {
    const p = S.game.release(pad.player.id);
    if (p) paintExit(pad, p);
  }
}

function armedCount() {
  let n = 0;
  for (const s of S.pointers.values()) if (s.size > 0) n++;
  return n;
}

function checkAllArmed() {
  if (S.phase !== 'prep') return;
  if (armedCount() < S.pads.length) {
    $('#vault-sub').textContent = `${armedCount()}/${S.pads.length} en place`;
    return;
  }
  startCountdown();
}

/* ── compte à rebours ────────────────────────── */
function startCountdown() {
  S.phase = 'countdown';
  $('#vault-sub').textContent = 'Le casse commence…';
  const box = $('#countdown');
  const num = $('#countdown-num');
  box.classList.add('show');
  $('#vault').style.opacity = '0';
  let n = 3;

  const step = () => {
    if (S.phase !== 'countdown') return;
    if (n > 0) {
      num.className = '';
      num.textContent = String(n);
      // relance l'animation
      num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
      sfx.count(4 - n);
      n--;
      S.cdTimer = setTimeout(step, 700);
    } else {
      num.className = 'go';
      num.textContent = 'GO';
      num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
      sfx.go();
      S.cdTimer = setTimeout(() => { box.classList.remove('show'); beginRound(); }, 520);
    }
  };
  step();
}

function abortCountdown() {
  clearTimeout(S.cdTimer);
  S.phase = 'prep';
  $('#countdown').classList.remove('show');
  $('#vault').style.opacity = '';
  $('#vault-sub').textContent = `${armedCount()}/${S.pads.length} en place`;
}

/* ── manche en cours ─────────────────────────── */
function beginRound() {
  const r = S.game.round;
  // les joueurs qui n'ont pas le doigt posé au démarrage sortent immédiatement
  S.phase = 'running';
  r.running = true;
  S.last = performance.now();
  S.nextTick = 0.7;

  $('#vault').style.opacity = '';
  $('#vault-label').textContent = 'BUTIN';
  $('#vault-sub').textContent = 'Retire quand tu veux';
  S.pads.forEach((pad, i) => {
    pad.el.classList.remove('is-armed');
    pad.el.classList.add('is-live');
    pad.state.textContent = 'Dans le casse';
    pad.badge.style.opacity = '0';
  });
  sfx.startTension();
  buzz([15, 30, 15]);

  // sécurité : un joueur qui n'avait pas le doigt posé sort à 0 s
  S.pads.forEach((pad, i) => {
    if (!(S.pointers.get(i)?.size)) {
      const p = S.game.release(pad.player.id);
      if (p) paintExit(pad, p);
    }
  });

  cancelAnimationFrame(S.raf);
  S.raf = requestAnimationFrame(loop);
}

function loop(now) {
  if (S.phase !== 'running') return;
  const dt = Math.min(0.05, (now - S.last) / 1000);
  S.last = now;

  const evts = S.game.tick(dt);
  const r = S.game.round;

  // rendu du butin
  const blind = r.blindUntil > 0;
  $('#vault').classList.toggle('blind', blind);
  $('#vault-amount').textContent = money(r.pot);
  if (r.mult > 1) $('#vault').classList.add('hot'); else $('#vault').classList.remove('hot');

  // tension sonore, indexée sur la durée écoulée
  const p = clamp(r.t / 18, 0, 1);
  sfx.tension(p);
  if (r.t >= S.nextTick) {
    sfx.tick(p);
    S.nextTick = r.t + Math.max(0.22, 0.72 - p * 0.5);
  }

  for (const e of evts) {
    if (e.kind === 'fake') fakeAlarm();
    else if (e.kind === 'event') showEvent(EVENTS[e.type]);
    else if (e.kind === 'eventEnd') hideEvent();
    else if (e.kind === 'alarm') return alarmSequence();
  }

  if (r.done) return finishRound();
  S.raf = requestAnimationFrame(loop);
}

function paintExit(pad, p) {
  pad.el.classList.remove('is-live', 'is-armed');
  pad.el.classList.add(p.perfect ? 'is-perfect' : 'is-out');
  pad.cash.style.display = '';
  pad.cash.textContent = money(p.gain);
  pad.state.textContent = p.perfect ? 'Casse parfait ×2' : 'Sécurisé';
  pad.badge.style.opacity = '0';
  if (p.perfect) { sfx.perfect(); $('#vault').classList.add('bump'); setTimeout(() => $('#vault').classList.remove('bump'), 300); }
  else sfx.cash();
}

function showEvent(e) {
  const b = $('#event-banner');
  b.innerHTML = `${e.label}<br><span style="opacity:.7;font-size:10.5px">${e.hint}</span>`;
  b.classList.add('show');
  sfx.event();
}
function hideEvent() { $('#event-banner').classList.remove('show'); }

function fakeAlarm() {
  const f = $('#fake-flash');
  f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
  sfx.fake();
  setTimeout(() => f.classList.remove('show'), 750);
}

function alarmSequence() {
  S.phase = 'over';
  sfx.stopTension();
  sfx.alarm();
  const a = $('#alarm-flash');
  a.classList.add('show');
  S.pads.forEach((pad) => {
    const p = S.game.round.players.find(x => x.id === pad.player.id);
    if (p.caught) {
      pad.el.classList.remove('is-live');
      pad.el.classList.add('is-caught');
      pad.cash.style.display = '';
      pad.cash.textContent = '0 €';
      pad.state.textContent = 'Attrapé';
      pad.badge.style.opacity = '0';
    }
  });
  $('#vault').classList.remove('blind');
  $('#vault-label').textContent = 'ALARME';
  $('#vault-sub').textContent = secs(S.game.round.alarm);
  setTimeout(() => { a.classList.remove('show'); showResults(); }, 1750);
}

function finishRound() {
  // tout le monde est sorti avant l'alarme
  S.phase = 'over';
  sfx.stopTension();
  $('#vault-label').textContent = 'CASSE TERMINÉ';
  $('#vault-sub').textContent = `Alarme prévue à ${secs(S.game.round.alarm)}`;
  setTimeout(showResults, 1300);
}

function startRound() {
  buildBoard();
  go('board');
}

function quitToHome() {
  cancelAnimationFrame(S.raf);
  clearTimeout(S.cdTimer);
  sfx.stopTension();
  S.phase = 'idle';
  S.game = null;
  refreshHome();
  go('home');
}

/* ══════════════ RÉSULTATS ══════════════ */
function showResults() {
  const g = S.game;
  const r = g.commitRound();
  resetComments();

  $('#res-kicker').textContent = `MANCHE ${r.n} / ${g.totalRounds}`;
  $('#res-title').textContent = r.endReason === 'alarm' ? 'L\'alarme a sonné' : 'Casse bouclé';
  $('#res-quote').textContent = '« ' + roundQuote(r.players, r) + ' »';
  $('#tl-alarm-time').textContent = secs(r.alarm);

  // frise chronologique
  const span = r.alarm * 1.06;
  const pct = (t) => clamp((t / span) * 100, 0, 100);
  $('#tl-perfect').style.left = pct(r.perfectFrom) + '%';
  $('#tl-perfect').style.width = '0%';
  requestAnimationFrame(() => { $('#tl-perfect').style.width = (pct(r.alarm) - pct(r.perfectFrom)) + '%'; });
  $('#tl-alarm').style.left = `calc(${pct(r.alarm)}% - 1.5px)`;

  const marks = $('#tl-marks');
  marks.innerHTML = '';
  r.players.filter(p => !p.caught).forEach((p, i) => {
    const m = el('div', 'tl-mark');
    m.style.left = pct(p.exit) + '%';
    const dot = el('i');
    dot.style.animationDelay = (0.18 + i * 0.08) + 's';
    applyColor(m, p.color);
    m.append(dot);
    marks.append(m);
  });
  $('#tl-scale').innerHTML = `<span>0 s</span><span>${secs(r.alarm / 2, 1)}</span><span>${secs(r.alarm, 1)}</span>`;

  // lignes joueurs, triées par gain
  const list = $('#res-list');
  list.innerHTML = '';
  [...r.players].sort((a, b) => (b.gain + b.bonus) - (a.gain + a.bonus)).forEach((p, i) => {
    const row = el('div', 'res-row' + (p.perfect ? ' perfect' : p.caught ? ' caught' : ''));
    row.style.animationDelay = (0.05 + i * 0.07) + 's';

    const c = PALETTE[p.color % PALETTE.length];
    const av = el('div', 'res-av', escape(p.name.charAt(0).toUpperCase()));
    av.style.background = `linear-gradient(140deg, ${c.hex}, ${c.hex}bb)`;

    const tags = [];
    if (p.perfect) tags.push('<span class="res-tag tag-perfect">PARFAIT ×2</span>');
    if (p.caught) tags.push('<span class="res-tag tag-caught">ATTRAPÉ</span>');
    if (p.best && !p.caught) tags.push(`<span class="res-tag tag-best">+${ROUND_BONUS} €</span>`);

    const mid = el('div', 'res-mid');
    mid.innerHTML = `<div class="res-nm">${escape(p.name)}${tags.join('')}</div>
                     <div class="res-cm">${escape(comment(p, r))}</div>`;

    const right = el('div', 'res-right');
    const total = p.gain + p.bonus;
    right.innerHTML =
      `<div class="res-gain ${p.caught ? 'zero' : p.perfect ? 'perfect' : ''}">${p.caught ? '0 €' : '+' + money(total)}</div>
       <div class="res-time">${p.caught ? money(p.potential) + ' perdus' : 'sorti à ' + secs(p.exit)}</div>`;

    row.append(av, mid, right);
    list.append(row);
  });

  const last = g.roundIndex >= g.totalRounds;
  $('#next-round-label').textContent = last ? 'Voir le vainqueur' : 'Manche suivante';
  go('results');
  if (r.players.some(p => p.perfect)) setTimeout(() => buzz([20, 40, 20]), 200);
}

function nextRound() {
  const g = S.game;
  if (g.roundIndex >= g.totalRounds) return showFinal();
  startRound();
}

/* ══════════════ CLASSEMENT ══════════════ */
function showStandings() {
  const list = $('#stand-list');
  list.innerHTML = '';
  S.game.standings().forEach((p, i) => {
    const row = el('div', 'stand-row' + (i === 0 ? ' lead' : ''));
    row.style.animationDelay = (0.04 + i * 0.06) + 's';
    const c = PALETTE[p.color % PALETTE.length];
    const av = el('div', 'res-av', escape(p.name.charAt(0).toUpperCase()));
    av.style.background = `linear-gradient(140deg, ${c.hex}, ${c.hex}bb)`;
    const mid = el('div', '', `<div class="stand-nm">${escape(p.name)}</div>
      <div class="stand-meta">${p.perfects} parfait${p.perfects > 1 ? 's' : ''} · ${p.caughts} arrestation${p.caughts > 1 ? 's' : ''}</div>`);
    row.append(el('div', 'stand-pos', String(i + 1)), av, mid, el('div', 'stand-amt', money(p.total)));
    list.append(row);
  });
  go('standings');
}

/* ══════════════ FIN DE PARTIE ══════════════ */
function showFinal() {
  const g = S.game;
  const rank = g.standings();
  const win = rank[0];
  const gap = win.total - (rank[1]?.total ?? 0);

  $('#final-name').textContent = win.name;
  $('#final-amount').textContent = money(win.total);
  $('#final-sub').textContent = '« ' + finalQuote(gap, win.total) + ' »';

  // podium
  const pod = $('#podium');
  pod.innerHTML = '';
  const order = [rank[1], rank[0], rank[2]].filter(Boolean);
  const place = { 0: 2, 1: 1, 2: 3 };
  order.forEach((p, idx) => {
    const realPos = rank.indexOf(p) + 1;
    const box = el('div', `pod pod-${realPos}`);
    box.style.animationDelay = (0.1 + idx * 0.12) + 's';
    const c = PALETTE[p.color % PALETTE.length];
    const av = el('div', 'pod-av', escape(p.name.charAt(0).toUpperCase()));
    av.style.background = `linear-gradient(140deg, ${c.hex}, ${c.hex}bb)`;
    box.append(av,
      el('div', 'pod-nm', escape(p.name)),
      el('div', 'pod-amt', money(p.total)),
      el('div', 'pod-bar', String(realPos)));
    pod.append(box);
  });
  if (order.length < 3) pod.style.gridTemplateColumns = `repeat(${order.length},1fr)`;

  // trophées
  const stats = g.stats();
  const tro = $('#trophies');
  tro.innerHTML = '';
  let n = 0;
  TROPHIES.forEach((t) => {
    const r = t.pick(stats);
    if (!r) return;
    const row = el('div', 'trophy');
    row.style.animationDelay = (0.15 + n++ * 0.07) + 's';
    row.append(el('div', 'trophy-ic', t.icon),
      el('div', '', `<div class="trophy-t">${t.title}</div>
        <div class="trophy-w"><b>${escape(r.player.name)}</b> · ${t.desc}</div>`));
    tro.append(row);
  });

  // le reste du classement
  const rest = $('#final-rest');
  rest.innerHTML = rank.length > 3
    ? '<div class="label label-center" style="margin-top:6px">Les autres</div>' +
      rank.slice(3).map((p, i) => `<div class="stand-row"><div class="stand-pos">${i + 4}</div>
        <div class="res-av" style="background:linear-gradient(140deg,${PALETTE[p.color % 5].hex},${PALETTE[p.color % 5].hex}bb)">${escape(p.name.charAt(0).toUpperCase())}</div>
        <div><div class="stand-nm">${escape(p.name)}</div></div>
        <div class="stand-amt">${money(p.total)}</div></div>`).join('')
    : '';

  save({ lastWinner: win.name, lastAmount: win.total });
  go('final');
  sfx.win();
  confetti();
}

function confetti() {
  const box = $('#confetti');
  box.innerHTML = '';
  const cols = ['#FFC53D', '#FF9F1C', '#22E39A', '#38BDF8', '#C084FC', '#FF7A45'];
  for (let i = 0; i < 46; i++) {
    const c = el('div', 'cf');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = pick(cols);
    c.style.animationDuration = (2.0 + Math.random() * 1.8) + 's';
    c.style.animationDelay = (Math.random() * 1.1) + 's';
    c.style.width = (5 + Math.random() * 6) + 'px';
    c.style.height = (9 + Math.random() * 12) + 'px';
    box.append(c);
  }
  setTimeout(() => { box.innerHTML = ''; }, 6500);
}

/* ══════════════ RÉGLAGES ══════════════ */
function buildSettings() {
  const box = $('#toggles');
  box.innerHTML = '';
  const items = [
    { k: 'sound', t: 'Sons', s: 'Tension, alarme, jackpot' },
    { k: 'haptics', t: 'Vibrations', s: 'Retour haptique (Android)' }
  ];
  items.forEach(({ k, t, s }) => {
    const row = el('div', 'tg');
    const sw = el('div', 'sw' + (getPref(k) ? ' on' : ''));
    row.append(el('div', '', `<div class="tg-t">${t}</div><div class="tg-s">${s}</div>`), sw);
    row.onclick = () => {
      const v = !getPref(k);
      setPref(k, v);
      sw.classList.toggle('on', v);
      if (k === 'sound' && v) { unlock(); sfx.tap(); }
      if (k === 'haptics' && v) buzz(30);
    };
    box.append(row);
  });
}

/* ══════════════ ACTIONS GLOBALES ══════════════ */
const ACTIONS = {
  quick: () => openSetup('classic'),
  chaos: () => openSetup('chaos'),
  rules: () => go('rules'),
  settings: () => { buildSettings(); go('settings'); },
  home: () => { refreshHome(); go('home'); },
  'start-game': startGame,
  'next-round': nextRound,
  standings: showStandings,
  'back-results': () => go('results'),
  replay: () => { const m = S.mode; S.game = null; openSetup(m); },
  'confirm-quit': async () => {
    const wasRunning = S.phase === 'running';
    if (wasRunning) { S.phase = 'paused'; sfx.stopTension(); }
    const yes = await ask({ title: 'Quitter la partie ?', text: 'Le butin de tout le monde sera perdu.', ok: 'Quitter' });
    if (yes) return quitToHome();
    if (wasRunning) { S.phase = 'running'; S.last = performance.now(); sfx.startTension(); S.raf = requestAnimationFrame(loop); }
  },
  'install-help': () => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    toast(ios
      ? 'Safari → bouton Partager → « Sur l\'écran d\'accueil »'
      : 'Chrome → menu ⋮ → « Installer l\'application »', 4200);
  },
  'reset-data': async () => {
    const yes = await ask({ title: 'Tout effacer ?', text: 'Prénoms, réglages et records seront supprimés.', ok: 'Effacer' });
    if (yes) { wipe(); toast('Données effacées'); buildSettings(); refreshHome(); }
  }
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  unlock();
  const a = btn.dataset.action;
  if (ACTIONS[a]) { if (a !== 'confirm-quit') sfx.ui(); ACTIONS[a](); }
});

/* anti-zoom / anti-scroll parasites */
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.pad')) e.preventDefault();
});
document.addEventListener('touchmove', (e) => {
  if (S.screen === 'board') e.preventDefault();
}, { passive: false });

/* si l'app passe en arrière-plan pendant une manche, on met en pause */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.phase === 'running') {
    S.phase = 'paused';
    cancelAnimationFrame(S.raf);
    sfx.stopTension();
    $('#vault-sub').textContent = 'En pause — reposez vos doigts';
  } else if (!document.hidden && S.phase === 'paused' && S.screen === 'board') {
    S.phase = 'running';
    S.last = performance.now();
    sfx.startTension();
    S.raf = requestAnimationFrame(loop);
  }
});

/* hauteur réelle du viewport mobile */
const fitViewport = () => document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
window.addEventListener('resize', fitViewport);
fitViewport();

/* ── démarrage ──────────────────────────────── */
refreshHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne indisponible */ });
  });
}

/* raccourcis PWA : ?go=quick | ?go=chaos */
try {
  const g = new URLSearchParams(location.search).get('go');
  if (g === 'quick') openSetup('classic');
  if (g === 'chaos') openSetup('chaos');
} catch { /* noop */ }
