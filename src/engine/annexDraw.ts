// Le dessin de la Pause : la pièce (carrelage de la cuisine, crédence, fenêtre, néon « PAUSE »),
// ses meubles (frigo, grande table, bornes d'arcade, ping-pong, baby-foot…), les personnages et la lumière.
// Même taille que le bureau (352 × 256), même pixel art.
import { ANNEX_BACK_DOOR, ANNEX_FURNITURE, type Annex, type AnnexFurn, type AnnexKind, type Pal } from './annex.ts';
import { pixelText } from './font.ts';
import { furniturePlacement, type Sprite } from './furniture.ts';
import { H, T, W, type Furn } from './layout.ts';
import { g2d, hline, makeCanvas, outline, P, px, rect, rgba, vline, type G } from './pixels.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite } from './robots.ts';
import { backWall, doorSign, floor, rug, sideDoor, windowPane, type TimeOfDay } from './room.ts';
import { jukeboxLights } from './render.ts';

// ── Les meubles de la Pause ──

/** Le plan de travail : l'évier, les plaques de cuisson, une planche à découper. */
function counterSprite(): Sprite {
  const c = makeCanvas(80, 28);
  const g = g2d(c);
  rect(g, 1, 8, 78, 10, '#d9d5e3');
  hline(g, 1, 8, 78, '#f1eff7');
  hline(g, 1, 17, 78, '#ffffff');
  rect(g, 1, 18, 78, 8, '#5f8f7a');
  hline(g, 1, 25, 78, '#466e5d');
  for (let x = 2; x < 78; x += 16) { vline(g, x + 15, 19, 6, '#466e5d'); rect(g, x + 6, 21, 4, 1, '#c9cfd8'); }
  // l'évier et son robinet
  rect(g, 8, 10, 18, 6, '#8a90a5');
  rect(g, 9, 11, 16, 4, '#6a7088');
  vline(g, 16, 3, 7, '#9aa3b5');
  hline(g, 16, 3, 5, '#9aa3b5');
  px(g, 20, 4, '#9fe0ff');
  // la planche à découper, une tomate, une carotte
  rect(g, 30, 10, 12, 6, '#c08a57');
  rect(g, 32, 11, 3, 3, '#e5484d');
  hline(g, 37, 13, 4, '#ff8a3d');
  // les plaques et une casserole
  rect(g, 50, 9, 24, 8, '#2b2836');
  for (const [x, y] of [[54, 11], [66, 11], [54, 14], [66, 14]]) { rect(g, x, y, 4, 2, '#5a3a44'); px(g, x + 1, y, '#ff6b5e'); }
  rect(g, 63, 5, 8, 6, '#9aa3b5');
  hline(g, 62, 5, 10, '#cfd2e0');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(2, 27, 76, 1);
  return { c, ox: 0, oy: -12, sort: 14 };
}

/** Le grand frigo blanc, et ses magnets. */
function fridgeSprite(): Sprite {
  const c = makeCanvas(16, 38);
  const g = g2d(c);
  rect(g, 1, 1, 14, 35, '#e8e5f1');
  vline(g, 1, 1, 35, '#ffffff');
  vline(g, 14, 1, 35, '#bdb7c9');
  hline(g, 1, 13, 14, '#a9a4b8');
  rect(g, 11, 5, 1, 5, '#8f8aa1');
  rect(g, 11, 17, 1, 8, '#8f8aa1');
  px(g, 4, 6, '#ff6fa8'); px(g, 6, 8, '#ffd166'); px(g, 4, 20, '#3fd8ff');
  rect(g, 3, 22, 4, 5, '#f6f2e9');
  hline(g, 4, 24, 2, '#a19a8c');
  outline(c, P.ink);
  return { c, ox: 0, oy: -22, sort: 14 };
}

/** Une pizza dans son carton ouvert (le vendredi midi). */
function pizza(g: G, x: number, y: number) {
  rect(g, x, y, 16, 12, P.ink);
  rect(g, x + 1, y + 1, 14, 10, '#c9a06a');
  rect(g, x + 2, y + 2, 12, 8, '#e8b25a');
  rect(g, x + 3, y + 3, 10, 6, '#e5484d');
  for (const [dx, dy] of [[4, 4], [8, 3], [10, 6], [5, 7], [7, 5]]) px(g, x + dx, y + dy, '#fff1c4');
  for (const [dx, dy] of [[6, 4], [11, 4], [9, 7], [4, 6]]) px(g, x + dx, y + dy, '#3a7d3a');
  // une part en moins
  rect(g, x + 10, y + 7, 3, 2, '#c9a06a');
}

/** La grande table en bois, avec une corbeille de fruits et des tasses. */
function tableSprite(): Sprite {
  const c = makeCanvas(64, 36);
  const g = g2d(c);
  rect(g, 1, 2, 62, 20, P.woodHi);
  hline(g, 1, 2, 62, P.woodLight);
  for (let y = 5; y < 22; y += 4) hline(g, 3, y, 58, P.wood);
  rect(g, 1, 22, 62, 4, P.woodFront);
  hline(g, 1, 25, 62, P.woodDark);
  rect(g, 3, 26, 3, 8, P.woodLeg);
  rect(g, 58, 26, 3, 8, P.woodLeg);
  // la corbeille de fruits, des assiettes, deux tasses
  rect(g, 26, 9, 12, 6, '#8a5530');
  rect(g, 27, 7, 3, 3, '#e5484d'); rect(g, 30, 6, 3, 3, '#ffd166'); rect(g, 33, 7, 3, 3, '#3ddc97'); px(g, 36, 8, '#ff8a3d');
  for (const x of [14, 46]) { rect(g, x, 5, 6, 4, '#f6f2e9'); rect(g, x, 15, 6, 4, '#f6f2e9'); }
  rect(g, 8, 11, 3, 3, '#f1eef6'); hline(g, 8, 12, 3, P.orange);
  rect(g, 54, 11, 3, 3, '#f1eef6'); hline(g, 54, 12, 3, '#3fd8ff');
  outline(c, P.ink);
  g.fillStyle = P.shadow;
  g.fillRect(2, 35, 60, 1);
  return { c, ox: 0, oy: -6, sort: 18 };
}

function stoolSprite(): Sprite {
  const c = makeCanvas(12, 9);
  const g = g2d(c);
  rect(g, 1, 1, 10, 3, '#c0563a');
  hline(g, 1, 1, 10, '#e07a5a');
  vline(g, 3, 4, 4, '#3a3646');
  vline(g, 8, 4, 4, '#3a3646');
  outline(c, P.ink);
  return { c, ox: 2, oy: 8, sort: 2 };
}

/** Le meuble télé : on voit le dos de l'écran, la console et deux manettes. */
function tvSprite(): Sprite {
  const c = makeCanvas(48, 24);
  const g = g2d(c);
  rect(g, 4, 2, 40, 12, '#2b2836');
  hline(g, 4, 2, 40, '#45405a');
  for (let x = 8; x < 40; x += 4) vline(g, x, 5, 6, '#211e2b');
  rect(g, 22, 14, 4, 2, '#3a3646');
  rect(g, 1, 15, 46, 7, '#5e3b20');
  hline(g, 1, 15, 46, '#8a5a36');
  rect(g, 6, 17, 10, 3, '#1a1d2a'); px(g, 14, 18, '#3ddc97');
  rect(g, 30, 17, 4, 2, '#ff5fa2'); rect(g, 37, 17, 4, 2, '#3fd8ff');
  outline(c, P.ink);
  return { c, ox: 0, oy: -6, sort: 14 };
}

/** Une borne d'arcade (son écran s'anime quand quelqu'un joue). */
function arcadeSprite(seed: number): Sprite {
  const c = makeCanvas(16, 40);
  const g = g2d(c);
  const body = seed % 2 ? '#7a3dbf' : '#2f6fae';
  const hi = seed % 2 ? '#a070e0' : '#4f9fe8';
  rect(g, 1, 4, 14, 34, body);
  vline(g, 1, 4, 34, hi);
  rect(g, 2, 1, 12, 5, seed % 2 ? '#ff5fa2' : '#3fd8ff');
  hline(g, 3, 3, 10, '#ffffff');
  rect(g, 3, 8, 10, 9, '#0d0f17');
  rect(g, 2, 19, 12, 5, '#2b2836');
  px(g, 5, 20, '#e5484d'); vline(g, 5, 20, 2, '#cfd2e0');
  px(g, 9, 21, '#ffd166'); px(g, 11, 21, '#3ddc97');
  outline(c, P.ink);
  return { c, ox: 0, oy: -24, sort: 14 };
}

/** La table de ping-pong (vue de dessus) : les joueurs se font face, aux deux bouts. */
function pingpongSprite(): Sprite {
  const c = makeCanvas(64, 36);
  const g = g2d(c);
  rect(g, 1, 4, 62, 22, '#2f8f5b');
  hline(g, 1, 4, 62, '#4fae72');
  hline(g, 2, 5, 60, '#f6f2e9');
  hline(g, 2, 24, 60, '#f6f2e9');
  vline(g, 2, 5, 20, '#f6f2e9');
  vline(g, 61, 5, 20, '#f6f2e9');
  hline(g, 3, 14, 58, '#cfe9da');
  // le filet
  rect(g, 31, 1, 2, 26, '#e8e5f1');
  for (let y = 2; y < 26; y += 2) px(g, 31, y, '#8a8ea2');
  rect(g, 1, 26, 62, 3, '#1f6b45');
  rect(g, 4, 29, 2, 6, '#3a3646');
  rect(g, 58, 29, 2, 6, '#3a3646');
  outline(c, P.ink);
  return { c, ox: 0, oy: -6, sort: 10 };
}

/** Le baby-foot : le terrain, les barres, les petits joueurs rouges et bleus. */
function foosballSprite(): Sprite {
  const c = makeCanvas(32, 28);
  const g = g2d(c);
  rect(g, 1, 6, 30, 14, '#5e3b20');
  rect(g, 3, 8, 26, 10, '#2f8f5b');
  vline(g, 16, 8, 10, '#cfe9da');
  for (const [x, col] of [[7, '#e5484d'], [12, '#2f6fae'], [20, '#e5484d'], [25, '#2f6fae']] as [number, string][]) {
    vline(g, x, 2, 22, '#cfd2e0');
    px(g, x, 1, '#2b2836'); px(g, x, 24, '#2b2836');
    rect(g, x - 1, 10, 3, 2, col); rect(g, x - 1, 14, 3, 2, col);
  }
  rect(g, 1, 20, 30, 3, '#4a2f17');
  rect(g, 3, 23, 2, 4, '#3a2412');
  rect(g, 27, 23, 2, 4, '#3a2412');
  outline(c, P.ink);
  return { c, ox: 0, oy: -8, sort: 14 };
}

function beanbagSprite(seed: number): Sprite {
  const c = makeCanvas(16, 12);
  const g = g2d(c);
  const col = seed % 2 ? '#ff8a3d' : '#3fb5a5';
  rect(g, 2, 3, 12, 8, col);
  rect(g, 1, 5, 14, 5, col);
  rect(g, 4, 1, 8, 3, col);
  rect(g, 4, 4, 8, 3, '#ffffff33');
  hline(g, 3, 10, 10, '#00000033');
  outline(c, P.ink);
  return { c, ox: 0, oy: 3, sort: 6 };
}

const cache = new Map<string, Sprite>();

function annexSprite(f: AnnexFurn): Sprite {
  const key = `${f.kind}|${f.seed ?? 0}`;
  let s = cache.get(key);
  if (s) return s;
  const own: Partial<Record<AnnexKind, () => Sprite>> = {
    counter: counterSprite, fridge: fridgeSprite, table: tableSprite, stool: stoolSprite, tv: tvSprite,
    arcade: () => arcadeSprite(f.seed ?? 1), pingpong: pingpongSprite, foosball: foosballSprite, beanbag: () => beanbagSprite(f.seed ?? 1),
  };
  const make = own[f.kind as AnnexKind];
  // le reste vient du bureau (canapé, bibliothèque, plantes, jukebox, café…)
  s = make ? make() : furniturePlacement(f as unknown as Furn).s;
  cache.set(key, s);
  return s;
}

/** Où se pose un meuble, et sa ligne de profondeur. */
export function annexPlacement(f: AnnexFurn) {
  const s = annexSprite(f);
  return { s, x: f.tx * T + s.ox, y: f.ty * T + s.oy, w: s.c.width, h: s.c.height, sortY: f.ty * T + s.sort };
}

// ── La pièce ──

function drawAnnexRoom(tod: TimeOfDay): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = g2d(c);
  floor(g);
  // la cuisine : un carrelage en damier
  for (let y = 3 * T; y < 15 * T; y += 8) for (let x = T; x < 10 * T + 8; x += 8) {
    rect(g, x, y, 8, 8, ((x + y) / 8) % 2 ? '#d9d0c1' : '#c4b9a6');
    hline(g, x, y, 8, '#b3a893');
  }
  // un grand tapis sous les jeux
  rug(g, 11, 6, 10, 8, '#a98bff');
  backWall(g);
  // la crédence carrelée, les placards, la hotte, le tableau du menu
  rect(g, T, 8, 9 * T, 36, '#e9e5ef');
  for (let x = T; x < 10 * T; x += 6) vline(g, x, 8, 36, '#d6d1de');
  for (let y = 14; y < 44; y += 6) hline(g, T, y, 9 * T, '#d6d1de');
  rect(g, T + 2, 6, 78, 14, '#5f8f7a');
  for (let x = T + 2; x < T + 80; x += 16) { vline(g, x + 15, 7, 12, '#466e5d'); rect(g, x + 6, 15, 4, 1, '#c9cfd8'); }
  hline(g, T + 2, 6, 78, '#7fb39c');
  rect(g, 66, 20, 26, 6, '#8a90a5');
  hline(g, 66, 25, 26, '#5d6178');
  rect(g, 118, 10, 38, 22, '#2b3a32');
  rect(g, 116, 8, 42, 2, '#8a5530');
  rect(g, 116, 32, 42, 2, '#8a5530');
  pixelText(g, 'MENU', 126, 12, '#f6f2e9');
  for (let i = 0; i < 3; i++) hline(g, 122, 21 + i * 3, 28 - i * 6, '#a8c7b5');
  // côté loisirs : la fenêtre sur la ville, une cible, le néon « PAUSE »
  windowPane(g, 212, 8, 52, 30, tod, 3);
  for (const [r, col] of [[7, '#2b2836'], [6, '#e5484d'], [4, '#f6f2e9'], [2, '#e5484d']] as [number, string][]) {
    for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); hline(g, 188 - w, 22 + y, w * 2 + 1, col); }
  }
  px(g, 188, 22, '#ffd166');
  rect(g, 286, 12, 40, 12, '#120f19');
  pixelText(g, 'PAUSE', 291, 15, '#ff6fa8');
  hline(g, 286, 12, 40, '#ff6fa8');
  // les murs de côté (la porte du bureau à gauche) et le mur de devant
  for (const x0 of [0, W - T]) {
    rect(g, x0, 0, T, H, P.wallTop);
    const inner = x0 === 0 ? T - 2 : x0;
    vline(g, inner, 5, H - 5, '#2c2740');
    vline(g, inner + 1, 5, H - 5, '#1d1a28');
  }
  sideDoor(g, 0, ANNEX_BACK_DOOR.row, 'left');
  doorSign(g, 0, ANNEX_BACK_DOOR.row, 'left', 'BUREAU', P.orange, P.orangeLight);
  g.fillStyle = 'rgba(8,6,16,0.25)';
  g.fillRect(T, 3 * T, 2, H - 4 * T);
  g.fillRect(W - T - 2, 3 * T, 2, H - 4 * T);
  rect(g, 0, 15 * T, W, T, P.wallTop);
  hline(g, 0, 15 * T, W, '#2c2740');
  return c;
}

// ── Une image ──

const AMBIENT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#a596b2', night: '#3b3961' };

export class AnnexRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgTod: TimeOfDay | null = null;
  private light = makeCanvas(W, H);
  private lg = g2d(this.light);
  private placed = ANNEX_FURNITURE.map((f) => ({ f, ...annexPlacement(f) }));

  draw(g: G, annex: Annex, tod: TimeOfDay) {
    if (!this.bg || this.bgTod !== tod) { this.bg = drawAnnexRoom(tod); this.bgTod = tod; }
    const t = annex.time;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    // le néon « PAUSE » grésille de temps en temps
    if (Math.sin(t * 1.1) > 0.97) { g.fillStyle = '#120f19'; g.fillRect(290, 14, 32, 8); }
    const playing = (id: string) => annex.pals.some((p) => p.state === 'doing' && p.spot?.id === id);
    const items: { y: number; draw: () => void }[] = [];
    for (const p of this.placed) {
      items.push({ y: p.sortY, draw: () => {
        g.drawImage(p.s.c, p.x, p.y);
        // le jukebox : ses néons s'allument et défilent quand la musique joue
        if (p.f.kind === 'jukebox') jukeboxLights(g, p.x, p.y, annex.musicOn, annex.musicLevel, t);
        // le vendredi midi : deux pizzas sur la grande table
        if (p.f.kind === 'table' && annex.pizza) for (const x of [6, 42]) pizza(g, p.x + x, p.y + 4);
        // l'écran des bornes d'arcade, qui s'anime quand quelqu'un joue
        if (p.f.kind === 'arcade') {
          const on = playing(p.f.id);
          for (let i = 0; i < 6; i++) {
            g.fillStyle = on ? ['#3fd8ff', '#ff5fa2', '#ffd166', '#3ddc97'][(i + Math.floor(t * 6)) % 4] : i % 2 ? '#1a1f2e' : '#232a3d';
            g.fillRect(p.x + 4 + (i % 3) * 3, p.y + 10 + Math.floor(i / 3) * 3, 2, 2);
          }
        }
      } });
    }
    for (const a of annex.pals) items.push({ y: a.y, draw: () => this.pal(g, a, annex) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    this.ball(g, annex);
    annex.fx.draw(g);
    if (tod !== 'day') this.lighting(g, annex, tod, t);
  }

  private pal(g: G, a: Pal, annex: Annex) {
    const x = Math.round(a.x), y = Math.round(a.y);
    if (!a.seated) {
      g.fillStyle = 'rgba(8,6,16,0.32)';
      g.fillRect(x - 5, y - 1, 10, 2);
      g.fillRect(x - 4, y - 2, 8, 1);
    }
    g.drawImage(robotSprite(a.id, a.pose, a.dir, a.frame, a.eyes), x - ANCHOR_X, y - ANCHOR_Y - a.hop);
    // Roré quand tu le diriges : une petite flèche au-dessus de sa tête
    if (a === annex.rore && annex.driving) {
      const by = y - 28 + (Math.floor(annex.time * 3) % 2);
      g.fillStyle = P.orange;
      g.fillRect(x - 2, by, 5, 1);
      g.fillRect(x - 1, by + 1, 3, 1);
      g.fillRect(x, by + 2, 1, 1);
    }
  }

  /** La balle de ping-pong, quand une partie est en cours : elle rebondit d'un bout à l'autre. */
  private ball(g: G, annex: Annex) {
    const players = annex.pals.filter((p) => p.state === 'doing' && p.act === 'pingpong');
    if (players.length < 2) return;
    const [a, b] = players[0].x < players[1].x ? players : [players[1], players[0]];
    const k = (annex.time * 1.3) % 2;
    const u = k < 1 ? k : 2 - k;
    const x = a.x + 7 + (b.x - a.x - 14) * u;
    const y = 9 * T + 6 - Math.abs(Math.sin(u * Math.PI * 2)) * 7;
    g.fillStyle = 'rgba(8,6,16,0.35)';
    g.fillRect(Math.round(x), 9 * T + 8, 2, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x), Math.round(y), 2, 2);
  }

  /** Le soir et la nuit : la pièce s'assombrit, les lampes, la télé, les bornes et le néon éclairent. */
  private lighting(g: G, annex: Annex, tod: TimeOfDay, t: number) {
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
    add(238, 46, 54, night ? '#7080d0' : '#ff9a6a', night ? 0.4 : 0.5);
    add(4 * T, 7 * T, 46, '#ffd9a0', 0.85);
    add(3 * T, 2 * T + 8, 40, '#fff0d4', 0.55);
    add(10 * T + 8, 14 * T - 12, 46, '#ffcf8a', 0.75);
    // la suspension au-dessus du ping-pong, et la lumière douce du coin des poufs
    add(14 * T, 9 * T + 4, 54, '#ffe2b8', 0.6);
    add(14 * T + 8, 13 * T, 30, '#ffcf8a', 0.4);
    add(306, 18, 30, '#ff6fa8', 0.6);
    const tvOn = annex.pals.some((p) => p.state === 'doing' && p.act === 'sofa');
    if (tvOn) add(14 * T + 8, 5 * T, 34, ['#4fb3ff', '#a98bff', '#3ddc97'][Math.floor(t * 2) % 3], 0.55);
    add(18 * T + 8, 3 * T, 18, '#a070e0', 0.5);
    add(19 * T + 8, 3 * T, 18, '#4f9fe8', 0.5);
    add(20 * T, 13 * T, 30, ['#ff5fa2', P.orange, '#3fd8ff'][Math.floor(t * 1.5) % 3], 0.4);
    for (const a of annex.pals) add(a.x, a.y - 13 - a.hop, 7, P.orange, 0.5);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
}
