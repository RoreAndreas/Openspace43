// Le dessin de la mer, en pixel art, avec la même logique que le jardin : l'île est vue de loin, en perspective. Le
// panorama tourne quand la barque fait le tour : chaque colonne de la falaise montre la face de l'île tournée vers nous
// (son profil, ses strates, ses ravines), avec dessus l'herbe, les pins et, selon l'endroit, le pavillon 43 et le chemin
// de la barque (au sud), l'arche de la grotte (au nord) ; le phare sur son îlot passe devant ou derrière. Au loin, le
// soleil (ou la lune) et les îles à l'horizon défilent en parallaxe. Devant : la houle, la barque, Roré et ses rames.
import { pixelText, textWidth } from './font.ts';
import { H, W } from './layout.ts';
import { g2d, hline, makeCanvas, mix, P, px, rect, rgba, vline, type G } from './pixels.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite, type Dir, type Pose } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import { angleDiff, LANDMARKS, SPOTS, type Sea } from './sea.ts';

const HORIZON = 112;
/** L'île à l'écran : son centre, sa demi-largeur, la hauteur de la falaise. */
const CX = W / 2, RS = 124, CLIFF = 34;
/** De combien de pixels défile le lointain (soleil, îles) quand on fait le tour. */
const FAR = 105;

const SKY: Record<TimeOfDay, string[]> = {
  day: ['#5fa8e6', '#7cbaec', '#9bcdf1', '#bcdff5', '#dcedf7'],
  evening: ['#2e2a5e', '#56397a', '#9a4c7c', '#e0755f', '#ffb77a'],
  night: ['#080b22', '#0c1230', '#111a3e', '#18234c', '#202d5a'],
};
const SEA: Record<TimeOfDay, [string, string]> = { day: ['#a6d2ea', '#2a78b2'], evening: ['#f0a88a', '#3e3470'], night: ['#28335e', '#0d1734'] };
const HAZE: Record<TimeOfDay, string> = { day: '#bcdff5', evening: '#e0907a', night: '#1c2850' };
const GLINT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#ffd2a0', night: '#dfe6ff' };
const AMBIENT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#c8a2b0', night: '#4a5890' };
const STRATA = ['#c2b6a0', '#b0a48e', '#9c917f', '#8a806f', '#776e60'];

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** La hauteur de la falaise selon la face de l'île (son profil, qui tourne avec la barque). Autour du pavillon, le
 *  terrain est aplani : une terrasse, pour que la maison soit bien posée. */
const roughH = (a: number) => CLIFF + 6 * Math.sin(a * 3 + 0.6) + 4 * Math.sin(a * 7 + 1.7) + 2 * Math.sin(a * 13);
const TERRACE = roughH(LANDMARKS.pavilion) + 2;
const cliffH = (a: number) => {
  const d = Math.abs(angleDiff(a, LANDMARKS.pavilion));
  const k = Math.max(0, Math.min(1, (d - 0.1) / 0.12));
  const s = k * k * (3 - 2 * k);
  return TERRACE + (roughH(a) - TERRACE) * s;
};
/** Où tombe à l'écran un point de l'île (angle `a`), vu de la barque (angle `at`) ; et s'il est de notre côté. */
const project = (a: number, at: number, r = RS) => { const d = angleDiff(a, at); return { x: CX + Math.sin(d) * r, front: Math.cos(d) }; };
/** Le haut de la falaise à l'écran, à une colonne donnée. */
const topOf = (sx: number, a: number) => { const u = (sx - CX) / RS; return Math.round(HORIZON - cliffH(a) * (0.35 + 0.65 * Math.pow(Math.max(0, 1 - u * u), 0.22))); };

/** Les arbres du plateau : leur place autour de l'île, et leur sorte. */
const TREES = Array.from({ length: 34 }, (_, i) => ({ a: (i / 34) * Math.PI * 2 + hash(i) * 0.15, pine: hash(i * 3) < 0.55, s: 0.8 + hash(i * 7) * 0.5 }))
  .filter((t) => Math.abs(angleDiff(t.a, LANDMARKS.pavilion)) > 0.18);
/** Les îles lointaines, sur l'horizon. */
const FAR_ISLES = [{ a: 1.2, w: 50, h: 9 }, { a: 2.9, w: 34, h: 6 }, { a: 4.1, w: 70, h: 12 }, { a: 5.4, w: 40, h: 7 }];

export class SeaRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgTod: TimeOfDay | null = null;
  private light = makeCanvas(W, H);
  private lg = g2d(this.light);
  /** le haut de la falaise, colonne par colonne (pour n'assombrir que l'île, le soir) */
  private tops = new Int16Array(W);

  /** Le ciel et la mer, sans rien dessus (une fois par heure du jour). */
  private backdrop(tod: TimeOfDay) {
    const c = makeCanvas(W, H);
    const g = g2d(c);
    const sky = SKY[tod];
    const bh = Math.ceil(HORIZON / sky.length);
    sky.forEach((col, i) => rect(g, 0, i * bh, W, bh, col));
    for (let i = 1; i < sky.length; i++) for (let x = (i % 2) * 2; x < W; x += 4) px(g, x, i * bh, sky[i - 1]);
    if (tod === 'night') for (let i = 0; i < 70; i++) px(g, Math.floor(hash(i) * W), Math.floor(hash(i * 3) * (HORIZON - 30)), hash(i * 5) < 0.3 ? '#ffffff' : '#9aa8d8');
    const [far, near] = SEA[tod];
    for (let y = HORIZON; y < H; y++) rect(g, 0, y, W, 1, mix(far, near, Math.pow((y - HORIZON) / (H - HORIZON), 0.55)));
    hline(g, 0, HORIZON, W, mix(far, '#ffffff', 0.3));
    return c;
  }

  draw(g: G, sea: Sea, tod: TimeOfDay, roreKey: string) {
    if (!this.bg || this.bgTod !== tod) { this.bg = this.backdrop(tod); this.bgTod = tod; }
    const t = sea.time, at = sea.at;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    const farX = (a: number) => CX + angleDiff(a, at) * FAR;

    // le soleil (ou la lune), les nuages, les îles lointaines : ils défilent quand on fait le tour
    const sunX = farX(0.9);
    if (tod === 'day') { this.disc(g, sunX, 26, 9, '#eef7fd'); this.disc(g, sunX, 26, 6, '#fffbe8'); }
    else if (tod === 'evening') { this.disc(g, sunX, HORIZON - 3, 13, '#ffcf8a'); this.disc(g, sunX, HORIZON - 3, 10, '#fff0c8'); }
    else { this.disc(g, sunX, 24, 5, '#eef2ff'); this.disc(g, sunX + 2, 23, 4, SKY.night[0]); }
    if (tod !== 'night') for (let i = 0; i < 5; i++) {
      const x = ((farX(i * 1.3) + t * (1.5 + i * 0.4)) % (W + 80) + W + 80) % (W + 80) - 40, y = 12 + i * 11;
      const col = tod === 'day' ? '#ffffff' : '#ffc9a8';
      rect(g, x + 4, y, 26, 3, col); rect(g, x, y + 2, 34, 4, col); rect(g, x + 8, y - 2, 12, 3, col);
    }
    for (const fi of FAR_ISLES) {
      const x = farX(fi.a);
      for (let k = -fi.w; k <= fi.w; k++) { const h = Math.round(fi.h * Math.sqrt(Math.max(0, 1 - (k / fi.w) ** 2))); if (h > 0) rect(g, x + k, HORIZON - h, 1, h, mix(HAZE[tod], '#5a7a8a', 0.35)); }
    }
    // le reflet du soleil sur l'eau
    for (let i = 0; i < 34; i++) {
      if (Math.sin(t * 3.1 + i * 2.3) < 0.2) continue;
      const p = (i * 0.071) % 1;
      px(g, sunX + Math.sin(i * 12.9) * (2 + p * 22), Math.round(HORIZON + 2 + p * (H - HORIZON - 4)), GLINT[tod]);
    }

    // le phare, sur son îlot (derrière l'île s'il est de l'autre côté)
    const lh = project(LANDMARKS.lighthouse, at, RS + 52);
    if (lh.front < 0 && Math.abs(lh.x - CX) > RS * 0.95) this.lighthouse(g, lh.x, t, tod);

    // l'île : une colonne par pixel ; chaque colonne montre la face tournée vers nous
    const haze = HAZE[tod];
    for (let sx = Math.ceil(CX - RS); sx <= Math.floor(CX + RS); sx++) {
      const u = (sx - CX) / RS;
      const a = at + Math.asin(Math.max(-1, Math.min(1, u)));
      const top = topOf(sx, a);
      this.tops[sx] = top;
      // l'herbe du plateau, puis la paroi en strates (plus sombre sur les bords, un peu de brume : elle est loin)
      const light = 0.82 + 0.18 * Math.cos(Math.asin(u) + 0.5);
      rect(g, sx, top - 1, 1, 3, mix(mix('#5b9a47', '#3f7a3c', 1 - light), haze, 0.18));
      px(g, sx, top - 1, mix('#7cbb5a', haze, 0.2));
      const span = HORIZON - top - 2;
      const ravine = hash(Math.floor(a * 60)) < 0.12;
      for (let k = 0; k < STRATA.length; k++) {
        const y0 = top + 2 + Math.round((span * k) / STRATA.length + Math.sin(a * 9 + k) * 1.2);
        const y1 = top + 2 + Math.round((span * (k + 1)) / STRATA.length + Math.sin(a * 9 + k + 1) * 1.2);
        let col = mix(STRATA[k], '#3a3530', (1 - light) * 0.8);
        if (ravine) col = mix(col, '#3a3530', 0.35);
        rect(g, sx, y0, 1, Math.max(0, Math.min(HORIZON, y1) - y0), mix(col, haze, 0.2));
      }
    }
    // l'écume au pied de la falaise
    for (let sx = Math.ceil(CX - RS); sx <= CX + RS; sx += 2) {
      const k = Math.sin(t * 1.3 + sx * 0.15 + at * 40);
      if (k > 0) { g.fillStyle = `rgba(255,255,255,${0.4 + k * 0.4})`; g.fillRect(sx, HORIZON - (k > 0.6 ? 1 : 0), 2, 1); }
    }
    // ce qu'il y a sur l'île, du fond vers l'avant : les arbres, le pavillon et le chemin, l'arche de la grotte
    const items = TREES.map((tr) => ({ ...tr, p: project(tr.a, at) })).filter((x) => x.p.front > 0.12).sort((p, q) => p.p.front - q.p.front);
    const dark = tod === 'night' ? 0.62 : tod === 'evening' ? 0.3 : 0;
    for (const tr of items) this.tree(g, tr.p.x, topOf(tr.p.x, tr.a), tr.pine, tr.s, haze, t, dark);
    const pav = project(LANDMARKS.pavilion, at);
    if (pav.front > 0.25) this.pavilion(g, pav.x, topOf(pav.x, LANDMARKS.pavilion), pav.front, tod);
    const cave = project(LANDMARKS.cave, at);
    if (cave.front > 0.3) this.cave(g, cave.x, cave.front);
    if (lh.front >= 0) this.lighthouse(g, lh.x, t, tod);

    // la houle : des crêtes qui avancent vers nous, et qui défilent quand on rame
    const [far, near] = SEA[tod];
    for (let i = 0; i < 70; i++) {
      const life = (i * 0.137 + t * 0.06) % 1;
      const p = life ** 1.3;
      const y = Math.round(HORIZON + 3 + p * (H - HORIZON - 6));
      const x = ((i * 83 - at * 520 * (0.3 + p) + t * 3) % (W + 40) + W + 40) % (W + 40) - 20;
      g.fillStyle = rgba(mix(mix(far, near, p), '#ffffff', 0.5), 0.2 + 0.4 * Math.sin(life * Math.PI));
      g.fillRect(Math.round(x), y, 2 + Math.round(p * 10), 1);
    }

    // les coins de pêche : des ronds dans l'eau, des oiseaux qui tournent, leur nom
    for (const s of SPOTS) {
      if (t < s.restUntil) continue;
      const d = angleDiff(s.at, at);
      if (Math.abs(d) > 0.5) continue;
      const x = CX + d * 420, y = 176;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1;
        const rx = 4 + k * 18, ry = rx * 0.32;
        g.fillStyle = s.lucky ? `rgba(255,209,102,${0.85 * (1 - k)})` : `rgba(255,255,255,${0.75 * (1 - k)})`;
        for (let q = 0; q < Math.PI * 2; q += 0.2) g.fillRect(Math.round(x + Math.cos(q) * rx), Math.round(y + Math.sin(q) * ry), 1, 1);
      }
      for (let i = 0; i < 3; i++) {
        const q = t * (0.9 + i * 0.2) + i * 2.1, rr = 10 + i * 5;
        const bx = Math.round(x + Math.cos(q) * rr), byy = Math.round(y - 30 - i * 4 + Math.sin(q) * 3);
        const up = Math.floor(t * 6 + i) % 2;
        g.fillStyle = s.lucky ? '#ffe9a0' : '#f6f6fa';
        g.fillRect(bx, byy, 2, 1); g.fillRect(bx - 2, byy - up, 2, 1); g.fillRect(bx + 2, byy - up, 2, 1);
      }
      const w = textWidth(s.label);
      g.fillStyle = 'rgba(10,8,18,0.72)'; g.fillRect(Math.round(x - w / 2 - 3), y - 52, w + 6, 9);
      pixelText(g, s.label, Math.round(x - w / 2), y - 50, s.lucky ? '#ffd166' : '#ffffff');
    }

    // la barque, Roré et ses rames, au premier plan
    this.boat(g, sea, roreKey, t);
    if (tod !== 'day') this.lighting(g, sea, tod, t, pav, lh);
    this.minimap(g, sea);
  }

  private disc(g: G, cx: number, cy: number, r: number, color: string) {
    for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); if (cy + dy < HORIZON + 1) hline(g, Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, color); }
  }

  private tree(g: G, x: number, top: number, pine: boolean, s: number, hazeCol: string, t: number, dark: number) {
    const sway = Math.round(Math.sin(t * 1.3 + x * 0.1) * 0.6);
    // le soir et la nuit, les arbres s'assombrissent avec le reste de l'île
    const mixT = (c: string, h: string, k: number) => mix(mix(c, h, k), '#10142a', dark);
    const haze = hazeCol;
    if (pine) {
      const h = Math.round(9 * s);
      for (let k = 0; k < h; k++) px(g, x + Math.round((k / h) * 2), top - k, mixT('#5a3a24', haze, 0.25));
      rect(g, x - 4 * s + 2 + sway, top - h - 2, 9 * s, 3, mixT('#24492c', haze, 0.2));
      rect(g, x - 3 * s + 2 + sway, top - h - 3, 7 * s, 2, mixT('#3f7a42', haze, 0.2));
    } else {
      rect(g, x, top - 4, 1, 4, mixT('#5a3a24', haze, 0.25));
      rect(g, x - 3 + sway, top - 10, 7, 6, mixT('#2f8266', haze, 0.2));
      rect(g, x - 2 + sway, top - 11, 5, 3, mixT('#4fae86', haze, 0.2));
    }
  }

  /** Le pavillon 43 au bord du plateau, et le chemin de la barque qui descend la falaise jusqu'au ponton. */
  private pavilion(g: G, x: number, _top: number, front: number, tod: TimeOfDay) {
    const w = Math.round(22 * front), bx = Math.round(x - w / 2);
    // la maison se pose sur le point le plus haut du terrain sous elle ; là où le sol descend, un soubassement de pierre
    let top = HORIZON;
    for (let sx = bx; sx < bx + w; sx++) top = Math.min(top, this.tops[sx] || HORIZON);
    for (let sx = bx - 1; sx <= bx + w; sx++) {
      const ground = this.tops[sx] || top;
      if (ground > top) { rect(g, sx, top, 1, ground - top + 1, '#a7a29a'); if ((sx - bx) % 3 === 0) vline(g, sx, top + 1, ground - top, '#8a857c'); }
    }
    rect(g, bx - 1, top - 1, w + 2, 1, '#c2bdb4');
    const by = top - 9;
    rect(g, bx - 1, by - 2, w + 2, 2, '#8a8a92');
    rect(g, bx, by, w, 8, '#efe9de');
    rect(g, bx, by, Math.round(w * 0.25), 8, '#a8743f');
    rect(g, bx + Math.round(w * 0.7), by + 1, Math.round(w * 0.25), 5, tod === 'day' ? '#9fd4f2' : '#ffcf8a');
    rect(g, bx + Math.round(w * 0.42), by + 3, 3, 5, '#ffd9a0');
    this.ladder(g, Math.round(x) + Math.round(8 * front), top, front, tod);
  }

  /** L'échelle de la barque, vue du large : fixée à la falaise par des pattes de fer, du palier (deux poteaux, une
   *  corde, une lanterne) jusqu'au ponton sur pieux, au ras de l'eau. Elle porte son ombre sur la roche. */
  private ladder(g: G, lx: number, top: number, front: number, tod: TimeOfDay) {
    const half = Math.max(2, Math.round(3 * front));
    const y0 = top + 1, y1 = HORIZON - 3;
    // l'ombre sur la paroi, à droite
    g.fillStyle = 'rgba(30,24,20,0.28)';
    g.fillRect(lx + half + 2, y0 + 2, 2, y1 - y0);
    // les deux montants (un bord clair, un bord sombre) et les pattes qui les tiennent à la roche
    for (let y = y0; y <= y1; y++) {
      px(g, lx - half - 1, y, '#8a5f3e'); px(g, lx - half, y, '#5e3d26');
      px(g, lx + half, y, '#8a5f3e'); px(g, lx + half + 1, y, '#5e3d26');
      if ((y - y0) % 9 === 4) { px(g, lx - half - 2, y, '#3a3640'); px(g, lx + half + 2, y, '#3a3640'); }
    }
    // les barreaux, avec leur petite ombre
    for (let y = y0 + 2; y < y1; y += 3) {
      hline(g, lx - half + 1, y, half * 2 - 1, '#d8a870');
      hline(g, lx - half + 1, y + 1, half * 2 - 1, 'rgba(40,24,14,0.4)');
    }
    // le palier en haut : des planches, deux poteaux, la corde qui ploie, une lanterne
    rect(g, lx - half - 4, top - 1, half * 2 + 9, 2, '#a8743f');
    hline(g, lx - half - 4, top - 1, half * 2 + 9, '#c89a6a');
    for (const px0 of [lx - half - 4, lx + half + 4]) { vline(g, px0, top - 5, 5, '#5e3d26'); }
    for (let k = 0; k <= half * 2 + 8; k++) px(g, lx - half - 4 + k, top - 4 + Math.sin((k / (half * 2 + 8)) * Math.PI) * 1.5, '#e8dcc0');
    rect(g, lx + half + 3, top - 7, 3, 2, '#2e2e3c'); px(g, lx + half + 4, top - 7, tod === 'day' ? '#c8b070' : '#ffd9a0');
    // le ponton au pied : des planches sur pieux, l'écume autour, l'anneau d'amarrage (la barque est avec Roré)
    rect(g, lx - half - 6, HORIZON - 3, half * 2 + 13, 2, '#8a5f3e');
    for (let k = lx - half - 6; k < lx + half + 7; k += 3) px(g, k, HORIZON - 3, '#6b4528');
    hline(g, lx - half - 6, HORIZON - 3, half * 2 + 13, '#b07c4c');
    for (const px0 of [lx - half - 5, lx + half + 5]) { vline(g, px0, HORIZON - 1, 2, '#3e2818'); px(g, px0 - 1, HORIZON, '#ffffff'); px(g, px0 + 1, HORIZON, '#ffffff'); }
    px(g, lx + half + 6, HORIZON - 4, '#9a9488');
  }

  private cave(g: G, x: number, front: number) {
    const w = Math.round(14 * front);
    rect(g, Math.round(x - w / 2), HORIZON - 10, w, 10, '#1a2238');
    rect(g, Math.round(x - w / 2) + 1, HORIZON - 12, w - 2, 2, '#1a2238');
  }

  /** Le phare, sur son îlot : la tour blanche à bandes rouges, la lanterne qui clignote. */
  private lighthouse(g: G, x: number, t: number, tod: TimeOfDay) {
    const lx = Math.round(x);
    for (let k = -14; k <= 14; k++) { const h = Math.round(6 * Math.sqrt(1 - (k / 14) ** 2)); rect(g, lx + k, HORIZON - h, 1, h, '#7a7062'); }
    rect(g, lx - 2, HORIZON - 26, 5, 21, '#f1ede6');
    for (const y of [HORIZON - 20, HORIZON - 12]) rect(g, lx - 2, y, 5, 3, '#d24a40');
    rect(g, lx - 3, HORIZON - 28, 7, 2, '#2e2e3c');
    rect(g, lx - 1, HORIZON - 31, 3, 3, Math.sin(t * 2.4) > 0 || tod !== 'day' ? '#fff2b0' : '#c8b070');
    rect(g, lx - 2, HORIZON - 33, 5, 2, '#d24a40');
    for (let x2 = lx - 15; x2 < lx + 15; x2 += 2) if (Math.sin(t * 1.4 + x2) > 0.2) px(g, x2, HORIZON, '#ffffff');
  }

  /** La barque au premier plan : elle tangue, elle dérive avec la houle ; Roré rame (ou regarde l'île). */
  private boat(g: G, sea: Sea, roreKey: string, t: number) {
    const bx = Math.round(CX + sea.sway), by = Math.round(206 + Math.sin(t * 1.6) * 1.5);
    const tilt = Math.sin(t * 1.2) * 1.2;
    const f = sea.facing;
    g.fillStyle = 'rgba(8,20,50,0.35)'; g.fillRect(bx - 30, by + 9, 60, 3);
    const ph = sea.stroke * Math.PI * 2;
    const oar = (side: number) => {
      const swing = sea.rowing ? Math.sin(ph) : 0.3;
      const ox = bx + f * 2, oy = by - 2;
      const ex = ox + side * 26 + f * swing * 10, ey = oy + (side > 0 ? 8 : 5) + (sea.rowing && Math.cos(ph) > 0 ? 3 : 0);
      for (let k = 0; k <= 26; k++) { const u = k / 26; px(g, ox + (ex - ox) * u, oy + (ey - oy) * u, '#c08a57'); }
      rect(g, ex - 2, ey - 1, 5, 2, '#e0b880');
      if (sea.rowing && Math.cos(ph) > 0) { g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(Math.round(ex - 4), Math.round(ey + 2), 9, 1); }
    };
    oar(-1);
    // la coque : un long bordé de bois, une bande rouge, la proue relevée du côté où l'on va
    for (let i = 0; i < 60; i++) {
      const u = i / 59;
      const bow = f > 0 ? u : 1 - u;
      const h = 9 - Math.round(Math.pow(Math.abs(u - 0.5) * 2, 3) * 5);
      const y0 = Math.round(by + tilt * (u - 0.5) * 2 + (9 - h) - Math.pow(Math.max(0, bow - 0.75) * 4, 2) * 2);
      rect(g, bx - 30 + i, y0, 1, h, '#8a5530');
      px(g, bx - 30 + i, y0, '#b07c4c');
      px(g, bx - 30 + i, y0 + 2, '#d24a40');
      px(g, bx - 30 + i, y0 + h - 1, '#6b4528');
    }
    // Roré : il regarde l'île quand il se repose, il se tourne pour ramer
    const dir: Dir = sea.rowing ? (f > 0 ? 'right' : 'left') : 'up';
    const pose: Pose = sea.rowing ? 'type' : 'sit';
    g.drawImage(robotSprite(roreKey, pose, dir, sea.rowing ? (Math.sin(ph) > 0 ? 1 : 0) : 0, 'open'), bx - ANCHOR_X, by + 4 - ANCHOR_Y);
    oar(1);
    if (sea.rowing) for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(255,255,255,${0.5 - k * 0.07})`; g.fillRect(bx - f * (32 + k * 5), by + 9 + (k % 2), 4, 1); }
    sea.screen = { x: bx, y: by + 10 };
  }

  /** Le soir et la nuit : l'île et la barque s'assombrissent (le ciel et la mer gardent leurs couleurs) ; les lumières. */
  private lighting(g: G, sea: Sea, tod: TimeOfDay, t: number, pav: { x: number; front: number }, lh: { x: number; front: number }) {
    const l = this.lg;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = '#ffffff';
    l.fillRect(0, 0, W, H);
    l.fillStyle = AMBIENT[tod];
    // seulement la paroi de l'île, colonne par colonne : le ciel, la mer et la barque (sa lanterne) gardent leurs couleurs
    for (let sx = Math.ceil(CX - RS); sx <= Math.floor(CX + RS); sx++) l.fillRect(sx, this.tops[sx] - 2, 1, HORIZON - this.tops[sx] + 3);
    l.globalCompositeOperation = 'lighter';
    const add = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = l.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(color, a));
      grd.addColorStop(0.55, rgba(color, a * 0.45));
      grd.addColorStop(1, rgba(color, 0));
      l.fillStyle = grd;
      l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (pav.front > 0.25) add(pav.x, HORIZON - 40, 16, '#ffcf8a', 0.9);
    add(sea.screen.x, sea.screen.y - 14, 22, '#ffd9a0', 0.6);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.globalCompositeOperation = 'source-over';
    // le faisceau du phare balaie le ciel
    if (lh.front > -0.2) {
      const a = Math.sin(t * 0.8);
      const ly = HORIZON - 30;
      g.fillStyle = rgba('#fff2c0', tod === 'night' ? 0.16 : 0.09);
      g.beginPath(); g.moveTo(lh.x, ly); g.lineTo(lh.x + a * 160, ly - 10); g.lineTo(lh.x + a * 160, ly + 6); g.closePath(); g.fill();
    }
  }

  /** La mini-carte : l'île vue de dessus, le phare, les coins de pêche, et la barque sur son tour. */
  private minimap(g: G, sea: Sea) {
    const cx = W - 26, cy = 26, R = 18;
    g.fillStyle = 'rgba(10,14,30,0.65)'; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(70,140,190,0.6)'; g.beginPath(); g.arc(cx, cy, R + 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fb86a'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
    const at = (a: number, r: number) => ({ x: cx + Math.sin(a) * r, y: cy + Math.cos(a) * r });
    const lh = at(LANDMARKS.lighthouse, 12);
    g.fillStyle = '#f1ede6'; g.fillRect(Math.round(lh.x) - 1, Math.round(lh.y) - 1, 2, 2);
    for (const s of SPOTS) { const p = at(s.at, R); g.fillStyle = sea.time < s.restUntil ? '#5a6478' : s.lucky ? '#ffd166' : '#ffffff'; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); }
    const b = at(sea.at, R);
    g.fillStyle = P.orange; g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
    pixelText(g, 'N', cx - 1, cy - R - 2, '#ffffff');
  }
}
