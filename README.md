# LE CASSE

> Garde ton doigt pour gagner plus. Retire-le pour sauver ton butin.
> **Reste une seconde de trop et tu perds tout.**

Jeu de soirée pour 2 à 5 joueurs, sur **un seul téléphone posé au centre de la table**.
PWA installable, 100 % hors ligne, aucune dépendance, aucun build.

---

## 1. Le jeu en 30 secondes

Tout le monde pose un doigt sur sa zone. Le butin monte, de plus en plus vite.
Chacun retire son doigt quand il veut pour sécuriser le montant affiché.
Une **alarme cachée** sonne à un moment aléatoire : ceux qui ont encore le doigt posé
repartent avec **0 €** sur la manche.

Juste avant l'alarme se cache une **zone parfaite** invisible (les ~1,5 dernières secondes).
Sortir pile là-dedans **double le butin**. C'est le casse parfait.

Après 5 manches, le plus riche gagne. Des trophées automatiques distribuent les titres :
Le Grand Cerveau, Le Gourmand, Le Pro du Timing, Le Lâche rentable, Le Chat Noir, La Légende du casse.

### Deux modes livrés

| Mode | Ce qui change |
|---|---|
| **Classique** | Alarme entre 6,5 s et 22 s. Une fausse alarme de temps en temps (25 % des manches). Zone parfaite de 1,6 s. |
| **Chaos** | Alarme plus tôt et plus instable (4,5 s → 21,5 s). Jusqu'à 3 événements par manche : **fausse alarme**, **coffre ouvert** (butin ×2 pendant 3 s), **panne de courant** (montant masqué 2,6 s). Zone parfaite réduite à 1,25 s. |

### Économie de la manche

- Vitesse du butin : `100 + 44·t` € par seconde → environ 1 000 € à 5 s, 3 200 € à 10 s, 6 450 € à 15 s.
- Sortie dans la zone parfaite : **×2**.
- Plus gros coup de la manche : **+500 €** de prime.
- Attrapé par l'alarme : **0 €**, mais l'écran de résultats affiche ce que tu as perdu (c'est là que ça fait mal).

---

## 2. Lancer le projet en local

Aucune installation, aucun bundler. Il faut juste un serveur HTTP (les modules ES et le
service worker ne fonctionnent pas en `file://`).

```bash
npx serve .          # ou : python3 -m http.server 5173
```

Puis ouvre `http://localhost:5173`.

Sur ordinateur, la souris fait office de doigt unique — pratique pour vérifier l'interface,
mais le vrai test se fait à plusieurs doigts sur un téléphone.

---

## 3. Déployer sur Vercel

**Option A — en ligne de commande**

```bash
npm i -g vercel
vercel            # aperçu
vercel --prod     # production
```

**Option B — depuis GitHub**

1. Pousse le dossier sur un dépôt GitHub.
2. Sur vercel.com : *Add New… → Project → Import*.
3. Framework Preset : **Other**. Build Command : *(vide)*. Output Directory : `.`
4. Deploy.

Le fichier `vercel.json` est déjà configuré : `sw.js` n'est jamais mis en cache (les mises à
jour arrivent immédiatement), les icônes le sont pour un an, et le manifest est servi avec le
bon `Content-Type`.

> ⚠️ Le service worker exige **HTTPS** — automatique sur Vercel, et autorisé sur `localhost`.

---

## 4. Installer sur téléphone

**iPhone / iPad** — ouvrir le lien **dans Safari** (pas Chrome), bouton **Partager**,
puis **« Sur l'écran d'accueil »**. L'app se lance ensuite en plein écran, sans barre d'adresse.

**Android** — ouvrir le lien dans Chrome, menu **⋮**, puis **« Installer l'application »**
(ou la bannière d'installation qui apparaît d'elle-même).

Une fois installée, l'app fonctionne **entièrement hors ligne** : tout est mis en cache au
premier chargement, et aucun son n'est téléchargé (ils sont synthétisés à la volée par la
Web Audio API).

À savoir sur les vibrations : `navigator.vibrate` fonctionne sur Android.
iOS ne l'expose pas aux sites web — l'app le détecte et n'insiste pas.

---

## 5. Structure du projet

```
le-casse/
├─ index.html               tous les écrans, en une page
├─ manifest.webmanifest     PWA : nom, icônes, mode standalone, raccourcis
├─ sw.js                    service worker (cache-first, navigation network-first)
├─ vercel.json              en-têtes de cache
├─ css/app.css              design system complet
├─ js/
│  ├─ app.js                écrans, tactile multi-doigts, rendu
│  ├─ game.js               moteur pur : butin, alarme, zone parfaite, événements
│  ├─ audio.js              sons synthétisés + haptique
│  ├─ texts.js              punchlines, trophées, commentaires
│  └─ util.js               format monétaire, stockage, palette joueurs
├─ icons/                   192 / 512 / maskable / apple-touch / og
└─ make_icons.py            régénère les icônes (Pillow + numpy)
```

`game.js` ne touche pas au DOM : le moteur est testable seul, et pourrait être réutilisé tel
quel pour une version multi-appareils.

### Régler l'équilibrage

Tout est en haut de `js/game.js` :

```js
export const MODES = { classic: { alarm: () => …, perfectWindow: 1.6, … } };
export const ROUND_BONUS  = 500;   // prime du meilleur coup
export const PERFECT_MULT = 2;     // multiplicateur zone parfaite
export const rate = (t) => 100 + 44 * t;   // vitesse du butin
```

---

## 6. Choix techniques

- **Pas de framework.** Un jeu tactile temps réel n'a pas besoin d'un cycle de rendu virtuel ;
  il a besoin que `pointerdown` / `pointerup` ne soient jamais avalés. Le DOM est manipulé
  directement, l'animation tourne en `requestAnimationFrame`, et les zones tactiles sont en
  `touch-action: none` avec capture du pointeur.
- **Multi-doigts fiable.** Chaque zone garde son propre ensemble de `pointerId`. Un doigt qui
  glisse hors de sa zone reste capturé ; un doigt qui se lève déclenche la sortie. Repli
  automatique sur les Touch Events si `PointerEvent` n'existe pas, et sur la souris au bureau.
- **Zéro asset audio.** Alarme, sirène, jackpot, nappe de tension : tout est généré par la
  Web Audio API. L'app reste légère et fonctionne hors ligne sans télécharger un seul son.
  Le contexte audio est débloqué au premier contact (contrainte iOS).
- **Anti-triche d'interface.** Zoom, sélection de texte, menu contextuel, rebond de scroll et
  double-tap sont neutralisés sur le plateau. Passer l'app en arrière-plan met la manche en
  pause plutôt que de faire sauter le chronomètre.

---

## 7. Ce qui a été volontairement gardé pour la V2

Le brief prévoyait plus large. Ces éléments sont conçus pour s'ajouter sans réécriture, mais
alourdiraient un MVP dont la force est d'être compris en dix secondes :

- **Boutique entre les manches** (Fausse alarme, Assurance, Indice, Sabotage, Coffre bonus,
  Bouclier). `Game.commitRound()` est déjà le point d'accroche naturel : un écran de boutique
  s'intercale entre `commitRound()` et `newRound()`, et les pouvoirs se branchent sur les
  champs `mult`, `blindUntil` et `events` de la manche.
- **Mode Équipes** : `Game` a déjà une notion de joueur indexé ; il suffit d'ajouter un champ
  `team` et d'agréger dans `standings()`.
- **Thème Bar clandestin** : le design system passe par des variables CSS (`--gold`, `--red`,
  `--panel`…). Un thème = une surcharge de `:root`.
- **Mode 6+ joueurs sur tablette** : la table `LAYOUT` dans `app.js` n'attend qu'une entrée
  supplémentaire.

---

*LE CASSE — v1.0*
