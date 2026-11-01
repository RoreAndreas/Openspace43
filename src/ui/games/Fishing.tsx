// La pêche au large, au timing. Roré est en barque ; on voit la falaise de loin, le pavillon 43 et le phare.
// 1. Le lancer : une jauge va et vient, Espace la fige. Dans la zone dorée, c'est un lancer parfait (plus loin, plus beau).
// 2. La touche : une ombre s'approche, la flotte frémit (fausses touches, parfois une mouette s'y pose)… puis plonge :
//    Espace, vite, pour ferrer. Trop tôt, le poisson a peur ; trop tard, il file.
// 3. Le combat : un curseur va et vient sur une barre ; Espace quand il est dans la zone verte (au centre doré : parfait).
//    Chaque coup réussi lui ôte de la vie ; chaque raté tend la ligne : trop tendue, elle casse.
// 4. Les poissons coriaces (la dorade, le bar, le poulpe, la lotte, la raie, les légendes) traînent la barque : ils
//    filent vers le large, l'eau défile, la barque pique du nez. Il faut tenir la ligne en tapant Espace très vite : si
//    Roré gagne le bras de fer, le poisson s'épuise ; s'il perd, la ligne casse.
// Les poissons légendaires (le Thon d'Or le jour, Nessie le soir et la nuit) arrivent comme un boss : un grand (!),
// un flash rouge, une barre de vie en haut de l'écran. Le bestiaire garde chaque espèce prise (dans le navigateur) :
// son dessin, sa rareté, son record ; pour les autres, une silhouette et un indice.
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { outside, timeOfDay } from '../../engine/instance.ts';
import { paintBoat } from '../../engine/boat.ts';
import { robotSprite } from '../../engine/robots.ts';
import type { TimeOfDay } from '../../engine/room.ts';
import { useOffice } from '../../state/store.ts';
import { loadScores, saveScores, useKeys, useLoop, type FishSave } from './common.ts';

const W = 256, H = 144;
const HORIZON = 54, SURFACE = 76;
const BOAT_X = 20;
/** le bout de la canne */
const TIP = { x: BOAT_X + 56, y: SURFACE - 30 };
/** la zone dorée du lancer parfait, sur la jauge (étroite : il faut viser juste) */
const PERFECT: [number, number] = [0.87, 0.93];
/** la barre du combat (et du bras de fer) */
const BAR = { x: 48, y: 126, w: 160, h: 7 };

// ── Les prises ──
type Kind = 'sardine' | 'maquereau' | 'rouget' | 'poulpe' | 'dorade' | 'calamar' | 'bar' | 'lotte' | 'raie' | 'thon' | 'espadon' | 'coelacanthe' | 'requin' | 'nessie' | 'lune' | 'kraken' | 'anguille' | 'botte' | 'algue';
interface Spec {
  name: string; kg: [number, number]; hp: number;
  /** la vitesse du curseur, la largeur de la zone verte, le temps pour ferrer (s) */
  speed: number; zone: number; window: number;
  /** la longueur de lancer minimale (0 à 1), les heures où il sort, sa fréquence */
  far: number; when?: TimeOfDay[]; often: number;
  w: number; h: number; body: string; belly: string; fin: string;
  legend?: boolean; junk?: boolean;
  /** où et quand le trouver (l'indice du bestiaire), et ce qu'on en dit une fois pris */
  hint: string; desc: string;
  /** une anecdote, pour le bestiaire */
  fact?: string;
  /** un poisson coriace : la force avec laquelle il traîne la barque, et à quels restes de vie (part des PV) */
  tough?: number; drags?: number[];
  /** sa bouche, où la ligne est accrochée (par rapport à son centre, tourné vers la droite) */
  mouth?: [number, number];
  /** une légende : sa zone verte bouge (vite pour l'anguille), un raté tend plus la ligne (il est lourd), il saute souvent */
  drift?: number; heavy?: number; jumpy?: number;
  /** il vit au fond : il ne saute jamais, nage lentement, et reste en bas même quand il traîne la barque */
  deep?: boolean;
}
const FISH: Record<Kind, Spec> = {
  sardine: { name: 'Sardine', kg: [0.05, 0.1], hp: 2, speed: 0.9, zone: 0.26, window: 0.6, far: 0, often: 10, w: 7, h: 3, body: '#9fb4c8', belly: '#e4edf5', fin: '#6f8aa4', hint: 'près de la barque, à toute heure', desc: 'Elle file en bancs argentés juste sous la barque. La première prise de tout pêcheur.', fact: 'Un banc peut compter des millions de sardines : elles tournent toutes ensemble, comme un seul grand poisson.' },
  maquereau: { name: 'Maquereau', kg: [0.3, 0.7], hp: 3, speed: 1.1, zone: 0.22, window: 0.5, far: 0.15, often: 8, w: 10, h: 4, body: '#3f8f7a', belly: '#d8eee4', fin: '#235e50', hint: 'un peu partout, surtout au coucher du soleil', desc: 'Rayé de vert et de bleu, il mord avec appétit quand le soleil se couche.', fact: 'Il n’a pas de vessie natatoire : s’il s’arrête de nager, il coule. Il ne dort donc jamais vraiment.' },
  rouget: { name: 'Rouget', kg: [0.2, 0.5], hp: 3, speed: 1.2, zone: 0.2, window: 0.45, far: 0.25, often: 6, w: 9, h: 4, body: '#d9574a', belly: '#f6c8b8', fin: '#a83a30', hint: 'un peu au large', desc: 'Rouge vif, avec deux petites moustaches pour fouiller le sable.', fact: 'Ses barbillons goûtent le sable : il sent les petites crevettes cachées dessous.' },
  poulpe: { name: 'Poulpe', kg: [1, 4], hp: 5, speed: 1.25, zone: 0.18, window: 0.42, far: 0.1, often: 2, w: 12, h: 9, body: '#c8704a', belly: '#f0b090', fin: '#8a4a30', hint: 'près de la barque, si tu as de la chance', desc: 'Huit bras, trois cœurs, et une ventouse pour chaque rocher. Il s’accroche et tire !', tough: 0.36, drags: [0.6], fact: 'Il ouvre les bocaux, se faufile par un trou grand comme une pièce, et change de couleur en un clin d’œil.' },
  dorade: { name: 'Dorade', kg: [0.6, 1.8], hp: 4, speed: 1.3, zone: 0.18, window: 0.42, far: 0.4, often: 5, w: 11, h: 6, body: '#c8b48a', belly: '#f1e6c8', fin: '#e0b040', hint: 'au large', desc: 'Un trait doré entre les yeux. Elle se défend bien, et file d’un coup.', tough: 0.28, drags: [0.55], fact: 'Elle naît mâle, et devient femelle en grandissant.' },
  calamar: { name: 'Calamar', kg: [0.4, 1.5], hp: 4, speed: 1.35, zone: 0.17, window: 0.4, far: 0.35, when: ['evening', 'night'], often: 4, w: 13, h: 5, body: '#e8b0c8', belly: '#fff0f6', fin: '#c07898', hint: 'le soir et la nuit, au large', desc: 'Il change de couleur quand il a peur, et crache un nuage d’encre en partant.', fact: 'Son encre fait un faux calamar : le prédateur attaque le nuage pendant qu’il s’enfuit.' },
  bar: { name: 'Bar', kg: [1, 4], hp: 5, speed: 1.5, zone: 0.15, window: 0.36, far: 0.6, often: 3, w: 14, h: 5, body: '#8a98aa', belly: '#e8edf2', fin: '#5a6678', hint: 'loin, avec un bon lancer', desc: 'Le loup de mer : rusé, puissant, il tire fort vers le large.', tough: 0.4, drags: [0.6], fact: 'Les pêcheurs l’appellent aussi le loup : il chasse au crépuscule, au ras des rochers.' },
  lotte: { name: 'Lotte', kg: [2, 8], hp: 6, speed: 1.4, zone: 0.14, window: 0.36, far: 0.45, when: ['night'], often: 3, w: 14, h: 9, body: '#6a5440', belly: '#8a7058', fin: '#3e3024', hint: 'seulement la nuit', desc: 'Une bouche immense et une petite lanterne sur la tête pour attirer les curieux.', tough: 0.42, drags: [0.6], fact: 'Sa lanterne est pleine de petites bactéries qui brillent. Les curieux s’approchent… et hop.' },
  raie: { name: 'Raie', kg: [3, 12], hp: 6, speed: 1.45, zone: 0.15, window: 0.38, far: 0.65, when: ['day'], often: 2, w: 16, h: 10, body: '#6a7a8a', belly: '#e8eef4', fin: '#4a5868', hint: 'très loin, de jour', desc: 'Elle vole sous l’eau comme un oiseau… et t’emmène faire un tour en barque.', tough: 0.46, drags: [0.7, 0.35], fact: 'Elle n’a pas d’os : son squelette est en cartilage, comme le bout de ton nez.' },
  thon: { name: 'Le Thon d’Or', kg: [40, 80], hp: 12, speed: 1.9, zone: 0.13, window: 0.55, far: 0.7, when: ['day', 'evening'], often: 0, w: 26, h: 9, body: '#e8b830', belly: '#fff0a8', fin: '#b88010', legend: true, hint: 'légendaire : un lancer parfait, au loin, de jour', desc: 'La légende des pêcheurs : il brille comme une pièce d’or et nage plus vite qu’un bateau.', tough: 0.55, drags: [0.7, 0.35], fact: 'Les vieux du port disent qu’il ne se montre qu’à ceux qui lancent parfaitement. Et ils ont raison.' },
  nessie: { name: 'Nessie', kg: [300, 500], hp: 14, speed: 2.1, zone: 0.12, window: 0.55, far: 0.7, when: ['evening', 'night'], often: 0, w: 30, h: 8, body: '#e88a8a', belly: '#fff0dc', fin: '#c0606a', legend: true, hint: 'légendaire : un lancer parfait, au loin, le soir ou la nuit', desc: 'Le monstre de la grotte, rose corail. Timide… et très, très fort. On le relâche toujours.', tough: 0.6, drags: [0.7, 0.35], mouth: [19, -12], fact: 'Il chante doucement, la nuit, devant sa grotte. Si tu le prends, Roré le relâche toujours.' },
  espadon: { name: 'L’Espadon d’argent', kg: [80, 200], hp: 12, speed: 2.5, zone: 0.12, window: 0.45, far: 0.75, when: ['day'], often: 0, w: 40, h: 9, body: '#9fb0c8', belly: '#eef3fa', fin: '#4a6ad0', legend: true, hint: 'légendaire : un lancer parfait, très loin, de jour', desc: 'Le plus rapide de la mer : un rostre comme une épée, une grande voile bleue sur le dos. Il saute sans arrêt et le curseur file.', fact: 'Il dépasse les 100 km/h ; sa voile se replie quand il fonce.', tough: 0.5, drags: [0.6], jumpy: 0.8, mouth: [12, 0] },
  coelacanthe: { name: 'Le Cœlacanthe', kg: [40, 90], hp: 12, speed: 1.7, zone: 0.13, window: 0.5, far: 0.55, when: ['evening'], often: 0, w: 28, h: 12, body: '#2a4a7a', belly: '#3e6aa0', fin: '#1a3056', legend: true, hint: 'légendaire : un lancer parfait, au large, le soir', desc: 'Un poisson d’avant les dinosaures, bleu d’acier tacheté de blanc, avec des nageoires comme de petites pattes.', fact: 'On le croyait disparu depuis 66 millions d’années… jusqu’à ce qu’un pêcheur en remonte un, en 1938.', tough: 0.45, drags: [0.6], mouth: [14, 1] },
  requin: { name: 'Le Requin-baleine', kg: [2000, 9000], hp: 20, speed: 1.4, zone: 0.15, window: 0.6, far: 0.8, when: ['day'], often: 0, w: 42, h: 13, body: '#3a5a7a', belly: '#d8e2ea', fin: '#24405a', legend: true, hint: 'légendaire : un lancer parfait, très loin, de jour', desc: 'Le plus grand des poissons, doux comme un agneau : constellé de points blancs, une bouche immense pour avaler le plancton.', fact: 'Chaque requin-baleine a ses propres taches, comme une empreinte digitale.', tough: 0.55, drags: [0.7, 0.35], heavy: 1.3, mouth: [21, 2] },
  lune: { name: 'Le Poisson-lune', kg: [500, 1500], hp: 16, speed: 1.3, zone: 0.14, window: 0.6, far: 0.5, when: ['night'], often: 0, w: 22, h: 22, body: '#b8c0d0', belly: '#e8ecf4', fin: '#7a8498', legend: true, hint: 'légendaire : un lancer parfait, au large, la nuit', desc: 'Un géant rond et plat qui se laisse flotter sous la lune. Lent, mais si lourd que la ligne souffre à chaque raté.', fact: 'Le plus lourd des poissons osseux : plus d’une tonne… pour une toute petite bouche.', tough: 0.4, drags: [0.5], heavy: 1.6, mouth: [11, 1] },
  kraken: { name: 'Le Kraken', kg: [800, 2000], hp: 18, speed: 1.8, zone: 0.12, window: 0.55, far: 0.65, when: ['night'], often: 0, w: 28, h: 24, body: '#a83a4a', belly: '#c85a68', fin: '#6a2030', legend: true, hint: 'légendaire : un lancer parfait, au loin, la nuit', desc: 'Une pieuvre immense, rouge sombre. Il traîne la barque plus fort que tous les autres : tiens bon la ligne.', fact: 'Les marins d’autrefois le prenaient pour une île… jusqu’à ce que l’île se réveille.', tough: 0.68, drags: [0.75, 0.5, 0.25], mouth: [2, 4], deep: true },
  anguille: { name: 'L’Anguille-lumière', kg: [8, 25], hp: 11, speed: 2.0, zone: 0.11, window: 0.45, far: 0.7, when: ['night'], often: 0, w: 40, h: 6, body: '#26344e', belly: '#2a3a50', fin: '#8ff0ff', legend: true, hint: 'légendaire : un lancer parfait, très loin, la nuit', desc: 'Une longue anguille noire des abysses, zébrée de traits bleus qui s’allument en vagues. Elle se tortille : la zone verte bouge sans arrêt.', fact: 'Ses lumières viennent d’elle-même : elle s’en sert pour parler aux autres anguilles, dans le noir.', drift: 0.55, mouth: [21, 0] },
  botte: { name: 'Une vieille botte…', kg: [0.8, 0.8], hp: 1, speed: 0.6, zone: 0.4, window: 0.8, far: 0, often: 0, w: 8, h: 8, body: '#4a3a2c', belly: '#6b5440', fin: '#2e2418', junk: true, hint: '', desc: '' },
  algue: { name: 'Une algue, sur la tête', kg: [0.1, 0.1], hp: 1, speed: 0.6, zone: 0.4, window: 0.8, far: 0, often: 0, w: 8, h: 6, body: '#3f7a42', belly: '#5a9a52', fin: '#2f5e36', junk: true, hint: '', desc: '' },
};
const SPECIES = (Object.keys(FISH) as Kind[]).filter((k) => !FISH[k].junk);
/** La rareté, en étoiles (1 à 5). */
const rarity = (k: Kind) => (FISH[k].legend ? 5 : FISH[k].often >= 8 ? 1 : FISH[k].often >= 5 ? 2 : FISH[k].often >= 3 ? 3 : 4);

/** Ce qui mord : selon la longueur du lancer, l'heure, et la chance (un lancer parfait attire les légendes). */
function pickCatch(power: number, perfect: boolean, tod: TimeOfDay, lucky = false): Kind {
  const r = Math.random();
  if (r < 0.05) return 'botte';
  if (r < 0.08) return 'algue';
  const legends = SPECIES.filter((k) => FISH[k].legend).filter((k) => FISH[k].when!.includes(tod) && power >= FISH[k].far);
  if (legends.length && Math.random() < (perfect ? 0.12 : 0.02) * (lucky ? 2.5 : 1)) return legends[Math.floor(Math.random() * legends.length)];
  const pool = SPECIES.filter((k) => !FISH[k].legend && power >= FISH[k].far && (!FISH[k].when || FISH[k].when!.includes(tod)));
  const weight = (k: Kind) => FISH[k].often * (k === 'maquereau' && tod === 'evening' ? 3 : 1) * (perfect && FISH[k].far >= 0.4 ? 2 : 1);
  let x = Math.random() * pool.reduce((s, k) => s + weight(k), 0);
  for (const k of pool) { x -= weight(k); if (x <= 0) return k; }
  return 'sardine';
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Le rythme de nage : combien de battements de queue par seconde (au repos) ; un sprite en a 8 images par battement. */
const SWIM_HZ = 1.6, FRAMES = 8;
const fmtKg = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : kg >= 1000 ? `${(kg / 1000).toFixed(1).replace('.', ',')} t` : kg >= 100 ? `${Math.round(kg)} kg` : `${kg.toFixed(1).replace('.', ',')} kg`);

/** Un poisson, centré en (0, 0), tourné vers la droite. `tint` : une seule couleur (la silhouette du bestiaire).
 *  Tout bouge sur une même phase de nage (`A`, un tour complet par battement) : le corps ondule de la tête vers la queue,
 *  la queue bat d'un côté puis de l'autre, les nageoires pagaient, les bras et les tentacules ondulent. */
function drawFish(g: CanvasRenderingContext2D, kind: Kind, t: number, flash = false, tint?: string) {
  const s = FISH[kind];
  const A = t * Math.PI * 2 * SWIM_HZ;
  const r = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = tint ?? (flash ? '#ffffff' : c); g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const eye = (x: number, y: number) => r(x, y, 1, 1, '#15121d');
  /** l'ondulation d'un corps vu de profil, à la colonne u (0 : la queue, 1 : la tête) : la queue bouge le plus */
  const wave = (u: number, amp = 1.6) => Math.round(Math.sin(A - u * 3.2) * amp * Math.pow(1 - u, 1.6));
  /** la nageoire de queue, accrochée en (x, y) : ses deux lobes s'ouvrent d'un côté puis de l'autre */
  const tailFin = (x: number, y: number, size: number, col: string, notch = true) => {
    const sw = Math.sin(A - 0.6);
    for (let k = 0; k <= size; k++) {
      const top = y - k * (0.75 + 0.45 * sw), bot = y + k * (0.75 - 0.45 * sw);
      if (notch && k > size * 0.55) { r(x - k, top, 1, 1, col); r(x - k, bot, 1, 1, col); r(x - k, top + 1, 1, 1, col); r(x - k, bot - 1, 1, 1, col); }
      else r(x - k, top, 1, bot - top + 1, col);
    }
  };
  /** un corps fuselé de profil, de x0 (la queue) à x1 (la tête) : le dos plus sombre, le ventre clair ; renvoie
   *  l'ondulation à la queue et à la tête */
  const body = (x0: number, x1: number, h: number, back: string, extra?: (x: number, top: number, hh: number, u: number) => void) => {
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0);
      const hh = Math.max(1, Math.round(h * Math.sin(Math.PI * Math.min(1, 0.1 + u * 0.92))));
      const top = -hh / 2 + wave(u);
      r(x, top, 1, hh, s.body); r(x, top, 1, 1, back);
      if (hh > 3) r(x, top + hh - 2, 1, 2, s.belly);
      extra?.(x, top, hh, u);
    }
    return { tail: wave(0), head: wave(1) };
  };
  if (kind === 'botte') { r(-2, -4, 4, 6, s.body); r(-3, 1, 8, 3, s.body); r(-2, 2, 6, 1, s.belly); return; }
  if (kind === 'algue') { for (let i = 0; i < 5; i++) r(-4 + i * 2, -3 + Math.round(Math.sin(A + i) * 1), 1, 6, i % 2 ? s.body : s.belly); return; }
  if (kind === 'nessie') {
    // Nessie corail : ses deux bosses qui ondulent, ses nageoires qui pagaient chacune à son tour, la queue qui frétille,
    // le long cou qui se balance, la petite tête, l'œil doux et les branchies roses en plumeau
    for (let i = -12; i <= 8; i++) {
      const u = (i + 12) / 20;
      const hh = Math.max(1, Math.round(6 * Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.95))));
      const hump = Math.round(Math.max(0, Math.sin((i + 9) * 0.55 - Math.sin(A) * 0.6)) * 2.5);
      r(i, -hh / 2 - hump, 1, hh + hump, s.body);
      r(i, -hh / 2 - hump, 1, 1, '#ffb0a8');
      if (hh > 3) r(i, hh / 2 - 1, 1, 1, s.belly);
      if ((i + 20) % 4 === 1 && hh > 4) r(i, -hh / 2 - hump + 2, 1, 1, '#ffc8b8');
    }
    for (let i = 0; i < 7; i++) r(-13 - i, Math.round(Math.sin(A - i * 0.7) * (i / 3)), 1, Math.max(1, 3 - Math.floor(i / 2)), s.body);
    const p1 = Math.round(Math.sin(A) * 2), p2 = Math.round(Math.sin(A + Math.PI) * 2);
    r(-9 + p1, 2, 4, 2, s.fin); r(-8 + p1, 4, 2, 1, s.fin);
    r(3 + p2, 2, 4, 2, s.fin); r(5 + p2, 4, 2, 1, s.fin);
    const sway = Math.round(Math.sin(A * 0.5) * 1);
    for (let k = 0; k < 9; k++) { const x = 8 + Math.round(k * 0.7) + Math.round(sway * k / 9), y = -2 - k; r(x, y, 3, 1, s.body); r(x + 2, y, 1, 1, s.belly); }
    const hx = 13 + sway, hy = -14;
    r(hx, hy, 6, 4, s.body); r(hx + 4, hy + 2, 3, 2, s.body); r(hx + 1, hy + 3, 5, 1, s.belly);
    eye(hx + 3, hy + 1); r(hx + 6, hy + 2, 1, 1, '#c0606a');
    const gw = Math.round(Math.sin(A * 2) * 0.6);
    r(hx - 2, hy - 1 + gw, 1, 2, '#ff6a9a'); r(hx - 3, hy + 1, 2, 1, '#ff6a9a'); r(hx - 2, hy + 3 - gw, 1, 1, '#ff6a9a'); r(hx - 3, hy - 2 + gw, 1, 1, '#ffb0d0');
    return;
  }
  if (kind === 'thon') {
    // le Thon d'Or : fuselé, le dos bleu nuit et or, le flanc qui brille, les pinnules jaunes, la nageoire en faucille
    // qui bat, la queue en croissant
    const { tail } = body(-13, 12, s.h, '#3a3a6a', (x, top, hh, u) => { if ((x + 30) % 4 === 0 && hh > 5) r(x, top + hh / 2 - 1, 1, 1, '#fff6c8'); if (u < 0.45 && (x + 30) % 2 === 0) { r(x, top - 1, 1, 1, '#ffe040'); r(x, top + hh, 1, 1, '#ffe040'); } });
    const fl = Math.round(Math.sin(A + 1) * 2);
    for (let k = 0; k < 7; k++) r(2 - k, 1 + Math.round(k * (0.3 + fl * 0.1)), 1, 1, s.fin);
    for (let k = 0; k < 4; k++) r(-1 - k, -5 - k + wave(0.5), 2, 1, s.fin);
    tailFin(-14, tail, 6, s.fin);
    eye(9, -1); r(9, -2, 1, 1, '#ffffff');
    return;
  }
  if (kind === 'espadon') {
    // la voile bleue qui ondule, le corps fuselé argenté, le rostre, la queue en croissant qui bat
    for (let i = -6; i <= 6; i++) { const hh = Math.round(10 * Math.sin(((i + 7) / 14) * Math.PI)) + Math.round(Math.sin(A + i * 0.4) * 1); r(i, -4 - hh, 1, hh, s.fin); if (i % 3 === 0) r(i, -4 - hh, 1, hh, '#7a9af0'); r(i, -4 - hh, 1, 1, '#9fbaff'); }
    const { tail } = body(-14, 12, s.h, '#4a5a80', (x, top, hh) => { if ((x + 20) % 5 === 0 && hh > 4) r(x, top + 1, 1, hh - 3, '#8a9ab8'); });
    for (let i = 13; i <= 26; i++) r(i, -1, 1, 1, '#d8e0f0');
    r(26, -1, 1, 1, '#ffffff');
    tailFin(-15, tail, 6, '#4a5a80');
    r(-6, 3 + Math.round(Math.sin(A + 2) * 1), 4, 1, s.fin); eye(9, -1); r(9, -2, 1, 1, '#ffffff');
    return;
  }
  if (kind === 'coelacanthe') {
    // le corps massif tacheté qui ondule, les nageoires lobées qui pagaient l'une après l'autre (comme des pattes), la
    // queue à trois lobes, l'œil qui luit
    const { tail } = body(-13, 13, s.h, '#3e6aa0', (x, top, hh) => { if ((x * 7 + 3) % 9 === 0 && hh > 6) r(x, top + 3 + (x % 3), 2, 1, '#e8eef6'); });
    tailFin(-14, tail, 4, s.fin, false); r(-19, tail - 1, 3, 2, s.fin);
    ([[-3, 5, 1, 0], [5, 5, 1, 2], [-1, -6, -1, 1], [8, -5, -1, 3]] as [number, number, number, number][]).forEach(([x, y, d, ph]) => {
      const sx = Math.round(Math.sin(A + ph * 1.6) * 2);
      r(x, y, 1, 2, s.fin); r(x - 1 + sx, y + (d > 0 ? 2 : -2), 3, 1, s.fin);
    });
    r(10, -2, 2, 2, '#ffe08a'); eye(11, -2);
    r(13, 1, 1, 1, '#0a1530');
    return;
  }
  if (kind === 'requin') {
    // énorme, constellé de points blancs, des arêtes le long du dos ; il ondule lentement, la grande queue bat
    const { tail } = body(-20, 20, s.h, '#2a4a6a', (x, top, hh) => { if ((x + 40) % 7 === 0) r(x, top + 1, 1, hh - 4, '#4a6a8a'); if ((x * 13) % 11 < 2 && hh > 6) r(x, top + 2 + ((x * 5) % 5), 1, 1, '#e8eef6'); });
    for (let k = 0; k < 6; k++) r(-3 + k, -7 - Math.min(k, 5 - k) + wave(0.45), 1, Math.min(k, 5 - k) + 1, s.fin);
    tailFin(-21, tail, 8, s.fin);
    r(14, 2, 7, 1, '#15121d'); eye(16, -2);
    r(4, 4 + Math.round(Math.sin(A) * 1), 5, 1, s.fin);
    return;
  }
  if (kind === 'lune') {
    // le grand disque gris d'argent ; ses deux hautes nageoires battent d'un côté puis de l'autre, son bord de queue
    // ondule ; le gros œil, la petite bouche
    const sw = Math.sin(A);
    for (let k = 0; k < 9; k++) { const lean = Math.round(sw * k * 0.35); r(-2 + lean, -10 - k, 3 - Math.floor(k / 4), 1, s.fin); r(-2 - lean, 10 + k, 3 - Math.floor(k / 4), 1, s.fin); }
    for (let dy = -10; dy <= 10; dy++) { const w = Math.round(10 * Math.sqrt(Math.max(0, 1 - (dy / 10.5) ** 2))); r(-w, dy, w * 2 + 1, 1, dy > 3 ? s.belly : s.body); r(-w, dy, 1, 1, '#8a94a8'); }
    for (let dy = -8; dy <= 8; dy += 2) r(-11 + Math.round(Math.sin(A + dy * 0.4) * 1), dy, 1, 1, s.fin);
    for (const [x, y] of [[-5, -4], [-1, 5], [3, -6], [-6, 2], [2, 1]]) r(x, y, 1, 1, '#d8dee8');
    r(5, -4, 3, 3, '#f4f8ff'); r(6, -3, 2, 2, '#15121d'); r(5, -4, 1, 1, '#ffffff');
    r(10, 0, 1, 2, '#4a5468'); r(-4, Math.round(sw), 3, 1, s.fin);
    return;
  }
  if (kind === 'kraken' || kind === 'poulpe') {
    // la tête qui se gonfle et se dégonfle ; les bras qui ondulent, chacun à son tour, et s'enroulent au bout ; les ventouses
    const big = kind === 'kraken';
    const n = big ? 6 : 4, len = big ? 13 : 8, sp = big ? 2.6 : 2.4, x0 = big ? -6 : -6;
    for (let a = 0; a < n; a++) {
      const side = a < n / 2 ? -1 : 1;
      for (let i = 0; i < len; i++) {
        const q = i / len;
        const x = x0 + a * sp + Math.sin(A + a * 0.9 - i * 0.45) * (0.5 + i * (big ? 0.35 : 0.3)) + side * i * (big ? 0.6 : 0.35) + (q > 0.7 ? side * (1 + Math.sin(A + a)) * (big ? 2 : 1.5) : 0);
        const y = (big ? 2 : 3) + i * (big ? 0.85 : 0.95) - (big && q > 0.8 ? (q - 0.8) * 10 * (0.6 + 0.4 * Math.sin(A * 1.3 + a)) : 0);
        r(x, y, i < len / 2 ? 2 : 1, 1, s.body); if (i % 3 === 1) r(x + 1, y, 1, 1, big ? '#f0b8c0' : s.belly);
      }
    }
    const pulse = Math.sin(A) * 0.7;
    if (big) {
      for (let dy = -11; dy <= 3; dy++) { const w = Math.round((8 + pulse) * Math.sqrt(Math.max(0, 1 - ((dy + 4) / 7.6) ** 2))); r(-w, dy, w * 2 + 1, 1, dy < -6 ? s.belly : s.body); }
      for (const [x, y] of [[-4, -8], [2, -9], [-1, -5], [5, -6]]) r(x, y, 1, 1, s.fin);
      r(1, -4, 4, 1, s.fin); r(1, -3, 4, 2, '#ffe08a'); r(2, -2, 3, 1, '#15121d'); r(4, -3, 1, 1, '#fff6d0');
    } else {
      for (let dy = -4; dy <= 2; dy++) { const w = Math.round((4 + pulse * 0.6) * Math.sqrt(Math.max(0, 1 - ((dy + 1) / 3.6) ** 2))); r(-3 - w, dy, w * 2 + 1, 1, dy > 0 ? s.belly : s.body); }
      eye(-1, -1); eye(-5, -1);
    }
    return;
  }
  if (kind === 'calamar') {
    // le manteau en pointe (il nage à reculons), les nageoires qui battent, les yeux, les tentacules qui ondulent
    const fl = Math.round(Math.sin(A) * 1);
    for (let i = 0; i < 9; i++) { const hh = Math.max(1, Math.round(1 + i * 0.45)); r(-8 + i, -Math.floor(hh / 2), 1, hh, i % 2 ? s.body : s.fin); }
    r(-8, -3 - fl, 2, 1, s.fin); r(-8, 2 + fl, 2, 1, s.fin); r(-9, -2 - fl, 1, 1, s.fin); r(-9, 1 + fl, 1, 1, s.fin);
    r(1, -2, 2, 4, s.belly); eye(2, -1);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 7; i++) r(3 + i, -1 + k + Math.round(Math.sin(A + k - i * 0.7) * (0.4 + i * 0.25)), 1, 1, i % 2 ? s.fin : s.body);
    return;
  }
  if (kind === 'raie') {
    // un losange : les ailes ondulent de l'avant vers l'arrière, la longue queue fouette, les yeux sur le dessus
    for (let i = 0; i < s.w; i++) {
      const u = i / (s.w - 1), d = Math.abs(u - 0.55);
      const hh = Math.max(1, Math.round(s.h * (1 - d * 1.8)));
      const flap = Math.round(Math.sin(A - u * 3) * d * 4);
      r(i - s.w / 2, -Math.floor(hh / 2) - flap, 1, hh + flap * 2 > 0 ? hh : 1, s.body);
      if (hh > 3) r(i - s.w / 2, Math.ceil(hh / 2) - 1 + flap, 1, 1, s.belly);
    }
    for (let i = 0; i < 9; i++) r(-s.w / 2 - i, Math.round(Math.sin(A * 1.3 - i * 0.7) * (i / 4)), 1, 1, s.fin);
    eye(s.w / 2 - 4, -2); eye(s.w / 2 - 4, 1);
    return;
  }
  if (kind === 'anguille') {
    // longue, noire, elle ondule d'un bout à l'autre ; ses traits bleus s'allument en vagues ; l'œil qui luit
    for (let i = -20; i <= 18; i++) {
      const y = Math.round(Math.sin(A - i * 0.3) * 2.2), hh = i < -16 ? 1 : i > 15 ? 2 : 3;
      r(i, y - Math.floor(hh / 2), 1, hh, s.body);
      r(i, y - Math.floor(hh / 2), 1, 1, '#3e5070');
      if (((i + 40) % 3 === 0) && Math.sin(A * 1.5 - i * 0.4) > -0.3) { r(i, y, 1, 1, s.fin); if (hh > 2) r(i, y - 1, 1, 1, '#c8faff'); }
    }
    const hy = Math.round(Math.sin(A - 18 * 0.3) * 2.2);
    r(18, hy - 2, 4, 4, s.body); r(20, hy - 1, 1, 1, '#e8fbff'); r(21, hy + 1, 1, 1, s.fin);
    return;
  }
  // les poissons ordinaires, de profil : le corps qui ondule, la queue qui bat, une petite nageoire sur le dos
  const hw = Math.floor(s.w / 2);
  let tailY = 0, headY = 0;
  for (let i = 0; i < s.w; i++) {
    const u = i / (s.w - 1);
    const shape = kind === 'lotte' ? Math.min(1, 0.35 + u * 0.9) : Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.9));
    const hh = Math.max(1, Math.round(s.h * shape));
    const off = wave(u, s.h > 5 ? 1.6 : 1.2);
    if (i === 0) tailY = off;
    if (i === s.w - 1) headY = off;
    r(i - hw, -Math.floor(hh / 2) + off, 1, hh, s.body);
    if (hh > 2) r(i - hw, Math.ceil(hh / 2) - 1 + off, 1, 1, s.belly);
    if (kind === 'maquereau' && i % 2 === 0 && u < 0.8) r(i - hw, -Math.floor(hh / 2) + off, 1, 1, '#235e50');
  }
  tailFin(-hw - 1, tailY, s.h > 6 ? 4 : s.h > 3 ? 3 : 2, s.fin);
  if (s.h > 4) r(-1, -Math.ceil(s.h / 2) - 1 + wave(0.45), 3, 1, s.fin);
  eye(s.w - hw - 3, -1 + headY);
  if (kind === 'lotte') { r(s.w - hw - 2, -7, 1, 3, s.fin); r(s.w - hw - 2, -9 + Math.round(Math.sin(A) * 1), 2, 2, '#fff2a0'); }
  if (kind === 'dorade') r(s.w - hw - 5, -2 + headY, 1, 3, s.fin);
}

// en développement seulement : le dessin des poissons, pour les planches d'essai
if (import.meta.env.DEV) (window as unknown as { __fishDraw?: unknown }).__fishDraw = { drawFish, FISH };

/** Les sprites des poissons, comme dans un vieux jeu : chaque espèce en huit images de nage (un battement complet), tournée par crans de
 *  22,5° au pixel près (sans lissage, chaque pixel reste un pixel), vers la droite ou vers la gauche. Gardés en mémoire. */
const SPR = 96, SPC = 48;
const sprites = new Map<string, HTMLCanvasElement>();
function fishSprite(kind: Kind, frame: number, step: number, face: number, flash: boolean, depth = 0): HTMLCanvasElement {
  const key = `${kind}|${frame}|${step}|${face}|${flash}|${depth}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const base = document.createElement('canvas'); base.width = base.height = SPR;
  const bg = base.getContext('2d')!;
  bg.imageSmoothingEnabled = false;
  bg.save(); bg.translate(SPC, SPC); drawFish(bg, kind, frame / (FRAMES * SWIM_HZ), flash); bg.restore();
  if (!flash) shade(bg);
  let out = base;
  if (step % 16 !== 0) {
    // la rotation au plus proche voisin : chaque pixel d'arrivée va chercher le pixel de départ qui tombe dessus
    out = document.createElement('canvas'); out.width = out.height = SPR;
    const og = out.getContext('2d')!;
    const th = (step * Math.PI) / 8, cs = Math.cos(th), sn = Math.sin(th);
    const src = bg.getImageData(0, 0, SPR, SPR).data, img = og.createImageData(SPR, SPR), d = img.data;
    for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
      const dx = x - SPC + 0.5, dy = y - SPC + 0.5;
      const sx = Math.floor(cs * dx + sn * dy + SPC), sy = Math.floor(-sn * dx + cs * dy + SPC);
      if (sx < 0 || sy < 0 || sx >= SPR || sy >= SPR) continue;
      const i = (y * SPR + x) * 4, j = (sy * SPR + sx) * 4;
      d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; d[i + 3] = src[j + 3];
    }
    og.putImageData(img, 0, 0);
  }
  if (face < 0 || depth > 0) {
    const m = document.createElement('canvas'); m.width = m.height = SPR;
    const mg = m.getContext('2d')!;
    if (face < 0) { mg.translate(SPR, 0); mg.scale(-1, 1); }
    mg.drawImage(out, 0, 0);
    // plus il est profond, plus l'eau le bleuit et l'assombrit
    if (depth > 0) { mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'source-atop'; mg.fillStyle = `rgba(14,48,96,${0.16 * depth})`; mg.fillRect(0, 0, SPR, SPR); }
    out = m;
  }
  if (sprites.size > 6000) sprites.clear();
  sprites.set(key, out);
  return out;
}

/** Du relief, comme dans le pixel art soigné : chaque colonne du poisson s'éclaire en haut (un liseré de lumière sur le
 *  dos) et s'assombrit en bas ; puis un contour, plus sombre que la couleur qu'il borde (pas un trait noir partout). */
function shade(g: CanvasRenderingContext2D) {
  const img = g.getImageData(0, 0, SPR, SPR), d = img.data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < SPR && y < SPR && d[(y * SPR + x) * 4 + 3] > 40;
  for (let x = 0; x < SPR; x++) {
    let top = -1, bot = -1;
    for (let y = 0; y < SPR; y++) if (on(x, y)) { if (top < 0) top = y; bot = y; }
    if (top < 0) continue;
    for (let y = top; y <= bot; y++) {
      if (!on(x, y)) continue;
      const rel = (y - top) / Math.max(1, bot - top);
      const k = y === top ? 0.38 : rel < 0.22 ? 0.18 : rel < 0.4 ? 0.06 : rel > 0.82 ? -0.3 : rel > 0.62 ? -0.12 : 0;
      const i = (y * SPR + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = k > 0 ? d[i + c] + (255 - d[i + c]) * k : d[i + c] * (1 + k);
    }
  }
  const src = new Uint8ClampedArray(d);
  const at = (x: number, y: number) => (y * SPR + x) * 4;
  for (let y = 1; y < SPR - 1; y++) for (let x = 1; x < SPR - 1; x++) {
    if (src[at(x, y) + 3] > 40) continue;
    let n = -1;
    for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (src[at(x + ox, y + oy) + 3] > 40) { n = at(x + ox, y + oy); break; }
    if (n < 0) continue;
    const i = at(x, y);
    d[i] = src[n] * 0.32; d[i + 1] = src[n + 1] * 0.32; d[i + 2] = src[n + 2] * 0.36 + 8; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** La taille d'un poisson à l'écran pendant le combat : en pixels entiers (les petites légendes ×2). */
const fishScale = (kind: Kind) => (FISH[kind].legend && FISH[kind].w < 30 ? 2 : 1);

const SKY = { day: ['#7cbaec', '#9bcdf1', '#bcdff5', '#dcedf7'], evening: ['#3a2f6a', '#7a4579', '#d9786a', '#ffb27a'], night: ['#0b1030', '#121a42', '#18234c', '#202d5a'] };
const SEA = { day: ['#a6d2ea', '#5aa0cc', '#2a78b2', '#175a92'], evening: ['#f0a88a', '#8a5a88', '#4a3a72', '#2c2858'], night: ['#28335e', '#1a2850', '#0f1c40', '#0a1532'] };

type Phase = 'ready' | 'boat' | 'aim' | 'cast' | 'wait' | 'warn' | 'bite' | 'fight' | 'drag' | 'catch' | 'fail';
interface Bit { x: number; y: number; vx: number; vy: number; life: number; col: string }
interface Card { title: string; sub: string; legend: boolean; junk: boolean; record: boolean }

export function Fishing({ lucky = false }: { lucky?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const tod = timeOfDay(useOffice.getState().tod);
  const journal = useRef(loadScores().fish.journal);
  const s = useRef({
    phase: 'ready' as Phase, t: 0, until: 0,
    power: 0, powDir: 1, perfect: false, castT: 0, landX: 160,
    bobX: TIP.x, bobY: TIP.y, dip: 0,
    kind: 'sardine' as Kind, kg: 0, hp: 0, shownHp: 0, trailHp: 0,
    shadow: null as null | { x: number; vx: number; y: number },
    nibbles: 0, nextNibble: 0, nextEvent: 0,
    gull: null as null | { x: number; y: number; t: number },
    cursor: 0, curDir: 1, zone: 0.5, tension: 0, rage: false,
    hitAt: -9, missAt: -9, jumpAt: -9, flashAt: -9, shake: 0,
    catchAt: -9, failAt: -9, algaeUntil: -9, sadUntil: -9,
    // le bras de fer : où en est la corde (1 : Roré gagne, 0 : la ligne casse), combien de fois il a déjà tiré, la
    // barque traînée (son décalage) et l'eau qui défile
    rope: 0.5, drags: 0, dragAt: -9, pressAt: -9, towX: 0, scroll: 0,
    // le poisson accroché : où il nage, sa vitesse, son côté, quand il s'est retourné, où il va, s'il fonce, son saut
    swim: { x: 160, y: SURFACE + 14, vx: 0, vy: 0, face: 1, turnAt: -9, tx: 160, ty: SURFACE + 20, next: 0, dart: false, jump: null as null | { t0: number; x0: number; y0: number; dir: number }, out: false },
    rings: [] as { x: number; t0: number; w: number }[],
    bubbles: [] as { x: number; y: number; t0: number }[],
    bits: [] as Bit[], confetti: [] as Bit[],
    msg: '', msgAt: -9,
  });
  const [hud, setHud] = useState({ phase: 'ready' as Phase, card: null as Card | null, journal: { ...journal.current } });
  const [book, setBook] = useState(false);
  // en développement seulement : l'état du jeu, pour les essais (forcer une légende…)
  if (import.meta.env.DEV) (window as unknown as { __fishing?: unknown }).__fishing = s.current;
  const set = (phase: Phase, card: Card | null = null) => { s.current.phase = phase; setHud({ phase, card, journal: { ...journal.current } }); };
  const say = (msg: string) => { s.current.msg = msg; s.current.msgAt = s.current.t; };
  const spec = () => FISH[s.current.kind];

  const splash = (x: number, n: number, col = '#ffffff') => {
    for (let i = 0; i < n; i++) s.current.bits.push({ x, y: SURFACE, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 45, life: 0.8, col });
  };
  const confetti = (n: number) => {
    const cols = ['#ffd166', '#ff6fa8', '#3ddc97', '#4fb3ff', '#ffffff', '#ff8a3d'];
    for (let i = 0; i < n; i++) s.current.confetti.push({ x: BOAT_X + 30, y: SURFACE - 40, vx: (Math.random() - 0.5) * 140, vy: -40 - Math.random() * 80, life: 1.8, col: cols[i % cols.length] });
  };

  /** Une nouvelle touche se prépare : quelle espèce, quand arrive son ombre. */
  const prepare = () => {
    const st = s.current;
    st.kind = pickCatch(st.power, st.perfect, tod, lucky);
    st.shadow = null;
    st.nibbles = Math.floor(Math.random() * 4);
    st.nextEvent = st.t + 0.8 + Math.random() * 1.8;
  };

  const action = () => {
    const st = s.current;
    switch (st.phase) {
      case 'ready': set('boat'); sfx('click'); return;
      case 'boat': st.power = 0; st.powDir = 1; set('aim'); sfx('tick'); return;
      case 'aim': {
        st.perfect = st.power >= PERFECT[0] && st.power <= PERFECT[1];
        st.landX = 104 + st.power * 140;
        st.castT = 0;
        set('cast');
        sfx('send');
        if (st.perfect) say('LANCER PARFAIT !');
        else if (st.power < 0.2) say('PLOUF... JUSTE A COTE');
        return;
      }
      case 'wait':
        // trop tôt : le poisson prend peur
        if (st.shadow) { st.shadow.vx = (st.shadow.x < st.bobX ? -1 : 1) * 90; say('TROP TOT ! IL A EU PEUR'); sfx('no'); st.nextEvent = st.t + 1.6; st.shadow = null; prepare(); }
        return;
      case 'bite': {
        const sp = spec();
        st.hp = sp.hp; st.shownHp = sp.hp; st.trailHp = sp.hp;
        st.kg = Math.round((sp.kg[0] + Math.random() * (sp.kg[1] - sp.kg[0])) * 100) / 100;
        st.cursor = 0; st.curDir = 1; st.zone = 0.3 + Math.random() * 0.4; st.tension = 0; st.rage = false; st.drags = 0;
        Object.assign(st.swim, { x: st.bobX, y: SURFACE + 8, vx: 0, vy: sp.deep ? 30 : 20, face: Math.random() < 0.5 ? -1 : 1, next: 0, dart: !sp.deep, jump: null, out: false });
        st.rings.push({ x: st.bobX, t0: st.t, w: 1 });
        set('fight');
        sfx('check');
        say(sp.legend ? 'FERRE ! LE COMBAT COMMENCE' : 'FERRE !');
        splash(st.bobX, 10);
        return;
      }
      case 'fight': strike(); return;
      case 'drag':
        // le bras de fer : chaque coup d'Espace ramène un peu la corde vers Roré
        st.rope = Math.min(1, st.rope + 0.08);
        st.pressAt = st.t;
        sfx('tick', 0.9 + st.rope * 0.8);
        if (st.rope >= 1) tire();
        return;
    }
  };

  /** Un coup pendant le combat : dans la zone verte, il perd de la vie ; à côté, la ligne se tend. */
  const strike = () => {
    const st = s.current, sp = spec();
    const d = Math.abs(st.cursor - st.zone);
    if (d < sp.zone / 2) {
      const perfect = d < sp.zone / 6;
      st.hp -= perfect ? 2 : 1;
      st.hitAt = st.t;
      st.zone = sp.zone / 2 + Math.random() * (1 - sp.zone);
      sfx('check', perfect ? 1.3 : 1);
      say(perfect ? 'PARFAIT !' : 'BIEN !');
      if (!sp.deep && Math.random() < (sp.jumpy ?? (sp.legend ? 0.45 : 0.3)) && !st.swim.jump) { st.jumpAt = st.t; st.swim.jump = { t0: st.t, x0: st.swim.x, y0: Math.max(SURFACE + 6, st.swim.y), dir: st.swim.face }; }
      if (sp.legend && !st.rage && st.hp <= sp.hp / 2) { st.rage = true; st.flashAt = st.t; st.shake = 0.6; say('IL ENRAGE !'); sfx('error'); }
      if (st.hp <= 0) { land(); return; }
      // un poisson coriace : passé un certain reste de vie, il file et traîne la barque
      const next = sp.drags?.[st.drags];
      if (sp.tough && next !== undefined && st.hp <= sp.hp * next) startDrag();
    } else {
      st.tension += (sp.legend ? 0.3 : 0.34) * (sp.heavy ?? 1);
      st.missAt = st.t;
      st.shake = 0.25;
      sfx('no');
      say('RATE !');
      if (st.tension >= 1) snap();
    }
  };

  const startDrag = () => {
    const st = s.current;
    st.drags++;
    st.rope = 0.5;
    st.dragAt = st.t;
    st.shake = 0.5;
    splash(st.bobX, 14);
    sfx('error');
    say('IL T’EMMENE !');
    set('drag');
  };

  /** Le bras de fer est gagné : le poisson s'épuise, il perd de la vie, et le combat reprend. */
  const tire = () => {
    const st = s.current;
    st.hp -= 2;
    st.hitAt = st.t;
    st.tension = Math.max(0, st.tension - 0.3);
    splash(st.bobX, 10);
    sfx('done');
    say('IL S’EPUISE !');
    if (st.hp <= 0) land(); else set('fight');
  };

  const land = () => {
    const st = s.current, sp = spec();
    st.catchAt = st.t;
    st.until = st.t + (sp.legend ? 4 : 3);
    splash(st.bobX, 14);
    let record = false;
    if (!sp.junk) {
      const prev = journal.current[st.kind];
      record = !!prev && st.kg > prev.kg;
      journal.current = { ...journal.current, [st.kind]: { n: (prev?.n ?? 0) + 1, kg: Math.max(prev?.kg ?? 0, st.kg) } };
      const sc = loadScores();
      sc.fish = { journal: journal.current };
      saveScores(sc);
      confetti(sp.legend ? 90 : record || !prev ? 40 : 18);
      sfx(sp.legend || record ? 'done' : 'check');
      outside.fx.floatIcon(outside.rore.x, outside.rore.y - 26, 'heart');
    } else {
      if (st.kind === 'algue') st.algaeUntil = st.t + 6;
      st.sadUntil = st.t + 3;
      sfx('no');
    }
    const card: Card = sp.junk
      ? { title: sp.name, sub: st.kind === 'botte' ? 'Elle n’est même pas à sa taille.' : 'Roré la garde comme un chapeau.', legend: false, junk: true, record: false }
      : { title: sp.legend ? `${sp.name} !` : sp.name, sub: `${fmtKg(st.kg)}${record ? ' · nouveau record !' : !journal.current[st.kind] || journal.current[st.kind].n === 1 ? ' · nouveau dans le bestiaire' : ''}`, legend: !!sp.legend, junk: false, record };
    set('catch', card);
  };

  const snap = () => {
    const st = s.current;
    st.failAt = st.t;
    st.until = st.t + 2.4;
    st.shake = 0.5;
    say('TCHAC ! LA LIGNE A CASSE');
    sfx('error');
    set('fail', { title: 'La ligne a cassé…', sub: spec().legend ? `${spec().name} est reparti au fond. Il reviendra.` : 'Roré tombe à la renverse dans la barque.', legend: false, junk: true, record: false });
  };

  /** Le poisson accroché nage : il file vers un point au hasard (parfois il fonce), se retourne, remonte quand il
   *  fatigue et se rapproche de la barque ; quand il saute, il suit un arc, sort de l'eau dans une gerbe et y rentre. */
  const this_swim = (dt: number) => {
    const st = s.current, sw = st.swim, t = st.t, sp = spec();
    if (sw.jump) {
      const j = sw.jump, u = (t - j.t0) / 1.0;
      const peak = SURFACE - (sp.legend ? 46 : 30);
      if (u >= 1) { sw.jump = null; sw.vx = j.dir * 30; sw.vy = 40; }
      else {
        sw.x = j.x0 + j.dir * u * 46;
        sw.y = j.y0 - (j.y0 - peak) * (1 - (2 * u - 1) ** 2);
        sw.vx = j.dir * 46; sw.vy = (j.y0 - peak) * 4 * (2 * u - 1);
        sw.face = j.dir;
      }
    } else {
      // il s'épuise : il remonte et se rapproche de la barque à mesure qu'il perd de la vie
      const tired = 1 - Math.max(0, st.hp) / sp.hp;
      const anchor = Math.min(st.landX, 210) - tired * 70;
      if (t > sw.next) {
        sw.next = t + 0.5 + Math.random() * 0.9;
        sw.dart = Math.random() < 0.35;
        sw.tx = Math.max(BOAT_X + 70, Math.min(W - 16, anchor + (Math.random() - 0.5) * 80));
        sw.ty = sp.deep ? SURFACE + 22 + Math.random() * 8 - tired * 4 : SURFACE + 9 + Math.random() * (34 - tired * 18);
        if (sp.deep) { sw.dart = false; sw.tx = anchor + (Math.random() - 0.5) * 40; }
      }
      const spd = (sw.dart ? 72 : 30) * (st.rage ? 1.3 : 1) * (sp.deep ? 0.35 : 1);
      const dx = sw.tx - sw.x, dy = sw.ty - sw.y, dl = Math.max(1, Math.hypot(dx, dy));
      sw.vx += ((dx / dl) * spd - sw.vx) * Math.min(1, dt * 3);
      sw.vy += ((dy / dl) * spd * 0.6 - sw.vy) * Math.min(1, dt * 3);
      // il se retourne quand il change franchement de côté
      if (sw.vx * sw.face < -8) { sw.face = -sw.face; sw.turnAt = t; }
      if (sw.dart && Math.random() < dt * 10) st.bubbles.push({ x: sw.x - sw.face * 6, y: sw.y - 1, t0: t });
    }
    sw.x += sw.vx * dt; sw.y += sw.vy * dt;
    // la gerbe quand il sort de l'eau, et quand il y retombe
    const out = sw.y < SURFACE - 1;
    if (out !== sw.out) {
      sw.out = out;
      const n = sp.legend ? 18 : 11;
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.8; st.bits.push({ x: sw.x, y: SURFACE - 1, vx: Math.cos(a) * (40 + Math.random() * 25), vy: Math.sin(a) * (55 + Math.random() * 30), life: 0.9, col: i % 3 ? '#ffffff' : '#bfe6ff' }); }
      st.rings.push({ x: sw.x, t0: t, w: sp.legend ? 2 : 1 });
      if (!out) for (let i = 0; i < 6; i++) st.bubbles.push({ x: sw.x + (i - 3) * 2, y: SURFACE + 4 + i * 2, t0: t });
    }
    st.bobX = sw.x;
  };

  const step = (dt: number) => {
    const st = s.current;
    for (const k of keys.take()) if (k === ' ' || k === 'enter') action();
    st.t += dt;
    const t = st.t;
    st.shake = Math.max(0, st.shake - dt);
    st.dip = Math.max(0, st.dip - dt * 6);
    for (const b of [...st.bits, ...st.confetti]) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt; b.life -= dt; }
    st.bits = st.bits.filter((b) => b.life > 0 && b.y < SURFACE + 2);
    st.confetti = st.confetti.filter((b) => b.life > 0);
    for (const b of st.bubbles) { b.y -= dt * 14; b.x += Math.sin((t - b.t0) * 6) * dt * 4; }
    st.bubbles = st.bubbles.filter((b) => b.y > SURFACE + 1);
    st.rings = st.rings.filter((r) => t - r.t0 < 1.2);
    if (st.gull) { st.gull.t += dt; if (st.gull.t > 3) st.gull = null; }
    // la barque traînée revient doucement à sa place ; l'eau ralentit
    if (st.phase !== 'drag') { st.towX += (0 - st.towX) * Math.min(1, dt * 1.5); st.scroll += dt * 4; }
    switch (st.phase) {
      case 'aim':
        st.power += st.powDir * 1.25 * dt;
        if (st.power >= 1) { st.power = 1; st.powDir = -1; }
        if (st.power <= 0) { st.power = 0; st.powDir = 1; }
        break;
      case 'cast': {
        st.castT += dt / 0.75;
        const u = Math.min(1, st.castT);
        st.bobX = TIP.x + (st.landX - TIP.x) * u;
        st.bobY = TIP.y + (SURFACE - TIP.y) * u - Math.sin(u * Math.PI) * 34;
        if (u >= 1) { st.bobY = SURFACE; splash(st.bobX, 9); sfx('glug'); prepare(); set('wait'); }
        break;
      }
      case 'wait': {
        // parfois, une mouette se pose sur la flotte (une fausse touche, pour rire)
        if (!st.gull && Math.random() < dt * 0.06) st.gull = { x: st.bobX, y: SURFACE - 3, t: 0 };
        if (st.gull && st.gull.t > 0.8 && st.gull.t < 2.2 && Math.random() < dt * 3) st.dip = 0.4;
        if (!st.shadow && t > st.nextEvent) {
          const side = Math.random() < 0.5 ? -1 : 1;
          st.shadow = { x: st.bobX + side * (50 + Math.random() * 30), vx: 42, y: SURFACE + 22 + Math.random() * 26 };
        }
        if (st.shadow) {
          const sh = st.shadow;
          const dx = st.bobX - sh.x;
          if (Math.abs(dx) > 3) sh.x += Math.sign(dx) * Math.min(Math.abs(dx), Math.abs(sh.vx) * dt);
          sh.y += (SURFACE + 10 - sh.y) * dt * 0.8;
          if (Math.abs(dx) <= 3 && t > st.nextNibble) {
            if (st.nibbles > 0) { st.nibbles--; st.dip = 0.45; st.nextNibble = t + 0.6 + Math.random() * 0.9; sfx('tick', 1.6); }
            else if (spec().legend) { st.until = t + 1.3; st.flashAt = t; st.shake = 1.3; set('warn'); sfx('error'); }
            else { st.until = t + spec().window; st.dip = 1; set('bite'); sfx('ask'); }
          }
        }
        break;
      }
      case 'warn':
        if (t > st.until) { st.until = t + spec().window; st.dip = 1; set('bite'); sfx('ask'); }
        break;
      case 'bite':
        st.dip = 1;
        if (t > st.until) { say('TROP TARD... IL A FILE'); sfx('no'); st.shadow = null; prepare(); set('wait'); }
        break;
      case 'fight': {
        const sp = spec();
        const speed = sp.speed * (st.rage ? 1.35 : 1);
        st.cursor += st.curDir * speed * dt;
        if (st.cursor >= 1) { st.cursor = 1; st.curDir = -1; }
        if (st.cursor <= 0) { st.cursor = 0; st.curDir = 1; }
        if (sp.legend) st.zone = Math.max(sp.zone / 2, Math.min(1 - sp.zone / 2, st.zone + Math.sin(t * (sp.drift ? 3.1 : 1.7)) * (sp.drift ?? 0.12) * dt));
        st.tension = Math.max(0, st.tension - 0.05 * dt);
        st.dip = 0.8;
        this_swim(dt);
        break;
      }
      case 'drag': {
        Object.assign(st.swim, { x: st.bobX + 6, y: spec().deep ? SURFACE + 24 : SURFACE + 5, vx: spec().deep ? 18 : 60, vy: 0, face: 1, jump: null });
        // il tire par à-coups, plus fort quand il enrage ; la barque est traînée, l'eau défile
        const sp = spec();
        // il tire par à-coups ; la première demi-seconde, Roré a le temps de réagir
        const pull = (sp.tough ?? 0.3) * 0.8 * (st.rage ? 1.25 : 1) * (0.75 + 0.5 * Math.max(0, Math.sin(t * 3.1))) * Math.min(1, (t - st.dragAt) / 0.6);
        st.rope -= pull * dt;
        st.towX += (34 - st.towX) * Math.min(1, dt * 0.9);
        st.scroll += dt * (60 + pull * 120);
        st.bobX += ((sp.deep ? W - 46 : W - 26) + Math.sin(t * 2.2) * 10 - st.bobX) * Math.min(1, dt * 2);
        st.dip = 1;
        st.tension = 0.4 + (1 - st.rope) * 0.6;
        if (Math.random() < dt * 14) st.bits.push({ x: BOAT_X + st.towX + 44, y: SURFACE - 2, vx: 20 + Math.random() * 30, vy: -30 - Math.random() * 30, life: 0.6, col: '#ffffff' });
        if (st.rope >= 1) tire();
        else if (st.rope <= 0) snap();
        break;
      }
      case 'catch': case 'fail':
        if (t > st.until) { st.bobX = TIP.x; st.bobY = TIP.y; set('boat'); }
        break;
    }
    // la barre de vie suit en douceur ; la traînée claire la rattrape plus lentement (comme pour un boss)
    st.shownHp += (Math.max(0, st.hp) - st.shownHp) * Math.min(1, dt * 10);
    st.trailHp += (st.shownHp - st.trailHp) * Math.min(1, dt * 2.2);
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current, t = st.t, sp = spec();
    const sky = SKY[tod], sea = SEA[tod];
    const night = tod === 'night';
    const dragging = st.phase === 'drag';
    const sc = st.scroll;
    const BX = BOAT_X + Math.round(st.towX);
    const tipBase = { x: TIP.x + Math.round(st.towX), y: TIP.y };
    const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const wrap = (x: number, span: number) => ((x % span) + span) % span;
    g.save();
    if (st.shake > 0) g.translate(Math.round((Math.random() - 0.5) * 4 * Math.min(1, st.shake * 3)), Math.round((Math.random() - 0.5) * 3 * Math.min(1, st.shake * 3)));
    // le ciel en bandes, tramées entre elles ; l'astre, les nuages (ils défilent quand la barque est traînée)
    const bh = Math.ceil(HORIZON / sky.length);
    sky.forEach((col, i) => r(0, i * bh, W, bh, col));
    for (let i = 1; i < sky.length; i++) for (let x = (i % 2) * 2; x < W; x += 4) r(x, i * bh, 1, 1, sky[i - 1]);
    if (night) { r(214, 10, 5, 5, '#eef2ff'); r(216, 9, 4, 4, sky[0]); for (let i = 0; i < 30; i++) r((i * 73) % W, (i * 37) % 44, 1, 1, i % 5 ? '#c9d0f0' : '#ffffff'); }
    else r(214, tod === 'evening' ? 42 : 12, 8, 8, tod === 'evening' ? '#ffcf8a' : '#fffbe8');
    for (let i = 0; i < 3; i++) { const x = wrap(t * (2 + i) + i * 90 - sc * 0.15, W + 50) - 40; r(x, 8 + i * 9, 26, 4, night ? '#2a3460' : '#ffffff'); r(x + 4, 6 + i * 9, 14, 3, night ? '#2a3460' : '#ffffff'); }
    // la falaise, vue de loin, avec le pavillon et les pins ; le phare sur son îlot
    const ox = -Math.round(sc * 0.04) % 40;
    const haze = tod === 'day' ? ['#7f9a86', '#9aa49a', '#8a8e88', '#767a76'] : tod === 'evening' ? ['#6a4a6a', '#8a6070', '#7a5468', '#684860'] : ['#1a2440', '#222c4a', '#1e2744', '#18203a'];
    for (let x = 60; x < 214; x++) {
      const edge = x < 68 ? (68 - x) * 2 : x > 206 ? (x - 206) * 2.5 : 0;
      const top = Math.round(29 + Math.sin(x * 0.13) * 1.4 + Math.sin(x * 0.37 + 1) * 0.8 + edge);
      if (top >= HORIZON) continue;
      r(x + ox, top, 1, 2, '#5b8a4a');
      const n = Math.sin(x * 12.9898) * 43758.5453, v = n - Math.floor(n);
      r(x + ox, top + 2, 1, HORIZON - top - 2, haze[1 + Math.floor(v * 2.99)]);
      for (let y = top + 5; y < HORIZON; y += 6) r(x + ox, y + Math.round(Math.sin(x * 0.2 + y) * 1), 1, 1, haze[3]);
    }
    r(176 + ox, 21, 18, 8, '#e8e2d6'); r(175 + ox, 20, 20, 2, '#8a8a92'); r(183 + ox, 24, 4, 5, '#ffd9a0'); r(189 + ox, 23, 4, 4, tod === 'day' ? '#9fd4f2' : '#ffcf8a'); r(177 + ox, 23, 3, 6, '#9a6a3e');
    for (const [px, h] of [[80, 6], [96, 5], [150, 6], [204, 5]]) { r(px + ox, 28 - h, 1, h, '#4a3a2c'); r(px - 3 + ox, 28 - h - 2, 8, 3, '#2f5e36'); }
    r(232 + ox, HORIZON - 3, 16, 3, '#7a7062'); r(238 + ox, HORIZON - 13, 3, 10, '#f1ede6'); r(238 + ox, HORIZON - 10, 3, 2, '#d24a40'); r(237 + ox, HORIZON - 15, 5, 2, '#2e2e3c');
    if (t % 4 < 0.5) r(238 + ox, HORIZON - 15, 3, 1, '#fff7c0');
    // la mer au loin : des rangs de petites vagues qui avancent
    for (let y = HORIZON; y < SURFACE; y++) r(0, y, W, 1, (y - HORIZON) < 6 ? sea[0] : sea[1]);
    for (let i = 0; i < 28; i++) {
      const p = (i * 0.13 + t * 0.03) % 1;
      const x = wrap(i * 47 + t * (3 + p * 8) - sc * (0.3 + p), W + 20) - 10;
      g.fillStyle = `rgba(255,255,255,${0.2 + 0.4 * Math.sin(p * Math.PI)})`;
      g.fillRect(Math.round(x), Math.round(HORIZON + 1 + p * (SURFACE - HORIZON - 3)), 1 + Math.round(p * 5), 1);
    }
    // sous l'eau : le dégradé, les rais de lumière, les algues du fond, les bulles, des poissons au loin
    for (let y = SURFACE; y < H; y++) r(0, y, W, 1, sea[Math.min(3, 2 + Math.floor((y - SURFACE) / 40))]);
    for (let y = SURFACE + 40; y < H; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < W; x += 4) r(x, y, 1, 1, sea[2]);
    g.fillStyle = night ? 'rgba(200,220,255,0.04)' : 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 4; i++) { const x0 = wrap(40 + i * 60 + Math.sin(t * 0.3 + i) * 10 - sc * 0.8, W + 40) - 20; for (let y = SURFACE; y < H; y += 2) g.fillRect(Math.round(x0 + (y - SURFACE) * 0.4), y, 6, 2); }
    for (let i = 0; i < 9; i++) {
      const x0 = wrap(i * 31 + 8 - sc, W + 30) - 15, hgt = 10 + (i * 7) % 12;
      for (let k = 0; k < hgt; k++) r(x0 + Math.round(Math.sin(t * 1.6 + i + k * 0.3) * (k / hgt) * 2.5), H - k, 1 + (k < 4 ? 1 : 0), 1, k % 3 === 0 ? '#2f7a4a' : '#3f9a5a');
    }
    for (let i = 0; i < 6; i++) { const q = (t * 0.25 + i / 6) % 1; r(wrap(i * 47 + Math.sin(t + i) * 3 - sc * 0.6, W), H - q * (H - SURFACE - 4), 1, 1, 'rgba(220,240,255,0.55)'); }
    for (let i = 0; i < 3; i++) { const fx = wrap(t * (8 + i * 3) * (i % 2 ? -1 : 1) + i * 90 - sc * 0.7, W + 30) - 15, fy = SURFACE + 40 + i * 12; g.fillStyle = 'rgba(5,10,30,0.25)'; g.fillRect(Math.round(fx), fy, 6, 2); g.fillRect(Math.round(fx) + (i % 2 ? 6 : -2), fy, 2, 2); }
    // l'ombre du poisson qui approche (énorme pour une légende)
    if (st.shadow && (st.phase === 'wait' || st.phase === 'warn' || st.phase === 'bite')) {
      const k = sp.legend ? 2.2 : 1;
      g.fillStyle = 'rgba(5,10,30,0.45)';
      g.beginPath(); g.ellipse(st.shadow.x, st.shadow.y, (sp.w / 2 + 3) * k, (sp.h / 2 + 1) * k, 0, 0, Math.PI * 2); g.fill();
    }
    // le poisson accroché, en sprites : il nage (sa queue bat plus vite quand il fonce), se retourne en une image écrasée,
    // secoue la tête quand on le touche, saute en suivant son arc (par crans de 22,5°) ; sa pose sert aussi à accrocher la
    // ligne à sa bouche
    const fk = fishScale(st.kind);
    let fish: null | { x: number; y: number; th: number; face: number } = null;
    const sw = st.swim;
    if (st.phase === 'fight' || dragging) {
      const face = sw.face >= 0 ? 1 : -1;
      // l'angle : selon sa vitesse (vers le haut, vers le bas), un peu en nageant, beaucoup en sautant
      let th = Math.atan2(sw.vy, Math.abs(sw.vx) + 0.01);
      if (!sw.jump) th = Math.max(-0.45, Math.min(0.45, th * 0.6));
      if (t - st.hitAt < 0.35) th += (Math.floor(t * 18) % 2 ? 1 : -1) * 0.4;
      fish = { x: sw.x, y: sw.y, th, face };
      const stepI = Math.max(-4, Math.min(4, Math.round(th / (Math.PI / 8))));
      const speed = Math.hypot(sw.vx, sw.vy);
      // la queue bat plus vite quand il fonce, et quand il se débat
      const frame = Math.floor(t * FRAMES * SWIM_HZ * (0.8 + speed / 45 + st.tension * 0.6)) % FRAMES;
      const depth = sw.y > SURFACE + 4 ? Math.max(0, Math.min(3, Math.round((sw.y - SURFACE) / 15))) : 0;
      const spr = fishSprite(st.kind, frame, stepI, face, t - st.hitAt < 0.08, depth);
      const turning = t - sw.turnAt < 0.12;
      const wq = turning ? Math.round(SPR * fk * 0.5) : SPR * fk;
      g.drawImage(spr, Math.round(sw.x - wq / 2), Math.round(sw.y - SPC * fk), wq, SPR * fk);
    }
    const mouth = (() => {
      if (!fish) return null;
      const m = sp.mouth ?? [Math.ceil(sp.w / 2), 0];
      const stepTh = Math.max(-4, Math.min(4, Math.round(fish.th / (Math.PI / 8)))) * (Math.PI / 8);
      const px0 = m[0] * Math.cos(stepTh) - m[1] * Math.sin(stepTh), py0 = m[0] * Math.sin(stepTh) + m[1] * Math.cos(stepTh);
      return { x: fish.x + px0 * fish.face * fk, y: fish.y + py0 * fk };
    })();
    // les ronds à la surface, là où il est sorti ou rentré ; les bulles qui remontent
    for (const rg of st.rings) {
      const k = (t - rg.t0) / 1.2, rx = (4 + k * 18) * rg.w, ry = rx * 0.25;
      g.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      for (let q = 0; q < Math.PI * 2; q += 0.25) g.fillRect(Math.round(rg.x + Math.cos(q) * rx), Math.round(SURFACE + 1 + Math.sin(q) * ry), 1, 1);
    }
    for (const b of st.bubbles) { r(b.x, b.y, 1, 1, 'rgba(220,240,255,0.8)'); if ((t - b.t0) % 0.6 < 0.3) r(b.x + 1, b.y - 1, 1, 1, 'rgba(220,240,255,0.5)'); }
    if (dragging && sp.deep) {
      // il tire depuis le fond : l'eau bouillonne au-dessus de lui
      for (let i = 0; i < 4; i++) { const q = (t * 1.8 + i / 4) % 1; r(st.bobX - 8 + i * 5, SURFACE + 30 - q * 30, 1, 1, 'rgba(220,240,255,0.7)'); }
      for (let i = 0; i < 2; i++) { const q = (t * 1.2 + i / 2) % 1; g.fillStyle = `rgba(255,255,255,${0.5 * (1 - q)})`; for (let a = 0; a < Math.PI * 2; a += 0.3) g.fillRect(Math.round(st.bobX + Math.cos(a) * (4 + q * 12)), Math.round(SURFACE + 1 + Math.sin(a) * (1 + q * 2)), 1, 1); }
    }
    if (dragging && !sp.deep) {
      // sa nageoire qui fend l'eau, la gerbe devant lui
      const fx = Math.round(st.bobX + 4);
      for (let k = 0; k < 5; k++) r(fx - k, SURFACE - 5 + k, 1 + k, 1, sp.fin);
      for (let k = 0; k < 4; k++) { const q = (t * 3 + k / 4) % 1; r(fx + 6 + q * 8, SURFACE - 2 - Math.sin(q * Math.PI) * 6, 1, 1, '#ffffff'); }
    }
    // la surface et ses vagues (elles défilent quand la barque est traînée)
    const wave = (x: number) => SURFACE + Math.sin((x + sc) * 0.08 + t * 2.2) * 1.2 + Math.sin((x + sc) * 0.21 - t * 1.4) * 0.6;
    for (let x = 0; x < W; x++) { const y = wave(x); r(x, y - 1, 1, 2, sea[1]); r(x, y + 1, 1, 1, 'rgba(255,255,255,0.35)'); if (Math.sin((x + sc) * 0.3 + t * 3) > 0.92) r(x, y - 1, 1, 1, '#ffffff'); }
    if (dragging) for (let i = 0; i < 10; i++) { const x = wrap(i * 29 - sc * 1.6, W + 20) - 10; r(x, SURFACE + 2 + (i % 3) * 3, 6 + (i % 4) * 3, 1, 'rgba(255,255,255,0.5)'); }
    // la barque : on voit dedans, Roré y est assis, le bordé devant cache ses jambes ; le « 43 », la lanterne
    const bob = Math.sin(t * 1.8) * (st.phase === 'fight' || dragging ? 2 : 1.2);
    const tilt = dragging ? 2.6 : Math.sin(t * 1.3) * (st.phase === 'fight' ? 1.6 : 0.8);
    const by = SURFACE - 5 + bob;
    const fall = (t - st.failAt) / 0.5;
    const caught = (t - st.catchAt) / 1.1;
    // la même barque qu'en mer (boat.ts), la proue vers la droite, du côté de la canne et de la ligne
    const boat = paintBoat(22, 1, tilt, 3, night || tod === 'evening');
    const bdx = BX + 22 - boat.ox, bdy = Math.round(by + 6) - boat.oy;
    g.drawImage(boat.back, bdx, bdy);
    const pose = st.phase === 'aim' ? 'raise' : st.phase === 'cast' ? 'cheer' : dragging ? (t - st.pressAt < 0.12 ? 'cheer' : 'raise') : st.phase === 'fight' ? (t - st.hitAt < 0.2 ? 'cheer' : Math.floor(t * 5) % 2 ? 'raise' : 'type') : st.phase === 'bite' ? 'raise' : st.phase === 'catch' && !sp.junk ? 'cheer' : 'sit';
    const eyes = st.sadUntil > t ? 'down' : dragging ? 'open' : st.phase === 'catch' || st.phase === 'bite' || st.phase === 'warn' ? 'happy' : 'open';
    const sprite = robotSprite(outside.rore.id, pose, 'right', Math.floor(t * 6) % 2, eyes);
    if (st.phase === 'fail' && fall >= 0) {
      g.save(); g.translate(BX + 18, Math.round(by)); g.rotate(-Math.min(1, fall) * 1.4); g.drawImage(sprite, -10, -20); g.restore();
    } else if (dragging || st.phase === 'fight') {
      // il se débat : penché en arrière, d'autant plus que la ligne est tendue, secoué par les à-coups du poisson
      const lean = dragging ? -0.25 : -(0.08 + st.tension * 0.22) + Math.sin(t * 9) * 0.05 * (1 + st.tension);
      const jx = st.tension > 0.5 ? Math.round(Math.sin(t * 40)) : 0;
      g.save(); g.translate(BX + 18 + jx, Math.round(by + 2)); g.rotate(lean); g.drawImage(sprite, -10, -20); g.restore();
      // des gouttes de sueur quand ça tire fort
      if (st.tension > 0.35 || dragging) for (let i = 0; i < 2; i++) { const q = (t * 2.5 + i / 2) % 1; r(BX + 12 - q * 8, by - 20 - Math.sin(q * Math.PI) * 5 + q * 6, 1, 1, '#bfe6ff'); }
    } else g.drawImage(sprite, BX + 8, Math.round(by - 18));
    if (st.algaeUntil > t) for (let i = 0; i < 5; i++) r(BX + 12 + i * 2, by - 18 + (i % 2), 1, 5 + (i % 3), i % 2 ? '#3f7a42' : '#5a9a52');
    g.drawImage(boat.front, bdx, bdy);
    // ce qui est sous l'eau prend sa couleur
    g.fillStyle = 'rgba(20,60,110,0.45)';
    for (let i = -22; i <= 22; i++) { const wl = Math.round(wave(BX + 22 + i)) + 1, bot = boat.ky(i) + bdy + 1; if (wl < bot) g.fillRect(BX + 22 + i, wl, 1, bot - wl); }
    // la canne : le manche en liège, le moulinet qui tourne, le scion qui plie avec la tension
    if (st.phase !== 'fail') {
      const bend = st.phase === 'fight' || dragging ? 3 + st.tension * 6 + (t - st.missAt < 0.2 ? 3 : 0) : st.phase === 'bite' ? 4 : 1;
      for (let k = 0; k <= 18; k++) {
        const u = k / 18;
        r(BX + 20 + (tipBase.x - BX - 20) * u, by - 8 + (tipBase.y + bob - (by - 8)) * u + Math.sin(u * Math.PI * 0.9) * -2 + u * u * bend, 1, 1, k < 4 ? '#c89a6a' : k < 6 ? '#563821' : '#8a5530');
      }
      const reel = st.phase === 'fight' || dragging;
      r(BX + 22, by - 9, 3, 3, '#2e2e3c'); r(BX + 23 + (reel && Math.floor(t * 12) % 2 ? 1 : 0), by - 8 - (reel && Math.floor(t * 12) % 2 ? 1 : 0), 1, 1, '#c8c8d8');
    }
    // la ligne et la flotte
    const tipX = tipBase.x, tipY = tipBase.y + bob + (st.phase === 'fight' || dragging ? 3 + st.tension * 6 : 0);
    // pendant le combat, la ligne part du bout de la canne et file jusqu'à la bouche du poisson ; la flotte glisse sur la
    // ligne et reste à la surface, là où la ligne entre dans l'eau
    if (mouth) {
      g.fillStyle = st.tension > 0.66 ? 'rgba(255,120,110,0.95)' : 'rgba(235,240,250,0.85)';
      const n = Math.max(8, Math.round(Math.hypot(mouth.x - tipX, mouth.y - tipY)));
      const shiver = st.tension > 0.5 ? Math.sin(t * 50) * 0.6 : 0;
      for (let k = 0; k <= n; k++) { const u = k / n; g.fillRect(Math.round(tipX + (mouth.x - tipX) * u), Math.round(tipY + (mouth.y - tipY) * u + Math.sin(u * Math.PI) * shiver), 1, 1); }
      if (mouth.y > SURFACE) {
        const u = clamp01((SURFACE - tipY) / (mouth.y - tipY));
        const fx = tipX + (mouth.x - tipX) * u;
        r(fx - 1, SURFACE - 2, 3, 2, '#e5484d'); r(fx, SURFACE - 3, 1, 1, '#ffffff');
        for (let i = 0; i < 2; i++) { const k = (t * 2 + i * 0.5) % 1; g.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; g.fillRect(Math.round(fx - 2 - k * 6), SURFACE + 1, Math.round(5 + k * 12), 1); }
      }
    }
    const bx = st.bobX, byb = st.bobY + (st.phase === 'wait' || st.phase === 'bite' || st.phase === 'fight' || st.phase === 'warn' ? Math.sin(t * 2.4) * 0.8 + st.dip * 3 : dragging ? 1 : 0);
    if (mouth) { /* la ligne est déjà tirée jusqu'au poisson */ }
    else if (st.phase !== 'ready' && st.phase !== 'boat' && st.phase !== 'aim' && st.phase !== 'fail') {
      const taut = st.phase === 'fight' || dragging;
      g.fillStyle = taut && st.tension > 0.66 ? 'rgba(255,120,110,0.95)' : 'rgba(235,240,250,0.8)';
      const n = Math.max(8, Math.round(Math.hypot(bx - tipX, byb - tipY)));
      for (let k = 0; k <= n; k++) { const u = k / n; g.fillRect(Math.round(tipX + (bx - tipX) * u), Math.round(tipY + (byb - tipY) * u + (taut ? 0 : Math.sin(u * Math.PI) * 5)), 1, 1); }
      if (st.phase !== 'cast' && st.dip < 0.9) { r(bx - 1, byb - 2, 3, 2, '#e5484d'); r(bx, byb - 3, 1, 1, '#ffffff'); }
      else if (st.phase === 'cast') { r(bx - 1, byb - 1, 3, 2, '#e5484d'); }
      if (st.phase === 'bite' || st.phase === 'fight') for (let i = 0; i < 2; i++) { const k = (t * 1.6 + i * 0.5) % 1; g.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; g.fillRect(Math.round(bx - 2 - k * 8), Math.round(SURFACE + 1), Math.round(5 + k * 16), 1); }
    } else if (st.phase === 'fail') {
      // le bout de ligne cassé qui retombe
      g.fillStyle = 'rgba(235,240,250,0.8)';
      for (let k = 0; k < 14; k++) g.fillRect(BX + 30 + k, Math.round(by - 14 + k * 0.6 + Math.sin(t * 8 + k) * 1), 1, 1);
    } else {
      g.fillStyle = 'rgba(235,240,250,0.8)';
      for (let y = tipY; y < tipY + 8; y++) g.fillRect(tipX, Math.round(y), 1, 1);
    }
    // l'écume à l'avant de la barque quand elle est traînée
    if (dragging) for (let k = 0; k < 6; k++) { const q = (t * 4 + k / 6) % 1; r(BX + 44 + q * 6, SURFACE - 1 - Math.sin(q * Math.PI) * 4, 1, 1, '#ffffff'); r(BX - 2 - q * 20, SURFACE + 1 + (k % 2), 3, 1, 'rgba(255,255,255,0.6)'); }
    // la mouette posée sur la flotte
    if (st.gull) {
      const gt = st.gull.t;
      const gx = gt < 0.8 ? st.gull.x - 40 + gt * 50 : gt < 2.2 ? st.gull.x : st.gull.x + (gt - 2.2) * 60;
      const gy = gt < 0.8 ? SURFACE - 30 + gt * 33 : gt < 2.2 ? SURFACE - 4 : SURFACE - 4 - (gt - 2.2) * 40;
      const up = Math.floor(t * 8) % 2 && (gt < 0.8 || gt > 2.2);
      r(gx - 3, gy - 3, 6, 3, '#f6f6fa'); r(gx + 2, gy - 5, 3, 3, '#f6f6fa'); r(gx + 5, gy - 4, 2, 1, '#ffb02e'); r(gx - 4, gy - 3 - (up ? 2 : 0), 3, 1, '#a8acb8'); r(gx + 1, gy - 3 - (up ? 2 : 0), 1, 1, '#a8acb8');
    }
    // le poisson qui s'envole au-dessus de Roré, pour la photo
    if (st.phase === 'catch' && caught >= 0) {
      const u = Math.min(1, caught);
      const cx = Math.round(st.bobX + (BX + 20 - st.bobX) * u), cy = Math.round(SURFACE - Math.sin(u * Math.PI * 0.5) * 40 - (u >= 1 ? Math.sin(t * 4) * 2 : 0));
      const k = sp.w > 30 ? 1 : 2;
      const spr = fishSprite(st.kind, Math.floor(t * FRAMES * SWIM_HZ) % FRAMES, u < 1 ? Math.round(u * 32) % 16 : 0, 1, false);
      g.drawImage(spr, cx - SPC * k, cy - SPC * k, SPR * k, SPR * k);
    }
    // les éclaboussures, les confettis
    for (const b of st.bits) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
    for (const b of st.confetti) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 2, 1 + (Math.floor(b.life * 10) % 2)); }
    // le « ! » au-dessus de Roré quand ça mord
    if (st.phase === 'bite' && !sp.legend) {
      const big = Math.floor(t * 10) % 2;
      r(BX + 16, by - 40 - big, 4, 9, '#ffd166'); r(BX + 16, by - 29, 4, 3, '#ffd166');
      r(BX + 15, by - 41 - big, 1, 15, '#15121d');
    }
    g.restore();

    // ── l'interface par-dessus ──
    const frame = (x: number, y: number, w: number, h: number) => { r(x - 2, y - 2, w + 4, h + 4, '#15121d'); r(x - 1, y - 1, w + 2, h + 2, '#4a4458'); r(x, y, w, h, '#2a2636'); };
    // la jauge du lancer
    if (st.phase === 'aim') {
      const gx = BOAT_X + 50, gy = 26, gw = 70;
      frame(gx, gy, gw, 5);
      r(gx + gw * PERFECT[0], gy, gw * (PERFECT[1] - PERFECT[0]), 5, '#8a6a20');
      r(gx, gy, gw * st.power, 5, st.power >= PERFECT[0] && st.power <= PERFECT[1] ? '#ffd166' : '#3ddc97');
      r(gx, gy, gw * st.power, 1, 'rgba(255,255,255,0.45)');
      r(gx + gw * st.power - 1, gy - 2, 2, 9, '#ffffff');
      pixelText(g, 'LANCER', gx, gy - 9, '#ffffff');
    }
    // la barre du combat : le curseur, la zone verte (au centre doré : parfait), la tension de la ligne
    if (st.phase === 'fight') {
      const zx = BAR.x + BAR.w * st.zone, zw = BAR.w * sp.zone;
      frame(BAR.x, BAR.y, BAR.w, BAR.h);
      if (t - st.missAt < 0.15) r(BAR.x, BAR.y, BAR.w, BAR.h, '#7a2a2a');
      r(zx - zw / 2, BAR.y, zw, BAR.h, t - st.hitAt < 0.12 ? '#ffffff' : '#3ddc97');
      r(zx - zw / 2, BAR.y, zw, 1, '#9ff0c8');
      r(zx - zw / 6, BAR.y, zw / 3, BAR.h, '#ffd166');
      const cx = BAR.x + BAR.w * st.cursor;
      r(cx - 1, BAR.y - 3, 2, BAR.h + 6, '#ffffff');
      r(cx - 2, BAR.y - 4, 4, 1, '#ffffff');
      // la tension
      r(BAR.x, BAR.y + BAR.h + 3, BAR.w, 2, '#2a2030');
      r(BAR.x, BAR.y + BAR.h + 3, BAR.w * Math.min(1, st.tension), 2, st.tension > 0.66 ? '#e5484d' : '#ffb02e');
      // la vie d'un poisson ordinaire : des petites pastilles
      if (!sp.legend) for (let i = 0; i < sp.hp; i++) r(BAR.x + BAR.w / 2 - sp.hp * 3 + i * 6, BAR.y - 9, 4, 4, i < st.hp ? '#3ddc97' : '#4a2a30');
    }
    // le bras de fer : la corde entre Roré (à gauche) et le poisson (à droite) ; Espace, vite, pour la ramener
    if (dragging) {
      const title = 'TIENS LA LIGNE !';
      g.save(); g.scale(2, 2);
      pixelText(g, title, Math.round((W / 2 - textWidth(title)) / 2), sp.legend ? 13 : 8, Math.floor(t * 6) % 2 ? '#ffffff' : '#ffd166');
      g.restore();
      frame(BAR.x, BAR.y, BAR.w, BAR.h);
      const mid = BAR.x + BAR.w * (1 - st.rope);
      r(BAR.x, BAR.y, mid - BAR.x, BAR.h, '#3ddc97');
      r(mid, BAR.y, BAR.x + BAR.w - mid, BAR.h, st.rope < 0.25 ? (Math.floor(t * 8) % 2 ? '#e5484d' : '#a83a3a') : '#e5484d');
      r(BAR.x, BAR.y, BAR.w, 1, 'rgba(255,255,255,0.3)');
      r(mid - 1, BAR.y - 4, 3, BAR.h + 8, '#ffffff');
      // Roré à gauche, le poisson à droite
      r(BAR.x - 12, BAR.y - 1, 8, 8, '#3a3a48'); r(BAR.x - 11, BAR.y + 1, 6, 3, '#15121d'); r(BAR.x - 10, BAR.y + 2, 1, 1, '#ff8a3d'); r(BAR.x - 7, BAR.y + 2, 1, 1, '#ff8a3d');
      g.save(); g.translate(BAR.x + BAR.w + 12, BAR.y + 3); drawFish(g, st.kind, t); g.restore();
      // la touche Espace, qui s'enfonce à chaque coup
      const pressed = t - st.pressAt < 0.08;
      const kx = W / 2 - 22, ky = BAR.y - 16 + (pressed ? 1 : 0);
      r(kx, ky + 1 + (pressed ? 0 : 1), 44, 9, '#9e4019');
      r(kx, ky, 44, 9, '#ff8a3d');
      pixelText(g, 'ESPACE', Math.round(kx + 22 - textWidth('ESPACE') / 2), ky + 2, '#160c06');
    }
    // une légende : flash rouge d'alerte, grand (!), puis barre de vie de boss
    if (sp.legend && (st.phase === 'warn' || st.phase === 'bite' || st.phase === 'fight' || dragging)) {
      const alarm = (st.phase !== 'fight' && !dragging) || t - st.flashAt < 1.2;
      if (alarm) {
        const a = 0.18 + 0.22 * Math.abs(Math.sin(t * 9));
        g.fillStyle = `rgba(229,72,77,${a})`;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(229,72,77,${0.4 + a})`;
        g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
      }
      if (st.phase !== 'fight' && !dragging) {
        // le grand (!) au milieu de l'écran, qui bat
        const k = 1 + 0.12 * Math.sin(t * 12);
        g.save();
        g.translate(W / 2, 62);
        g.scale(k, k);
        g.fillStyle = '#15121d'; g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e5484d'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e5484d'; g.fillRect(-3, -13, 6, 17); g.fillRect(-3, 7, 6, 6);
        g.restore();
        const label = 'POISSON LEGENDAIRE !';
        g.save(); g.scale(2, 2);
        pixelText(g, label, Math.round((W / 2 - textWidth(label)) / 2), 49, Math.floor(t * 6) % 2 ? '#ffffff' : '#ffd166');
        g.restore();
        if (st.phase === 'bite') { const f = 'ESPACE ! FERRE !'; pixelText(g, f, Math.round(W / 2 - textWidth(f) / 2), 92 + 18, '#ffffff'); }
      } else {
        // la barre de vie, comme pour un boss : rouge, avec une traînée claire qui la rattrape
        const bx0 = 36, bw = W - 72, byy = 10;
        r(bx0 - 2, byy - 9, bw + 4, 17, 'rgba(10,8,18,0.8)');
        // la police en pixels n'a ni Œ ni accents (sauf É) : on les retire
        const name = sp.name.toUpperCase().replace(/’/g, "'").replace(/Œ/g, 'OE').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        pixelText(g, name, Math.round(W / 2 - textWidth(name) / 2), byy - 7, '#ffd166');
        r(bx0, byy, bw, 5, '#2a1018');
        r(bx0, byy, bw * Math.max(0, st.trailHp) / sp.hp, 5, '#ffe2b8');
        r(bx0, byy, bw * Math.max(0, st.shownHp) / sp.hp, 5, st.rage ? (Math.floor(t * 8) % 2 ? '#ff3040' : '#e5484d') : '#e5484d');
        r(bx0, byy, bw * Math.max(0, st.shownHp) / sp.hp, 1, '#ff9aa0');
        for (let i = 1; i < sp.hp; i++) r(bx0 + (bw * i) / sp.hp, byy, 1, 5, 'rgba(10,8,18,0.6)');
      }
    }
    // les petits messages (PARFAIT, RATE, TROP TOT…)
    if (st.msg && t - st.msgAt < 1.3 && st.phase !== 'warn' && st.phase !== 'catch' && !(dragging && t - st.dragAt > 1)) {
      const y = Math.round(st.phase === 'fight' || dragging ? BAR.y - 30 : 40 - (t - st.msgAt) * 6);
      const col = st.msg.startsWith('RATE') || st.msg.startsWith('TROP') || st.msg.startsWith('TCHAC') || st.msg.startsWith('IL ENRAGE') || st.msg.startsWith('IL T') ? '#ff8a80' : '#ffd166';
      const msg = st.msg.replace('’', "'");
      r(W / 2 - textWidth(msg) / 2 - 3, y - 2, textWidth(msg) + 6, 9, 'rgba(10,8,18,0.7)');
      pixelText(g, msg, Math.round(W / 2 - textWidth(msg) / 2), y, col);
    }
  };

  useLoop(step, draw, []);

  const tip: Record<Phase, string> = {
    ready: '',
    boat: 'Espace (ou un clic) pour préparer le lancer.',
    aim: 'Espace pour lancer ! La zone dorée est étroite : un lancer parfait va plus loin, et les légendes rôdent.',
    cast: 'Plouf !',
    wait: 'Attends… La flotte frémit parfois pour rien (et les mouettes s’en mêlent). Ferre seulement quand elle plonge !',
    warn: 'Attention : quelque chose d’énorme approche…',
    bite: 'Ça mord ! Espace, vite !',
    fight: 'Espace quand le curseur est dans la zone verte (le centre doré compte double). Chaque raté tend la ligne.',
    drag: 'Il t’emmène ! Tape sur Espace très vite pour tenir la ligne et le fatiguer.',
    catch: '',
    fail: '',
  };

  const caught = SPECIES.filter((k) => hud.journal[k]);
  return (
    <div className="game">
      <div className="game-screen" onPointerDown={(e) => { e.preventDefault(); action(); }}>
        <canvas ref={canvas} width={W} height={H} style={{ cursor: 'pointer' }} />
        {hud.card && (hud.phase === 'catch' || hud.phase === 'fail') && (
          <div className={`fish-card ${hud.card.legend ? 'is-legend' : ''} ${hud.card.junk ? 'junk' : ''}`}>
            <b>{hud.card.title}</b>
            <span>{hud.card.sub}</span>
          </div>
        )}
        {hud.phase === 'ready' && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            <b>La pêche au large</b>
            <span>Tout est dans le timing : lance au bon moment, ferre quand la flotte plonge (pas avant !), puis frappe quand le curseur passe dans la zone verte.</span>
            <span>Les gros poissons traînent la barque : tape sur Espace très vite pour tenir la ligne.</span>
            <span className="muted">On raconte qu’un Thon d’Or rôde le jour, et Nessie la nuit… Il faut un lancer parfait pour les attirer.</span>
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); set('boat'); sfx('click'); }}>Monter dans la barque</button>
          </div>
        )}
      </div>
      <p className="small">{tip[hud.phase] || ' '}</p>
      <div className="bestiary-head">
        <span className="muted small">📖 Bestiaire : {caught.length} sur {SPECIES.length} espèces</span>
        <button className="btn small" onClick={() => setBook(!book)}>{book ? 'Fermer le bestiaire' : 'Ouvrir le bestiaire'}</button>
      </div>
      {book && <Bestiary journal={hud.journal} />}
    </div>
  );
}

/** Le bestiaire : une fiche par espèce. Prise : son dessin, sa rareté, ce qu'on en dit, combien de fois, le record.
 *  Pas encore prise : une silhouette, la rareté, et un indice pour la trouver. */
function Bestiary({ journal }: { journal: FishSave['journal'] }) {
  return (
    <div className="bestiary">
      {SPECIES.map((k) => <BestiaryCard key={k} kind={k} entry={journal[k]} />)}
    </div>
  );
}

function BestiaryCard({ kind, entry }: { kind: Kind; entry?: { n: number; kg: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sp = FISH[kind];
  const known = !!entry;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    const tall = kind === 'nessie' ? 18 : 0;
    const k = Math.max(1, Math.floor(Math.min(56 / (sp.w + 10), 30 / (sp.h + 6 + tall))));
    g.save();
    g.translate(c.width / 2, c.height / 2 + (kind === 'nessie' ? 5 : 0));
    g.scale(k, k);
    if (known) { g.translate(-SPC, -SPC); g.drawImage(fishSprite(kind, 0, 0, 1, false), 0, 0); }
    else drawFish(g, kind, 0.3, false, '#2c2a3a');
    g.restore();
  }, [kind, known, sp]);
  const stars = rarity(kind);
  // où (selon la longueur du lancer), quand, combien il pèse, sa force au combat
  const where = sp.far >= 0.6 ? 'très loin' : sp.far >= 0.3 ? 'au large' : 'près de la barque';
  const when = !sp.when ? '☀️ 🌅 🌙 à toute heure' : sp.when.map((w) => (w === 'day' ? '☀️ le jour' : w === 'evening' ? '🌅 le soir' : '🌙 la nuit')).join(' · ');
  const force = Math.min(5, Math.max(1, Math.round(sp.hp / 2.4)));
  return (
    <div className={`bestiary-card ${sp.legend ? 'is-legend' : ''} ${known ? '' : 'unknown'}`}>
      <canvas ref={ref} width={64} height={36} />
      <b>{known ? sp.name : '???'}</b>
      <span className="bestiary-stars" title="Rareté">{'★'.repeat(stars)}<i className="dim">{'★'.repeat(5 - stars)}</i>{sp.legend ? ' légendaire' : ''}</span>
      <dl className="bestiary-facts">
        <dt>Où</dt><dd>{where}</dd>
        <dt>Quand</dt><dd>{when}</dd>
        <dt>Poids</dt><dd>{known ? `${fmtKg(sp.kg[0])} à ${fmtKg(sp.kg[1])}` : '?'}</dd>
        <dt>Force</dt><dd>{'●'.repeat(force)}<i className="dim">{'●'.repeat(5 - force)}</i>{sp.tough ? ' · traîne la barque' : ''}</dd>
      </dl>
      {known ? <span className="small">{sp.desc}</span> : <span className="small muted">Indice : {sp.hint}.</span>}
      {known && sp.fact && <span className="small bestiary-fact">💡 {sp.fact}</span>}
      {known && <span className="small muted">Ta pêche : {entry.n} {entry.n > 1 ? 'prises' : 'prise'} · record {fmtKg(entry.kg)}</span>}
    </div>
  );
}
