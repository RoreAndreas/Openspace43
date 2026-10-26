// Les robots du bureau : des cubes-robots, comme le logo de VibesMoney (visière noire, yeux orange).
// Chaque robot porte une tenue : des couleurs (tête, visière, yeux, corps) et des pièces (le béret du designer,
// la capuche de Nyx, le chapeau de Merlain, la cape de Roré…). Les robots de métier ont la leur ; les
// personnages du catalogue (src/characters/catalog.json) aussi. Tout est dessiné en code, sur le même
// gabarit de 20 × 24 pixels, pose par pose, puis gardé en mémoire.
import type { Role } from '../../shared/protocol.ts';
import { ROLES } from '../../shared/activity.ts';
import { outfitOf } from './characters.ts';
import { darken, g2d, lighten, makeCanvas, mirror, outline, P, px, rect } from './pixels.ts';

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Pose = 'stand' | 'walk' | 'sit' | 'type' | 'read' | 'think' | 'carry' | 'raise' | 'cheer' | 'wave' | 'write' | 'play';
export type Eyes = 'open' | 'blink' | 'down' | 'up' | 'left' | 'right' | 'happy';

/** Taille d'un sprite de robot ; les pieds (le bas du contour) sont au point d'ancrage. */
export const ROBOT_W = 20;
export const ROBOT_H = 24;
export const ANCHOR_X = 10;
export const ANCHOR_Y = 22;

/** Les pièces d'une tenue (chacune est dessinée plus bas, de face, de dos et de profil). */
export type Part =
  | 'jacket' | 'beret' | 'explorerHat' | 'headset' | 'glasses' | 'pencil'
  | 'hood' | 'cables' | 'sneakers'
  | 'wizardHat' | 'beard' | 'robe' | 'staff'
  | 'cape' | 'epaulettes' | 'star'
  | 'chestLight' | 'toolbelt'
  | 'bun' | 'tie' | 'tablet'
  | 'pompadour' | 'sunglasses' | 'puffy' | 'tape'
  | 'hairTuft' | 'goggles' | 'backpack' | 'holo'
  | 'crest' | 'spear' | 'shield';

/** Une tenue : les couleurs du robot et ses pièces. Les couleurs absentes gardent celles du robot blanc. */
export interface Outfit {
  head?: string;
  visor?: string;
  eyes?: string;
  body: string;
  arm?: string;
  hand?: string;
  leg?: string;
  tip?: string;
  /** la couleur de certaines pièces (hood, hat, hair, cape, glasses, accent…) */
  colors?: Record<string, string>;
  parts: Part[];
}

interface Look {
  parts: Set<Part>;
  c: (key: string, fallback: string) => string;
  top: string; front: string; shade: string; visor: string; visorHi: string;
  eye: string; eyeHi: string; eyeDim: string;
  body: string; bodyHi: string; bodyShade: string;
  arm: string; hand: string; leg: string; tip: string;
}

/** Ce qui cache l'antenne. */
const HATS: Part[] = ['beret', 'explorerHat', 'hood', 'wizardHat', 'bun', 'pompadour', 'hairTuft', 'crest'];

/** Les robots de métier, tels qu'ils étaient : blancs, la couleur du métier, un accessoire. */
function roleOutfit(role: Role): Outfit {
  if (role === 'chef') {
    // la tête noire du logo, une veste blanche sur un haut orange
    return {
      head: '#4a4658', visor: '#0b0910', body: '#f1eff7', arm: '#e4e1ec', hand: '#3d3a4a', leg: '#2a2734', tip: P.orange,
      colors: { headTop: '#77718a', headShade: '#33303f', visorHi: '#4a4566' }, parts: ['jacket'],
    };
  }
  const part: Partial<Record<Role, Part>> = { design: 'beret', recherche: 'explorerHat', code: 'headset', analyse: 'glasses', redaction: 'pencil' };
  return { body: ROLES[role].color, colors: { accent: ROLES[role].color }, parts: part[role] ? [part[role]!] : [] };
}

function lookOf(key: string): Look {
  const o = outfitOf(key) ?? roleOutfit((key in ROLES ? key : 'renfort') as Role);
  const head = o.head ?? '#e8e5f1';
  const eye = o.eyes ?? P.orange;
  const colors = o.colors ?? {};
  return {
    parts: new Set(o.parts),
    c: (k, fallback) => colors[k] ?? fallback,
    // la tête blanche d'origine garde ses trois tons exacts ; pour les autres, on les calcule (ou la tenue les donne)
    top: colors.headTop ?? (o.head ? lighten(head, 0.35) : '#ffffff'),
    front: head,
    shade: colors.headShade ?? (o.head ? darken(head, 0.18) : '#c4bfd4'),
    visor: o.visor ?? '#15121c',
    visorHi: colors.visorHi ?? (o.visor ? lighten(o.visor, 0.2) : '#3d3852'),
    eye, eyeHi: lighten(eye, 0.6), eyeDim: darken(eye, 0.25),
    body: o.body, bodyHi: lighten(o.body, 0.3), bodyShade: darken(o.body, 0.25),
    arm: o.arm ?? '#d7d3e2', hand: o.hand ?? '#b9b4c9', leg: o.leg ?? '#3a3547', tip: o.tip ?? o.body,
  };
}

/** La couleur des yeux d'un robot (pour leur lueur, la nuit). */
export const eyeColor = (key: string) => lookOf(key).eye;

/** Les yeux, dans la visière (vue de face). */
function drawEyes(g: CanvasRenderingContext2D, L: Look, eyes: Eyes, bob: number) {
  const y0 = 8 + bob;
  if (eyes === 'blink') {
    rect(g, 7, y0 + 1, 2, 1, L.eyeDim);
    rect(g, 11, y0 + 1, 2, 1, L.eyeDim);
    return;
  }
  if (eyes === 'happy') {
    for (const x of [7, 11]) {
      rect(g, x, y0, 2, 1, L.eye);
      px(g, x - 1, y0 + 1, L.eye);
      px(g, x + 2, y0 + 1, L.eye);
    }
    return;
  }
  const ox = eyes === 'left' ? -1 : eyes === 'right' ? 1 : 0;
  const oy = eyes === 'down' ? 1 : eyes === 'up' ? -1 : 0;
  for (const x of [7, 11]) {
    rect(g, x + ox, y0 + oy, 2, 2, L.eye);
    px(g, x + ox, y0 + oy, L.eyeHi);
  }
}

/** La tête (cube) vue de face, de dos ou de profil. */
function drawHead(g: CanvasRenderingContext2D, L: Look, dir: Dir, eyes: Eyes, bob: number) {
  const y = 4 + bob;
  // dessus du cube (plus clair), puis la face
  rect(g, 4, y, 12, 2, L.top);
  rect(g, 4, y + 2, 12, 8, L.front);
  rect(g, 15, y + 2, 1, 8, L.shade);
  rect(g, 4, y + 9, 12, 1, L.shade);
  // l'arête lumineuse entre le dessus et la face
  rect(g, 4, y + 2, 11, 1, lighten(L.front, 0.12));
  if (dir === 'down') {
    rect(g, 6, y + 3, 8, 4, L.visor);
    rect(g, 6, y + 3, 3, 1, L.visorHi);
    drawEyes(g, L, eyes, bob);
  } else if (dir === 'up') {
    // l'arrière de la tête : une petite grille d'aération
    rect(g, 8, y + 5, 4, 1, L.shade);
    rect(g, 8, y + 7, 4, 1, L.shade);
  } else {
    // de profil (vers la droite) : la visière occupe l'avant de la tête, un seul œil
    rect(g, 10, y + 3, 6, 4, L.visor);
    rect(g, 10, y + 3, 2, 1, L.visorHi);
    const oy = eyes === 'down' ? 1 : eyes === 'up' ? -1 : 0;
    if (eyes === 'blink') rect(g, 13, y + 5, 2, 1, L.eyeDim);
    else if (eyes === 'happy') { rect(g, 13, y + 4, 2, 1, L.eye); px(g, 12, y + 5, L.eye); }
    else { rect(g, 13, y + 4 + oy, 2, 2, L.eye); px(g, 13, y + 4 + oy, L.eyeHi); }
    rect(g, 4, y + 2, 1, 8, L.shade);
  }
}

/** L'antenne, avec sa petite boule de couleur. */
function drawAntenna(g: CanvasRenderingContext2D, L: Look, bob: number, chef: boolean) {
  rect(g, 9, 3 + bob, 2, 1, chef ? '#5b566a' : '#9d98ae');
  rect(g, 9, 1 + bob, 2, 2, L.tip);
  px(g, 9, 1 + bob, lighten(L.tip, 0.5));
}

/** Ce qui se porte sur la tête : chapeaux, coiffures, capuche, lunettes. */
function drawHeadParts(g: CanvasRenderingContext2D, L: Look, dir: Dir, bob: number) {
  const y = bob;
  const has = (p: Part) => L.parts.has(p);
  const side = dir === 'left' || dir === 'right';
  if (has('beret')) { // un béret, penché
    const c = L.c('accent', ROLES.design.color);
    rect(g, 5, 2 + y, 10, 2, c);
    rect(g, 4, 3 + y, 12, 1, darken(c, 0.15));
    rect(g, 6, 1 + y, 6, 1, lighten(c, 0.25));
    px(g, 11, 0 + y, darken(c, 0.3));
  }
  if (has('explorerHat')) { // un chapeau d'explorateur (il part à la chasse aux infos)
    rect(g, 3, 4 + y, 14, 1, '#d6bd86');
    rect(g, 6, 1 + y, 8, 3, '#c7aa70');
    rect(g, 6, 3 + y, 8, 1, '#7c6337');
    rect(g, 7, 1 + y, 6, 1, '#e3cf9e');
  }
  if (has('headset')) { // un casque audio
    const c = L.c('accent', ROLES.code.color);
    rect(g, 4, 3 + y, 12, 1, '#2b2836');
    if (side) {
      rect(g, 7, 6 + y, 3, 4, c);
      rect(g, 7, 9 + y, 3, 1, darken(c, 0.3));
    } else {
      rect(g, 2, 6 + y, 2, 5, c);
      rect(g, 16, 6 + y, 2, 5, c);
      rect(g, 2, 10 + y, 2, 1, darken(c, 0.3));
      rect(g, 16, 10 + y, 2, 1, darken(c, 0.3));
    }
  }
  if (has('hood')) { // une capuche rabattue : elle encadre la visière
    const c = L.c('hood', '#2b2b33'), hi = lighten(c, 0.12), lo = darken(c, 0.3);
    if (dir === 'up') {
      rect(g, 3, 3 + y, 14, 11, c);
      rect(g, 4, 3 + y, 12, 1, hi);
      rect(g, 9, 5 + y, 2, 8, lo);
      rect(g, 8, 2 + y, 4, 1, c);
    } else if (side) {
      rect(g, 4, 3 + y, 10, 3, c);
      rect(g, 3, 5 + y, 7, 9, c);
      rect(g, 4, 3 + y, 9, 1, hi);
      rect(g, 9, 6 + y, 1, 7, lo);
      rect(g, 6, 2 + y, 4, 1, c);
    } else {
      rect(g, 3, 3 + y, 14, 3, c);
      rect(g, 3, 5 + y, 2, 9, c);
      rect(g, 15, 5 + y, 2, 9, c);
      rect(g, 4, 3 + y, 12, 1, hi);
      rect(g, 5, 6 + y, 10, 1, lo);
      rect(g, 8, 2 + y, 4, 1, c);
    }
  }
  if (has('wizardHat')) { // le chapeau pointu du mage, sa pointe retombe
    const c = L.c('hat', '#5a2d82'), hi = lighten(c, 0.2), band = L.c('rune', '#3fe0c8');
    if (side) {
      rect(g, 3, 4 + y, 14, 1, darken(c, 0.2));
      rect(g, 5, 3 + y, 9, 1, band);
      rect(g, 5, 2 + y, 7, 1, c);
      rect(g, 5, 1 + y, 5, 1, hi);
      rect(g, 3, 0 + y, 3, 1, c);
    } else {
      rect(g, 2, 4 + y, 16, 1, darken(c, 0.2));
      rect(g, 5, 3 + y, 10, 1, band);
      rect(g, 6, 2 + y, 8, 1, c);
      rect(g, 7, 1 + y, 6, 1, hi);
      rect(g, 8, 0 + y, 4, 1, c);
      px(g, 12, 0 + y, darken(c, 0.2));
    }
  }
  if (has('bun')) { // un chignon net, et les cheveux tirés
    const c = L.c('hair', '#2b2430'), hi = lighten(c, 0.2);
    if (dir === 'up') {
      rect(g, 4, 4 + y, 12, 5, c);
      rect(g, 8, 1 + y, 4, 3, c);
      px(g, 9, 1 + y, hi);
    } else if (side) {
      rect(g, 4, 4 + y, 10, 2, c);
      rect(g, 4, 5 + y, 3, 5, c);
      rect(g, 3, 2 + y, 4, 3, c);
      px(g, 4, 2 + y, hi);
    } else {
      rect(g, 4, 4 + y, 12, 2, c);
      rect(g, 4, 6 + y, 1, 4, c);
      rect(g, 15, 6 + y, 1, 4, c);
      rect(g, 8, 1 + y, 4, 3, c);
      px(g, 9, 1 + y, hi);
    }
  }
  if (has('pompadour')) { // une banane violette, très haute
    const c = L.c('hair', '#7a3dbf'), hi = lighten(c, 0.3), lo = darken(c, 0.25);
    if (side) {
      rect(g, 10, 0 + y, 5, 1, hi);
      rect(g, 7, 1 + y, 8, 1, c);
      rect(g, 5, 2 + y, 9, 1, c);
      rect(g, 4, 3 + y, 9, 2, lo);
      rect(g, 4, 5 + y, 2, 3, lo);
    } else {
      rect(g, 8, 0 + y, 5, 1, hi);
      rect(g, 6, 1 + y, 8, 1, c);
      rect(g, 5, 2 + y, 10, 1, c);
      rect(g, 4, 3 + y, 12, 2, dir === 'up' ? c : lo);
      if (dir === 'up') rect(g, 4, 5 + y, 12, 3, lo);
      else { rect(g, 4, 5 + y, 1, 3, lo); rect(g, 15, 5 + y, 1, 3, lo); }
    }
  }
  if (has('hairTuft')) { // des cheveux roux en bataille
    const c = L.c('hair', '#c8462d'), hi = lighten(c, 0.25);
    if (side) {
      rect(g, 5, 3 + y, 9, 1, c);
      px(g, 6, 2 + y, c); px(g, 9, 2 + y, hi); px(g, 12, 2 + y, c);
      rect(g, 4, 4 + y, 2, 3, c);
    } else {
      rect(g, 5, 3 + y, 10, 1, c);
      px(g, 6, 2 + y, c); px(g, 8, 2 + y, hi); px(g, 11, 2 + y, c); px(g, 13, 2 + y, hi);
      if (dir === 'up') rect(g, 4, 4 + y, 12, 3, c);
    }
  }
  if (has('crest')) { // le casque corinthien : une aigrette rouge d'avant en arrière, des paragnathides de bronze
    const c = L.c('crest', '#c0392b'), hi = lighten(c, 0.3), bronze = L.c('bronze', '#b8863b');
    if (side) {
      rect(g, 4, 1 + y, 10, 2, c);
      rect(g, 3, 2 + y, 2, 3, c);
      rect(g, 6, 1 + y, 7, 1, hi);
      rect(g, 8, 3 + y, 4, 1, bronze);
    } else {
      rect(g, 8, 0 + y, 4, 4, c);
      rect(g, 9, 0 + y, 1, 4, hi);
      rect(g, 7, 3 + y, 6, 1, bronze);
      if (dir === 'down') { rect(g, 4, 9 + y, 2, 4, bronze); rect(g, 14, 9 + y, 2, 4, bronze); }
    }
  }
  if (has('goggles') && dir !== 'up') { // des lunettes d'aviateur relevées sur le front
    const band = L.c('strap', '#57483c'), lens = L.c('lens', '#43748a');
    if (side) {
      rect(g, 4, 5 + y, 11, 1, band);
      rect(g, 12, 4 + y, 3, 2, lens);
      px(g, 13, 4 + y, lighten(lens, 0.5));
    } else {
      rect(g, 4, 5 + y, 12, 1, band);
      for (const x of [6, 11]) { rect(g, x, 4 + y, 3, 2, lens); px(g, x, 4 + y, lighten(lens, 0.5)); }
    }
  }
  if (has('glasses')) { // des lunettes, sur la visière
    const f = L.c('glasses', '#f3f1f8');
    if (dir === 'down') {
      for (const x of [6, 10]) {
        rect(g, x, 7 + y, 4, 1, f);
        rect(g, x, 10 + y, 4, 1, f);
        rect(g, x, 7 + y, 1, 4, f);
        rect(g, x + 3, 7 + y, 1, 4, f);
      }
    } else if (dir !== 'up') {
      rect(g, 12, 7 + y, 4, 1, f);
      rect(g, 12, 10 + y, 4, 1, f);
      rect(g, 12, 7 + y, 1, 4, f);
    }
  }
  if (has('sunglasses') && dir !== 'up') { // de grandes lunettes de soleil rondes et jaunes
    const f = L.c('sunglasses', '#fde219'), lens = '#2a1630';
    if (side) {
      rect(g, 12, 7 + y, 3, 3, f);
      px(g, 13, 8 + y, lens);
    } else {
      for (const x of [6, 11]) { rect(g, x, 7 + y, 3, 3, f); px(g, x + 1, 8 + y, lens); }
      rect(g, 9, 8 + y, 2, 1, f);
    }
  }
  if (has('pencil') && dir === 'down') { // un crayon sur l'oreille
    px(g, 16, 3 + y, '#ff8fb1');
    rect(g, 16, 4 + y, 1, 5, '#ffd166');
    px(g, 16, 9 + y, '#3a3547');
  }
}

interface Limbs { la: [number, number, number]; ra: [number, number, number]; ll: number; rl: number }

/** Ce qui se porte dans le dos et passe derrière le corps (vue de face ou de profil). */
function drawBehind(g: CanvasRenderingContext2D, L: Look, dir: Dir, frame: number, walking: boolean, bob: number) {
  const y = 14 + bob;
  if (L.parts.has('cape') && dir !== 'up') { // la cape, qui dépasse de chaque côté
    const c = L.c('cape', P.orange), lo = darken(c, 0.25);
    if (dir === 'down') {
      // de face, on ne voit que ses deux pans, sous les bras
      rect(g, 3, y, 3, 7, lo);
      rect(g, 14, y, 3, 7, lo);
      rect(g, 3, y, 1, 7, c);
      rect(g, 16, y, 1, 7, c);
    } else {
      const flap = walking && frame % 2 ? 1 : 0;
      rect(g, 4 - flap, y, 4 + flap, 7, c);
      rect(g, 4 - flap, y + 6, 4 + flap, 1, lo);
    }
  }
  if (L.parts.has('backpack') && dir !== 'down' && dir !== 'up') { // le sac à dos et sa parabole, de profil
    const c = L.c('pack', '#43748a'), lo = darken(c, 0.3);
    rect(g, 3, y - 1, 5, 7, c);
    rect(g, 3, y + 1, 5, 1, lo);
    rect(g, 2, 8 + bob, 3, 3, '#cfd2e0');
    px(g, 3, 9 + bob, '#8a8ea2');
    rect(g, 4, 11 + bob, 1, 2, '#8a8ea2');
  }
}

/** Ce qui se porte sur le corps, devant (vue de face) ou dans le dos (vue de dos). */
function drawBodyParts(g: CanvasRenderingContext2D, L: Look, dir: Dir, limbs: Limbs, bob: number) {
  const y = 14 + bob;
  const has = (p: Part) => L.parts.has(p);
  if (dir === 'up') {
    if (has('cape')) { // dans le dos, la cape couvre tout
      const c = L.c('cape', P.orange), lo = darken(c, 0.25);
      rect(g, 5, y, 10, 7, c);
      rect(g, 8, y + 1, 1, 6, lo);
      rect(g, 11, y + 1, 1, 6, lo);
      rect(g, 5, y + 6, 10, 1, lo);
    }
    if (has('backpack')) { // le sac à dos, sa parabole au-dessus de l'épaule
      const c = L.c('pack', '#43748a'), lo = darken(c, 0.3);
      rect(g, 5, y - 1, 10, 7, c);
      rect(g, 5, y + 1, 10, 1, lo);
      rect(g, 8, y + 3, 4, 2, lo);
      rect(g, 13, 9 + bob, 3, 3, '#cfd2e0');
      px(g, 14, 10 + bob, '#8a8ea2');
      rect(g, 14, 12 + bob, 1, 1, '#8a8ea2');
    }
    if (has('epaulettes')) { rect(g, 5, y, 2, 1, L.c('gold', '#ffb02e')); rect(g, 13, y, 2, 1, L.c('gold', '#ffb02e')); }
    if (has('puffy')) { rect(g, 3, y - 1, 4, 3, L.body); rect(g, 13, y - 1, 4, 3, L.body); rect(g, 3, y - 1, 14, 1, L.bodyHi); }
    return;
  }
  if (has('puffy')) { // des épaules énormes, rembourrées
    rect(g, 3, y - 1, 4, 3, L.body);
    rect(g, 13, y - 1, 4, 3, L.body);
    rect(g, 3, y - 1, 4, 1, L.bodyHi);
    rect(g, 13, y - 1, 4, 1, L.bodyHi);
    rect(g, 3, y + 1, 4, 1, L.bodyShade);
    rect(g, 13, y + 1, 4, 1, L.bodyShade);
  }
  if (has('tie')) { // le col blanc et la cravate moutarde
    px(g, 8, y, '#f4f1ea'); px(g, 11, y, '#f4f1ea');
    rect(g, 9, y, 2, 1, L.c('tie', '#e0a526'));
    rect(g, 9, y + 1, 1, 3, L.c('tie', '#e0a526'));
  }
  if (has('tape')) { // le mètre ruban autour du cou
    const c = L.c('tape', '#fde219');
    rect(g, 8, y, 1, 4, c);
    rect(g, 11, y, 1, 2, c);
  }
  if (has('epaulettes')) { rect(g, 5, y, 2, 1, L.c('gold', '#ffb02e')); rect(g, 13, y, 2, 1, L.c('gold', '#ffb02e')); }
  if (has('star')) { px(g, 12, y + 2, L.c('gold', '#ffd84d')); px(g, 12, y + 1, lighten(L.c('gold', '#ffd84d'), 0.5)); }
  if (has('chestLight')) { rect(g, 9, y + 1, 2, 2, L.eye); px(g, 9, y + 1, L.eyeHi); }
  if (has('toolbelt')) { rect(g, 6, y + 4, 8, 1, L.c('belt', '#ffd166')); px(g, 9, y + 4, darken(L.c('belt', '#ffd166'), 0.4)); }
  if (has('backpack')) { const s = L.c('strap', '#57483c'); rect(g, 7, y, 1, 4, s); rect(g, 12, y, 1, 4, s); rect(g, 15, 9 + bob, 3, 3, '#cfd2e0'); px(g, 16, 10 + bob, '#8a8ea2'); }
  if (has('cables')) { // des câbles verts le long des manches
    const c = L.c('cables', '#41f509');
    for (const [x, ay, h] of [limbs.la, limbs.ra]) { px(g, x, ay + bob + 1, c); px(g, x + 1, ay + bob + Math.min(3, h - 2), c); }
    px(g, 7, y + 2, c);
  }
  if (has('holo')) { const [x, ay, h] = limbs.ra; rect(g, x, ay + bob + h - 2, 2, 1, L.c('holo', '#9fe8ff')); }
  if (has('shield')) { // l'hoplon de bronze frappé du lambda, au bras gauche
    const b = L.c('bronze', '#b8863b'), rim = darken(b, 0.3), mark = L.c('crest', '#c0392b');
    rect(g, 2, y, 6, 6, b);
    rect(g, 3, y - 1, 4, 8, b);
    rect(g, 2, y, 1, 6, rim); rect(g, 7, y, 1, 6, rim);
    px(g, 5, y + 1, mark); px(g, 4, y + 2, mark); px(g, 4, y + 3, mark); px(g, 6, y + 2, mark); px(g, 6, y + 3, mark); px(g, 3, y + 4, mark); px(g, 7, y + 4, mark);
  }
  if (has('tablet')) { // la tablette tenue contre elle
    const c = L.c('tablet', '#2c2c4e');
    rect(g, 5, y + 1, 4, 4, c);
    rect(g, 6, y + 2, 2, 2, L.c('screen', '#6f849d'));
  }
}

/** Le corps, les bras et les jambes, vus de face ou de dos. */
function drawBodyFront(g: CanvasRenderingContext2D, L: Look, dir: Dir, limbs: Limbs, bob: number, seated: boolean, chef: boolean) {
  const y = 14 + bob;
  const robe = L.parts.has('robe');
  // jambes (cachées sous le bureau quand il est assis)
  if (!seated) {
    rect(g, 7, 19, 2, 3 - limbs.ll, L.leg);
    rect(g, 11, 19, 2, 3 - limbs.rl, L.leg);
    if (L.parts.has('sneakers')) {
      if (!limbs.ll) rect(g, 7, 21, 2, 1, L.c('shoes', '#f3f1f8'));
      if (!limbs.rl) rect(g, 11, 21, 2, 1, L.c('shoes', '#f3f1f8'));
    }
  }
  // corps (la robe du mage descend jusqu'aux pieds)
  const h = robe && !seated ? 7 : 5;
  rect(g, robe ? 5 : 6, y, robe ? 10 : 8, h, L.body);
  rect(g, robe ? 5 : 6, y, robe ? 10 : 8, 1, L.bodyHi);
  rect(g, robe ? 5 : 6, y + h - 1, robe ? 10 : 8, 1, L.bodyShade);
  rect(g, robe ? 14 : 13, y + 1, 1, h - 2, L.bodyShade);
  if (robe && !seated) for (const x of [6, 9, 12]) px(g, x, y + h - 2, L.c('rune', '#3fe0c8'));
  if (chef && dir === 'down') {
    // l'encolure en V de la veste blanche, sur le haut orange, et ses revers
    rect(g, 8, y, 4, 1, P.orange);
    rect(g, 9, y + 1, 2, 1, P.orange);
    px(g, 7, y, L.bodyShade);
    px(g, 12, y, L.bodyShade);
    px(g, 8, y + 1, L.bodyShade);
    px(g, 11, y + 1, L.bodyShade);
    px(g, 9, y + 2, L.bodyShade);
    px(g, 10, y + 2, L.bodyShade);
    // les boutons et la poche de poitrine
    px(g, 10, y + 3, '#8f8aa1');
    px(g, 7, y + 2, '#ffd2a8');
  } else if (chef && dir === 'up') {
    // le dos de la veste : la couture
    rect(g, 10, y + 1, 1, 3, L.bodyShade);
  } else if (!chef && dir === 'down' && L.parts.size <= 1) {
    // un petit voyant sur la poitrine
    px(g, 8, y + 2, lighten(L.body, 0.55));
  }
  // bras : [x, y, hauteur]
  for (const [x, ay, ah] of [limbs.la, limbs.ra]) {
    rect(g, x, ay + bob, 2, ah, L.arm);
    rect(g, x, ay + bob + ah - 1, 2, 1, L.hand);
  }
}

function drawBodySide(g: CanvasRenderingContext2D, L: Look, frame: number, walking: boolean, bob: number, pose: Pose) {
  const y = 14 + bob;
  const swing = walking ? [0, 1, 0, -1][frame % 4] : 0;
  const robe = L.parts.has('robe');
  // jambes : l'une devant, l'autre derrière
  rect(g, 8 + swing, 19, 2, 3, darken(L.leg, 0.15));
  rect(g, 10 - swing, 19, 2, 3, L.leg);
  if (L.parts.has('sneakers')) { rect(g, 8 + swing, 21, 2, 1, darken(L.c('shoes', '#f3f1f8'), 0.15)); rect(g, 10 - swing, 21, 3, 1, L.c('shoes', '#f3f1f8')); }
  const h = robe ? 7 : 5;
  rect(g, robe ? 6 : 7, y, robe ? 9 : 7, h, L.body);
  rect(g, robe ? 6 : 7, y, robe ? 9 : 7, 1, L.bodyHi);
  rect(g, robe ? 6 : 7, y + h - 1, robe ? 9 : 7, 1, L.bodyShade);
  if (robe) for (const x of [8, 12]) px(g, x, y + h - 2, L.c('rune', '#3fe0c8'));
  if (L.parts.has('puffy')) { rect(g, 6, y - 1, 9, 3, L.body); rect(g, 6, y - 1, 9, 1, L.bodyHi); }
  if (L.parts.has('tie')) { px(g, 13, y, '#f4f1ea'); rect(g, 13, y + 1, 1, 2, L.c('tie', '#e0a526')); }
  if (L.parts.has('toolbelt')) rect(g, 7, y + 4, 7, 1, L.c('belt', '#ffd166'));
  if (L.parts.has('epaulettes')) rect(g, 9, y, 3, 1, L.c('gold', '#ffb02e'));
  if (L.parts.has('backpack')) rect(g, 8, y, 1, 4, L.c('strap', '#57483c'));
  if (pose === 'carry') {
    // la feuille tenue devant lui
    rect(g, 12, y, 5, 6, P.paper);
    rect(g, 13, y + 2, 3, 1, P.paperLine);
    rect(g, 13, y + 4, 2, 1, P.paperLine);
    rect(g, 11, y + 1, 3, 2, L.arm);
  } else if (L.parts.has('tablet')) {
    rect(g, 11, y + 1, 2, 4, L.c('tablet', '#2c2c4e'));
    rect(g, 9 - swing, y + 1, 3, 2, L.arm);
  } else {
    rect(g, 9 - swing, y + 1, 2, 4, L.arm);
    rect(g, 9 - swing, y + 4, 2, 1, L.hand);
    if (L.parts.has('cables')) px(g, 9 - swing, y + 2, L.c('cables', '#41f509'));
    if (L.parts.has('holo')) px(g, 10 - swing, y + 3, L.c('holo', '#9fe8ff'));
  }
}

/** Le bâton du mage : il le tient à côté de lui ; son cristal scintille une image sur deux au repos. */
function drawStaff(g: CanvasRenderingContext2D, L: Look, dir: Dir, frame: number, bob: number, glint: boolean) {
  const x = dir === 'up' ? 3 : 16;
  if (L.parts.has('spear')) { // la lance de Hares : une hampe et une pointe de bronze
    const tip = L.c('bronze', '#b8863b');
    rect(g, x, 3 + bob, 1, 19 - bob, L.c('wood', '#7a5230'));
    rect(g, x - 1, 1 + bob, 3, 2, tip);
    px(g, x, 0 + bob, lighten(tip, 0.4));
    return;
  }
  if (!L.parts.has('staff')) return;
  const wood = L.c('wood', '#7a5230'), gem = L.c('rune', '#3fe0c8');
  rect(g, x, 4 + bob, 1, 17 - bob, wood);
  rect(g, x - 1, 1 + bob, 3, 3, glint && frame % 2 ? lighten(gem, 0.5) : gem);
  px(g, x - 1, 1 + bob, '#ffffff');
}

function limbsFor(pose: Pose, frame: number): Limbs {
  const f = frame % 4;
  switch (pose) {
    case 'walk':
      return { la: [4, 14 + (f === 1 ? 1 : f === 3 ? -1 : 0), 4], ra: [14, 14 + (f === 1 ? -1 : f === 3 ? 1 : 0), 4], ll: f === 1 ? 1 : 0, rl: f === 3 ? 1 : 0 };
    case 'type':
    case 'play': // debout, les mains qui s'agitent (baby-foot, arcade, fourneaux)
      return { la: [5, 16 - (frame % 2 === 0 ? 1 : 0), 3], ra: [13, 16 - (frame % 2 === 1 ? 1 : 0), 3], ll: 0, rl: 0 };
    case 'sit':
    case 'read':
      return { la: [5, 16, 3], ra: [13, 16, 3], ll: 0, rl: 0 };
    case 'think':
      return { la: [4, 14, 4], ra: [13, 11, 4], ll: 0, rl: 0 };
    case 'raise':
      return { la: [4, 14, 4], ra: [15, 2 + (frame % 2), 6], ll: 0, rl: 0 };
    case 'cheer':
      return { la: [3, 3 + (frame % 2), 6], ra: [15, 3 + ((frame + 1) % 2), 6], ll: frame % 2, rl: (frame + 1) % 2 };
    case 'wave':
      return { la: [4, 14, 4], ra: [15 + (frame % 2), 4, 6], ll: 0, rl: 0 };
    case 'write':
      return { la: [4, 14, 4], ra: [14, 7 + (frame % 2), 6], ll: 0, rl: 0 };
    case 'carry':
      return { la: [5, 15, 3], ra: [13, 15, 3], ll: 0, rl: 0 };
    default:
      return { la: [4, 14, 4], ra: [14, 14, 4], ll: 0, rl: 0 };
  }
}

function build(key: string, pose: Pose, dir: Dir, frame: number, eyes: Eyes): HTMLCanvasElement {
  if (dir === 'left') return mirror(build(key, pose, 'right', frame, eyes));
  const L = lookOf(key);
  const chef = key === 'chef' || L.parts.has('jacket');
  const c = makeCanvas(ROBOT_W, ROBOT_H);
  const g = g2d(c);
  const seated = pose === 'sit' || pose === 'type' || pose === 'read' || (pose === 'think' && frame >= 100);
  const walking = pose === 'walk';
  const f = frame % 4;
  const bob = walking ? (f === 1 || f === 3 ? -1 : 0) : pose === 'cheer' ? -(frame % 2) : 0;
  const hatted = HATS.some((p) => L.parts.has(p));
  // au repos, le cristal du mage scintille (son « frame » alterne)
  const glint = pose === 'stand' || pose === 'sit';
  if (dir === 'right') {
    drawBehind(g, L, dir, frame, walking, bob);
    drawBodySide(g, L, frame, walking, bob, pose);
    if (!hatted) drawAntenna(g, L, bob, chef);
    drawHead(g, L, 'right', eyes, bob);
    drawHeadParts(g, L, 'right', bob);
    if (L.parts.has('beard')) { rect(g, 11, 11 + bob, 4, 3, '#f2efe6'); rect(g, 12, 14 + bob, 3, 2, '#f2efe6'); }
    drawStaff(g, L, dir, frame, bob, glint);
  } else {
    const limbs = limbsFor(pose, frame);
    drawBehind(g, L, dir, frame, walking, bob);
    // les bras levés passent derrière la tête : on les dessine d'abord
    drawBodyFront(g, L, dir, limbs, bob, seated, chef);
    drawBodyParts(g, L, dir, limbs, bob);
    if (!hatted) drawAntenna(g, L, bob, chef);
    drawHead(g, L, dir, eyes, bob);
    drawHeadParts(g, L, dir, bob);
    if (L.parts.has('beard') && dir === 'down') {
      // la longue barbe blanche, sous la visière
      rect(g, 6, 11 + bob, 8, 3, '#f2efe6');
      rect(g, 7, 14 + bob, 6, 2, '#f2efe6');
      rect(g, 9, 16 + bob, 2, 1, '#f2efe6');
      px(g, 8, 12 + bob, '#d8d1c3');
      px(g, 11, 13 + bob, '#d8d1c3');
    }
    if (pose === 'carry' && dir === 'down') {
      // la feuille, tenue à deux mains devant le ventre
      rect(g, 7, 15 + bob, 6, 6, P.paper);
      rect(g, 8, 17 + bob, 4, 1, P.paperLine);
      rect(g, 8, 19 + bob, 3, 1, P.paperLine);
      rect(g, 12, 15 + bob, 1, 6, P.paperShade);
      rect(g, 5, 16 + bob, 2, 2, L.hand);
      rect(g, 13, 16 + bob, 2, 2, L.hand);
    }
    if ((pose === 'raise' || pose === 'cheer' || pose === 'wave') && dir === 'down') {
      // le bras levé redessiné par-dessus la tête quand il la recouvre
      const [x, ay, h] = limbs.ra;
      if (x <= 15) { rect(g, x, ay + bob, 2, h, L.arm); rect(g, x, ay + bob, 2, 1, L.hand); }
      if (pose === 'cheer') { const [lx, ly, lh] = limbs.la; rect(g, lx, ly + bob, 2, lh, L.arm); rect(g, lx, ly + bob, 2, 1, L.hand); }
    }
    drawStaff(g, L, dir, frame, bob, glint);
  }
  outline(c, chef ? '#07060a' : P.ink);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Le sprite d'un robot : `key` est un personnage du catalogue, ou un métier (son robot d'origine).
 *  Gardé en mémoire : chaque pose n'est dessinée qu'une fois. */
export function robotSprite(key: string, pose: Pose, dir: Dir, frame: number, eyes: Eyes = 'open'): HTMLCanvasElement {
  const id = `${key}|${pose}|${dir}|${frame}|${eyes}`;
  let c = cache.get(id);
  if (!c) {
    c = build(key, pose, dir, frame, eyes);
    cache.set(id, c);
  }
  return c;
}

/** Le visage d'un robot en grand (pour la boîte de dialogue). */
export function portrait(key: string, eyes: Eyes, scale: number): HTMLCanvasElement {
  const src = robotSprite(key, 'stand', 'down', 0, eyes);
  const c = makeCanvas(16 * scale, 16 * scale);
  const g = g2d(c);
  g.drawImage(src, 2, 0, 16, 16, 0, 0, 16 * scale, 16 * scale);
  return c;
}
