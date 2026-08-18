/* ── La voix du jeu : punchlines, titres, événements ── */

import { pick } from './util.js';

const LINES = {
  veryEarly: [
    "Il a braqué 12 centimes et il est parti.",
    "Sécurité maximale, ambition minimale.",
    "Sorti avant même que ça devienne intéressant.",
    "Le coffre n'était même pas ouvert.",
    "Techniquement, c'est un vol. Émotionnellement, non.",
    "Il est venu, il a vu, il est reparti tout de suite."
  ],
  early: [
    "Prudent. Trop prudent.",
    "Il a préféré le sommeil à la fortune.",
    "Une sortie de comptable.",
    "Petit butin, gros dodo.",
    "Il joue pour finir la partie, pas pour la gagner."
  ],
  clean: [
    "Sortie propre.",
    "Pas spectaculaire, mais rentable.",
    "Il a joué la prudence.",
    "Du travail honnête. Enfin, presque.",
    "Rien à redire, rien à raconter.",
    "Le braquage du bon élève."
  ],
  greedy: [
    "Il a senti le danger… et il a continué.",
    "À deux doigts de la catastrophe.",
    "La sueur commençait à couler.",
    "Il a joué avec le feu et il est sorti fumant.",
    "Encore une seconde et c'était la fin.",
    "Le genre de sortie qui se raconte au bar."
  ],
  perfect: [
    "Timing de voleur professionnel.",
    "Casse parfait.",
    "Il a senti l'alarme dans son âme.",
    "Propre, net, indécent.",
    "Chirurgical.",
    "Il connaissait l'horaire du vigile."
  ],
  caught: [
    "La cupidité a gagné.",
    "Contrôle judiciaire immédiat.",
    "Il a voulu faire le héros.",
    "Une seconde de trop.",
    "Les menottes avant le butin.",
    "Il négocie déjà sa remise de peine.",
    "Tout ça pour zéro."
  ],
  caughtHuge: [
    "Une fortune envolée en une seconde.",
    "Le plus beau butin jamais perdu.",
    "Il était riche. Il ne l'a pas su assez longtemps.",
    "Ça, c'est un dossier pour Netflix."
  ]
};

/* évite de répéter la même punchline dans une même manche */
let used = new Set();
export const resetComments = () => { used = new Set(); };
function fresh(list) {
  const free = list.filter(l => !used.has(l));
  const line = pick(free.length ? free : list);
  used.add(line);
  return line;
}

/** Punchline individuelle selon la sortie. */
export function comment(p, round) {
  if (p.caught) {
    return p.potential >= round.pot * 0.85 && round.pot > 4000
      ? fresh(LINES.caughtHuge) : fresh(LINES.caught);
  }
  if (p.perfect) return fresh(LINES.perfect);
  const r = p.exit / round.alarm;
  if (r < 0.22) return fresh(LINES.veryEarly);
  if (r < 0.45) return fresh(LINES.early);
  if (r < 0.80) return fresh(LINES.clean);
  return fresh(LINES.greedy);
}

/** Commentaire collectif affiché en haut de l'écran de résultats. */
export function roundQuote(players, round) {
  const alive = players.filter(p => p.caught);
  const outs  = players.filter(p => !p.caught);

  if (alive.length === players.length)
    return pick([
      "Le pire casse de l'histoire.",
      "Netflix ne fera pas de série sur vous.",
      "Beaucoup d'ambition, aucun résultat.",
      "Tout le monde en cellule. Bravo l'équipe."
    ]);

  if (!alive.length && outs.every(p => p.exit < round.alarm * 0.4))
    return pick([
      "Braquage de boulangerie.",
      "Vous avez volé trois pièces et fui.",
      "Même le vigile est déçu.",
      "Une équipe de professionnels… de la fuite."
    ]);

  if (outs.some(p => p.perfect) && alive.length)
    return pick([
      "Certains ont du flair. D'autres ont des menottes.",
      "Un artiste, des amateurs.",
      "Le talent ne se partage pas."
    ]);

  if (!alive.length)
    return pick([
      "Personne n'est tombé. Suspect.",
      "Tout le monde dehors, tout le monde riche.",
      "Un casse sans bavure. Ennuyeux, mais efficace."
    ]);

  return pick([
    "Il y a ceux qui sortent, et ceux qui restent.",
    "Le butin se partage mal quand on est en garde à vue.",
    "Chacun sa méthode. Chacun sa peine.",
    "Une manche, deux destins."
  ]);
}

/** Événements du mode Chaos. */
export const EVENTS = {
  fake:  { label: 'FAUSSE ALARME',  hint: 'Ce n\'était pas la vraie…' },
  vault: { label: 'COFFRE OUVERT',  hint: 'Le butin monte deux fois plus vite' },
  black: { label: 'PANNE DE COURANT', hint: 'Le montant est masqué' }
};

/* ── Trophées de fin de partie ─────────────── */
export const TROPHIES = [
  {
    id: 'brain', icon: '🧠', title: 'Le Grand Cerveau', desc: 'Meilleur butin total',
    pick: (s) => best(s, p => p.total, 1)
  },
  {
    id: 'greedy', icon: '🐷', title: 'Le Gourmand', desc: 'Plus gros butin perdu à cause de l\'alarme',
    pick: (s) => best(s, p => p.lost, 1)
  },
  {
    id: 'timing', icon: '🎯', title: 'Le Pro du Timing', desc: 'Le plus de sorties parfaites',
    pick: (s) => best(s, p => p.perfects, 1)
  },
  {
    id: 'coward', icon: '🐁', title: 'Le Lâche rentable', desc: 'Sort tôt, mais ne tombe jamais',
    pick: (s) => best(s.filter(p => p.caughts === 0 && p.rounds > 1), p => -p.avgRatio, 0.0001)
  },
  {
    id: 'blackcat', icon: '🐈‍⬛', title: 'Le Chat Noir', desc: 'Le plus souvent attrapé',
    pick: (s) => best(s, p => p.caughts, 2)
  },
  {
    id: 'legend', icon: '👑', title: 'La Légende du casse', desc: 'Plus gros gain sur une seule manche',
    pick: (s) => best(s, p => p.bestRound, 1)
  }
];

function best(stats, fn, min) {
  if (!stats.length) return null;
  let top = null, val = -Infinity;
  for (const p of stats) {
    const v = fn(p);
    if (v > val) { val = v; top = p; }
  }
  if (top == null || val < min) return null;
  return { player: top, value: val };
}

/** Sous-titre de l'écran final. */
export function finalQuote(gap, total) {
  if (total === 0) return "Zéro euro. Une performance, dans son genre.";
  if (gap <= 0)    return "Égalité parfaite. Le partage est un art.";
  if (gap < 1500)  return "Ça s'est joué à un cheveu.";
  if (gap > 12000) return "Ce n'était même pas une compétition.";
  return "Le crime paie. Pour un seul d'entre vous.";
}
