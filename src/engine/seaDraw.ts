// Le dessin de la mer, en pixel art, avec la même logique que le jardin : l'île est vue depuis la barque, en perspective.
// Le panorama tourne quand la barque fait le tour, et grandit quand elle s'approche : chaque colonne de la falaise montre
// la face de l'île tournée vers nous (son profil, ses strates, ses ravines), avec dessus l'herbe, les pins et, selon
// l'endroit, le pavillon 43, l'échelle et le ponton (au sud), la grotte du serpent de mer (au nord) ; le phare sur son
// îlot passe devant ou derrière. Au loin : le soleil (ou la lune), les îles, les voiliers et, de temps en temps, un
// paquebot. Sur l'eau : la houle, des vaguelettes, des poissons qui sautent. Devant : la barque, Roré dedans, ses rames.
import { pixelText, textWidth } from './font.ts';
import { H, WIDE } from './layout.ts';
import { g2d, hline, makeCanvas, mix, P, px, rect, rgba, vline, type G } from './pixels.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite, type Dir, type Pose } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import { angleDiff, LANDMARKS, OFFSHORE, SPOTS, type Sea } from './sea.ts';

/** La mer est plus large que le bureau : elle remplit le cadre. */
const W = WIDE;
const HORIZON = 112;
/** L'île à l'écran, vue du large : son centre, sa demi-largeur, la hauteur de la falaise. */
const CX = W / 2, RS = 124, CLIFF = 34;
/** De combien de pixels défile le lointain (soleil, îles, bateaux) quand on fait le tour. */
const FAR = 105;
/** La ligne d'eau de la barque. */
const BOAT_Y = 208;

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
/** Le serpent de mer : vert sombre, le ventre plus clair, la crête, l'œil. */
const SERPENT = { body: '#2f7a4a', dark: '#1f5a36', belly: '#8fcf86', eye: '#e8ff7a' };

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** La hauteur de la falaise selon la face de l'île (son profil, qui tourne avec la barque). Autour du pavillon, le
 *  terrain est aplani : une terrasse, pour que la maison soit bien posée. */
const roughH = (a: number) => CLIFF + 6 * Math.sin(a * 3 + 0.6) + 4 * Math.sin(a * 7 + 1.7) + 2 * Math.sin(a * 13);
const TERRACE = roughH(LANDMARKS.pavilion) + 2;
const cliffH = (a: number) => {
  const d = Math.abs(angleDiff(a, LANDMARKS.pavilion));
  const k = clamp((d - 0.1) / 0.12, 0, 1);
  const s = k * k * (3 - 2 * k);
  return TERRACE + (roughH(a) - TERRACE) * s;
};

/** Ce que la distance change à l'image : l'île grandit (`z`), s'élargit (`rs`), son pied descend (`base`). */
interface View { at: number; z: number; rs: number; base: number }
const viewOf = (sea: Sea): View => {
  const near = 1 - sea.dist;
  const z = 1 + near * 1.25;
  return { at: sea.at, z, rs: RS * z, base: HORIZON + Math.round(Math.pow(near, 1.5) * 40) };
};
/** Où tombe à l'écran un point de l'île (angle `a`), vu de la barque ; et s'il est de notre côté. */
const project = (a: number, v: View, r = v.rs) => { const d = angleDiff(a, v.at); return { x: CX + Math.sin(d) * r, front: Math.cos(d) }; };
/** Le haut de la falaise à l'écran, à une colonne donnée. */
const topOf = (sx: number, a: number, v: View) => {
  const u = (sx - CX) / v.rs;
  return Math.round(v.base - cliffH(a) * v.z * (0.12 + 0.88 * Math.pow(Math.max(0, 1 - u * u), 0.3)));
};

/** Les arbres du plateau : leur place autour de l'île, et leur sorte. */
const TREES = Array.from({ length: 34 }, (_, i) => ({ a: (i / 34) * Math.PI * 2 + hash(i) * 0.15, pine: hash(i * 3) < 0.55, s: 0.8 + hash(i * 7) * 0.5 }))
  .filter((t) => Math.abs(angleDiff(t.a, LANDMARKS.pavilion)) > 0.18);
/** Les îles lointaines, sur l'horizon. */
const FAR_ISLES = [{ a: 1.2, w: 50, h: 9 }, { a: 2.9, w: 34, h: 6 }, { a: 4.1, w: 70, h: 12 }, { a: 5.4, w: 40, h: 7 }];
/** Les voiliers au loin : où ils sont, à quelle vitesse ils vont, s'ils sont un peu plus près. */
const SAILS = [{ a: 0.6, v: 0.006, y: 1, s: 1 }, { a: 2.1, v: -0.004, y: 3, s: 1 }, { a: 3.7, v: 0.005, y: 7, s: 2 }, { a: 5.1, v: -0.007, y: 2, s: 1 }];

export class SeaRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgTod: TimeOfDay | null = null;
  private light = makeCanvas(W, H);
  private lg = g2d(this.light);
  /** le haut de la falaise, colonne par colonne (pour n'assombrir que l'île, le soir) */
  private tops = new Int16Array(W);
  /** où sont, ce soir, les yeux du serpent (pour les faire luire) */
  private eyes: { x: number; y: number } | null = null;

  /** Le ciel et la mer, sans rien dessus (une fois par heure du jour). */
  private backdrop(tod: TimeOfDay) {
    const c = makeCanvas(W, H);
    const g = g2d(c);
    const sky = SKY[tod];
    const bh = Math.ceil(HORIZON / sky.length);
    sky.forEach((col, i) => rect(g, 0, i * bh, W, bh, col));
    for (let i = 1; i < sky.length; i++) for (let x = (i % 2) * 2; x < W; x += 4) px(g, x, i * bh, sky[i - 1]);
    if (tod === 'night') for (let i = 0; i < 86; i++) px(g, Math.floor(hash(i) * W), Math.floor(hash(i * 3) * (HORIZON - 30)), hash(i * 5) < 0.3 ? '#ffffff' : '#9aa8d8');
    const [far, near] = SEA[tod];
    for (let y = HORIZON; y < H; y++) rect(g, 0, y, W, 1, mix(far, near, Math.pow((y - HORIZON) / (H - HORIZON), 0.55)));
    hline(g, 0, HORIZON, W, mix(far, '#ffffff', 0.3));
    return c;
  }

  draw(g: G, sea: Sea, tod: TimeOfDay, roreKey: string) {
    if (!this.bg || this.bgTod !== tod) { this.bg = this.backdrop(tod); this.bgTod = tod; }
    const t = sea.time, at = sea.at;
    const v = viewOf(sea);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    const farX = (a: number) => CX + angleDiff(a, at) * FAR;

    // le soleil (ou la lune), les nuages, les îles lointaines : ils défilent quand on fait le tour
    const sunX = farX(0.9);
    if (tod === 'day') { this.disc(g, sunX, 26, 9, '#eef7fd'); this.disc(g, sunX, 26, 6, '#fffbe8'); }
    else if (tod === 'evening') { this.disc(g, sunX, HORIZON - 3, 13, '#ffcf8a'); this.disc(g, sunX, HORIZON - 3, 10, '#fff0c8'); }
    else { this.disc(g, sunX, 24, 5, '#eef2ff'); this.disc(g, sunX + 2, 23, 4, SKY.night[0]); }
    if (tod !== 'night') for (let i = 0; i < 6; i++) {
      const x = ((farX(i * 1.1) + t * (1.5 + i * 0.4)) % (W + 80) + W + 80) % (W + 80) - 40, y = 12 + i * 10;
      const col = tod === 'day' ? '#ffffff' : '#ffc9a8';
      rect(g, x + 4, y, 26, 3, col); rect(g, x, y + 2, 34, 4, col); rect(g, x + 8, y - 2, 12, 3, col);
    }
    for (const fi of FAR_ISLES) {
      const x = farX(fi.a);
      for (let k = -fi.w; k <= fi.w; k++) { const h = Math.round(fi.h * Math.sqrt(Math.max(0, 1 - (k / fi.w) ** 2))); if (h > 0) rect(g, x + k, HORIZON - h, 1, h, mix(HAZE[tod], '#5a7a8a', 0.35)); }
    }
    // les voiliers au loin, et de temps en temps un paquebot (ses hublots s'allument la nuit)
    for (const s of SAILS) this.sailboat(g, farX(s.a + t * s.v), HORIZON + s.y, s.s, Math.sign(s.v), t, tod);
    this.liner(g, t, tod, farX);
    // le reflet du soleil sur l'eau
    for (let i = 0; i < 34; i++) {
      if (Math.sin(t * 3.1 + i * 2.3) < 0.2) continue;
      const p = (i * 0.071) % 1;
      px(g, sunX + Math.sin(i * 12.9) * (2 + p * 22), Math.round(HORIZON + 2 + p * (H - HORIZON - 4)), GLINT[tod]);
    }

    // le phare, sur son îlot (derrière l'île s'il est de l'autre côté ; quand on est tout près, il est dans notre dos)
    const lh = project(LANDMARKS.lighthouse, v, v.rs + 52 * v.z);
    const lhFront = lh.front >= 0;
    const lhY = lhFront ? HORIZON + (v.base - HORIZON) * 0.55 : HORIZON;
    const lhZ = lhFront ? 1 + (v.z - 1) * 0.5 : 1;
    if (!lhFront && Math.abs(lh.x - CX) > v.rs * 0.95) this.lighthouse(g, lh.x, HORIZON, 1, t, tod);

    // l'île : une colonne par pixel ; chaque colonne montre la face tournée vers nous
    const haze = HAZE[tod];
    const x0 = Math.max(0, Math.ceil(CX - v.rs)), x1 = Math.min(W - 1, Math.floor(CX + v.rs));
    this.tops.fill(0);
    for (let sx = x0; sx <= x1; sx++) {
      const u = (sx - CX) / v.rs;
      const a = at + Math.asin(clamp(u, -1, 1));
      const top = topOf(sx, a, v);
      this.tops[sx] = top;
      // l'herbe du plateau, puis la paroi en strates (plus sombre sur les bords, un peu de brume : elle est loin)
      const light = 0.82 + 0.18 * Math.cos(Math.asin(clamp(u, -1, 1)) + 0.5);
      const mist = 0.2 - (v.z - 1) * 0.1;
      rect(g, sx, top - 1, 1, 2 + Math.round(v.z), mix(mix('#5b9a47', '#3f7a3c', 1 - light), haze, mist));
      px(g, sx, top - 1, mix('#7cbb5a', haze, mist));
      const span = v.base - top - 2;
      const ravine = hash(Math.floor(a * 60)) < 0.12;
      for (let k = 0; k < STRATA.length; k++) {
        const y0 = top + 2 + Math.round((span * k) / STRATA.length + Math.sin(a * 9 + k) * 1.2 * v.z);
        const y1 = top + 2 + Math.round((span * (k + 1)) / STRATA.length + Math.sin(a * 9 + k + 1) * 1.2 * v.z);
        let col = mix(STRATA[k], '#3a3530', (1 - light) * 0.8);
        if (ravine) col = mix(col, '#3a3530', 0.35);
        // de près, on voit le grain de la roche
        if (v.z > 1.4 && hash(Math.floor(a * 400) + k * 7) < 0.18) col = mix(col, '#5a5248', 0.3);
        rect(g, sx, y0, 1, Math.max(0, Math.min(v.base, y1) - y0), mix(col, haze, mist));
      }
      // le reflet de la falaise dans l'eau, cassé par les vaguelettes
      const rh = Math.round(Math.min(12 * v.z, (v.base - top) * 0.25));
      for (let k = 1; k < rh; k += 2) if (Math.sin(t * 2 + k * 1.3 + sx * 0.4) > -0.2) { g.fillStyle = rgba('#3a3530', 0.16 * (1 - k / rh)); g.fillRect(sx, v.base + k, 1, 1); }
    }
    // l'écume au pied de la falaise
    for (let sx = x0; sx <= x1; sx += 2) {
      const k = Math.sin(t * 1.3 + sx * 0.15 + at * 40);
      if (k > 0) { g.fillStyle = `rgba(255,255,255,${0.4 + k * 0.4})`; g.fillRect(sx, v.base - (k > 0.6 ? 1 : 0), 2, Math.max(1, Math.round(v.z * 0.7))); }
    }
    // ce qu'il y a sur l'île, du fond vers l'avant : les arbres, le pavillon et l'échelle, la grotte et son serpent
    const items = TREES.map((tr) => ({ ...tr, p: project(tr.a, v) })).filter((x) => x.p.front > 0.12 && x.p.x > -10 && x.p.x < W + 10).sort((p, q) => p.p.front - q.p.front);
    const dark = tod === 'night' ? 0.62 : tod === 'evening' ? 0.3 : 0;
    for (const tr of items) this.tree(g, tr.p.x, topOf(tr.p.x, tr.a, v), tr.pine, tr.s * v.z, haze, t, dark);
    const pav = project(LANDMARKS.pavilion, v);
    let pavTop = HORIZON;
    if (pav.front > 0.45 && pav.x > -40 && pav.x < W + 40) pavTop = this.pavilion(g, pav.x, pav.front, v, tod);
    const cave = project(LANDMARKS.cave, v);
    this.eyes = null;
    const roam = tod === 'night' && sea.serpent.phase === 'lair' ? this.roam(t) : null;
    if (cave.front > 0.3) this.cave(g, cave.x, cave.front, v, sea, t, !roam);
    if (lhFront && !(sea.dist < 0.3 && Math.abs(lh.x - CX) < v.rs * 0.6)) this.lighthouse(g, lh.x, lhY, lhZ, t, tod);

    // la houle : des crêtes qui avancent vers nous (plus vite quand on rame vers l'île), et qui défilent quand on tourne
    const [far, near] = SEA[tod];
    const hidden = (x: number, y: number) => x >= x0 && x <= x1 && y <= v.base + 1;
    for (let i = 0; i < 86; i++) {
      const life = (((i * 0.137 + t * 0.06 - sea.dist * 1.6) % 1) + 1) % 1;
      const p = life ** 1.3;
      const y = Math.round(HORIZON + 3 + p * (H - HORIZON - 6));
      const x = ((i * 83 - at * 520 * (0.3 + p) * (0.6 + v.z * 0.4) + t * 3) % (W + 40) + W + 40) % (W + 40) - 20;
      if (hidden(x, y)) continue;
      g.fillStyle = rgba(mix(mix(far, near, p), '#ffffff', 0.5), 0.2 + 0.4 * Math.sin(life * Math.PI));
      g.fillRect(Math.round(x), y, 2 + Math.round(p * 10), 1);
    }
    this.wavelets(g, t, tod, hidden);
    this.fish(g, t, hidden);
    if (roam) this.serpentRoam(g, roam, t, tod);

    // les coins de pêche : des ronds dans l'eau, des oiseaux qui tournent, leur nom
    for (const s of SPOTS) {
      if (t < s.restUntil) continue;
      const d = angleDiff(s.at, at);
      if (Math.abs(d) > 0.5) continue;
      const x = CX + d * 420, y = 176;
      const away = s.lucky && sea.dist < OFFSHORE;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1;
        const rx = 4 + k * 18, ry = rx * 0.32;
        g.fillStyle = s.lucky ? `rgba(255,209,102,${(away ? 0.35 : 0.85) * (1 - k)})` : `rgba(255,255,255,${0.75 * (1 - k)})`;
        for (let q = 0; q < Math.PI * 2; q += 0.2) g.fillRect(Math.round(x + Math.cos(q) * rx), Math.round(y + Math.sin(q) * ry), 1, 1);
      }
      for (let i = 0; i < 3; i++) {
        const q = t * (0.9 + i * 0.2) + i * 2.1, rr = 10 + i * 5;
        const bx = Math.round(x + Math.cos(q) * rr), byy = Math.round(y - 30 - i * 4 + Math.sin(q) * 3);
        const up = Math.floor(t * 6 + i) % 2;
        g.fillStyle = s.lucky ? '#ffe9a0' : '#f6f6fa';
        g.fillRect(bx, byy, 2, 1); g.fillRect(bx - 2, byy - up, 2, 1); g.fillRect(bx + 2, byy - up, 2, 1);
      }
      const label = away ? `${s.label} · PLUS AU LARGE` : s.label;
      const w = textWidth(label);
      g.fillStyle = 'rgba(10,8,18,0.72)'; g.fillRect(Math.round(x - w / 2 - 3), y - 52, w + 6, 9);
      pixelText(g, label, Math.round(x - w / 2), y - 50, s.lucky ? '#ffd166' : '#ffffff');
    }

    // le ponton qui avance dans l'eau, quand on est devant ; puis la barque, Roré et ses rames, au premier plan
    if (sea.dist < 0.5 && Math.abs(angleDiff(LANDMARKS.pavilion, at)) < 0.5 && pav.front > 0.45) this.jetty(g, pav.x + Math.round(8 * pav.front * v.z), sea, v, t);
    this.boat(g, sea, roreKey, t, tod);
    if (tod !== 'day') this.lighting(g, sea, tod, t, pav, pavTop, lh, v);
    this.minimap(g, sea);
  }

  private disc(g: G, cx: number, cy: number, r: number, color: string) {
    for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); if (cy + dy < HORIZON + 1) hline(g, Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, color); }
  }

  private tree(g: G, x: number, top: number, pine: boolean, k: number, haze: string, t: number, dark: number) {
    const sway = Math.round(Math.sin(t * 1.3 + x * 0.1) * 0.6 * k);
    // le soir et la nuit, les arbres s'assombrissent avec le reste de l'île
    const c = (col: string, h: number) => mix(mix(col, haze, h), '#10142a', dark);
    const tw = Math.max(1, Math.round(k * 0.6));
    if (pine) {
      const h = Math.round(9 * k), cw = Math.round(9 * k);
      for (let i = 0; i < h; i++) rect(g, x + Math.round((i / h) * 2 * k), top - i, tw, 1, c('#5a3a24', 0.25));
      rect(g, x - cw / 2 + 2 * k + sway, top - h - 2 * k, cw, Math.max(2, 3 * k), c('#24492c', 0.2));
      rect(g, x - cw * 0.38 + 2 * k + sway, top - h - 3 * k, cw * 0.78, Math.max(1, 2 * k), c('#3f7a42', 0.2));
    } else {
      rect(g, x, top - 4 * k, tw, 4 * k, c('#5a3a24', 0.25));
      rect(g, x - 3 * k + sway, top - 10 * k, 7 * k, 6 * k, c('#2f8266', 0.2));
      rect(g, x - 2 * k + sway, top - 11 * k, 5 * k, 3 * k, c('#4fae86', 0.2));
      if (k > 1.4) rect(g, x - 2 * k + sway, top - 10 * k, 2 * k, 2 * k, c('#6cc79c', 0.2));
    }
  }

  /** Le pavillon 43 au bord du plateau, et l'échelle de la barque qui descend la falaise jusqu'au ponton.
   *  Renvoie le haut du terrain sous la maison. */
  private pavilion(g: G, x: number, front: number, v: View, tod: TimeOfDay) {
    const z = v.z;
    const w = Math.round(22 * front * z), bx = Math.round(x - w / 2);
    // la maison se pose sur le point le plus haut du terrain sous elle ; là où le sol descend, un soubassement de pierre
    let top = v.base;
    for (let sx = bx; sx < bx + w; sx++) if (sx >= 0 && sx < W && this.tops[sx]) top = Math.min(top, this.tops[sx]);
    for (let sx = bx - 1; sx <= bx + w; sx++) {
      const ground = (sx >= 0 && sx < W && this.tops[sx]) || top;
      if (ground > top) { rect(g, sx, top, 1, ground - top + 1, '#a7a29a'); if ((sx - bx) % 3 === 0) vline(g, sx, top + 1, ground - top, '#8a857c'); }
    }
    rect(g, bx - 1, top - 1, w + 2, 1, '#c2bdb4');
    const hh = Math.round(8 * z), by = top - 1 - hh;
    // le toit plat (sa verdure), le mur, le bardage de bois, la baie vitrée, la porte
    rect(g, bx - 1, by - Math.round(2 * z), w + 2, Math.round(2 * z), '#8a8a92');
    if (z > 1.3) hline(g, bx, by - Math.round(2 * z) - 1, w, '#5b9a47');
    rect(g, bx, by, w, hh, '#efe9de');
    rect(g, bx, by, Math.round(w * 0.25), hh, '#a8743f');
    if (z > 1.3) for (let k = bx + 1; k < bx + w * 0.25; k += 2) vline(g, k, by, hh, '#8a5f3e');
    rect(g, bx + Math.round(w * 0.7), by + Math.round(z), Math.round(w * 0.25), Math.round(5 * z), tod === 'day' ? '#9fd4f2' : '#ffcf8a');
    rect(g, bx + Math.round(w * 0.42), by + Math.round(3 * z), Math.round(3 * z), hh - Math.round(3 * z), '#ffd9a0');
    // le petit logo 43 au-dessus de la porte, de près
    if (z > 1.6) pixelText(g, '43', bx + Math.round(w * 0.42) - 1, by + 1, '#2e2e3c');
    this.ladder(g, Math.round(x) + Math.round(8 * front * z), top, front, v, tod);
    return top;
  }

  /** L'échelle de la barque : fixée à la falaise par des pattes de fer, du palier (deux poteaux, une corde, une
   *  lanterne) jusqu'au ponton sur pieux, au ras de l'eau. Elle porte son ombre sur la roche. */
  private ladder(g: G, lx: number, top: number, front: number, v: View, tod: TimeOfDay) {
    const z = v.z;
    const half = Math.max(2, Math.round(3 * front * z));
    const y0 = top + 1, y1 = v.base - Math.round(3 * z);
    g.fillStyle = 'rgba(30,24,20,0.28)';
    g.fillRect(lx + half + 2, y0 + 2, Math.round(2 * z), y1 - y0);
    for (let y = y0; y <= y1; y++) {
      px(g, lx - half - 1, y, '#8a5f3e'); px(g, lx - half, y, '#5e3d26');
      px(g, lx + half, y, '#8a5f3e'); px(g, lx + half + 1, y, '#5e3d26');
      if ((y - y0) % Math.round(9 * z) === 4) { px(g, lx - half - 2, y, '#3a3640'); px(g, lx + half + 2, y, '#3a3640'); }
    }
    const step = Math.max(3, Math.round(3 * z));
    for (let y = y0 + 2; y < y1; y += step) {
      hline(g, lx - half + 1, y, half * 2 - 1, '#d8a870');
      hline(g, lx - half + 1, y + 1, half * 2 - 1, 'rgba(40,24,14,0.4)');
    }
    // le palier en haut : des planches, deux poteaux, la corde qui ploie, une lanterne
    const pw = half * 2 + Math.round(9 * z);
    rect(g, lx - half - 4 * z, top - 1, pw, 2, '#a8743f');
    hline(g, lx - half - 4 * z, top - 1, pw, '#c89a6a');
    for (const px0 of [lx - half - 4 * z, lx + half + 4 * z]) vline(g, px0, top - 5 * z, 5 * z, '#5e3d26');
    for (let k = 0; k <= pw; k++) px(g, lx - half - 4 * z + k, top - 4 * z + Math.sin((k / pw) * Math.PI) * 1.5 * z, '#e8dcc0');
    rect(g, lx + half + 3 * z, top - 7 * z, 3 * z, 2 * z, '#2e2e3c'); px(g, lx + half + 4 * z, top - 7 * z, tod === 'day' ? '#c8b070' : '#ffd9a0');
    // le ponton au pied : des planches sur pieux, l'écume autour, l'anneau d'amarrage
    const dw = half * 2 + Math.round(13 * z), dx = lx - half - Math.round(6 * z), dy = v.base - Math.round(3 * z);
    rect(g, dx, dy, dw, Math.max(2, Math.round(2 * z)), '#8a5f3e');
    for (let k = dx; k < dx + dw; k += Math.max(3, Math.round(3 * z))) px(g, k, dy, '#6b4528');
    hline(g, dx, dy, dw, '#b07c4c');
    for (const px0 of [dx + 1, dx + dw - 2]) { vline(g, px0, dy + 2, Math.round(2 * z), '#3e2818'); px(g, px0 - 1, v.base, '#ffffff'); px(g, px0 + 1, v.base, '#ffffff'); }
    px(g, dx + dw, dy - 1, '#9a9488');
  }

  /** Le ponton qui avance vers nous sur ses pieux, depuis le pied de l'échelle, quand on est devant. La barque vient
   *  s'y ranger, à gauche. */
  private jetty(g: G, footX: number, sea: Sea, v: View, t: number) {
    const L = 0.13;
    const y0 = v.base - 1;
    const d = clamp(L / Math.max(0.02, sea.dist), 0, 1.4);
    const y1 = Math.min(H + 4, Math.round(y0 + (BOAT_Y - 2 - y0) * Math.pow(Math.min(1, d), 0.75) + (d > 1 ? (d - 1) * 120 : 0)));
    if (y1 <= y0 + 2) return;
    const nearX = CX + 50 + angleDiff(LANDMARKS.pavilion, sea.at) * 520;
    const w0 = 6 * v.z, w1 = 30;
    let plank = 0;
    for (let y = y0; y <= y1; y++) {
      const f = (y - y0) / Math.max(1, BOAT_Y - y0);
      const cx = footX + (nearX - footX) * Math.min(1, f), w = w0 + (w1 - w0) * Math.min(1, f);
      // les planches : plus larges près de nous
      const gap = Math.max(2, Math.round(2 + f * 5));
      plank++;
      const col = plank % gap === 0 ? '#6b4528' : (plank % gap === 1 ? '#c89a6a' : '#a8743f');
      rect(g, cx - w / 2, y, w, 1, col);
      px(g, cx - w / 2, y, '#5e3d26'); px(g, cx + w / 2, y, '#5e3d26');
      // les pieux, à intervalles réguliers, avec un peu d'écume autour
      if (plank % Math.max(6, Math.round(6 + f * 14)) === 0) {
        const ph = Math.round(2 + f * 6);
        for (const sx of [cx - w / 2, cx + w / 2 - Math.max(1, f * 3)]) {
          rect(g, sx, y + 1, Math.max(1, Math.round(f * 3)), ph, '#3e2818');
          if (Math.sin(t * 2 + sx) > 0) { px(g, sx - 1, y + ph, '#ffffff'); px(g, sx + 1 + f * 3, y + ph, '#ffffff'); }
        }
      }
    }
    // une bitte d'amarrage et sa corde, au bout
    const ex = nearX - w1 / 2 + 3;
    if (y1 < H) { rect(g, ex, y1 - 5, 3, 5, '#3e2818'); hline(g, ex, y1 - 5, 3, '#6b4528'); }
  }

  /** La grotte au pied de la falaise : une arche sombre, l'eau qui y entre. Au fond, deux yeux qui luisent : le serpent
   *  de mer. Quand la barque approche, il sort la tête, regarde, puis replonge. */
  private cave(g: G, x: number, front: number, v: View, sea: Sea, t: number, home: boolean) {
    const z = v.z;
    const w = Math.round(20 * front * z), h = Math.round(16 * z);
    const cx = Math.round(x), base = v.base;
    // l'arche : un bord de roche plus clair, puis le noir qui s'enfonce
    for (let k = -w / 2 - 1; k <= w / 2 + 1; k++) {
      const u = k / (w / 2 + 1);
      const ah = Math.round(h * Math.sqrt(Math.max(0, 1 - u * u)));
      rect(g, cx + k, base - ah - 1, 1, ah + 1, '#5a5248');
    }
    for (let k = -w / 2; k <= w / 2; k++) {
      const u = k / (w / 2);
      const ah = Math.round((h - 1) * Math.sqrt(Math.max(0, 1 - u * u)));
      rect(g, cx + k, base - ah, 1, ah, mix('#0a0e1a', '#1a2238', Math.abs(u)));
    }
    // l'eau qui entre dans la grotte, et quelques reflets
    for (let k = -w / 2 + 2; k < w / 2 - 2; k += 3) if (Math.sin(t * 1.7 + k) > 0.3) px(g, cx + k, base - 1, 'rgba(140,180,220,0.5)');
    // des stalactites
    for (let k = -w / 3; k <= w / 3; k += Math.max(3, Math.round(4 * z))) vline(g, cx + k, base - h + 2, Math.round((1 + hash(k) * 2) * z), '#2a2a34');
    const s = sea.serpent;
    if (s.phase === 'lair') {
      if (!home) return;
      // les yeux, au fond : ils clignent de temps en temps
      if ((t % 4.3) < 0.15) return;
      const ey = Math.round(base - h * 0.42), es = Math.max(1, Math.round(z * 0.6));
      rect(g, cx - 2 * es, ey, es, es, SERPENT.eye); rect(g, cx + es, ey, es, es, SERPENT.eye);
      this.eyes = { x: cx, y: ey };
      return;
    }
    // il sort de l'eau devant sa grotte (vers nous), le cou en S, la tête tournée vers la barque
    const rise = s.phase === 'peek' ? Math.min(1, s.t / 1.1) : Math.max(0, 1 - s.t / 1.1);
    const look = cx < sea.screen.x ? 1 : -1;
    const wx = cx + Math.round(look * w * 0.15), wy = base + Math.round(5 * z);
    this.neck(g, wx, wy, 26 * z * rise, look, z, t, false);
    // l'eau qui bouillonne autour
    const ring = (t * 1.5) % 1;
    g.fillStyle = rgba('#ffffff', 0.7 * (1 - ring));
    for (let q = 0; q < Math.PI * 2; q += 0.35) g.fillRect(Math.round(wx + Math.cos(q) * (4 + ring * 8) * z), Math.round(wy + Math.sin(q) * (1 + ring * 2) * z), 1, 1);
    if (s.phase === 'dive' && s.t > 0.8) for (let i = 0; i < 6; i++) px(g, wx + (i - 3) * 2 * z, wy - (s.t - 0.8) * 30 * (1 - Math.abs(i - 2.5) / 3) + (s.t - 0.8) ** 2 * 60, '#ffffff');
  }

  /** Le cou et la tête du serpent, sortis de l'eau en (x, y), hauts de `hgt` : un S, la crête, le ventre clair. */
  private neck(g: G, x: number, y: number, hgt: number, look: number, z: number, t: number, night: boolean) {
    if (hgt < 1) return;
    const body = night ? '#1d4a34' : SERPENT.body, dark = night ? '#123224' : SERPENT.dark, belly = night ? '#5f8f7a' : SERPENT.belly;
    const th = Math.max(2, Math.round(3.4 * z));
    const n = Math.round(hgt);
    let hx = x, hy = y;
    for (let i = 0; i <= n; i++) {
      const u = i / Math.max(1, n);
      const sx = x + Math.sin(u * Math.PI * 1.4 + t * 1.2) * 3 * z * (1 - u * 0.4) + look * u * u * 4 * z;
      const sy = y - i;
      const tw = Math.max(1, Math.round(th * (1 - u * 0.35)));
      rect(g, sx - tw / 2, sy, tw, 1, body);
      px(g, sx + (look > 0 ? tw / 2 - 1 : -tw / 2), sy, belly);
      if (i % Math.max(3, Math.round(3 * z)) === 0 && u < 0.9) px(g, sx - look * (tw / 2 + 1), sy, dark);
      hx = sx; hy = sy;
    }
    // la tête : allongée vers la barque, l'œil jaune, une narine
    const hw = Math.round(7 * z), hh = Math.max(2, Math.round(3.4 * z));
    const x0 = look > 0 ? hx - 1 : hx - hw + 1;
    rect(g, x0, hy - hh + 1, hw, hh, body);
    rect(g, x0, hy, hw, 1, belly);
    rect(g, look > 0 ? x0 + hw - 2 : x0, hy - hh + 2, 2, Math.max(1, hh - 2), body);
    const ex = look > 0 ? x0 + Math.round(hw * 0.35) : x0 + hw - Math.round(hw * 0.35) - 1;
    px(g, ex, hy - hh + 1 + Math.round(z * 0.5), SERPENT.eye);
    px(g, look > 0 ? x0 + hw - 1 : x0, hy - hh + 2, dark);
    // une petite crête sur la tête
    for (let k = 0; k < 3; k++) px(g, x0 + (look > 0 ? 1 + k : hw - 2 - k), hy - hh - (k % 2), dark);
  }

  /** La nuit, le serpent quitte sa grotte et nage au large : où il en est (ou null s'il est chez lui). */
  private roam(t: number) {
    const per = 46, on = 26;
    const cyc = Math.floor(t / per), k = t % per;
    if (k > on) return null;
    return { p: k / on, dir: cyc % 2 ? 1 : -1, y: 146 + Math.round(hash(cyc) * 14) };
  }

  /** Le serpent qui nage au large : la tête et le cou, trois bosses qui ondulent, le sillage. */
  private serpentRoam(g: G, r: { p: number; dir: number; y: number }, t: number, tod: TimeOfDay) {
    const x = r.dir > 0 ? -60 + r.p * (W + 120) : W + 60 - r.p * (W + 120);
    const y = r.y;
    // il apparaît et disparaît doucement : il plonge en partant
    const show = Math.min(1, r.p * 6, (1 - r.p) * 6);
    const sink = Math.round((1 - show) * 6);
    const body = '#1d4a34', moon = tod === 'night' ? '#7fb0a0' : SERPENT.belly;
    for (let i = 0; i < 3; i++) {
      const hx = x - r.dir * (12 + i * 11);
      const bob = Math.sin(t * 2.4 - i * 1.1);
      const hh = Math.max(0, Math.round(4 + bob * 1.6) - sink);
      for (let k = -4; k <= 4; k++) {
        const ah = Math.round(hh * Math.sqrt(Math.max(0, 1 - (k / 4.5) ** 2)));
        if (ah > 0) { rect(g, hx + k, y - ah, 1, ah, body); px(g, hx + k, y - ah, moon); }
      }
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(Math.round(hx - 6), y, 3, 1); g.fillRect(Math.round(hx + 4), y, 3, 1);
    }
    this.neck(g, Math.round(x), y, Math.max(0, 12 - sink * 2), r.dir, 1, t, true);
    // le sillage, en V derrière lui
    for (let k = 1; k < 12; k++) {
      g.fillStyle = rgba('#dfe6ff', 0.4 * (1 - k / 12));
      g.fillRect(Math.round(x - r.dir * (40 + k * 5)), y - Math.round(k * 0.5), 3, 1);
      g.fillRect(Math.round(x - r.dir * (40 + k * 5)), y + 1 + Math.round(k * 0.6), 3, 1);
    }
    this.eyes = { x: Math.round(x + r.dir * 4), y: y - Math.max(0, 12 - sink * 2) - 2 };
  }

  /** Le phare, sur son îlot : la tour blanche à bandes rouges, la lanterne qui clignote. */
  private lighthouse(g: G, x: number, base: number, z: number, t: number, tod: TimeOfDay) {
    const lx = Math.round(x), s = (n: number) => Math.round(n * z);
    for (let k = -s(14); k <= s(14); k++) { const h = Math.round(s(6) * Math.sqrt(Math.max(0, 1 - (k / s(14)) ** 2))); rect(g, lx + k, base - h, 1, h, '#7a7062'); }
    rect(g, lx - s(2), base - s(26), s(5), s(21), '#f1ede6');
    for (const y of [base - s(20), base - s(12)]) rect(g, lx - s(2), y, s(5), s(3), '#d24a40');
    rect(g, lx - s(3), base - s(28), s(7), s(2), '#2e2e3c');
    rect(g, lx - s(1), base - s(31), s(3), s(3), Math.sin(t * 2.4) > 0 || tod !== 'day' ? '#fff2b0' : '#c8b070');
    rect(g, lx - s(2), base - s(33), s(5), s(2), '#d24a40');
    for (let x2 = lx - s(15); x2 < lx + s(15); x2 += 2) if (Math.sin(t * 1.4 + x2) > 0.2) px(g, x2, base, '#ffffff');
  }

  /** Un voilier au loin : une petite coque, une voile triangulaire ; la nuit, un feu en haut du mât. */
  private sailboat(g: G, x: number, y: number, s: number, dir: number, t: number, tod: TimeOfDay) {
    if (x < -10 || x > W + 10) return;
    const bob = Math.round(Math.sin(t * 1.3 + x) * 0.5);
    const hull = tod === 'night' ? '#2a2f48' : '#e8e5f1', sail = tod === 'night' ? '#5a6488' : tod === 'evening' ? '#ffe0c8' : '#ffffff';
    rect(g, x - 2 * s, y + bob, 5 * s, s, hull);
    vline(g, x, y - 5 * s + bob, 5 * s, tod === 'night' ? '#3a4060' : '#9a9aa8');
    for (let k = 0; k < 4 * s; k++) hline(g, dir >= 0 ? x + 1 : x - Math.round((k + 1) * 0.6), y - 5 * s + k + bob, Math.max(1, Math.round((k + 1) * 0.6)), sail);
    if (tod === 'night') px(g, x, y - 5 * s - 1 + bob, '#fff2b0');
  }

  /** Le paquebot : il passe rarement, très loin, sur l'horizon ; la nuit, ses hublots sont allumés. */
  private liner(g: G, t: number, tod: TimeOfDay, farX: (a: number) => number) {
    const per = 150, on = 80;
    const k = t % per;
    if (k > on) return;
    const cyc = Math.floor(t / per);
    const a = 1.5 + cyc * 2.2 + (k / on - 0.5) * 1.4;
    const x = Math.round(farX(a)), y = HORIZON;
    if (x < -40 || x > W + 40) return;
    const night = tod !== 'day';
    rect(g, x - 15, y - 3, 30, 3, '#262a36');
    rect(g, x - 14, y - 1, 28, 1, '#a83a32');
    px(g, x + 15, y - 3, '#262a36'); px(g, x + 16, y - 3, '#262a36');
    rect(g, x - 10, y - 6, 20, 3, night ? '#6a6e82' : '#f4f2ea');
    rect(g, x - 7, y - 8, 13, 2, night ? '#6a6e82' : '#f4f2ea');
    for (const fx of [x - 3, x + 3]) { rect(g, fx, y - 11, 2, 3, '#d24a40'); px(g, fx, y - 11, '#262a36'); }
    // les hublots et les fenêtres des ponts
    for (let i = x - 13; i < x + 13; i += 2) px(g, i, y - 2, night && hash(i + cyc) > 0.25 ? '#ffd98a' : '#4a5060');
    for (let i = x - 9; i < x + 9; i += 2) px(g, i, y - 5, night && hash(i * 3 + cyc) > 0.3 ? '#ffe9b0' : '#8aa0b8');
    // la fumée qui s'en va
    if (!night) for (let i = 0; i < 4; i++) { const q = (t * 0.4 + i / 4) % 1; g.fillStyle = rgba('#e8e8ee', 0.6 * (1 - q)); g.fillRect(Math.round(x - 1 - q * 14), Math.round(y - 13 - q * 6), 2 + Math.round(q * 3), 2); }
  }

  /** Des vaguelettes : de petits moutons qui naissent et s'effacent, plus grands près de nous. */
  private wavelets(g: G, t: number, tod: TimeOfDay, hidden: (x: number, y: number) => boolean) {
    const [, near] = SEA[tod];
    for (let i = 0; i < 30; i++) {
      const cycle = Math.floor(t / 2.2 + i * 0.37);
      const life = (t / 2.2 + i * 0.37) % 1;
      const u = hash(cycle * 13 + i * 7), p = hash(cycle * 5 + i * 11) ** 0.9;
      const y = Math.round(HORIZON + 6 + p * (H - HORIZON - 10));
      const x = Math.round(u * W);
      if (hidden(x, y)) continue;
      const a = Math.sin(life * Math.PI);
      const s = 1 + Math.round(p * 3 * a);
      g.fillStyle = rgba('#ffffff', 0.8 * a);
      g.fillRect(x - s, y, s * 2 + 1, 1);
      if (p > 0.35) { g.fillRect(x, y - 1, 1, 1); if (p > 0.7) { g.fillRect(x - 1, y - 1, 3, 1); g.fillRect(x, y - 2, 1, 1); } }
      g.fillStyle = rgba(mix(near, '#000020', 0.3), 0.35 * a);
      g.fillRect(x - s, y + 1, s * 2 + 1, 1);
    }
  }

  /** Des poissons qui sautent hors de l'eau : un arc argenté, des gouttes, un rond dans l'eau. */
  private fish(g: G, t: number, hidden: (x: number, y: number) => boolean) {
    for (let i = 0; i < 4; i++) {
      const per = 6 + i * 1.7, k = (t + i * 2.3) % per, cyc = Math.floor((t + i * 2.3) / per);
      if (k > 2) continue;
      const p = hash(cyc * 3 + i * 17);
      const y0 = Math.round(HORIZON + 14 + p * 70), x0 = Math.round(20 + hash(cyc * 7 + i) * (W - 40));
      if (hidden(x0, y0)) continue;
      const s = y0 > 160 ? 2 : 1, dir = hash(cyc + i) > 0.5 ? 1 : -1;
      const jump = 0.9;
      if (k < jump) {
        const u = k / jump;
        const fx = x0 + dir * (u - 0.5) * 16 * s, fy = y0 - Math.sin(u * Math.PI) * 10 * s;
        // le poisson s'incline : nez en haut en montant, en bas en descendant
        const tilt = u < 0.4 ? -1 : u > 0.6 ? 1 : 0;
        for (let q = -2; q <= 2; q++) rect(g, fx + q * s * dir, fy + q * tilt * 0.5 * s, s, s, q < 0 ? '#9aa8b8' : '#dfe8f0');
        px(g, fx - dir * 3 * s, fy - tilt * s - s, '#9aa8b8');
        if (u < 0.15) for (let d = 0; d < 3; d++) px(g, x0 - dir * 8 * s + (d - 1) * 2, y0 - 2 - d + u * 10, '#ffffff');
      } else {
        // le rond dans l'eau, là où il est retombé, et quelques gouttes
        const u = (k - jump) / (2 - jump);
        const rx = (3 + u * 10) * s, ry = rx * 0.3;
        g.fillStyle = rgba('#ffffff', 0.7 * (1 - u));
        for (let q = 0; q < Math.PI * 2; q += 0.3) g.fillRect(Math.round(x0 + dir * 8 * s + Math.cos(q) * rx), Math.round(y0 + Math.sin(q) * ry), 1, 1);
        if (u < 0.25) for (let d = -1; d <= 1; d++) px(g, x0 + dir * 8 * s + d * 2, y0 - 3 + u * 12 - Math.abs(d), '#ffffff');
      }
    }
  }

  /** La barque au premier plan, vue d'un peu au-dessus : on voit l'intérieur (les membrures, le banc) et Roré assis
   *  DEDANS, le bordé devant cache ses jambes. Elle tangue, elle dérive avec la houle, elle cogne les rochers. */
  private boat(g: G, sea: Sea, roreKey: string, t: number, tod: TimeOfDay) {
    const shake = sea.bump > 0 ? Math.round(Math.sin(t * 70) * sea.bump * 2) : 0;
    const bx = Math.round(CX + sea.sway * clamp(sea.dist * 5, 0, 1)) + shake;
    const by = Math.round(BOAT_Y + Math.sin(t * 1.6) * 1.5);
    const tilt = Math.sin(t * 1.2) * 1.2;
    const f = sea.facing;
    const HL = 34;
    const ph = sea.stroke * Math.PI * 2;
    const dip = sea.rowing && Math.cos(ph) > 0;
    const swing = sea.rowing ? Math.sin(ph) : 0.25;
    const [, nearSea] = SEA[tod];
    // le profil de la barque : le plat-bord de devant (gy), celui du fond (fy, plus haut : on voit dedans), la quille (ky)
    const gy = (i: number) => { const u = i / HL; return by - 5 - Math.round(u * u * 3) - Math.round(Math.pow(Math.max(0, u * f - 0.55) / 0.45, 2) * 3) + Math.round(tilt * u); };
    const fy = (i: number) => gy(i) - Math.round(6 * Math.sqrt(Math.max(0, 1 - (i / HL) ** 2)));
    const ky = (i: number) => by + 4 - Math.round(Math.pow(Math.abs(i / HL), 3) * 7);
    // l'ombre et le reflet dans l'eau
    for (let i = -HL - 2; i <= HL + 2; i++) { g.fillStyle = rgba('#081430', 0.3); g.fillRect(bx + i, by + 4 - Math.round(Math.pow(Math.abs(i / HL), 3) * 3), 1, 4); }
    for (let k = 0; k < 4; k++) { g.fillStyle = rgba('#8a5530', 0.18 - k * 0.04); g.fillRect(bx - HL + 6 + k * 3, by + 8 + k * 2, (HL - 6 - k * 3) * 2, 1); }
    // la rame du fond : elle part du tolet, passe derrière la barque, et sa pale plonge plus loin dans l'eau
    const lock = bx + 2;
    const farOar = () => {
      const sx = lock, sy = fy(2) - 1;
      const ex = sx + f * swing * 9 - 4, ey = sy - 9 + (dip ? 3 : 0);
      for (let k = 0; k <= 12; k++) { const u = k / 12; px(g, sx + (ex - sx) * u, sy + (ey - sy) * u, '#a0703f'); }
      rect(g, ex - 2, ey - 1, 4, 2, '#c89a6a');
      if (dip) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(Math.round(ex - 4), Math.round(ey + 1), 8, 1); }
    };
    farOar();
    // dedans : la membrure du fond, le bordé intérieur, les varangues, le plancher
    for (let i = -HL; i <= HL; i++) {
      const top = fy(i), bot = gy(i);
      if (bot - top < 1) continue;
      px(g, bx + i, top, '#d8a870');
      rect(g, bx + i, top + 1, 1, bot - top - 1, '#7a4a2a');
      if (bot - top > 3) rect(g, bx + i, bot - 2, 1, 2, '#5e3a22');
      if ((i + 60) % 6 === 0) rect(g, bx + i, top + 1, 1, bot - top - 1, '#5a3620');
    }
    // les bancs (vus d'un peu au-dessus, ils traversent la barque) : celui de Roré au milieu, un autre à l'arrière
    for (const u of [0, -0.55 * f]) {
      const i0 = Math.round(u * HL) - 3;
      for (let i = i0; i < i0 + 6; i++) { const top = fy(i) + 1; rect(g, bx + i, top, 1, gy(i) - top, i === i0 ? '#a0703f' : '#c8955e'); }
    }
    // une lanterne à l'arrière, sur son petit mât
    const lx = bx - f * Math.round(HL * 0.78);
    vline(g, lx, gy(lx - bx) - 8, 8, '#3e2818');
    rect(g, lx - 1, gy(lx - bx) - 11, 3, 3, '#2e2e3c'); px(g, lx, gy(lx - bx) - 10, tod === 'day' ? '#c8b070' : '#ffe9a0');
    // Roré, assis sur son banc : il regarde l'île quand il se repose, il se tourne pour ramer
    const dir: Dir = sea.heading > 0 ? 'down' : sea.rowing && sea.heading === 0 ? (f > 0 ? 'right' : 'left') : 'up';
    const pose: Pose = sea.rowing ? 'type' : 'sit';
    g.drawImage(robotSprite(roreKey, pose, dir, sea.rowing ? (Math.sin(ph) > 0 ? 1 : 0) : 0, 'open'), bx - ANCHOR_X, gy(0) + 6 - ANCHOR_Y);
    // le bordé devant : le plat-bord clair, le liston, la bande rouge, les virures à clin, le « 43 » à la proue
    for (let i = -HL; i <= HL; i++) {
      const top = gy(i), bot = ky(i);
      if (bot <= top) continue;
      const x = bx + i;
      rect(g, x, top, 1, bot - top, '#9a6438');
      px(g, x, top, '#e8bc84');
      px(g, x, top + 1, '#6b4528');
      if (bot - top > 4) px(g, x, top + 2, '#c0443a');
      for (let k = top + 4; k < bot - 1; k += 2) px(g, x, k, '#7e4e2c');
      px(g, x, bot - 1, '#5a3820');
      // ce qui est sous l'eau prend sa couleur
      for (let y = by + 2; y < bot; y++) { g.fillStyle = rgba(nearSea, 0.45); g.fillRect(x, y, 1, 1); }
    }
    // l'étrave, un peu plus haute, du côté où l'on va
    const sx = bx + f * HL;
    vline(g, sx, gy(f * HL) - 2, ky(f * HL) - gy(f * HL) + 2, '#6b4528');
    px(g, sx, gy(f * HL) - 3, '#e8bc84');
    pixelText(g, '43', bx + f * (HL - 12) - 3, gy(f * (HL - 12)) + 3, '#f4ead8');
    // les tolets, et la rame de devant : elle descend vers nous, sa pale plonge devant la barque
    rect(g, lock - 1, gy(2) - 2, 2, 2, '#2e2e3c');
    {
      const sx0 = lock, sy0 = gy(2) - 1;
      const ex = sx0 + f * swing * 12 + 6, ey = by + 13 + (dip ? 3 : 0);
      for (let k = 0; k <= 18; k++) { const u = k / 18; rect(g, sx0 + (ex - sx0) * u, sy0 + (ey - sy0) * u, 2, 1, k < 4 ? '#8a5f3e' : '#c08a57'); }
      rect(g, ex - 3, ey - 1, 6, 3, '#e0b880');
      hline(g, ex - 3, ey + 1, 6, '#b08050');
      if (dip) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(Math.round(ex - 6), Math.round(ey + 2), 13, 1); g.fillRect(Math.round(ex - 3), Math.round(ey + 3), 7, 1); }
      else if (sea.rowing) px(g, ex, ey + 3 + Math.round((t * 4) % 3), '#dfeaff');
    }
    // le sillage : derrière quand on tourne, des rides sur les côtés quand on avance ou recule
    if (sea.rowing && sea.heading === 0) for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(255,255,255,${0.5 - k * 0.06})`; g.fillRect(bx - f * (HL + 3 + k * 5), by + 4 + (k % 2), 4, 1); }
    if (sea.rowing && sea.heading !== 0) for (let k = 0; k < 4; k++) { const q = (t * 0.8 + k / 4) % 1; g.fillStyle = rgba('#ffffff', 0.5 * (1 - q)); g.fillRect(bx - HL - 4 - Math.round(q * 10), by + 3 + k, 3, 1); g.fillRect(bx + HL + 2 + Math.round(q * 10), by + 3 + k, 3, 1); }
    // les rochers : la barque vient de cogner, ça éclabousse
    if (sea.bump > 0.2) for (let i = 0; i < 10; i++) { const a = i * 0.7 + t * 3; px(g, bx + Math.cos(a) * (10 + i * 2), by - 14 - Math.abs(Math.sin(a)) * 10 * sea.bump, '#ffffff'); }
    sea.screen = { x: bx, y: by + 6 };
  }

  /** Le soir et la nuit : l'île et la barque s'assombrissent (le ciel et la mer gardent leurs couleurs) ; les lumières. */
  private lighting(g: G, sea: Sea, tod: TimeOfDay, t: number, pav: { x: number; front: number }, pavTop: number, lh: { x: number; front: number }, v: View) {
    const l = this.lg;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = '#ffffff';
    l.fillRect(0, 0, W, H);
    l.fillStyle = AMBIENT[tod];
    // seulement la paroi de l'île, colonne par colonne : le ciel, la mer gardent leurs couleurs
    for (let sx = 0; sx < W; sx++) if (this.tops[sx]) l.fillRect(sx, this.tops[sx] - 2, 1, v.base - this.tops[sx] + 3);
    l.globalCompositeOperation = 'lighter';
    const add = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = l.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(color, a));
      grd.addColorStop(0.55, rgba(color, a * 0.45));
      grd.addColorStop(1, rgba(color, 0));
      l.fillStyle = grd;
      l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (pav.front > 0.45) add(pav.x, pavTop - 6 * v.z, 16 * v.z, '#ffcf8a', 0.9);
    if (this.eyes) add(this.eyes.x, this.eyes.y, 8, '#c8ff6a', 0.8);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    // la lanterne de la barque éclaire l'eau autour, et les yeux du serpent percent la nuit
    g.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(color, a));
      grd.addColorStop(1, rgba(color, 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(sea.screen.x - sea.facing * 26, sea.screen.y - 16, 30, '#ffb860', tod === 'night' ? 0.28 : 0.16);
    if (this.eyes) glow(this.eyes.x, this.eyes.y, 7, '#c8ff6a', tod === 'night' ? 0.5 : 0.25);
    g.globalCompositeOperation = 'source-over';
    // le faisceau du phare balaie le ciel
    if (lh.front > -0.2) {
      const a = Math.sin(t * 0.8);
      const ly = HORIZON - 30;
      g.fillStyle = rgba('#fff2c0', tod === 'night' ? 0.16 : 0.09);
      g.beginPath(); g.moveTo(lh.x, ly); g.lineTo(lh.x + a * 160, ly - 10); g.lineTo(lh.x + a * 160, ly + 6); g.closePath(); g.fill();
    }
  }

  /** La mini-carte : l'île vue de dessus, le phare, la grotte, les coins de pêche, et la barque (plus ou moins près). */
  private minimap(g: G, sea: Sea) {
    const cx = W - 26, cy = 26, R = 18;
    g.fillStyle = 'rgba(10,14,30,0.65)'; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(70,140,190,0.6)'; g.beginPath(); g.arc(cx, cy, R + 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fb86a'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
    const at = (a: number, r: number) => ({ x: cx + Math.sin(a) * r, y: cy + Math.cos(a) * r });
    const lh = at(LANDMARKS.lighthouse, 12);
    g.fillStyle = '#f1ede6'; g.fillRect(Math.round(lh.x) - 1, Math.round(lh.y) - 1, 2, 2);
    const cave = at(LANDMARKS.cave, 8);
    g.fillStyle = '#10142a'; g.fillRect(Math.round(cave.x) - 1, Math.round(cave.y) - 1, 2, 2);
    const dock = at(LANDMARKS.pavilion, 9);
    g.fillStyle = '#c89a6a'; g.fillRect(Math.round(dock.x), Math.round(dock.y), 1, 2);
    for (const s of SPOTS) { const p = at(s.at, s.lucky ? R : 14); g.fillStyle = sea.time < s.restUntil ? '#5a6478' : s.lucky ? '#ffd166' : '#ffffff'; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); }
    const b = at(sea.at, 9 + sea.dist * 10);
    g.fillStyle = P.orange; g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
    pixelText(g, 'N', cx - 1, cy - R - 2, '#ffffff');
  }
}
