// Le dessin de Dehors : la façade du bâtiment (l'enseigne 43), l'herbe qui ondule au vent, la falaise et la mer au loin.
// Le décor fixe est dessiné une fois (par heure du jour) ; l'herbe, les vagues, les feuilles et les arbres bougent à chaque image.
import { OUT_DOOR, OUTSIDE_FURNITURE, type Outside, type OutFurn } from './outside.ts';
import { H, T, W } from './layout.ts';
import { g2d, hline, makeCanvas, outline, P, px, rect, rgba, rng, vline, type G } from './pixels.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import type { Sprite } from './furniture.ts';

// ── Les couleurs, selon l'heure ──
const SEA: Record<TimeOfDay, string[]> = {
  day: ['#2b6a9e', '#3377ad', '#4388bd', '#5c9ccb', '#78b2d8'],
  evening: ['#3a2f6a', '#4d3677', '#7a4579', '#b85f74', '#e08a6a'],
  night: ['#0a1030', '#0f1840', '#142148', '#1a2a56', '#213461'],
};
const GLINT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#ffd2a8', night: '#b9c9f0' };
const AMBIENT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#b79db3', night: '#36447c' };

const GRASS_Y0 = 96;
/** Là où l'herbe s'arrête (la clôture et le bord de la falaise sont juste en dessous). */
const EDGE_Y = 192;
const SEA_Y = 218;

// ── Les meubles de Dehors ──

function benchSprite(): Sprite {
  const c = makeCanvas(48, 24);
  const g = g2d(c);
  // le dossier : deux lattes entre deux montants
  rect(g, 2, 1, 3, 15, P.woodDark);
  rect(g, 43, 1, 3, 15, P.woodDark);
  rect(g, 4, 2, 40, 3, P.wood);
  hline(g, 4, 2, 40, P.woodHi);
  rect(g, 4, 6, 40, 3, P.wood);
  hline(g, 4, 6, 40, P.woodHi);
  // l'assise
  rect(g, 1, 10, 46, 6, P.woodHi);
  hline(g, 1, 10, 46, P.woodLight);
  for (const x of [16, 32]) vline(g, x, 11, 5, P.wood);
  rect(g, 1, 16, 46, 2, P.woodFront);
  // les pieds en fonte
  rect(g, 4, 18, 3, 5, '#2b2836');
  rect(g, 41, 18, 3, 5, '#2b2836');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(3, 23, 42, 1);
  return { c, ox: 0, oy: 0, sort: 14 };
}

/** Un tabouret, un seau d'eau et ses appâts : le coin du pêcheur. */
function fishingSprite(): Sprite {
  const c = makeCanvas(18, 16);
  const g = g2d(c);
  rect(g, 2, 6, 9, 5, P.wood);
  hline(g, 2, 6, 9, P.woodLight);
  rect(g, 3, 11, 2, 4, P.woodLeg);
  rect(g, 8, 11, 2, 4, P.woodLeg);
  // le seau
  rect(g, 11, 8, 6, 7, '#3a7fc4');
  hline(g, 11, 8, 6, '#9fd0ff');
  hline(g, 11, 14, 6, '#285d94');
  px(g, 12, 7, '#cfd2e0'); px(g, 16, 7, '#cfd2e0'); hline(g, 13, 6, 3, '#cfd2e0');
  // un poisson d'argent qui dépasse
  px(g, 13, 9, '#e8eef7'); px(g, 14, 9, '#e8eef7'); px(g, 15, 10, '#e8eef7');
  outline(c, P.ink);
  return { c, ox: 0, oy: 0, sort: 10 };
}

function lampSprite(): Sprite {
  const c = makeCanvas(10, 38);
  const g = g2d(c);
  rect(g, 4, 10, 2, 26, '#2b2836');
  rect(g, 2, 35, 6, 3, '#2b2836');
  hline(g, 2, 35, 6, '#4d4666');
  // la lanterne
  rect(g, 1, 3, 8, 8, '#2b2836');
  rect(g, 2, 4, 6, 6, '#ffd9a0');
  hline(g, 2, 4, 6, '#fff0d4');
  hline(g, 2, 1, 6, '#2b2836');
  px(g, 4, 0, '#2b2836'); px(g, 5, 0, '#2b2836');
  outline(c, P.ink);
  return { c, ox: 0, oy: 0, sort: 36 };
}

/** Un arbre : le tronc (fixe) et le feuillage (qui se balance dans le vent), en trois verts. */
const LEAVES = [
  [P.leafDark, P.leaf, P.leafHi, P.leafLight, P.leafDeep],
  ['#245c4c', '#2f8266', '#4fae86', '#8be0b0', '#173d34'],
  ['#4a6e2a', '#6a9a36', '#98c250', '#cde87c', '#2f4a1a'],
];

function treeParts(pal: string[]): { trunk: HTMLCanvasElement; canopy: HTMLCanvasElement } {
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
  for (const [x, y] of [[8, 24], [18, 26], [26, 22]]) { hline(cg, x, y, 4, pal[4]); }
  outline(canopy, P.ink);
  return { trunk, canopy };
}

const sprites = new Map<string, Sprite>();
const trees = LEAVES.map(treeParts);
const treeOf = (f: { tx: number; ty: number }) => trees[(f.tx * 7 + f.ty * 3) % trees.length];

function outSprite(f: OutFurn): Sprite {
  let s = sprites.get(f.kind);
  if (s) return s;
  s = f.kind === 'bench' ? benchSprite() : f.kind === 'fishing' ? fishingSprite() : lampSprite();
  sprites.set(f.kind, s);
  return s;
}

/** Où se pose un meuble (pour le dessin et pour les clics), et sa ligne de profondeur. */
export function outsidePlacement(f: OutFurn) {
  if (f.kind === 'tree') {
    const cx = f.tx * T + 8, fy = (f.ty + 1) * T - 2;
    return { x: cx - 17, y: fy - 16 - 26, w: 34, h: 44, sortY: fy };
  }
  const s = outSprite(f);
  const w = s.c.width, h = s.c.height;
  if (f.kind === 'bench') return { s, x: f.tx * T, y: 173, w, h, sortY: 187 };
  if (f.kind === 'fishing') return { s, x: f.tx * T - 1, y: 12 * T - 17, w, h, sortY: 11 * T + 9 };
  return { s, x: f.tx * T + 3, y: (f.ty + 1) * T - 2 - h, w, h, sortY: (f.ty + 1) * T - 2 };
}

// ── Le décor fixe ──

/** L'enseigne : le logo 43 (le triangle fin et le « 43. » en gras), peint directement sur la façade, sans fond. */
function sign43(g: G, x: number, y: number) {
  const ink = '#15121d';
  const ox = x + 9, top = y + 18;
  // le triangle : un trait d'un pixel (le sommet est entre le 4 et le 3)
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, ink);
  };
  line(ox + 15, y + 6, ox + 5, y + 26);
  line(ox + 15, y + 6, ox + 29, y + 26);
  hline(g, ox + 5, y + 26, 25, ink);
  // le « 4 »
  rect(g, ox + 8, top - 6, 4, 18, ink);
  rect(g, ox, top + 6, 13, 3, ink);
  for (let i = 0; i < 12; i++) rect(g, ox + 7 - Math.floor(i * 0.6), top - 6 + i, 3, 1, ink);
  // le « 3 »
  const tx = ox + 15;
  rect(g, tx + 1, top - 6, 9, 3, ink);
  rect(g, tx + 9, top - 5, 3, 7, ink);
  rect(g, tx + 3, top + 1, 8, 3, ink);
  rect(g, tx + 9, top + 3, 3, 7, ink);
  rect(g, tx + 1, top + 9, 9, 3, ink);
  px(g, tx, top - 4, ink); px(g, tx, top + 10, ink);
  // le point
  rect(g, tx + 14, top + 9, 3, 3, ink);
}

function windowGlass(g: G, x: number, y: number, w: number, h: number, tod: TimeOfDay) {
  rect(g, x - 2, y - 2, w + 4, h + 4, '#2b2836');
  const cols = tod === 'day' ? ['#8ec9f2', '#a7d8f6'] : tod === 'evening' ? ['#ff9d5c', '#ffcf6b'] : ['#ffcf6b', '#ffe29a'];
  rect(g, x, y, w, h, cols[0]);
  rect(g, x, y + h / 2, w, h / 2, cols[1]);
  // le reflet du ciel
  for (let i = 0; i < 3; i++) for (let k = 0; k < h - 4; k += 2) px(g, x + 6 + i * 12 + Math.floor(k / 2), y + 2 + k, tod === 'day' ? '#ffffff' : cols[1]);
  vline(g, x + w / 2, y, h, '#2b2836');
  hline(g, x, y + h / 2, w, '#2b2836');
  rect(g, x - 3, y + h + 2, w + 6, 2, '#bfb6a6');
}

function bush(g: G, x: number, y: number, w: number, r: () => number) {
  for (let i = 0; i < w; i += 6) {
    const bw = 8 + Math.floor(r() * 4);
    rect(g, x + i + 1, y - 7, bw - 2, 8, P.leafDark);
    rect(g, x + i, y - 5, bw, 6, P.leaf);
    hline(g, x + i + 2, y - 7, bw - 4, P.leafHi);
    if (r() < 0.5) px(g, x + i + 3, y - 4, P.leafLight);
  }
}

function drawBackground(tod: TimeOfDay): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = g2d(c);
  const r = rng(7);
  // l'herbe, avec des plaques plus claires et plus sombres
  rect(g, 0, 0, W, EDGE_Y + 8, '#4f9047');
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * EDGE_Y), w = 10 + Math.floor(r() * 22);
    rect(g, x, y, w, 6 + Math.floor(r() * 6), r() < 0.5 ? '#58994e' : '#47853f');
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * EDGE_Y);
    hline(g, x, y, 2, r() < 0.5 ? '#3f7a3c' : '#6bb35a');
  }

  // le chemin de dalles, de la porte jusqu'au banc
  for (let y = GRASS_Y0; y < 176; y += 8) {
    const off = (y / 8) % 2 ? 0 : 8;
    for (let x = 160 - 8; x < 192 + 8; x += 16) {
      const px0 = x + off;
      if (px0 < 160 - 2 || px0 + 14 > 192 + 2) continue;
      rect(g, px0, y, 15, 7, '#cdc3b1');
      hline(g, px0, y, 15, '#e0d8c8');
      hline(g, px0, y + 6, 15, '#a89d8a');
    }
  }
  rect(g, 158, GRASS_Y0, 2, 80, '#3f7a3c');
  rect(g, 192, GRASS_Y0, 2, 80, '#3f7a3c');

  // la mer, tout en bas, et la falaise juste au-dessus
  const sea = SEA[tod];
  for (let i = 0; i < sea.length; i++) rect(g, 0, SEA_Y + i * 8, W, 8, sea[i]);
  for (let i = 1; i < sea.length; i++) for (let x = i % 2 * 2; x < W; x += 4) px(g, x, SEA_Y + i * 8, sea[i - 1]);
  // le rebord de terre, puis la paroi de rocher
  rect(g, 0, EDGE_Y + 8, W, 8, '#7a5a3a');
  hline(g, 0, EDGE_Y + 8, W, '#9a7648');
  for (let x = 0; x < W; x += 4) if (r() < 0.55) px(g, x, EDGE_Y + 8 + Math.floor(r() * 3), '#4f9047');
  const faceCols = ['#7b7a8e', '#6b6a80', '#5b5a70', '#4a4961'];
  for (let i = 0; i < 4; i++) rect(g, 0, EDGE_Y + 16 + i * 3, W, 3, faceCols[i]);
  for (let x = 0; x < W; x += 6 + Math.floor(r() * 10)) vline(g, x, EDGE_Y + 16, 4 + Math.floor(r() * 8), '#3c3b52');
  for (let i = 0; i < 26; i++) { const x = Math.floor(r() * W); rect(g, x, EDGE_Y + 16 + Math.floor(r() * 9), 2 + Math.floor(r() * 3), 2, '#8f8ea3'); }
  for (let i = 0; i < 18; i++) { const x = Math.floor(r() * W); rect(g, x, EDGE_Y + 16 + Math.floor(r() * 4), 3, 2, '#4c7a4a'); }
  // l'ombre de la falaise sur l'eau, les rochers au pied
  rect(g, 0, SEA_Y - 2, W, 3, rgba('#0a0f2a', 0.35));
  for (let x = 6; x < W; x += 22 + Math.floor(r() * 30)) {
    const w = 8 + Math.floor(r() * 8);
    rect(g, x, SEA_Y - 1, w, 5, '#4a4961');
    hline(g, x + 1, SEA_Y - 1, w - 2, '#6b6a80');
    hline(g, x - 1, SEA_Y + 4, w + 2, '#ffffff66');
  }

  // le bâtiment : un petit pavillon, le toit d'ardoise, la façade, ses fenêtres
  rect(g, 84, 14, 184, 15, '#34344e');
  for (let y = 16; y < 29; y += 4) { hline(g, 84, y, 184, '#46466a'); for (let x = 84 + (y % 8 ? 0 : 6); x < 268; x += 12) vline(g, x, y, 4, '#2a2a40'); }
  hline(g, 84, 14, 184, '#5a5a82');
  rect(g, 82, 28, 188, 3, '#1f1f30');
  rect(g, 88, 31, 176, 65, '#e8dfd1');
  for (let x = 92; x < 264; x += 16) vline(g, x, 31, 57, '#d9cfbf');
  rect(g, 88, 31, 176, 4, rgba('#2a2438', 0.28));
  rect(g, 88, 88, 176, 8, '#9a9488');
  hline(g, 88, 88, 176, '#b9b3a6');
  for (let x = 88; x < 264; x += 14) vline(g, x, 88, 8, '#7d786d');
  vline(g, 88, 29, 67, '#bfb6a6');
  vline(g, 263, 29, 67, '#bfb6a6');
  windowGlass(g, 100, 40, 44, 30, tod);
  windowGlass(g, 208, 40, 44, 30, tod);

  // la porte d'entrée : un auvent, deux battants vitrés, une lumière chaude
  rect(g, OUT_DOOR.x - 6, 59, OUT_DOOR.w + 12, 4, '#2b2836');
  hline(g, OUT_DOOR.x - 6, 59, OUT_DOOR.w + 12, '#4d4666');
  rect(g, OUT_DOOR.x - 2, 63, OUT_DOOR.w + 4, 33, '#2b2836');
  const dx = OUT_DOOR.x;
  rect(g, dx, 64, 15, 32, '#ffd9a0');
  rect(g, dx + 17, 64, 15, 32, '#ffd9a0');
  rect(g, dx, 80, 15, 16, '#e0b878');
  rect(g, dx + 17, 80, 15, 16, '#e0b878');
  hline(g, dx, 64, 32, '#fff0d4');
  rect(g, dx + 15, 64, 2, 32, '#2b2836');
  rect(g, dx + 11, 82, 2, 6, P.orangeHi);
  rect(g, dx + 19, 82, 2, 6, P.orangeHi);
  // le paillasson orange (comme à l'intérieur)
  rect(g, dx + 2, 96, 28, 7, P.orangeDeep);
  for (let i = 0; i < 3; i++) hline(g, dx + 4, 97 + i * 2, 24, i % 2 ? P.orangeDark : P.orange);

  // l'enseigne 43
  sign43(g, 152, 27);

  // des massifs de fleurs et des buissons au pied de la façade
  bush(g, 88, 100, 66, r);
  bush(g, 198, 100, 68, r);
  // des buissons et des fourrés derrière et sur les côtés, pour que l'endroit soit habité
  for (const [bx, by, bw] of [[8, 40, 40], [296, 44, 44], [6, 120, 22], [326, 126, 22], [250, 150, 20], [28, 156, 20]] as [number, number, number][]) bush(g, bx, by, bw, r);
  const flowers = ['#ff6fa8', '#ffd166', '#ffffff', '#a98bff', '#ff8a3d'];
  for (let i = 0; i < 46; i++) {
    const x = (i < 23 ? 90 : 200) + Math.floor(r() * 62), y = 100 + Math.floor(r() * 7);
    px(g, x, y + 1, '#2f6b3a');
    rect(g, x, y - 1, 2, 2, flowers[Math.floor(r() * flowers.length)]);
  }

  // la clôture de bois au bord de la falaise (avec une brèche pour le coin de pêche)
  for (let x = 4; x < W - 4; x += 16) {
    if (x >= 60 && x < 84) continue;
    rect(g, x, EDGE_Y, 3, 10, P.woodFront);
    vline(g, x, EDGE_Y, 10, P.woodLight);
    hline(g, x, EDGE_Y, 3, P.woodLight);
  }
  for (const y of [EDGE_Y + 3, EDGE_Y + 7]) {
    for (const [a, b] of [[4, 62], [82, W - 4]]) { rect(g, a, y, b - a, 2, P.wood); hline(g, a, y, b - a, P.woodHi); }
  }
  g.fillStyle = 'rgba(8,6,16,0.2)';
  g.fillRect(4, EDGE_Y + 10, W - 8, 2);
  return c;
}

// ── Une image ──

interface Blade { x: number; y: number; h: number; c: number }
interface Flower { x: number; y: number; col: string }

export class OutsideRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgTod: TimeOfDay | null = null;
  private light = makeCanvas(W, H);
  private lg = g2d(this.light);
  private placed = OUTSIDE_FURNITURE.map((f) => ({ f, ...outsidePlacement(f) }));
  private blades: Blade[] = [];
  private flowers: Flower[] = [];

  private makeGrass(o: Outside) {
    const r = rng(11);
    const colors = ['#6bb35a', '#7cc366', '#58994e'];
    for (let i = 0; i < 330; i++) {
      const x = 12 + Math.floor(r() * (W - 24)), y = GRASS_Y0 + 6 + Math.floor(r() * (EDGE_Y - GRASS_Y0 - 8));
      if (!o.grid[Math.floor((y - 2) / T)]?.[Math.floor(x / T)]) continue;
      if (x > 156 && x < 196 && y < 176) continue;
      this.blades.push({ x, y, h: 3 + Math.floor(r() * 3), c: Math.floor(r() * colors.length) });
    }
    const fc = ['#ff6fa8', '#ffd166', '#ffffff', '#a98bff', '#ff8a3d'];
    for (let i = 0; i < 46; i++) {
      const x = 14 + Math.floor(r() * (W - 28)), y = GRASS_Y0 + 8 + Math.floor(r() * (EDGE_Y - GRASS_Y0 - 14));
      if (!o.grid[Math.floor((y - 2) / T)]?.[Math.floor(x / T)]) continue;
      if (x > 156 && x < 196 && y < 176) continue;
      this.flowers.push({ x, y, col: fc[Math.floor(r() * fc.length)] });
    }
  }

  draw(g: G, o: Outside, tod: TimeOfDay, roreKey: string) {
    if (!this.bg || this.bgTod !== tod) { this.bg = drawBackground(tod); this.bgTod = tod; }
    if (!this.blades.length) this.makeGrass(o);
    const t = o.time;
    const gust = o.gust();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    this.sea(g, t, tod);
    this.clouds(g, t);
    // l'herbe qui ondule : chaque brin penche selon la rafale, avec un décalage selon sa place
    const tip = ['#a9e07a', '#bde88a', '#8fd06a'];
    const base = ['#3f7a3c', '#46853f', '#3a7038'];
    for (const b of this.blades) {
      const s = Math.sin(t * 2.4 + b.x * 0.05 + b.y * 0.04) * 0.7 + gust * 1.6;
      const lean = Math.round(s);
      px(g, b.x, b.y, base[b.c]);
      px(g, b.x, b.y - 1, base[b.c]);
      px(g, b.x + (Math.abs(s) > 1.2 ? lean : 0), b.y - 2, tip[b.c]);
      if (b.h > 3) px(g, b.x + lean, b.y - 3, tip[b.c]);
      if (b.h > 4) px(g, b.x + lean + (s > 1.4 ? 1 : s < -1.4 ? -1 : 0), b.y - 4, tip[b.c]);
    }
    for (const f of this.flowers) {
      const s = Math.round(Math.sin(t * 2.4 + f.x * 0.05 + f.y * 0.04) * 0.7 + gust * 1.4);
      px(g, f.x, f.y, '#2f6b3a');
      px(g, f.x + (s > 0 ? 0 : 0), f.y - 1, '#2f6b3a');
      rect(g, f.x + s - 0, f.y - 3, 2, 2, f.col);
    }
    this.fishingLine(g, t, gust);

    const items: { y: number; draw: () => void }[] = [];
    for (const p of this.placed) {
      if (p.f.kind === 'tree') {
        const tr = treeOf(p.f);
        items.push({ y: p.sortY, draw: () => {
          const cx = p.x + 17;
          g.drawImage(tr.trunk, cx - 5, p.y + 28);
          // le feuillage se balance : un à deux pixels, plus fort dans les rafales
          const sway = Math.round(Math.sin(t * 1.6 + p.x) * 0.8 + gust * 1.8);
          g.drawImage(tr.canopy, cx - 18 + sway, p.y);
        } });
      } else {
        const s = 's' in p ? p.s : null;
        if (s) items.push({ y: p.sortY, draw: () => g.drawImage(s.c, p.x, p.y) });
      }
    }
    items.push({ y: o.y, draw: () => this.rore(g, o, roreKey) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    this.gull(g, t);
    this.birds(g, t);
    if (tod !== 'night') this.butterflies(g, t);
    this.leaves(g, o);
    o.fx.draw(g);
    if (tod !== 'day') this.lighting(g, o, tod);
    // la nuit, des lucioles (dessinées après la lumière : elles brillent)
    if (tod === 'night') this.fireflies(g, t);
  }

  /** Des papillons qui butinent au-dessus de l'herbe. */
  private butterflies(g: G, t: number) {
    const cols = ['#ffd166', '#ff6fa8', '#ffffff', '#a98bff', '#ff8a3d'];
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 62 + Math.sin(t * (0.35 + i * 0.07) + i * 2) * 40 + Math.sin(t * 1.3 + i) * 4;
      const y = 120 + (i % 3) * 22 + Math.sin(t * (0.5 + i * 0.05) + i) * 14 + Math.sin(t * 6 + i) * 1.5;
      const up = Math.floor(t * 9 + i) % 2;
      const c = cols[i];
      g.fillStyle = c;
      g.fillRect(Math.round(x) - 2, Math.round(y) - (up ? 2 : 0), 2, up ? 2 : 1);
      g.fillRect(Math.round(x) + 1, Math.round(y) - (up ? 2 : 0), 2, up ? 2 : 1);
      px(g, x, y, '#2b2836');
    }
  }

  /** Des oiseaux perchés sur la clôture : ils picorent de temps en temps. */
  private birds(g: G, t: number) {
    for (const [i, x] of [112, 236, 292].entries()) {
      const peck = Math.sin(t * 1.1 + i * 2.3) > 0.8;
      const bx = x, by = EDGE_Y - 1;
      g.fillStyle = '#6b5a4a';
      g.fillRect(bx, by - 3, 5, 3);
      g.fillRect(bx + 4, by - 4 + (peck ? 2 : 0), 3, 2);
      g.fillStyle = '#e8d8c0';
      g.fillRect(bx + 1, by - 2, 3, 1);
      px(g, bx + 6, by - 3 + (peck ? 2 : 0), P.orange);
      px(g, bx + 5, by - 4 + (peck ? 2 : 0), '#15121d');
      g.fillStyle = '#4a3c30';
      g.fillRect(bx - 2, by - 3 - (Math.floor(t * 2 + i) % 5 === 0 ? 1 : 0), 2, 1);
    }
  }

  private fireflies(g: G, t: number) {
    for (let i = 0; i < 14; i++) {
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

  private rore(g: G, o: Outside, key: string) {
    const x = Math.round(o.x), y = Math.round(o.y);
    if (!o.seated) {
      g.fillStyle = 'rgba(8,6,16,0.32)';
      g.fillRect(x - 5, y - 1, 10, 2);
      g.fillRect(x - 4, y - 2, 8, 1);
    }
    g.drawImage(robotSprite(key, o.pose, o.dir, o.frame, o.eyes), x - ANCHOR_X, y - ANCHOR_Y - o.hop);
    if (o.driving) {
      const by = y - 28 + (Math.floor(o.time * 3) % 2);
      g.fillStyle = P.orange;
      g.fillRect(x - 2, by, 5, 1);
      g.fillRect(x - 1, by + 1, 3, 1);
      g.fillRect(x, by + 2, 1, 1);
    }
  }

  /** La mer, vue de loin : des vagues qui glissent, de l'écume au pied de la falaise, des reflets. */
  private sea(g: G, t: number, tod: TimeOfDay) {
    const sea = SEA[tod];
    for (let i = 0; i < 16; i++) {
      const y = SEA_Y + 3 + ((i * 7) % 33);
      const len = 7 + (i % 3) * 4;
      const x = ((i * 53 + t * (4 + (i % 4) * 2.5)) % (W + 40)) - 20;
      hline(g, x, y, len, sea[Math.min(sea.length - 1, 1 + ((y - SEA_Y) >> 3))]);
      hline(g, x + 1, y - 1, len - 3, rgba(GLINT[tod], 0.28));
    }
    // l'écume, qui respire au pied des rochers
    const foam = 0.35 + 0.25 * Math.sin(t * 1.1);
    g.fillStyle = rgba('#ffffff', foam);
    for (let x = 0; x < W; x += 5) g.fillRect(x + Math.round(Math.sin(t * 1.5 + x * 0.2) * 1), SEA_Y + 1 + (x % 3 === 0 ? 1 : 0), 3, 1);
    // les reflets du soleil (ou de la lune) qui scintillent
    for (let i = 0; i < 12; i++) {
      const on = Math.sin(t * 3 + i * 1.9) > 0.55;
      if (on) px(g, 230 + ((i * 37) % 90), SEA_Y + 8 + ((i * 13) % 26), GLINT[tod]);
    }
    // un voilier tout petit, très loin
    const bx = 292 + Math.sin(t * 0.07) * 22, by = SEA_Y + 20;
    rect(g, bx, by, 7, 1, '#e8e5f1');
    rect(g, bx + 1, by + 1, 5, 1, '#5a5a82');
    px(g, bx + 3, by - 1, '#ffffff'); rect(g, bx + 3, by - 4, 1, 3, '#cfd2e0'); px(g, bx + 4, by - 3, '#ffffff'); px(g, bx + 4, by - 2, '#ffffff');
  }

  /** Des ombres de nuages qui traversent l'herbe. */
  private clouds(g: G, t: number) {
    g.fillStyle = 'rgba(12,32,20,0.10)';
    for (const [k, y, rw, rh] of [[0, 128, 44, 9], [1, 168, 34, 7]] as [number, number, number, number][]) {
      const x = ((t * (7 + k * 3) + k * 190) % (W + 120)) - 60;
      g.beginPath();
      g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** La ligne de la canne à pêche, qui descend vers la mer et se balance dans le vent. */
  private fishingLine(g: G, t: number, gust: number) {
    const bx0 = 4 * T + 10, by0 = 12 * T - 10;
    // la canne, appuyée sur la clôture et penchée au-dessus du vide
    const tipX = bx0 + 18, tipY = by0 + 12;
    const n = 20;
    for (let i = 0; i <= n; i++) px(g, bx0 + ((tipX - bx0) * i) / n, by0 + ((tipY - by0) * i) / n + Math.sin((i / n) * Math.PI) * -2, i < 4 ? '#563821' : '#8a5530');
    const sway = gust * 4 + Math.sin(t * 1.3) * 1.2;
    const endX = tipX + sway, endY = SEA_Y + 14;
    for (let y = tipY; y < endY; y += 1) {
      const k = (y - tipY) / (endY - tipY);
      px(g, tipX + sway * k * k + Math.sin(t * 2 + y * 0.2) * 0.4, y, 'rgba(235,240,250,0.75)');
    }
    // la flotte, et ses ronds dans l'eau
    const bob = Math.round(Math.sin(t * 2.2));
    rect(g, endX - 1, endY + bob - 1, 3, 2, '#e5484d');
    px(g, endX, endY + bob - 2, '#ffffff');
    const ring = (t * 1.2) % 1;
    g.fillStyle = rgba('#ffffff', 0.4 * (1 - ring));
    g.fillRect(Math.round(endX - 3 - ring * 3), endY + 2, Math.round(7 + ring * 6), 1);
  }

  /** Une mouette qui traverse de temps en temps. */
  private gull(g: G, t: number) {
    const k = t % 46;
    if (k > 24) return;
    const x = 366 - k * 15, y = 212 + Math.sin(t * 0.8) * 5;
    const up = Math.floor(t * 5) % 2;
    g.fillStyle = '#f4f4f8';
    g.fillRect(Math.round(x), Math.round(y), 2, 1);
    g.fillRect(Math.round(x) - 2, Math.round(y) - (up ? 1 : 0), 2, 1);
    g.fillRect(Math.round(x) + 2, Math.round(y) - (up ? 1 : 0), 2, 1);
    if (up) { px(g, Math.round(x) - 3, Math.round(y) - 1, '#f4f4f8'); px(g, Math.round(x) + 4, Math.round(y) - 1, '#f4f4f8'); }
  }

  /** Des feuilles qui filent avec le vent. */
  private leaves(g: G, o: Outside) {
    const t = o.time;
    for (const l of o.leaves) {
      const x = Math.round(l.x), y = Math.round(l.y + Math.sin(t * 3 + l.ph) * 2);
      px(g, x, y, l.color);
      if (Math.sin(t * 5 + l.ph) > 0) px(g, x + 1, y + 1, l.color);
      else px(g, x - 1, y, l.color);
    }
  }

  /** Le soir et la nuit : tout s'assombrit ; les fenêtres, la porte, les lampadaires et l'enseigne éclairent. */
  private lighting(g: G, o: Outside, tod: TimeOfDay) {
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
    add(122, 56, 44, '#ffcf8a', night ? 0.85 : 0.6);
    add(230, 56, 44, '#ffcf8a', night ? 0.85 : 0.6);
    add(176, 84, 44, '#ffd9a0', 0.9);
    add(176, 112, 34, '#ffd9a0', 0.5);
    add(176, 44, 30, '#ffffff', night ? 0.45 : 0.3);
    for (const x of [8 * T + 5, 13 * T + 5]) add(x, 6 * T - 12, 46, '#ffd9a0', 0.95);
    add(o.x, o.y - 13 - o.hop, 8, P.orange, 0.5);
    add(300, SEA_Y + 22, 40, night ? '#8aa8e0' : '#ff9a6a', night ? 0.35 : 0.5);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
}
