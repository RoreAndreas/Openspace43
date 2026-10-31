// Le dessin de Dehors. Deux plans :
// - le fond, en perspective : le ciel, la mer qui s'étend jusqu'à l'horizon (brumeuse au loin, plus franche près de
//   la falaise), le soleil ou la lune et leur reflet, un cap lointain avec son phare, à gauche ;
// - le sol, vu de dessus en 3/4 comme le bureau : le pavillon 43 à droite (toit plat, bardage bois, grande baie),
//   la prairie que le vent parcourt en vagues, les pins, le chemin de gravier, et le bord de la falaise, face au large.
// Le décor fixe est dessiné une fois par heure du jour ; le reste bouge à chaque image.
import { coastY, HORIZON, OUT_DOOR, OUTSIDE_FURNITURE, PATHS, type Outside, type OutFurn, type Walker } from './outside.ts';
import { H, OX, T, WIDE } from './layout.ts';

/** Dehors est plus large que le bureau : la scène reste au milieu, le décor se prolonge sur les côtés (de X0 à X0 + W). */
const X0 = -OX;
const W = WIDE;
import { g2d, hline, makeCanvas, mix, outline, P, px, rect, rgba, rng, vline, type G } from './pixels.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import type { Sprite } from './furniture.ts';

// ── Les couleurs, selon l'heure ──
const SKY: Record<TimeOfDay, string[]> = {
  day: ['#5fa8e6', '#7cbaec', '#9bcdf1', '#bcdff5', '#dcedf7'],
  evening: ['#2e2a5e', '#56397a', '#9a4c7c', '#e0755f', '#ffb77a'],
  night: ['#080b22', '#0c1230', '#111a3e', '#18234c', '#202d5a'],
};
/** La mer : au loin (brumeuse, presque la couleur de l'horizon), et tout près de la falaise. */
const SEA: Record<TimeOfDay, [string, string]> = {
  day: ['#a6d2ea', '#2a78b2'],
  evening: ['#f0a88a', '#3e3470'],
  night: ['#28335e', '#0d1734'],
};
const LAND: Record<TimeOfDay, [string, string]> = {
  day: ['#86a6b6', '#9ab8c6'],
  evening: ['#7a4f78', '#8e5e84'],
  night: ['#161d3c', '#1d2648'],
};
const GLINT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#ffd2a0', night: '#dfe6ff' };
const AMBIENT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#b79db3', night: '#36447c' };
/** Le soleil (ou la lune) : sa place dans le ciel ; son reflet descend vers nous. */
const SUN_X = 150;

// ── Le bord de la falaise, colonne par colonne ──
const EDGE: number[] = [];
for (let x = X0; x < X0 + W; x++) EDGE.push(Math.round(coastY(x)));
const edgeAt = (x: number) => EDGE[Math.max(0, Math.min(W - 1, Math.round(x) - X0))];
/** Le bas de la mer visible (le bord de la falaise le plus bas). */
const SEA_BOTTOM = Math.max(...EDGE.slice(OX, OX + 200));

/** La distance d'un point au chemin de gravier. */
function toPath(x: number, y: number) {
  let best = Infinity;
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(a.x + dx * k - x, a.y + dy * k - y));
  }
  return best;
}

/** Le pavillon (pour ne pas y faire pousser d'herbe). */
const inBuilding = (x: number, y: number) => x >= 228 && x <= 328 && y < 104;
/** La profondeur d'un point de la mer : 0 à l'horizon, 1 au pied de la vue. */
const depth = (y: number) => Math.max(0, Math.min(1, (y - HORIZON) / (SEA_BOTTOM - HORIZON)));

// ── Les meubles de Dehors ──

/** Le banc, vu de dos : on s'y assoit face à la mer. Le dossier passe devant celui qui est assis. */
function benchBackSprite(): Sprite {
  const c = makeCanvas(48, 20);
  const g = g2d(c);
  // l'assise, qu'on voit par-dessus le dossier
  rect(g, 2, 1, 44, 5, P.woodHi);
  hline(g, 2, 1, 44, P.woodLight);
  for (const x of [16, 32]) vline(g, x, 2, 4, P.wood);
  // les montants et les deux lattes du dossier
  rect(g, 2, 2, 3, 15, P.woodDark);
  rect(g, 43, 2, 3, 15, P.woodDark);
  rect(g, 4, 7, 40, 3, P.wood);
  hline(g, 4, 7, 40, P.woodHi);
  rect(g, 4, 11, 40, 3, P.wood);
  hline(g, 4, 11, 40, P.woodHi);
  rect(g, 4, 16, 3, 3, '#2b2836');
  rect(g, 41, 16, 3, 3, '#2b2836');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(3, 19, 42, 1);
  return { c, ox: 0, oy: 0, sort: 14 };
}

/** Un vieux tronc couché, un peu de mousse dessus. */
function logSprite(): Sprite {
  const c = makeCanvas(34, 14);
  const g = g2d(c);
  rect(g, 3, 2, 28, 9, '#7a5236');
  hline(g, 3, 2, 28, '#9a6c48');
  hline(g, 3, 3, 28, '#8a5f3e');
  for (const x of [8, 15, 22, 27]) vline(g, x, 4, 5, '#5e3d26');
  hline(g, 3, 10, 28, '#5e3d26');
  for (const x of [1, 29]) { rect(g, x, 3, 4, 8, '#c89b6a'); rect(g, x + 1, 5, 2, 4, '#a87a4c'); px(g, x + 1, 6, '#c89b6a'); }
  for (const [x, y] of [[10, 2], [11, 2], [18, 1], [19, 2], [24, 2]]) px(g, x, y, '#6aa84a');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(3, 13, 28, 1);
  return { c, ox: 0, oy: 0, sort: 8 };
}

/** Le panneau du chemin de la barque : un poteau de bois, une planche avec une petite barque peinte. */
function fishingSprite(): Sprite {
  const c = makeCanvas(14, 18);
  const g = g2d(c);
  rect(g, 6, 6, 2, 12, P.woodDark);
  rect(g, 1, 1, 12, 7, P.wood);
  hline(g, 1, 1, 12, P.woodLight);
  // la barque peinte, sur l'eau
  rect(g, 3, 4, 8, 2, '#8a5530');
  hline(g, 3, 4, 8, '#d24a40');
  hline(g, 2, 6, 10, '#4f9fe8');
  vline(g, 7, 2, 2, '#563821');
  outline(c, P.ink);
  return { c, ox: 0, oy: 0, sort: 16 };
}

function bollardSprite(): Sprite {
  const c = makeCanvas(6, 11);
  const g = g2d(c);
  rect(g, 1, 2, 4, 8, '#3a3a48');
  rect(g, 1, 2, 4, 2, '#ffe2a8');
  hline(g, 1, 1, 4, '#4a4a5c');
  vline(g, 1, 4, 6, '#4a4a5c');
  outline(c, P.ink);
  return { c, ox: 0, oy: 0, sort: 10 };
}

function windsockPole(): Sprite {
  const c = makeCanvas(8, 28);
  const g = g2d(c);
  rect(g, 3, 2, 2, 24, '#cfd2e0');
  vline(g, 3, 2, 24, '#ffffff');
  rect(g, 1, 25, 6, 3, '#5a5a6e');
  rect(g, 2, 1, 4, 2, '#8a8ea2');
  outline(c, P.ink);
  return { c, ox: 0, oy: 0, sort: 26 };
}

const LEAVES = [
  [P.leafDark, P.leaf, P.leafHi, P.leafLight, P.leafDeep],
  ['#245c4c', '#2f8266', '#4fae86', '#8be0b0', '#173d34'],
  ['#4a6e2a', '#6a9a36', '#98c250', '#cde87c', '#2f4a1a'],
];

/** Un arbre rond : le tronc (fixe) et le feuillage (qui se balance), en trois verts. */
function roundTree(pal: string[]) {
  const trunk = makeCanvas(10, 16);
  const tg = g2d(trunk);
  rect(tg, 3, 0, 4, 14, '#6b4528');
  vline(tg, 3, 0, 14, '#8a5a36');
  rect(tg, 2, 12, 6, 3, '#6b4528');
  outline(trunk, P.ink);
  const canopy = makeCanvas(36, 32);
  const cg = g2d(canopy);
  const blob = (x: number, y: number, w: number, h: number, col: string) => { rect(cg, x + 2, y, w - 4, h, col); rect(cg, x, y + 2, w, h - 4, col); rect(cg, x + 1, y + 1, w - 2, h - 2, col); };
  blob(4, 10, 28, 20, pal[0]);
  blob(2, 6, 20, 18, pal[1]);
  blob(14, 2, 20, 18, pal[1]);
  blob(8, 3, 14, 12, pal[2]);
  blob(20, 8, 10, 8, pal[2]);
  for (const [x, y] of [[10, 6], [24, 5], [16, 11], [27, 13], [8, 15]]) { px(cg, x, y, pal[3]); px(cg, x + 1, y, pal[3]); }
  for (const [x, y] of [[8, 24], [18, 26], [26, 22]]) hline(cg, x, y, 4, pal[4]);
  outline(canopy, P.ink);
  return { trunk, canopy };
}

/** Un pin parasol : un tronc long et penché (le vent du large l'a couché), une couronne plate. */
function pineTree() {
  const trunk = makeCanvas(16, 32);
  const tg = g2d(trunk);
  for (let y = 0; y < 30; y++) {
    const x = Math.round(4 + ((29 - y) / 29) ** 1.4 * 8);
    rect(tg, x, y, 3, 1, '#7a5236');
    px(tg, x, y, '#9a6c48');
  }
  rect(tg, 2, 29, 6, 2, '#7a5236');
  rect(tg, 12, 8, 3, 1, '#7a5236');
  outline(trunk, P.ink);
  const canopy = makeCanvas(46, 18);
  const cg = g2d(canopy);
  const layer = (x: number, y: number, w: number, h: number, col: string) => { rect(cg, x + 3, y, w - 6, h, col); rect(cg, x + 1, y + 1, w - 2, h - 2, col); rect(cg, x, y + 2, w, h - 4, col); };
  layer(1, 6, 44, 10, '#24492c');
  layer(4, 3, 36, 10, '#2f5e36');
  layer(10, 1, 26, 8, '#3f7a42');
  for (const [x, y, w] of [[14, 2, 6], [24, 2, 8], [8, 6, 5], [30, 5, 6]]) hline(cg, x, y, w, '#5a9a52');
  hline(cg, 6, 15, 34, '#1a3520');
  outline(canopy, P.ink);
  return { trunk, canopy };
}

const sprites = new Map<string, Sprite>();
const ROUND = LEAVES.map(roundTree);
const PINE = pineTree();
const roundOf = (f: OutFurn) => ROUND[(f.tx * 7 + f.ty * 3) % ROUND.length];

function outSprite(f: OutFurn): Sprite {
  let s = sprites.get(f.kind);
  if (s) return s;
  s = f.kind === 'bench' ? benchBackSprite() : f.kind === 'log' ? logSprite() : f.kind === 'fishing' ? fishingSprite() : f.kind === 'windsock' ? windsockPole() : bollardSprite();
  sprites.set(f.kind, s);
  return s;
}

/** Où se pose un meuble (pour le dessin et pour les clics), et sa ligne de profondeur. */
export function outsidePlacement(f: OutFurn): { x: number; y: number; w: number; h: number; sortY: number; s?: Sprite } {
  const cx = f.tx * T + 8, by = (f.ty + 1) * T - 2;
  if (f.kind === 'pine') return { x: cx - 18, y: by - 42, w: 48, h: 42, sortY: by };
  if (f.kind === 'tree') return { x: cx - 17, y: by - 42, w: 34, h: 42, sortY: by };
  const s = outSprite(f);
  const w = s.c.width, h = s.c.height;
  // le banc passe devant celui qui y est assis (on le voit de dos), mais derrière celui qui se tient derrière
  if (f.kind === 'bench') return { s, x: f.tx * T, y: (f.ty + 1) * T - 10, w, h, sortY: (f.ty + 1) * T };
  if (f.kind === 'log') return { s, x: f.tx * T - 1, y: (f.ty + 1) * T - 12, w, h, sortY: (f.ty + 1) * T - 4 };
  return { s, x: cx - Math.floor(w / 2), y: by - h + 1, w, h, sortY: by };
}

// ── Le décor fixe ──

/** Le logo 43, d'après l'original : un grand triangle au trait fin, deux fois plus haut que les chiffres ; le « 43. » en
 *  gras est posé en bas à gauche, sur la même ligne que la base du triangle. Le côté gauche s'arrête juste au-dessus du 4,
 *  la base ne réapparaît qu'après le point, le côté droit descend jusqu'au bout. Peint sur la façade, sans fond.
 *  (x, y) : le coin en haut à gauche ; il fait 25 × 20 pixels. */
const DIGIT_4 = ['....##.', '...###.', '..####.', '.##.##.', '##..##.', '##..##.', '#######', '#######', '....##.', '....##.'];
const DIGIT_3 = ['.#####.', '##...##', '.....##', '.....##', '..####.', '..####.', '.....##', '.....##', '##...##', '.#####.'];

function sign43(g: G, x: number, y: number) {
  const ink = '#15121d', thin = '#56506a';
  const bitmap = (rows: string[], ox: number, oy: number) => rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') px(g, ox + i, oy + j, ink); });
  // le triangle : le sommet au-dessus de la jonction du 4 et du 3
  for (let k = 0; k <= 19; k++) px(g, x + 12 + Math.round((12 * k) / 19), y + k, thin);
  for (let k = 0; k <= 8; k++) px(g, x + 12 - Math.round((12 * k) / 19), y + k, thin);
  hline(g, x + 22, y + 19, 3, thin);
  // « 43. » en gras, en bas à gauche
  bitmap(DIGIT_4, x + 3, y + 10);
  bitmap(DIGIT_3, x + 11, y + 10);
  rect(g, x + 18, y + 17, 3, 3, ink);
}

/** Une vitre : le reflet du ciel le jour, la lumière de l'intérieur le soir. */
function glass(g: G, x: number, y: number, w: number, h: number, tod: TimeOfDay) {
  const sky = tod === 'day' ? ['#9fd4f2', '#c4e6f8'] : tod === 'evening' ? ['#ffb07a', '#ffd9a0'] : ['#ffcf8a', '#ffe7b8'];
  rect(g, x, y, w, h, sky[0]);
  rect(g, x, y + Math.floor(h * 0.55), w, h - Math.floor(h * 0.55), sky[1]);
  for (let i = 0; i < w + h; i += 14) for (let k = 0; k < 6; k++) {
    const px0 = x + i - k, py0 = y + k * 2;
    if (px0 >= x && px0 < x + w && py0 < y + h) px(g, px0, py0, tod === 'day' ? '#ffffff' : sky[1]);
  }
}

function bush(g: G, x: number, y: number, w: number, r: () => number) {
  for (let i = 0; i < w; i += 6) {
    const bw = 8 + Math.floor(r() * 4);
    rect(g, x + i + 1, y - 7, bw - 2, 8, P.leafDark);
    rect(g, x + i, y - 5, bw, 6, P.leaf);
    hline(g, x + i + 2, y - 7, bw - 4, P.leafHi);
    if (r() < 0.5) px(g, x + i + 3, y - 4, P.leafLight);
    if (r() < 0.3) px(g, x + i + 5, y - 6, ['#ff6fa8', '#ffffff', '#ffd166'][Math.floor(r() * 3)]);
  }
}

function disc(g: G, cx: number, cy: number, r: number, color: string) {
  for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); hline(g, cx - w, cy + dy, w * 2 + 1, color); }
}

/** Le fond : le ciel, l'astre, le cap lointain et son phare, la mer jusqu'à l'horizon. */
function drawBackdrop(g: G, tod: TimeOfDay, r: () => number) {
  // le ciel, en bandes qui s'éclaircissent vers l'horizon
  const sky = SKY[tod];
  const bh = Math.ceil(HORIZON / sky.length);
  sky.forEach((col, i) => rect(g, X0, i * bh, W, bh, col));
  for (let i = 1; i < sky.length; i++) for (let x = X0 + (i % 2) * 2; x < X0 + W; x += 4) px(g, x, i * bh, sky[i - 1]);
  if (tod === 'night') for (let i = 0; i < 80; i++) px(g, X0 + Math.floor(r() * W), Math.floor(r() * (HORIZON - 8)), r() < 0.3 ? '#ffffff' : '#9aa8d8');
  // l'astre : le soleil pâle, le soleil couchant (à moitié dans la mer), ou la lune
  if (tod === 'day') { disc(g, SUN_X, 14, 9, '#eef7fd'); disc(g, SUN_X, 14, 6, '#fffbe8'); }
  else if (tod === 'evening') { disc(g, SUN_X, HORIZON - 2, 12, '#ffcf8a'); disc(g, SUN_X, HORIZON - 2, 9, '#fff0c8'); }
  else { disc(g, SUN_X, 14, 5, '#eef2ff'); disc(g, SUN_X + 2, 13, 4, sky[0]); }
  // la mer, de l'horizon (brumeuse) jusqu'au pied de la vue
  const [far, near] = SEA[tod];
  for (let y = HORIZON; y < H; y++) rect(g, X0, y, W, 1, mix(far, near, Math.pow(depth(y), 0.7)));
  // la houle : des traits plus longs et plus espacés à mesure qu'on s'approche
  for (let y = HORIZON + 2; y < SEA_BOTTOM; ) {
    const p = depth(y);
    const len = 1 + Math.round(p * 6), gap = 6 + Math.round(p * 16);
    const col = mix(mix(far, near, Math.pow(p, 0.7)), '#ffffff', 0.12 + 0.08 * (1 - p));
    for (let x = X0 + Math.floor(r() * gap); x < X0 + W; x += gap + Math.floor(r() * gap)) hline(g, x, y, len, col);
    y += 1 + Math.round(p * 4);
  }
  // la ligne d'horizon, un peu plus claire
  hline(g, X0, HORIZON, W, mix(far, '#ffffff', 0.25));
  // le cap lointain, à gauche, et son phare (tout petit : il est loin)
  const [land, landHi] = LAND[tod];
  for (let x = 0; x < 72; x++) {
    const top = Math.round(HORIZON - 9 + Math.pow(Math.max(0, (x - 28) / 44), 1.6) * 9 - (x < 28 ? Math.sin(x * 0.4) * 1 : 0));
    if (top < HORIZON) { rect(g, x, top, 1, HORIZON - top + 1, land); px(g, x, top, landHi); }
  }
  rect(g, 27, HORIZON - 20, 3, 11, '#f1ede6');
  rect(g, 27, HORIZON - 16, 3, 2, '#d24a40');
  rect(g, 26, HORIZON - 22, 5, 2, '#2e2e3c');
  px(g, 28, HORIZON - 23, '#2e2e3c');
  // une île au loin
  for (let x = 92; x < 116; x++) { const top = Math.round(HORIZON - 3 * Math.sin(((x - 92) / 24) * Math.PI)); if (top < HORIZON) rect(g, x, top, 1, HORIZON - top, land); }
}

function drawBackground(tod: TimeOfDay): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = g2d(c);
  g.translate(OX, 0);
  const r = rng(43);
  drawBackdrop(g, tod, r);

  // le sol : la prairie, du bord de la falaise jusqu'à nous
  for (let x = X0; x < X0 + W; x++) rect(g, x, edgeAt(x), 1, H - edgeAt(x), '#5b9a47');
  const onGround = (x: number, y: number) => y > edgeAt(x) + 1;
  for (let i = 0; i < 130; i++) {
    const x = X0 + Math.floor(r() * W), y = 40 + Math.floor(r() * (H - 40)), w = 10 + Math.floor(r() * 26), h = 5 + Math.floor(r() * 7);
    const col = ['#63a34e', '#53913f', '#5f9f49', '#6aa850'][Math.floor(r() * 4)];
    for (let k = 0; k < w; k++) { const top = Math.max(y, edgeAt(x + k) + 2); if (top < y + h) rect(g, x + k, top, 1, y + h - top, col); }
  }
  for (let i = 0; i < 1600; i++) { const x = X0 + Math.floor(r() * W), y = 40 + Math.floor(r() * (H - 40)); if (onGround(x, y) && onGround(x + 1, y)) hline(g, x, y, 2, r() < 0.5 ? '#4a8a3c' : '#70b25a'); }
  // le bord de la falaise : une lèvre de terre, des touffes qui se découpent sur la mer, quelques pierres
  for (let x = X0; x < X0 + W; x++) {
    const e = edgeAt(x);
    px(g, x, e, '#3f6a34');
    px(g, x, e + 1, '#7a5a3a');
    if (r() < 0.35) px(g, x, e - 1, '#5b9a47');
    if (r() < 0.12) { px(g, x, e - 2, '#70b25a'); }
  }
  for (let i = 0; i < 20; i++) { const x = X0 + Math.floor(r() * (200 + OX)), e = edgeAt(x); rect(g, x, e - 1, 3 + Math.floor(r() * 3), 3, '#9a9488'); hline(g, x, e - 1, 3, '#c2bdb4'); }

  // le chemin de gravier : un bord plus sombre, le gravier, des cailloux
  for (const [rad, col] of [[8, '#a8936a'], [6, '#d9c8a0']] as [number, string][]) {
    for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5);
      for (let k = 0; k <= n; k++) disc(g, Math.round(a.x + ((b.x - a.x) * k) / n), Math.round(a.y + ((b.y - a.y) * k) / n), rad, col);
    }
  }
  for (let i = 0; i < 3000; i++) {
    const x = X0 + Math.floor(r() * W), y = 90 + Math.floor(r() * 130);
    if (toPath(x, y) < 6) px(g, x, y, r() < 0.5 ? '#c4b089' : '#efe2c2');
  }

  // le pavillon, à droite (petit) : un toit plat, couvert de gravier gris, bordé d'une fine rive de métal
  rect(g, 232, 30, 92, 11, '#3a3a48');
  rect(g, 234, 31, 88, 8, '#8a8a92');
  for (let i = 0; i < 160; i++) px(g, 234 + Math.floor(r() * 88), 31 + Math.floor(r() * 8), ['#9c9ca4', '#76767e', '#a8a8b0', '#6a6a72'][Math.floor(r() * 4)]);
  hline(g, 232, 30, 92, '#a9b2bf');
  rect(g, 230, 40, 96, 3, '#2e2e3c');
  hline(g, 230, 40, 96, '#4a4a5c');
  // l'aile gauche : un bardage de bois, une fenêtre étroite
  for (let x = 236; x < 252; x += 3) { rect(g, x, 43, 2, 47, x % 6 ? '#b07c4c' : '#9a6a3e'); vline(g, x + 2, 43, 47, '#6b4528'); }
  rect(g, 240, 50, 8, 32, '#2e2e3c');
  glass(g, 241, 51, 6, 30, tod);
  // le centre, enduit clair : le logo, la porte
  rect(g, 252, 43, 40, 47, '#efe9de');
  for (let i = 0; i < 40; i++) px(g, 253 + Math.floor(r() * 38), 44 + Math.floor(r() * 45), '#e2dacb');
  vline(g, 252, 43, 47, '#d9d0c0');
  vline(g, 291, 43, 47, '#d9d0c0');
  // l'aile droite : une baie vitrée
  rect(g, 292, 43, 28, 47, '#2e2e3c');
  glass(g, 294, 45, 24, 42, tod);
  vline(g, 306, 45, 42, '#2e2e3c');
  rect(g, 294, 81, 24, 6, rgba('#4a3a30', 0.35));
  rect(g, 310, 72, 5, 9, '#3f7a42');
  rect(g, 311, 69, 3, 4, '#5a9a52');
  // le socle de béton, les côtés
  rect(g, 234, 90, 88, 6, '#a7a29a');
  hline(g, 234, 90, 88, '#c2bdb4');
  rect(g, 232, 43, 4, 53, '#7a5236');
  rect(g, 320, 43, 4, 53, '#232330');

  sign43(g, OUT_DOOR.x + 4, 47);

  // la porte d'entrée : un auvent, deux battants vitrés, une lumière chaude
  const dx = OUT_DOOR.x;
  rect(g, dx - 6, 69, OUT_DOOR.w + 12, 3, '#2e2e3c');
  hline(g, dx - 6, 71, OUT_DOOR.w + 12, '#ffe9c2');
  rect(g, dx - 2, 72, OUT_DOOR.w + 4, 24, '#2e2e3c');
  rect(g, dx, 73, 15, 23, '#ffd9a0');
  rect(g, dx + 17, 73, 15, 23, '#ffd9a0');
  rect(g, dx, 85, 15, 11, '#e8bf80');
  rect(g, dx + 17, 85, 15, 11, '#e8bf80');
  hline(g, dx, 73, 32, '#fff0d4');
  rect(g, dx + 11, 81, 2, 6, P.orangeHi);
  rect(g, dx + 19, 81, 2, 6, P.orangeHi);
  rect(g, dx + 2, 96, 28, 6, P.orangeDeep);
  for (let i = 0; i < 3; i++) hline(g, dx + 4, 97 + i * 2, 24, i % 2 ? P.orangeDark : P.orange);
  g.fillStyle = 'rgba(16,24,12,0.22)';
  g.fillRect(234, 96, 20, 3);
  g.fillRect(292, 96, 30, 3);

  // les massifs au pied de la façade, et des fourrés au premier plan
  bush(g, 236, 102, 14, r);
  bush(g, 296, 102, 22, r);
  for (const [bx, by, bw] of [[0, 250, 26], [150, 254, 30], [300, 252, 44], [196, 120, 18]] as [number, number, number][]) bush(g, bx, by, bw, r);
  return c;
}

// ── Une image ──

interface Blade { x: number; y: number; h: number; c: number; tall: boolean }
interface Flower { x: number; y: number; col: string }

export class OutsideRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgTod: TimeOfDay | null = null;
  private light = makeCanvas(W, H);
  private lg = (() => { const l = g2d(this.light); l.translate(OX, 0); return l; })();
  private placed = OUTSIDE_FURNITURE.map((f) => ({ f, ...outsidePlacement(f) }));
  private blades: Blade[] = [];
  private flowers: Flower[] = [];
  private roof: Blade[] = [];

  /** Les brins d'herbe (hauts et secs au bord du vide), les fleurs en massifs, les herbes du toit : placés une fois. */
  private makeGrass() {
    const r = rng(11);
    const blocked = (x: number, y: number) => OUTSIDE_FURNITURE.some((f) => f.w > 0 && x >= f.tx * T - 2 && x < (f.tx + f.w) * T + 2 && y >= f.ty * T && y < (f.ty + f.h) * T + 2);
    const ok = (x: number, y: number) => !inBuilding(x, y) && y > edgeAt(x) + 3 && toPath(x, y) > 8 && !blocked(x, y);
    for (let i = 0; i < 1400 && this.blades.length < 740; i++) {
      const x = X0 + 2 + Math.floor(r() * (W - 4)), y = 44 + Math.floor(r() * (H - 46));
      if (!ok(x, y)) continue;
      const tall = y - edgeAt(x) < 14 || x < 16 || y > H - 18;
      this.blades.push({ x, y, h: tall ? 5 + Math.floor(r() * 3) : 3 + Math.floor(r() * 3), c: Math.floor(r() * 3), tall });
    }
    const cols = ['#ff6fa8', '#ffd166', '#ffffff', '#a98bff', '#ff8a3d', '#6fc3ff'];
    for (let k = 0; k < 16; k++) {
      const cx = X0 + 14 + Math.floor(r() * (W - 28)), cy = 130 + Math.floor(r() * 110);
      if (!ok(cx, cy)) continue;
      const col = cols[Math.floor(r() * cols.length)];
      for (let i = 0; i < 10; i++) {
        const x = cx + Math.floor((r() - 0.5) * 22), y = cy + Math.floor((r() - 0.5) * 12);
        if (ok(x, y)) this.flowers.push({ x, y, col: r() < 0.2 ? '#ffffff' : col });
      }
    }
    for (let i = 0; i < 0; i++) this.roof.push({ x: 236 + Math.floor(r() * 84), y: 34 + Math.floor(r() * 5), h: 3, c: Math.floor(r() * 3), tall: false });
  }

  draw(g: G, o: Outside, tod: TimeOfDay) {
    g.save();
    g.translate(OX, 0);
    this.scene(g, o, tod);
    g.restore();
  }

  private scene(g: G, o: Outside, tod: TimeOfDay) {
    if (!this.bg || this.bgTod !== tod) { this.bg = drawBackground(tod); this.bgTod = tod; }
    if (!this.blades.length) this.makeGrass();
    const t = o.time;
    const gust = o.gust();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, X0, 0);
    this.sky(g, t, tod);
    this.sea(g, t, tod);
    this.shadows(g, t);
    this.ropes(g, t, gust);
    this.grass(g, t, gust);
    this.moored(g, t);

    const items: { y: number; draw: () => void }[] = [];
    for (const p of this.placed) {
      const f = p.f;
      if (f.kind === 'tree' || f.kind === 'pine') {
        const sway = () => Math.round(Math.sin(t * 1.6 + p.x) * 0.8 + gust * (f.kind === 'pine' ? 2.2 : 1.8));
        items.push({ y: p.sortY, draw: () => {
          const cx = f.tx * T + 8, by = (f.ty + 1) * T - 2;
          if (f.kind === 'pine') {
            g.drawImage(PINE.trunk, cx - 6, by - 30);
            g.drawImage(PINE.canopy, cx - 15 + sway(), by - 42);
          } else {
            const tr = roundOf(f);
            g.drawImage(tr.trunk, cx - 5, by - 14);
            g.drawImage(tr.canopy, cx - 18 + sway(), by - 42);
          }
        } });
      } else if (p.s) {
        const s = p.s;
        items.push({ y: p.sortY, draw: () => {
          g.drawImage(s.c, p.x, p.y);
          if (f.kind === 'windsock') this.windsock(g, p.x + 4, p.y + 3, t, gust);
        } });
      }
    }
    for (const w of o.walkers) items.push({ y: w.y, draw: () => this.walker(g, w, w === o.rore && o.driving, t) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    if (tod !== 'night') this.butterflies(g, t);
    this.leaves(g, o);
    o.fx.draw(g);
    if (tod !== 'day') this.lighting(g, o, tod, t);
    if (tod === 'night') this.fireflies(g, t);
  }

  private walker(g: G, w: Walker, driven: boolean, t: number) {
    const x = Math.round(w.x), y = Math.round(w.y);
    if (!w.seated) {
      g.fillStyle = 'rgba(8,6,16,0.32)';
      g.fillRect(x - 5, y - 1, 10, 2);
      g.fillRect(x - 4, y - 2, 8, 1);
    }
    g.drawImage(robotSprite(w.id, w.pose, w.dir, w.frame, w.eyes), x - ANCHOR_X, y - ANCHOR_Y - w.hop);
    if (driven) {
      const by = y - 28 + (Math.floor(t * 3) % 2);
      g.fillStyle = P.orange;
      g.fillRect(x - 2, by, 5, 1);
      g.fillRect(x - 1, by + 1, 3, 1);
      g.fillRect(x, by + 2, 1, 1);
    }
  }

  /** Le ciel : des nuages qui dérivent lentement, des mouettes, le phare qui clignote au loin. */
  private sky(g: G, t: number, tod: TimeOfDay) {
    if (tod !== 'night') {
      // les nuages passent derrière le pavillon
      g.save();
      g.beginPath();
      g.rect(X0, 0, 230 - X0, HORIZON);
      g.rect(230, 0, 96, 30);
      g.rect(326, 0, X0 + W - 326, HORIZON - 4);
      g.clip();
      const col = tod === 'day' ? ['#ffffff', '#e4f1fa'] : ['#ffc9a8', '#d98a8a'];
      for (const [k, y, w] of [[0, 10, 34], [1, 24, 24], [2, 6, 18], [3, 30, 40]] as [number, number, number][]) {
        const x = X0 + ((t * (1.2 + k * 0.5) + k * 97) % (W + 60)) - 50;
        rect(g, x + 4, y, w - 8, 3, col[0]);
        rect(g, x, y + 2, w, 4, col[0]);
        rect(g, x + 2, y + 5, w - 4, 2, col[1]);
        rect(g, x + w * 0.3, y - 2, w * 0.35, 3, col[0]);
      }
      g.restore();
    }
    // la lanterne du phare : un éclat toutes les quatre secondes
    if ((t % 4) < 0.5) { rect(g, 27, HORIZON - 22, 3, 1, '#fff7c0'); px(g, 26, HORIZON - 22, '#fff7c0'); px(g, 30, HORIZON - 22, '#fff7c0'); }
    // des mouettes qui planent au-dessus de la mer
    for (let i = 0; i < 3; i++) {
      const k = (t * (0.9 + i * 0.2) + i * 17) % 60;
      const x = -10 + k * 7, y = 52 + i * 14 + Math.sin(t * 0.7 + i * 2) * 5;
      if (x > X0 + W + 10) continue;
      const up = Math.floor(t * 4 + i) % 2;
      const rx = Math.round(x), ry = Math.round(y);
      const c = tod === 'night' ? '#c9d0e8' : '#f6f6fa';
      g.fillStyle = c;
      g.fillRect(rx, ry, 2, 1);
      g.fillRect(rx - 2, ry - up, 2, 1);
      g.fillRect(rx + 2, ry - up, 2, 1);
    }
  }

  /** La mer, en perspective : la houle qui avance vers nous (petite au loin, plus grande près de la falaise), le reflet de l'astre, des voiliers. */
  private sea(g: G, t: number, tod: TimeOfDay) {
    const [far, near] = SEA[tod];
    // la houle : de longues lignes ondulées qui avancent vers nous, plus amples et plus espacées près de la falaise
    for (let k = 0; k < 7; k++) {
      const p = ((k / 7 + t * 0.012) % 1) ** 1.35;
      const y0 = HORIZON + 2 + p * (SEA_BOTTOM - HORIZON - 2);
      const amp = 0.4 + p * 2.2, freq = 0.09 - p * 0.05;
      const fade = Math.sin(((k / 7 + t * 0.012) % 1) * Math.PI);
      g.fillStyle = rgba(mix(mix(far, near, p), '#ffffff', 0.35), 0.18 + 0.32 * fade);
      for (let x = X0; x < X0 + W; x += 1) {
        const y = Math.round(y0 + Math.sin(x * freq + t * (0.8 + k * 0.07) + k * 2) * amp);
        if (y >= edgeAt(x) - 1) continue;
        // la crête : un trait plus clair là où la vague est la plus haute
        if (Math.sin(x * freq + t * (0.8 + k * 0.07) + k * 2) < -0.35) g.fillRect(x, y, 1, 1);
      }
    }
    // des moutons d'écume qui naissent et s'effacent ici et là
    for (let i = 0; i < 18; i++) {
      const cycle = Math.floor(t / 2.4 + i * 0.37);
      const life = (t / 2.4 + i * 0.37) % 1;
      const h = Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453;
      const u = h - Math.floor(h), v = (h * 7.13) - Math.floor(h * 7.13);
      const p = v ** 1.2;
      const y = Math.round(HORIZON + 4 + p * (SEA_BOTTOM - HORIZON - 8));
      const x = X0 + Math.round(u * W);
      if (y >= edgeAt(x) - 2) continue;
      const a = Math.sin(life * Math.PI);
      const w = 1 + Math.round(p * 4 * a);
      g.fillStyle = rgba('#ffffff', 0.75 * a);
      g.fillRect(x - Math.floor(w / 2), y, w, 1);
      if (p > 0.4 && a > 0.5) g.fillRect(x, y - 1, 1, 1);
    }
    for (let i = 0; i < 46; i++) {
      const p = ((i * 0.137 + t * 0.018) % 1) ** 1.3;
      const y = Math.round(HORIZON + 2 + p * (SEA_BOTTOM - HORIZON - 2));
      const x = X0 + Math.round(((i * 83 + t * (2 + p * 5)) % (W + 20)) - 10);
      if (y >= edgeAt(x) - 1) continue;
      const len = 1 + Math.round(p * 7);
      const fade = Math.sin(((i * 0.137 + t * 0.018) % 1) * Math.PI);
      g.fillStyle = rgba(mix(mix(far, near, p), '#ffffff', 0.55), 0.25 + 0.45 * fade);
      g.fillRect(x, y, len, 1);
    }
    // le reflet du soleil (ou de la lune) : une colonne qui scintille, plus large près de nous
    for (let i = 0; i < 40; i++) {
      if (Math.sin(t * 3.1 + i * 2.3) < 0.2) continue;
      const p = (i * 0.071) % 1;
      const y = Math.round(HORIZON + 1 + p * (SEA_BOTTOM - HORIZON));
      const spread = 2 + p * 16;
      const x = Math.round(SUN_X + Math.sin(i * 12.9) * spread);
      if (y >= edgeAt(x) - 1) continue;
      g.fillStyle = GLINT[tod];
      g.fillRect(x, y, 1 + Math.round(p * 2), 1);
    }
    // deux voiliers : un tout petit à l'horizon, un plus près
    for (const [k, y, sc, sp] of [[0, HORIZON + 4, 1, 0.04], [1, HORIZON + 26, 2, 0.08]] as [number, number, number, number][]) {
      const x = Math.round(40 + ((t * sp * 20 + k * 120) % 200));
      if (y >= edgeAt(x) - 6) continue;
      rect(g, x, y, 3 * sc, sc === 1 ? 1 : 1, '#e8e5f1');
      rect(g, x + sc, y - 3 * sc, 1, 3 * sc, '#cfd2e0');
      rect(g, x + sc + 1, y - 3 * sc + 1, sc, 2 * sc - 1, '#ffffff');
    }
    if (tod === 'night') this.monster(g, t);
  }

  /** La nuit, la raie-lanterne sort de sa grotte et nage au large : on la voit souvent depuis la falaise (sa silhouette
   *  sous l'eau, ses points lumineux, la lanterne de sa queue, le sillage argenté) ; parfois elle s'envole. */
  private monster(g: G, t: number) {
    const per = 34, on = 22;
    const cyc = Math.floor(t / per), k = t % per;
    if (k > on) return;
    const p = k / on, dir = cyc % 2 ? 1 : -1;
    // ses poses changent dix fois par seconde, comme les images d'un sprite ; seul son trajet est continu
    const tq = Math.floor(t * 10) / 10;
    const span = 230 + OX;
    const x = Math.round(dir > 0 ? X0 - 20 + p * span : X0 + span - 20 - p * span);
    const h = Math.sin(cyc * 12.9898) * 43758.5453;
    const y = Math.round(HORIZON + 16 + (h - Math.floor(h)) * 18);
    const show = Math.min(1, p * 6, (1 - p) * 6);
    const dot = (px0: number, py0: number, col: string) => { if (py0 < edgeAt(px0) - 1) { g.fillStyle = col; g.fillRect(px0, py0, 1, 1); } };
    // le sillage, en V derrière elle
    for (let i = 1; i < 9; i++) {
      const a = 0.35 * (1 - i / 9) * show;
      for (const w of [0, 1]) {
        dot(x - dir * (22 + i * 4) + w, y - Math.round(i * 0.4), rgba('#dfe6ff', a));
        dot(x - dir * (22 + i * 4) + w, y + 1 + Math.round(i * 0.6), rgba('#dfe6ff', a));
      }
    }
    // la carapace bosselée sur le dos (la lune l'éclaire par-dessus), qui monte et descend avec la houle
    // certaines nuits, au milieu de sa traversée, elle s'envole un moment
    const fh = Math.sin(cyc * 78.233) * 43758.5453;
    const q = fh - Math.floor(fh) > 0.35 ? (p - 0.4) / 0.2 : -1;
    const alt = q > 0 && q < 1 ? Math.round(Math.sin(q * Math.PI) * 16) : 0;
    const yy = y - alt;
    if (alt) for (let k2 = -6; k2 <= 6; k2++) dot(x + k2, y, rgba('#000818', 0.35 * (1 - alt / 20)));
    for (const [q0, x0] of [[0, x - dir * 8], [1, x]] as [number, number][]) {
      const k2 = Math.abs(q - q0) / 0.15;
      if (q > -0.5 && k2 < 1) for (let i = -3; i <= 3; i++) dot(Math.round(x0 + i * 2 * k2), Math.round(y - (4 - Math.abs(i)) * (1 - k2) * 2), rgba('#dfe6ff', 1 - k2));
    }
    // la raie-lanterne vue d'en haut : un losange sombre, les ailes de part et d'autre (elles battent : leur bout se
    // rapproche), la queue et sa lanterne ; sous l'eau, elle prend la couleur de la mer, ses points lumineux percent
    const under = !alt;
    const body = under ? '#1a2a4a' : '#2d5b84', wingC = under ? '#16243f' : '#3d6f99';
    const flap = alt ? [1, 0.6, 0.2, 0, 0.2, 0.6][Math.floor(t * 8) % 6] : 0.15 + 0.2 * Math.max(0, Math.sin(tq * 2.2));
    const reach = Math.round(6 * (1 - flap * 0.6));
    for (let r = 1; r <= reach; r++) {
      const w = Math.max(1, Math.round((1 - r / (reach + 1)) * 5));
      for (let c = 0; c < w; c++) { dot(x - dir * c, yy - r, wingC); dot(x - dir * c, yy + r, wingC); }
    }
    for (let c = -2; c <= 4; c++) dot(x + dir * c, yy, body);
    dot(x + dir * 5, yy - 1, body); dot(x + dir * 5, yy + 1, body);
    for (let c = 1; c <= 8; c++) dot(x - dir * (2 + c), yy + Math.round(Math.sin(tq * 3 - c * 0.5) * 0.6), '#132538');
    dot(x - dir * 11, yy, '#fff2a8');
    for (let i = 0; i < 4; i++) if (Math.sin(tq * 2.2 + i * 1.4) > 0.1) dot(x - dir * (i % 2), yy + (i < 2 ? -2 - i : 2 + i - 2), '#8ff0ff');
    // le bout des ailes affleure et l'eau scintille
    if (under && flap > 0.25) { dot(x - dir, yy - reach - 1, rgba('#ffffff', 0.7)); dot(x - dir, yy + reach + 1, rgba('#ffffff', 0.7)); }
  }

  /** Des ombres de nuages qui glissent sur la prairie. */
  private shadows(g: G, t: number) {
    g.fillStyle = 'rgba(12,32,20,0.10)';
    for (const [k, y, rw, rh] of [[0, 170, 46, 10], [1, 224, 36, 8]] as [number, number, number, number][]) {
      const x = X0 + ((t * (7 + k * 3) + k * 150) % (W + 120)) - 60;
      g.beginPath();
      g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** Le vent parcourt la prairie en vagues : chaque brin plie selon la rafale, et la vague qui passe l'éclaircit. */
  private grass(g: G, t: number, gust: number) {
    const tip = ['#a9e07a', '#bde88a', '#8fd06a'];
    const tipHi = ['#d8f5a8', '#e2f8b8', '#c8f09a'];
    const dry = ['#c8d870', '#d8c870', '#b8d068'];
    const base = ['#3f7a3c', '#46853f', '#3a7038'];
    const blade = (b: Blade) => {
      const wave = Math.sin(t * 1.9 - b.x * 0.045 + b.y * 0.012);
      const s = gust * (b.tall ? 2 : 1.4) + wave * (b.tall ? 1.4 : 1);
      const lean = Math.round(s);
      const top = b.tall ? dry[b.c] : wave > 0.75 ? tipHi[b.c] : tip[b.c];
      px(g, b.x, b.y, base[b.c]);
      px(g, b.x, b.y - 1, base[b.c]);
      for (let k = 2; k < b.h; k++) {
        const bend = Math.round(lean * ((k - 1) / (b.h - 1)) ** 1.3);
        px(g, b.x + bend, b.y - k, k >= b.h - 2 ? top : base[b.c]);
      }
    };
    for (const b of this.blades) blade(b);
    for (const b of this.roof) blade(b);
    for (const f of this.flowers) {
      const s = Math.round(gust * 1.3 + Math.sin(t * 1.9 - f.x * 0.045 + f.y * 0.012));
      px(g, f.x, f.y, '#2f6b3a');
      px(g, f.x + (s > 1 ? 1 : s < -1 ? -1 : 0), f.y - 1, '#2f6b3a');
      rect(g, f.x + s, f.y - 3, 2, 2, f.col);
    }
  }

  /** Une corde entre des piquets, au bord de la falaise : elle ondule dans le vent. */
  private ropes(g: G, t: number, gust: number) {
    const runs: number[][] = [[6, 22], [62, 78], [154, 170, 186]];
    for (const xs of runs) {
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i], y = edgeAt(x) + 6;
        rect(g, x, y - 7, 2, 8, P.woodFront);
        vline(g, x, y - 7, 8, P.woodLight);
        if (i === xs.length - 1) continue;
        const x2 = xs[i + 1], y2 = edgeAt(x2) + 6;
        for (let k = 0; k <= x2 - x; k++) {
          const u = k / (x2 - x);
          const sag = (2.5 + Math.abs(gust)) * Math.sin(u * Math.PI);
          const flap = Math.sin(t * 3 + x * 0.3) * Math.sin(u * Math.PI) * 0.8;
          px(g, x + 1 + k, y - 6 + (y2 - y) * u + sag + flap, '#e8dcc0');
        }
      }
    }
  }

  /** La manche à air : tendue dans les rafales, elle retombe quand le vent faiblit. */
  private windsock(g: G, x: number, y: number, t: number, gust: number) {
    const strength = 0.5 + 0.5 * gust;
    const droop = (1 - strength) * 1.15;
    for (const pass of [0, 1]) {
      let cx = x + 1, cy = y;
      for (let i = 0; i < 6; i++) {
        const a = droop * (0.4 + i * 0.18) + Math.sin(t * 9 + i * 0.9) * 0.12 * strength;
        cx += Math.cos(a) * 3;
        cy += Math.sin(a) * 3;
        const th = i < 2 ? 4 : i < 4 ? 3 : 2;
        if (pass === 0) { g.fillStyle = P.ink; g.fillRect(Math.round(cx) - 1, Math.round(cy - th / 2) - 1, 5, th + 2); }
        else { g.fillStyle = i % 2 ? '#ffffff' : '#e5484d'; g.fillRect(Math.round(cx), Math.round(cy - th / 2), 3, th); }
      }
    }
  }

  /** Le chemin de la barque : au bord de la falaise, deux poteaux de bois reliés par des cordes, pour dire « on descend
   *  ici » (la barque attend en bas, on la retrouve en mer). */
  private moored(g: G, t: number) {
    const top = edgeAt(42), cx = 42;
    for (const x of [cx - 8, cx + 7]) {
      rect(g, x, top - 7, 2, 11, P.woodFront);
      vline(g, x, top - 7, 11, P.woodLight);
      hline(g, x - 1, top - 8, 4, P.woodDark);
      g.fillStyle = 'rgba(8,6,16,0.3)'; g.fillRect(x + 2, top + 3, 2, 1);
    }
    // les cordes : une en haut, qui ploie et bouge un peu au vent, et une qui retombe de chaque poteau
    for (let k = 0; k <= 15; k++) px(g, cx - 7 + k, top - 6 + Math.sin((k / 15) * Math.PI) * (2.5 + Math.sin(t * 2) * 0.4), '#e8dcc0');
    for (const [x, d] of [[cx - 8, -1], [cx + 8, 1]] as [number, number][]) for (let k = 0; k < 6; k++) px(g, x + d * Math.round(k * 0.4), top - 5 + k, '#d8ccb0');
  }

  private butterflies(g: G, t: number) {
    const cols = ['#ffd166', '#ff6fa8', '#ffffff', '#a98bff', '#ff8a3d'];
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 62 + Math.sin(t * (0.35 + i * 0.07) + i * 2) * 40 + Math.sin(t * 1.3 + i) * 4;
      const y = 172 + (i % 3) * 22 + Math.sin(t * (0.5 + i * 0.05) + i) * 14 + Math.sin(t * 6 + i) * 1.5;
      const up = Math.floor(t * 9 + i) % 2;
      g.fillStyle = cols[i];
      g.fillRect(Math.round(x) - 2, Math.round(y) - (up ? 2 : 0), 2, up ? 2 : 1);
      g.fillRect(Math.round(x) + 1, Math.round(y) - (up ? 2 : 0), 2, up ? 2 : 1);
      px(g, x, y, '#2b2836');
    }
  }

  private leaves(g: G, o: Outside) {
    const t = o.time;
    for (const l of o.leaves) {
      const x = Math.round(l.x), y = Math.round(l.y + Math.sin(t * 3 + l.ph) * 2);
      px(g, x, y, l.color);
      if (Math.sin(t * 5 + l.ph) > 0) px(g, x + 1, y + 1, l.color);
      else px(g, x - 1, y, l.color);
    }
  }

  private fireflies(g: G, t: number) {
    for (let i = 0; i < 16; i++) {
      const x = 20 + ((i * 97) % 312) + Math.sin(t * 0.6 + i * 1.7) * 12;
      const y = 150 + ((i * 53) % 90) + Math.sin(t * 0.8 + i * 2.1) * 8;
      const a = Math.max(0, Math.sin(t * 1.8 + i * 1.3));
      if (a < 0.2) continue;
      g.fillStyle = rgba('#ffe97a', 0.4 + a * 0.6);
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      g.fillStyle = rgba('#ffe97a', a * 0.25);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
  }

  /** Le soir et la nuit : le sol s'assombrit (le ciel et la mer gardent leurs couleurs) ; la baie, la porte, les bornes éclairent. */
  private lighting(g: G, o: Outside, tod: TimeOfDay, t: number) {
    const l = this.lg;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = '#ffffff';
    l.fillRect(X0, 0, W, H);
    l.fillStyle = mix(AMBIENT[tod], '#ffffff', 0.25);
    l.fillRect(X0, 0, W, H);
    l.fillStyle = AMBIENT[tod];
    for (let x = X0; x < X0 + W; x++) l.fillRect(x, edgeAt(x) - 2, 1, H - edgeAt(x) + 2);
    l.fillRect(230, 28, 96, 72);
    l.globalCompositeOperation = 'lighter';
    const add = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = l.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(color, a));
      grd.addColorStop(0.55, rgba(color, a * 0.45));
      grd.addColorStop(1, rgba(color, 0));
      l.fillStyle = grd;
      l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const night = tod === 'night';
    add(306, 70, 36, '#ffcf8a', night ? 0.9 : 0.65);
    add(244, 68, 20, '#ffcf8a', night ? 0.7 : 0.5);
    add(272, 88, 36, '#ffd9a0', 0.9);
    add(272, 112, 30, '#ffd9a0', 0.45);
    for (const f of OUTSIDE_FURNITURE) if (f.kind === 'bollard') add(f.tx * T + 8, (f.ty + 1) * T - 10, 24, '#ffd9a0', 0.8);
    for (const w of o.walkers) add(w.x, w.y - 13 - w.hop, 8, P.orange, 0.45);
    // le phare, au loin : un petit halo à chaque éclat
    if ((t % 4) < 0.6) add(28, HORIZON - 22, 10, '#fff2c0', 0.9);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, X0, 0);
    g.globalCompositeOperation = 'source-over';
  }
}
