// Le dessin de Dehors : le pavillon 43 (toit végétalisé, bardage bois, grande baie), la prairie que le vent parcourt
// en vagues, les pins parasols couchés par le vent du large, la falaise en strates et la mer, turquoise au pied des
// rochers, avec un îlot et son phare. Le décor fixe est dessiné une fois par heure du jour ; le reste bouge à chaque image.
import { coastY, OUT_DOOR, OUTSIDE_FURNITURE, PATHS, type Outside, type OutFurn, type Walker } from './outside.ts';
import { H, T, W } from './layout.ts';
import { g2d, hline, makeCanvas, outline, P, px, rect, rgba, rng, vline, type G } from './pixels.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import type { Sprite } from './furniture.ts';

// ── Les couleurs, selon l'heure ──
/** La mer, du pied de la falaise (turquoise) vers le large (profond). */
const SEA: Record<TimeOfDay, string[]> = {
  day: ['#7fd3cf', '#4fb3c4', '#2f8fb8', '#2873a8', '#225c94'],
  evening: ['#e0a08a', '#b5717f', '#7d4f7f', '#55406f', '#3d3462'],
  night: ['#2a4a6a', '#1f3a5c', '#172e50', '#122544', '#0e1d38'],
};
const GLINT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#ffd2a8', night: '#c9d6f5' };
const AMBIENT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#b79db3', night: '#36447c' };
const STONE = ['#c2b6a0', '#a99d88', '#8f8472', '#766c5e', '#5f5750'];

// ── La côte, colonne par colonne ──
const EDGE: number[] = [];
const SEA_TOP: number[] = [];
for (let x = 0; x < W; x++) {
  const e = Math.round(coastY(x));
  EDGE.push(e);
  SEA_TOP.push(e + 3 + Math.round(15 + 3 * Math.sin(x * 0.05) + 2 * Math.sin(x * 0.13)));
}
const edgeAt = (x: number) => EDGE[Math.max(0, Math.min(W - 1, Math.round(x)))];

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
const inBuilding = (x: number, y: number) => x >= 88 && x <= 264 && y < 104;

// ── Les meubles de Dehors ──

function benchSprite(): Sprite {
  const c = makeCanvas(48, 24);
  const g = g2d(c);
  rect(g, 2, 1, 3, 15, P.woodDark);
  rect(g, 43, 1, 3, 15, P.woodDark);
  rect(g, 4, 2, 40, 3, P.wood);
  hline(g, 4, 2, 40, P.woodHi);
  rect(g, 4, 6, 40, 3, P.wood);
  hline(g, 4, 6, 40, P.woodHi);
  rect(g, 1, 10, 46, 6, P.woodHi);
  hline(g, 1, 10, 46, P.woodLight);
  for (const x of [16, 32]) vline(g, x, 11, 5, P.wood);
  rect(g, 1, 16, 46, 2, P.woodFront);
  rect(g, 4, 18, 3, 5, '#2b2836');
  rect(g, 41, 18, 3, 5, '#2b2836');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(3, 23, 42, 1);
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
  // les deux bouts, avec leurs cernes
  for (const x of [1, 29]) { rect(g, x, 3, 4, 8, '#c89b6a'); rect(g, x + 1, 5, 2, 4, '#a87a4c'); px(g, x + 1, 6, '#c89b6a'); }
  for (const [x, y] of [[10, 2], [11, 2], [18, 1], [19, 2], [24, 2]]) px(g, x, y, '#6aa84a');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(3, 13, 28, 1);
  return { c, ox: 0, oy: 0, sort: 8 };
}

/** Le coin du pêcheur : un porte-canne, un seau, une boîte d'hameçons. */
function fishingSprite(): Sprite {
  const c = makeCanvas(18, 16);
  const g = g2d(c);
  rect(g, 1, 9, 7, 5, '#c0563a');
  hline(g, 1, 9, 7, '#e07a5a');
  rect(g, 3, 11, 3, 1, '#2b2836');
  rect(g, 10, 7, 6, 8, '#3a7fc4');
  hline(g, 10, 7, 6, '#9fd0ff');
  hline(g, 10, 14, 6, '#285d94');
  px(g, 11, 6, '#cfd2e0'); px(g, 15, 6, '#cfd2e0'); hline(g, 12, 5, 3, '#cfd2e0');
  px(g, 12, 8, '#e8eef7'); px(g, 13, 8, '#e8eef7'); px(g, 14, 9, '#e8eef7');
  // le porte-canne, planté dans l'herbe
  vline(g, 8, 4, 11, '#563821');
  outline(c, P.ink);
  return { c, ox: 0, oy: 0, sort: 12 };
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

/** Un arbre rond : le tronc (fixe) et le feuillage (qui se balance), en trois verts. */
const LEAVES = [
  [P.leafDark, P.leaf, P.leafHi, P.leafLight, P.leafDeep],
  ['#245c4c', '#2f8266', '#4fae86', '#8be0b0', '#173d34'],
  ['#4a6e2a', '#6a9a36', '#98c250', '#cde87c', '#2f4a1a'],
];

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
  s = f.kind === 'bench' ? benchSprite() : f.kind === 'log' ? logSprite() : f.kind === 'fishing' ? fishingSprite() : f.kind === 'windsock' ? windsockPole() : bollardSprite();
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
  if (f.kind === 'bench') return { s, x: f.tx * T, y: 189, w, h, sortY: 203 };
  if (f.kind === 'log') return { s, x: f.tx * T - 1, y: 9 * T - 12, w, h, sortY: 9 * T - 4 };
  if (f.kind === 'fishing') return { s, x: f.tx * T - 1, y: by - h + 2, w, h, sortY: by - 4 };
  return { s, x: cx - Math.floor(w / 2), y: by - h + 1, w, h, sortY: by };
}

// ── Le décor fixe ──

/** Le logo 43 (le triangle fin et le « 43. » en gras), peint directement sur la façade, sans fond. */
function sign43(g: G, x: number, y: number) {
  const ink = '#15121d';
  const ox = x + 9, top = y + 18;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, ink);
  };
  line(ox + 15, y + 6, ox + 5, y + 26);
  line(ox + 15, y + 6, ox + 29, y + 26);
  hline(g, ox + 5, y + 26, 25, ink);
  rect(g, ox + 8, top - 6, 4, 18, ink);
  rect(g, ox, top + 6, 13, 3, ink);
  for (let i = 0; i < 12; i++) rect(g, ox + 7 - Math.floor(i * 0.6), top - 6 + i, 3, 1, ink);
  const tx = ox + 15;
  rect(g, tx + 1, top - 6, 9, 3, ink);
  rect(g, tx + 9, top - 5, 3, 7, ink);
  rect(g, tx + 3, top + 1, 8, 3, ink);
  rect(g, tx + 9, top + 3, 3, 7, ink);
  rect(g, tx + 1, top + 9, 9, 3, ink);
  px(g, tx, top - 4, ink); px(g, tx, top + 10, ink);
  rect(g, tx + 14, top + 9, 3, 3, ink);
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

function drawBackground(tod: TimeOfDay): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = g2d(c);
  const r = rng(43);

  // la prairie, avec ses plaques plus claires et plus sombres
  rect(g, 0, 0, W, H, '#5b9a47');
  for (let i = 0; i < 110; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * 220), w = 10 + Math.floor(r() * 26);
    rect(g, x, y, w, 5 + Math.floor(r() * 7), ['#63a34e', '#53913f', '#5f9f49', '#6aa850'][Math.floor(r() * 4)]);
  }
  for (let i = 0; i < 1100; i++) hline(g, Math.floor(r() * W), Math.floor(r() * 220), 2, r() < 0.5 ? '#4a8a3c' : '#70b25a');

  // le chemin de gravier : un bord plus sombre, le gravier, des cailloux
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5);
    for (let k = 0; k <= n; k++) disc(g, Math.round(a.x + ((b.x - a.x) * k) / n), Math.round(a.y + ((b.y - a.y) * k) / n), 8, '#a8936a');
  }
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5);
    for (let k = 0; k <= n; k++) disc(g, Math.round(a.x + ((b.x - a.x) * k) / n), Math.round(a.y + ((b.y - a.y) * k) / n), 6, '#d9c8a0');
  }
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(r() * W), y = 96 + Math.floor(r() * 100);
    if (toPath(x, y) < 6) px(g, x, y, r() < 0.5 ? '#c4b089' : '#efe2c2');
  }

  // la falaise et la mer, colonne par colonne
  const sea = SEA[tod];
  for (let x = 0; x < W; x++) {
    const e = EDGE[x], top = e + 3, bottom = SEA_TOP[x];
    // le rebord de terre
    rect(g, x, e, 1, 3, '#8a6a44');
    px(g, x, e, '#a8824f');
    // la paroi, en strates (plus claire en haut), et ses fissures
    const f = bottom - top;
    for (let y = top; y < bottom; y++) {
      const k = (y - top) / f;
      let col = STONE[Math.min(STONE.length - 1, Math.floor(k * STONE.length))];
      if ((x * 7 + Math.floor((y - top) / 4) * 13) % 17 === 0) col = '#4f4842';
      px(g, x, y, col);
    }
    // la mer : turquoise au pied des rochers, plus profonde vers le large
    const bands = [[0, 3], [3, 9], [9, 18], [18, 30], [30, 999]];
    bands.forEach(([d0, d1], i) => { const y0 = bottom + d0, y1 = Math.min(H, bottom + d1); if (y1 > y0) rect(g, x, y0, 1, y1 - y0, sea[i]); });
  }
  // l'herbe qui déborde du rebord, des touffes de mousse et de lichen sur la paroi
  for (let x = 0; x < W; x += 2) if (r() < 0.6) px(g, x, EDGE[x] + (r() < 0.5 ? 0 : 1), '#5b9a47');
  for (let i = 0; i < 40; i++) { const x = Math.floor(r() * W); rect(g, x, EDGE[x] + 4 + Math.floor(r() * 8), 2 + Math.floor(r() * 2), 1, r() < 0.5 ? '#6a8a4a' : '#c9b25a'); }
  // des rochers au pied, et l'îlot du phare
  for (let x = 10; x < W; x += 24 + Math.floor(r() * 26)) {
    const w = 6 + Math.floor(r() * 8), y = SEA_TOP[x] + 2 + Math.floor(r() * 4);
    rect(g, x, y, w, 4, '#5f5750');
    hline(g, x + 1, y, w - 2, '#8f8472');
  }
  rect(g, 20, 240, 36, 8, '#5f5750');
  rect(g, 24, 236, 26, 6, '#766c5e');
  hline(g, 26, 236, 22, '#a99d88');
  rect(g, 32, 232, 12, 6, '#8f8472');
  // le phare : blanc à bandes rouges, sa galerie, sa lanterne
  rect(g, 35, 214, 7, 20, '#f4f1ea');
  for (const y of [218, 226]) rect(g, 35, y, 7, 3, '#d9473f');
  vline(g, 35, 214, 20, '#ffffff');
  vline(g, 41, 214, 20, '#c9c3b8');
  rect(g, 34, 212, 9, 2, '#2e2e3c');
  rect(g, 36, 208, 5, 4, '#2e2e3c');
  rect(g, 37, 209, 3, 2, '#ffe9a0');
  px(g, 38, 207, '#d9473f');

  // le pavillon : le toit végétalisé, son bord
  rect(g, 90, 12, 172, 17, '#3a3a48');
  rect(g, 92, 13, 168, 14, '#6a9a52');
  for (let i = 0; i < 120; i++) px(g, 93 + Math.floor(r() * 166), 14 + Math.floor(r() * 12), ['#7fb362', '#557f42', '#b8645a', '#e0c35a', '#8fc06a'][Math.floor(r() * 5)]);
  rect(g, 88, 28, 176, 4, '#2e2e3c');
  hline(g, 88, 28, 176, '#4a4a5c');
  // l'aile gauche : un bardage de bois vertical, une haute fenêtre
  for (let x = 96; x < 152; x += 3) { rect(g, x, 32, 2, 58, x % 6 ? '#b07c4c' : '#9a6a3e'); vline(g, x + 2, 32, 58, '#6b4528'); }
  rect(g, 114, 40, 20, 44, '#2e2e3c');
  glass(g, 116, 42, 16, 40, tod);
  vline(g, 124, 42, 40, '#2e2e3c');
  // le centre, enduit clair : le logo, la porte
  rect(g, 152, 32, 48, 58, '#efe9de');
  for (let i = 0; i < 60; i++) px(g, 153 + Math.floor(r() * 46), 33 + Math.floor(r() * 56), '#e2dacb');
  vline(g, 152, 32, 58, '#d9d0c0');
  vline(g, 199, 32, 58, '#d9d0c0');
  // l'aile droite : une grande baie vitrée, et l'intérieur qu'on devine
  rect(g, 200, 32, 56, 58, '#2e2e3c');
  glass(g, 203, 35, 50, 52, tod);
  for (const x of [219, 236]) vline(g, x, 35, 52, '#2e2e3c');
  rect(g, 203, 80, 50, 7, rgba('#4a3a30', 0.35));
  // une plante et une lampe derrière la vitre
  rect(g, 240, 70, 6, 10, '#3f7a42');
  rect(g, 241, 66, 4, 5, '#5a9a52');
  rect(g, 241, 80, 4, 4, '#b8643f');
  vline(g, 208, 52, 26, '#2e2e3c');
  rect(g, 206, 50, 5, 3, '#ffd9a0');
  // le socle de béton, la façade de côté
  rect(g, 92, 90, 168, 6, '#a7a29a');
  hline(g, 92, 90, 168, '#c2bdb4');
  rect(g, 92, 32, 4, 64, '#7a5236');
  rect(g, 256, 32, 4, 64, '#232330');

  sign43(g, 152, 29);

  // la porte d'entrée : un auvent, deux battants vitrés, une lumière chaude
  rect(g, 150, 61, 52, 4, '#2e2e3c');
  hline(g, 150, 64, 52, '#ffe9c2');
  const dx = OUT_DOOR.x;
  rect(g, dx - 2, 65, OUT_DOOR.w + 4, 31, '#2e2e3c');
  rect(g, dx, 66, 15, 30, '#ffd9a0');
  rect(g, dx + 17, 66, 15, 30, '#ffd9a0');
  rect(g, dx, 82, 15, 14, '#e8bf80');
  rect(g, dx + 17, 82, 15, 14, '#e8bf80');
  hline(g, dx, 66, 32, '#fff0d4');
  rect(g, dx + 11, 78, 2, 7, P.orangeHi);
  rect(g, dx + 19, 78, 2, 7, P.orangeHi);
  // le paillasson orange (comme à l'intérieur)
  rect(g, dx + 2, 96, 28, 6, P.orangeDeep);
  for (let i = 0; i < 3; i++) hline(g, dx + 4, 97 + i * 2, 24, i % 2 ? P.orangeDark : P.orange);
  // l'ombre du pavillon sur l'herbe
  g.fillStyle = 'rgba(16,24,12,0.22)';
  g.fillRect(92, 96, 64, 3);
  g.fillRect(196, 96, 64, 3);

  // les massifs au pied de la façade, et des fourrés sur les côtés
  bush(g, 96, 102, 54, r);
  bush(g, 202, 102, 54, r);
  for (const [bx, by, bw] of [[4, 22, 30], [60, 64, 22], [290, 70, 28], [318, 30, 24], [6, 178, 18], [326, 182, 18]] as [number, number, number][]) bush(g, bx, by, bw, r);
  return c;
}

// ── Une image ──

interface Blade { x: number; y: number; h: number; c: number; tall: boolean }
interface Flower { x: number; y: number; col: string }

export class OutsideRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgTod: TimeOfDay | null = null;
  private light = makeCanvas(W, H);
  private lg = g2d(this.light);
  private placed = OUTSIDE_FURNITURE.map((f) => ({ f, ...outsidePlacement(f) }));
  private blades: Blade[] = [];
  private flowers: Flower[] = [];
  private roof: Blade[] = [];

  /** Les brins d'herbe, les touffes hautes près du vide, les fleurs (en massifs) : placés une fois pour toutes. */
  private makeGrass() {
    const r = rng(11);
    const blocked = (x: number, y: number) => OUTSIDE_FURNITURE.some((f) => f.w > 0 && x >= f.tx * T - 2 && x < (f.tx + f.w) * T + 2 && y >= f.ty * T && y < (f.ty + f.h) * T + 2);
    const ok = (x: number, y: number) => !inBuilding(x, y) && y < edgeAt(x) - 3 && toPath(x, y) > 8 && !blocked(x, y);
    for (let i = 0; i < 900 && this.blades.length < 560; i++) {
      const x = 2 + Math.floor(r() * (W - 4)), y = 6 + Math.floor(r() * 200);
      if (!ok(x, y)) continue;
      // près du vide et sur les bords : des herbes hautes et sèches, qui plient plus fort
      const tall = edgeAt(x) - y < 22 || x < 22 || x > W - 22;
      this.blades.push({ x, y, h: tall ? 5 + Math.floor(r() * 3) : 3 + Math.floor(r() * 3), c: Math.floor(r() * 3), tall });
    }
    const cols = ['#ff6fa8', '#ffd166', '#ffffff', '#a98bff', '#ff8a3d', '#6fc3ff'];
    for (let k = 0; k < 14; k++) {
      const cx = 20 + Math.floor(r() * (W - 40)), cy = 110 + Math.floor(r() * 80);
      if (!ok(cx, cy)) continue;
      const col = cols[Math.floor(r() * cols.length)];
      for (let i = 0; i < 10; i++) {
        const x = cx + Math.floor((r() - 0.5) * 22), y = cy + Math.floor((r() - 0.5) * 12);
        if (ok(x, y)) this.flowers.push({ x, y, col: r() < 0.2 ? '#ffffff' : col });
      }
    }
    for (let i = 0; i < 26; i++) this.roof.push({ x: 94 + Math.floor(r() * 164), y: 16 + Math.floor(r() * 10), h: 3, c: Math.floor(r() * 3), tall: false });
  }

  draw(g: G, o: Outside, tod: TimeOfDay) {
    if (!this.bg || this.bgTod !== tod) { this.bg = drawBackground(tod); this.bgTod = tod; }
    if (!this.blades.length) this.makeGrass();
    const t = o.time;
    const gust = o.gust();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    this.sea(g, t, tod);
    this.clouds(g, t);
    this.ropes(g, t, gust);
    this.grass(g, t, gust);
    this.fishingLine(g, t, gust);

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
    this.gulls(g, t);
    if (tod !== 'night') this.butterflies(g, t);
    this.leaves(g, o);
    o.fx.draw(g);
    if (tod !== 'day') this.lighting(g, o, tod, t);
    // la nuit, des lucioles (dessinées après la lumière : elles brillent)
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

  /** La mer : les vagues qui viennent mourir au pied de la falaise, l'écume qui respire, les reflets, un voilier. */
  private sea(g: G, t: number, tod: TimeOfDay) {
    const sea = SEA[tod];
    // des crêtes qui montent lentement vers la côte et s'effacent
    for (let i = 0; i < 18; i++) {
      const x0 = (i * 61 + t * 3) % (W + 20) - 10;
      const life = (t * 0.25 + i * 0.37) % 1;
      const y = Math.round(H - 4 - life * (H - 4 - SEA_TOP[Math.max(0, Math.min(W - 1, Math.round(x0)))] - 4));
      if (y <= SEA_TOP[Math.max(0, Math.min(W - 1, Math.round(x0)))] + 2) continue;
      const len = 6 + (i % 3) * 3;
      g.fillStyle = rgba(GLINT[tod], 0.18 + 0.3 * Math.sin(life * Math.PI));
      g.fillRect(Math.round(x0), y, len, 1);
      g.fillStyle = sea[Math.min(sea.length - 1, 2 + (i % 2))];
      g.fillRect(Math.round(x0) + 1, y + 1, len - 2, 1);
    }
    // l'écume au pied des rochers, qui respire avec la houle
    const swell = 0.45 + 0.3 * Math.sin(t * 1.1);
    for (let x = 0; x < W; x += 2) {
      const k = Math.sin(t * 1.1 + x * 0.09);
      g.fillStyle = rgba('#ffffff', Math.max(0, swell * (0.6 + 0.4 * k)));
      g.fillRect(x, SEA_TOP[x] + (k > 0.4 ? 1 : 0), 2, 1);
    }
    // les reflets qui scintillent
    for (let i = 0; i < 16; i++) {
      if (Math.sin(t * 3 + i * 1.9) <= 0.55) continue;
      const x = 120 + ((i * 41) % 220), y = SEA_TOP[x] + 10 + ((i * 13) % 24);
      if (y < H) px(g, x, y, GLINT[tod]);
    }
    // un voilier, très loin
    const bx = Math.round(150 + Math.sin(t * 0.06) * 30), by = 246;
    rect(g, bx, by, 7, 1, '#e8e5f1');
    rect(g, bx + 1, by + 1, 5, 1, '#5a5a82');
    rect(g, bx + 3, by - 5, 1, 5, '#cfd2e0');
    px(g, bx + 4, by - 4, '#ffffff'); rect(g, bx + 4, by - 3, 2, 1, '#ffffff'); rect(g, bx + 4, by - 2, 2, 1, '#ffffff');
    // la lanterne du phare clignote doucement
    if (Math.sin(t * 2.4) > 0) rect(g, 37, 209, 3, 2, '#fff7d0');
  }

  /** Des ombres de nuages qui glissent sur la prairie et sur la mer. */
  private clouds(g: G, t: number) {
    g.fillStyle = 'rgba(12,32,20,0.10)';
    for (const [k, y, rw, rh] of [[0, 126, 46, 10], [1, 176, 36, 8], [2, 232, 50, 7]] as [number, number, number, number][]) {
      const x = ((t * (7 + k * 3) + k * 150) % (W + 120)) - 60;
      g.beginPath();
      g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** Une corde entre des piquets, au bord du cap et de l'anse : elle ondule dans le vent. */
  private ropes(g: G, t: number, gust: number) {
    const runs: number[][] = [[218, 236, 254, 272, 290, 306], [24, 40, 56], [86, 102]];
    for (const xs of runs) {
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i], y = edgeAt(x) - 3;
        rect(g, x, y - 6, 2, 7, P.woodFront);
        vline(g, x, y - 6, 7, P.woodLight);
        if (i === xs.length - 1) continue;
        const x2 = xs[i + 1], y2 = edgeAt(x2) - 3;
        for (let k = 0; k <= x2 - x; k++) {
          const u = k / (x2 - x);
          const sag = (2.5 + Math.abs(gust)) * Math.sin(u * Math.PI);
          const flap = Math.sin(t * 3 + x * 0.3) * Math.sin(u * Math.PI) * 0.8;
          px(g, x + 1 + k, y - 5 + (y2 - y) * u + sag + flap, '#e8dcc0');
        }
      }
    }
  }

  /** La manche à air : tendue dans les rafales, elle retombe quand le vent faiblit. */
  private windsock(g: G, x: number, y: number, t: number, gust: number) {
    const strength = 0.5 + 0.5 * gust;
    const droop = (1 - strength) * 1.15;
    let cx = x + 1, cy = y;
    for (let i = 0; i < 6; i++) {
      const a = droop * (0.4 + i * 0.18) + Math.sin(t * 9 + i * 0.9) * 0.12 * strength;
      cx += Math.cos(a) * 3;
      cy += Math.sin(a) * 3;
      const th = i < 2 ? 4 : i < 4 ? 3 : 2;
      g.fillStyle = P.ink;
      g.fillRect(Math.round(cx) - 1, Math.round(cy - th / 2) - 1, 5, th + 2);
    }
    cx = x + 1; cy = y;
    for (let i = 0; i < 6; i++) {
      const a = droop * (0.4 + i * 0.18) + Math.sin(t * 9 + i * 0.9) * 0.12 * strength;
      cx += Math.cos(a) * 3;
      cy += Math.sin(a) * 3;
      const th = i < 2 ? 4 : i < 4 ? 3 : 2;
      g.fillStyle = i % 2 ? '#ffffff' : '#e5484d';
      g.fillRect(Math.round(cx), Math.round(cy - th / 2), 3, th);
    }
  }

  /** La ligne de pêche, qui descend vers l'anse et se balance dans le vent. */
  private fishingLine(g: G, t: number, gust: number) {
    const bx0 = 4 * T + 7, by0 = 10 * T + 4;
    const tipX = bx0 + 20, tipY = by0 + 14;
    const n = 22;
    for (let i = 0; i <= n; i++) px(g, bx0 + ((tipX - bx0) * i) / n, by0 + ((tipY - by0) * i) / n - Math.sin((i / n) * Math.PI) * 3, i < 5 ? '#563821' : '#8a5530');
    const sway = gust * 4 + Math.sin(t * 1.3) * 1.2;
    const endY = SEA_TOP[Math.round(tipX)] + 9, endX = tipX + sway;
    for (let y = tipY; y < endY; y++) {
      const k = (y - tipY) / (endY - tipY);
      px(g, tipX + sway * k * k + Math.sin(t * 2 + y * 0.2) * 0.4, y, 'rgba(235,240,250,0.75)');
    }
    const bob = Math.round(Math.sin(t * 2.2));
    rect(g, endX - 1, endY + bob - 1, 3, 2, '#e5484d');
    px(g, endX, endY + bob - 2, '#ffffff');
    const ring = (t * 1.2) % 1;
    g.fillStyle = rgba('#ffffff', 0.4 * (1 - ring));
    g.fillRect(Math.round(endX - 3 - ring * 3), endY + 2, Math.round(7 + ring * 6), 1);
  }

  /** Deux mouettes qui planent au-dessus de la mer. */
  private gulls(g: G, t: number) {
    for (let i = 0; i < 2; i++) {
      const k = (t + i * 23) % 40;
      if (k > 26) continue;
      const x = 370 - k * 15, y = 214 + i * 12 + Math.sin(t * 0.8 + i) * 4;
      const up = Math.floor(t * 5 + i) % 2;
      const rx = Math.round(x), ry = Math.round(y);
      g.fillStyle = '#f4f4f8';
      g.fillRect(rx, ry, 2, 1);
      g.fillRect(rx - 2, ry - up, 2, 1);
      g.fillRect(rx + 2, ry - up, 2, 1);
      if (up) { px(g, rx - 3, ry - 1, '#f4f4f8'); px(g, rx + 4, ry - 1, '#f4f4f8'); }
    }
  }

  /** Des papillons qui butinent au-dessus des fleurs. */
  private butterflies(g: G, t: number) {
    const cols = ['#ffd166', '#ff6fa8', '#ffffff', '#a98bff', '#ff8a3d'];
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 62 + Math.sin(t * (0.35 + i * 0.07) + i * 2) * 40 + Math.sin(t * 1.3 + i) * 4;
      const y = 122 + (i % 3) * 20 + Math.sin(t * (0.5 + i * 0.05) + i) * 14 + Math.sin(t * 6 + i) * 1.5;
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
      const y = 112 + ((i * 53) % 70) + Math.sin(t * 0.8 + i * 2.1) * 8;
      const a = Math.max(0, Math.sin(t * 1.8 + i * 1.3));
      if (a < 0.2) continue;
      g.fillStyle = rgba('#ffe97a', 0.4 + a * 0.6);
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      g.fillStyle = rgba('#ffe97a', a * 0.25);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
  }

  /** Le soir et la nuit : la baie, la porte, les bornes et le phare éclairent ; la lune (ou le couchant) sur la mer. */
  private lighting(g: G, o: Outside, tod: TimeOfDay, t: number) {
    const l = this.lg;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = AMBIENT[tod];
    l.fillRect(0, 0, W, H);
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
    add(228, 70, 54, '#ffcf8a', night ? 0.9 : 0.65);
    add(124, 64, 30, '#ffcf8a', night ? 0.7 : 0.5);
    add(176, 86, 40, '#ffd9a0', 0.9);
    add(176, 112, 30, '#ffd9a0', 0.45);
    for (const f of OUTSIDE_FURNITURE) if (f.kind === 'bollard') add(f.tx * T + 8, (f.ty + 1) * T - 10, 24, '#ffd9a0', 0.8);
    for (const w of o.walkers) add(w.x, w.y - 13 - w.hop, 8, P.orange, 0.45);
    // le phare : sa lanterne, et son faisceau qui tourne
    add(38, 210, 14, '#fff2c0', 0.9);
    const a = t * 0.9;
    const dx = Math.cos(a), dy = Math.sin(a) * 0.35;
    if (dx > -0.2) for (let k = 1; k <= 6; k++) add(38 + dx * k * 22, 210 + dy * k * 22, 8 + k * 3, '#fff2c0', 0.5 - k * 0.06);
    add(290, 238, 44, night ? '#8aa8e0' : '#ff9a6a', night ? 0.35 : 0.5);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
}
