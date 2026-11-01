// Le dessin de la mer, en pixel art, avec la même logique que le jardin : l'île est vue depuis la barque, en perspective.
// Le panorama tourne quand la barque fait le tour, et grandit quand elle s'approche : chaque colonne de la falaise montre
// la face de l'île tournée vers nous (son profil, ses strates, ses ravines), avec dessus l'herbe, les pins et, selon
// l'endroit, le pavillon 43, l'échelle et le ponton (au sud), la grotte du monstre marin (au nord) ; le phare sur son
// îlot passe devant ou derrière. Au loin : le soleil (ou la lune), les îles, les voiliers et, de temps en temps, un
// paquebot. Sur l'eau (`seaWater.ts`) : des rangs de vagues qui avancent vers nous, dont chaque crête est une chaîne
// de ressorts (les éclaboussures y courent), des vaguelettes, le reflet du soleil ; la barque y flotte, le ponton, le
// phare et les remous y sont posés à leur distance. Devant : la barque, Roré dedans, ses rames.
import { pixelText, textWidth } from './font.ts';
import { H, WIDE } from './layout.ts';
import { g2d, hline, makeCanvas, mix, outline, P, px, rect, rgba, vline, type G } from './pixels.ts';
import { paintBoat } from './boat.ts';
import { paintNessie } from './nessie.ts';
import { ANCHOR_X, ANCHOR_Y, robotSprite, type Dir, type Pose } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import { angleDiff, LANDMARKS, OFFSHORE, SPOTS, type Sea } from './sea.ts';
import { BOAT_Y, C, crestRange, crestW, E, HORIZON, planeOf, Q, RW, SEA, Swell, toScreen, toWater, type Plane } from './seaWater.ts';

/** La mer est plus large que le bureau : elle remplit le cadre. */
const W = WIDE;
/** L'île à l'écran, vue du large : son centre, sa demi-largeur, la hauteur de la falaise. */
const CX = W / 2, RS = 124, CLIFF = 34;
/** De combien de pixels défile le lointain (soleil, îles, bateaux) quand on fait le tour. */
const FAR = 105;

const SKY: Record<TimeOfDay, string[]> = {
  day: ['#5fa8e6', '#7cbaec', '#9bcdf1', '#bcdff5', '#dcedf7'],
  evening: ['#2e2a5e', '#56397a', '#9a4c7c', '#e0755f', '#ffb77a'],
  night: ['#080b22', '#0c1230', '#111a3e', '#18234c', '#202d5a'],
};
const HAZE: Record<TimeOfDay, string> = { day: '#bcdff5', evening: '#e0907a', night: '#1c2850' };
const AMBIENT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#c8a2b0', night: '#4a5890' };
const GLINT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#ffd2a0', night: '#dfe6ff' };
const STRATA = ['#c2b6a0', '#b0a48e', '#9c917f', '#8a806f', '#776e60'];
/** Le monstre marin : Nessie corail, dans le style de l'ancien monstre (façon Lapras), doux, timide et curieux. Rose
 *  corail, le ventre crème, des branchies en plumeau de chaque côté de la tête (comme un axolotl) ; un long cou, une petite
 *  tête ronde aux yeux doux ; deux bosses tachetées qui ondulent dans l'eau, le bout de la queue qui frétille, des
 *  nageoires qui pagaient (en vol, elles battent comme des ailes). */
/** Son petit canevas (il y est dessiné à l'échelle 1) et sa ligne d'eau dedans. */
const MON_W = 128, MON_H = 104, MON_X = 64, MON_Y = 64;
/** Ses yeux, la nuit, accrochent la moindre lueur. */
const GLOW = '#c8f4ff';
/** Les remous : des ronds qui s'élargissent, l'écume du sillage, des gouttes qui retombent. Ils sont posés sur l'eau
 *  (en mètres : u de côté, w depuis le pied de la falaise) et défilent avec elle quand la barque tourne ou avance. */
interface Fx { kind: 'ring' | 'foam' | 'drop'; u: number; w: number; vu: number; vw: number; h: number; vh: number; life: number; max: number; r: number; a: number }

/** Remplit un polygone convexe, rang par rang (des pixels nets), sans rien dessiner sous `clipY`. */
function poly(g: G, pts: { x: number; y: number }[], color: string, clipY = Infinity) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  y1 = Math.min(y1, clipY);
  g.fillStyle = color;
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if ((p.y <= y + 0.5 && q.y >= y + 0.5) || (q.y <= y + 0.5 && p.y >= y + 0.5)) {
        const x = p.y === q.y ? p.x : p.x + ((y + 0.5 - p.y) / (q.y - p.y)) * (q.x - p.x);
        a = Math.min(a, x); b = Math.max(b, x);
      }
    }
    if (b >= a) g.fillRect(Math.round(a), y, Math.max(1, Math.round(b) - Math.round(a)), 1);
  }
}

/** Les couleurs mélangées, gardées en mémoire : la scène en redemande des milliers à chaque image (la falaise, colonne
 *  par colonne) et les recalculer coûtait cher. Le mélange est arrondi au 1/32, l'opacité au 1/24. */
const mixMemo = new Map<string, string>(), rgbaMemo = new Map<string, string>();
const cmix = (a: string, b: string, t: number) => {
  const k = `${a}${b}${Math.round(t * 32)}`;
  let c = mixMemo.get(k);
  if (!c) { c = mix(a, b, Math.round(t * 32) / 32); if (mixMemo.size > 20000) mixMemo.clear(); mixMemo.set(k, c); }
  return c;
};
const crgba = (hex: string, a: number) => {
  const k = `${hex}${Math.round(a * 24)}`;
  let c = rgbaMemo.get(k);
  if (!c) { c = rgba(hex, Math.max(0, Math.min(1, Math.round(a * 24) / 24))); if (rgbaMemo.size > 20000) rgbaMemo.clear(); rgbaMemo.set(k, c); }
  return c;
};
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
interface View { at: number; z: number; rs: number; base: number; baseF: number }
const viewOf = (sea: Sea): View => {
  // l'île avance par pixels entiers : un cran de distance, un pixel de rotation (et la falaise n'est redessinée qu'à ce moment)
  const near = 1 - Math.round(sea.dist * 400) / 400;
  const z = 1 + near * 1.25, rs = RS * z;
  // l'eau, elle, suit la distance sans arrondi (`baseF`) : sinon tous les rangs de vagues sauteraient d'un coup
  return { at: Math.round(sea.at * rs) / rs, z, rs, base: HORIZON + Math.round(Math.pow(near, 1.5) * 40), baseF: HORIZON + Math.pow(1 - sea.dist, 1.5) * 40 };
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
  /** où sont, ce soir, les yeux du monstre (pour les faire luire) */
  private eyes: { x: number; y: number } | null = null;
  /** ses yeux au large : une lueur plus discrète qu'au fond de la grotte */
  private eyesFar = false;
  private swell = new Swell();
  private cliffCan = makeCanvas(W, H);
  private cliffG = g2d(this.cliffCan);
  private cliffKey = '';
  private monCan = makeCanvas(MON_W, MON_H);
  private monG = g2d(this.monCan);
  /** le monstre qui sort de sa grotte (dessiné après l'ombre du soir, pour ne pas être assombri deux fois) */
  private peek: { x: number; wl: number; rise: number; look: number; sc: number; phase: string; st: number; z: number } | null = null;
  private lastPeek = 'lair';
  /** les vaguelettes et les poissons qui sautent, posés sur l'eau (en mètres) */
  private caps: { u: number; w: number; t0: number; life: number }[] = [];
  private jumps: { u: number; w: number; t0: number; dir: number; landed: boolean }[] = [];
  private nextJump = 0;
  private lastFly = 0;
  /** le trajet de Nessie au large, posé sur l'eau (en mètres) : il le garde toute sa traversée */
  private route: { cyc: number; u0: number; u1: number; w: number } | null = null;
  /** il s'enfonce quand Roré rame près de lui (0 à 1) */
  private shy = 0;
  /** la couleur de la lueur (ses yeux) */
  private glowCol = GLOW;
  private plane: Plane = { at: 0, dw: 30 };
  private fx: Fx[] = [];
  private dt = 0;
  private last = { t: 0, dip: false, wake: 0, ring: 0, bow: 0 };
  /** la barque qui flotte : sa hauteur, son roulis, et leurs vitesses */
  private float = { y: 0, vy: 0, r: 0, vr: 0 };

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
    hline(g, 0, HORIZON, W, cmix(far, '#ffffff', 0.3));
    return c;
  }

  draw(g: G, sea: Sea, tod: TimeOfDay, roreKey: string) {
    if (!this.bg || this.bgTod !== tod) { this.bg = this.backdrop(tod); this.bgTod = tod; }
    const t = sea.time, at = sea.at;
    const v = viewOf(sea);
    const pl = planeOf(at, v.baseF);
    this.plane = pl;
    this.dt = clamp(t - this.last.t, 0, 0.1);
    this.last.t = t;
    this.swell.step(this.dt, pl, t);
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
      for (let k = -fi.w; k <= fi.w; k++) { const h = Math.round(fi.h * Math.sqrt(Math.max(0, 1 - (k / fi.w) ** 2))); if (h > 0) rect(g, x + k, HORIZON - h, 1, h, cmix(HAZE[tod], '#5a7a8a', 0.35)); }
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

    // le phare, au loin sur son îlot, comme on le voit depuis la falaise : on ne peut pas l'atteindre en barque ; il
    // défile avec les îles lointaines et passe derrière l'île (dessiné avant elle, son faisceau aussi)
    const lhX = farX(LANDMARKS.lighthouse);
    if (lhX > -40 && lhX < W + 40) { this.lighthouse(g, lhX, HORIZON, 1, t, tod); this.beam(g, lhX, HORIZON, 1, t, tod); }

    // l'île : chaque colonne montre la face tournée vers nous
    const haze = HAZE[tod];
    const x0 = Math.max(0, Math.ceil(CX - v.rs)), x1 = Math.min(W - 1, Math.floor(CX + v.rs));
    const angleAt = (sx: number) => v.at + Math.asin(clamp((sx - CX) / v.rs, -1, 1));
    const key = `${v.at}|${v.z}|${tod}`;
    if (key !== this.cliffKey) { this.cliffKey = key; this.cliff(v, tod, x0, x1, angleAt); }
    g.drawImage(this.cliffCan, 0, 0);
    for (let sx = x0; sx <= x1; sx++) {
      const top = this.tops[sx];
      // le reflet de la falaise dans l'eau, cassé par les vaguelettes
      const rh = Math.round(Math.min(12 * v.z, (v.base - top) * 0.25));
      for (let k = 1; k < rh; k += 2) if (Math.sin(t * 2 + k * 1.3 + sx * 0.4) > -0.2) { g.fillStyle = crgba('#3a3530', 0.16 * (1 - k / rh)); g.fillRect(sx, v.base + k, 1, 1); }
    }
    // l'écume au pied de la falaise : elle monte, se retire, revient
    for (let sx = x0; sx <= x1; sx++) {
      const a = angleAt(sx);
      const surge = Math.sin(t * 1.1 + a * 23 + hash(Math.floor(a * 50)) * 3);
      if (surge > -0.2) { g.fillStyle = crgba('#ffffff', 0.45 + surge * 0.35); g.fillRect(sx, v.base - (surge > 0.55 ? 1 : 0), 1, 1); }
      const back = Math.sin(t * 1.1 + a * 23 - 1.6 + hash(Math.floor(a * 50)) * 3);
      if (back > 0.4 && (sx & 1)) { g.fillStyle = crgba('#ffffff', (back - 0.4) * 0.8); g.fillRect(sx, v.base + 1 + Math.round(v.z * (1 - back) * 2), 1, 1); }
    }
    // ce qu'il y a sur l'île, du fond vers l'avant : les arbres, le pavillon et l'échelle, la grotte et son monstre
    const items = TREES.map((tr) => ({ ...tr, p: project(tr.a, v) })).filter((x) => x.p.front > 0.12 && x.p.x > -10 && x.p.x < W + 10).sort((p, q) => p.p.front - q.p.front);
    const dark = tod === 'night' ? 0.62 : tod === 'evening' ? 0.3 : 0;
    for (const tr of items) this.tree(g, tr.p.x, topOf(tr.p.x, tr.a, v), tr.pine, tr.s * v.z, haze, t, dark);
    const pav = project(LANDMARKS.pavilion, v);
    let pavTop = HORIZON;
    if (pav.front > 0.45 && pav.x > -40 && pav.x < W + 40) pavTop = this.pavilion(g, pav.x, pav.front, v, tod);
    const cave = project(LANDMARKS.cave, v);
    this.eyes = null;
    this.eyesFar = false;
    this.peek = null;
    const roam = tod === 'night' && sea.serpent.phase === 'lair' ? this.roam(t) : null;
    if (cave.front > 0.3) this.cave(g, cave.x, cave.front, v, sea, t, !roam);
    // le soir et la nuit, la falaise s'assombrit
    if (tod !== 'day') this.shade(g, tod, pav, pavTop, v);

    // l'eau : les rangs de vagues et leurs remous, les vaguelettes, les ronds, les poissons, le monstre
    // l'eau ne passe pas sur l'île
    const hidden = (x: number, y: number) => x >= x0 && x <= x1 && y <= v.base + 1;
    this.crests(g, v, t, tod, hidden);
    this.wavelets(g, t, tod, hidden);
    this.water(g, hidden);
    this.fish(g, t, hidden);
    if (roam) this.roaming(g, roam, t, v.base, sea);
    this.peeking(g, t);

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

    // le ponton qui avance dans l'eau quand on est devant, puis la barque, Roré et ses rames ; les lumières
    if (pav.front > 0.45 && pav.x > -60 && pav.x < W + 60) this.jetty(g, pav.x + Math.round(8 * pav.front * v.z), sea, v, t);
    this.boat(g, sea, roreKey, t, tod);
    if (tod !== 'day') this.glows(g, sea, tod);
    // (après la nuit : ses tentacules se détachent dans le noir)
    if (sea.krakenHere()) this.krakenTips(g, t);
    this.minimap(g, sea);
  }

  /** Les rangs de vagues : chaque crête avance vers nous, ondule, accroche la lumière par endroits, avec sa face plus
   *  sombre dessous ; ses remous (la chaîne de ressorts) la soulèvent en écume ou la creusent. */
  private crests(g: G, v: View, t: number, tod: TimeOfDay, hidden: (x: number, y: number) => boolean) {
    const pl = this.plane, [far, near] = SEA[tod];
    const shadeCol = cmix(near, '#000018', 0.35);
    const { from, to } = crestRange(pl, t);
    for (let k = from; k <= to; k++) {
      const d0 = pl.dw - crestW(k, pl.at * RW, t) + E;
      if (d0 < 3) continue;
      const r0 = C / d0, y0 = HORIZON + r0;
      // au loin les rangs se serrent : ils s'effacent avant de se toucher ; tout près, ils sortent par le bas
      const alpha = clamp(((r0 * r0) / C * 3.4 - 1.2) / 3.5, 0, 1) * clamp((H + 4 - y0) / 18, 0, 1);
      if (alpha < 0.03) continue;
      const p = clamp(r0 / (H - HORIZON), 0, 1);
      const lite = crgba(cmix(cmix(far, near, p), '#ffffff', 0.55), (0.3 + 0.45 * p) * alpha);
      const shade = crgba(shadeCol, 0.26 * alpha), deep = crgba(shadeCol, 0.5 * alpha), foam = crgba('#ffffff', 0.85 * alpha);
      const dh = Math.round(1 + p * 3);
      const sp = r0 * Q;
      for (let x = 0; x < W; x++) {
        const u = (x - CX) / sp + pl.at * RW;
        const d = pl.dw - crestW(k, u, t) + E;
        if (d < 3) continue;
        const r = C / d;
        const rip = this.swell.ripple(k, u);
        const y = Math.round(HORIZON + r - (0.2 + clamp(rip * 4, -0.3, 0.3)) * r * Q);
        if (hidden(x, y)) continue;
        const b = Math.sin(1.7 * u + k * 1.3 + 0.4 * t) * 0.7 + Math.sin(0.6 * u - k * 0.9) * 0.3;
        if (b > -0.35 || Math.abs(rip) > 0.015) { g.fillStyle = shade; g.fillRect(x, y + 1, 1, dh); }
        if (rip > 0.045) { g.fillStyle = foam; g.fillRect(x, y - 1, 1, 2); }
        else if (rip < -0.045) { g.fillStyle = deep; g.fillRect(x, y, 1, 1); }
        else if (rip > 0.015) { g.fillStyle = lite; g.fillRect(x, y, 1, 1); }
        else if (b > 0.15) {
          g.fillStyle = lite; g.fillRect(x, y, 1, 1);
          if (b > 0.88 && p > 0.5) { g.fillStyle = foam; g.fillRect(x, y - 1, 1, 1); }
        }
      }
    }
  }

  /** Des vaguelettes : de petits moutons qui naissent et s'effacent, plus grands près de nous. Ils sont posés sur l'eau
   *  (en mètres) : quand la barque tourne ou avance, ils défilent avec les vagues au lieu de rester collés à l'écran. */
  private wavelets(g: G, t: number, tod: TimeOfDay, hidden: (x: number, y: number) => boolean) {
    const pl = this.plane, [, near] = SEA[tod];
    const first = this.caps.length === 0;
    this.caps = this.caps.filter((c) => t - c.t0 < c.life && t >= c.t0);
    while (this.caps.length < 30) {
      // un endroit au hasard sur l'eau qu'on voit, réparti sur la hauteur de l'écran
      const r = 6 + Math.random() * (H - HORIZON - 10);
      const life = 1.8 + Math.random() * 1.2;
      this.caps.push({ u: pl.at * RW + (Math.random() * 2 - 1) * (CX / (r * Q)), w: pl.dw - (C / r - E), t0: t - (first ? Math.random() * life : 0), life });
    }
    for (const c of this.caps) {
      const p = toScreen(pl, c.u, c.w);
      if (!p || p.y > H + 2) { c.life = 0; continue; }
      const x = Math.round(p.x), y = Math.round(p.y);
      if (hidden(x, y)) continue;
      const k = clamp((p.y - HORIZON) / (H - HORIZON), 0, 1);
      const a = Math.sin(((t - c.t0) / c.life) * Math.PI);
      const sz = 1 + Math.round(k * 3 * a);
      g.fillStyle = crgba('#ffffff', 0.8 * a);
      g.fillRect(x - sz, y, sz * 2 + 1, 1);
      if (k > 0.35) { g.fillRect(x, y - 1, 1, 1); if (k > 0.7) { g.fillRect(x - 1, y - 1, 3, 1); g.fillRect(x, y - 2, 1, 1); } }
      g.fillStyle = crgba(cmix(near, '#000020', 0.3), 0.35 * a);
      g.fillRect(x - sz, y + 1, sz * 2 + 1, 1);
    }
  }

  /** Une onde dans l'eau, là où tombe un pixel de l'écran. */
  private splash(x: number, y: number, dv: number, radius = 0.8) {
    const p = toWater(this.plane, x, y);
    this.swell.disturb(p.u, p.w, this.last.t, dv, radius);
  }

  /** La falaise : l'herbe du plateau, puis la paroi en strates (plus sombre sur les bords, un peu de brume : elle est
   *  loin), le pied mouillé. Dessinée dans son propre canevas, seulement quand la vue change. */
  private cliff(v: View, tod: TimeOfDay, x0: number, x1: number, angleAt: (sx: number) => number) {
    const g = this.cliffG, haze = HAZE[tod];
    g.clearRect(0, 0, W, H);
    this.tops.fill(0);
    const mist = 0.2 - (v.z - 1) * 0.1;
    for (let sx = x0; sx <= x1; sx++) {
      const u = (sx - CX) / v.rs;
      const a = angleAt(sx);
      const top = topOf(sx, a, v);
      this.tops[sx] = top;
      const light = 0.82 + 0.18 * Math.cos(Math.asin(clamp(u, -1, 1)) + 0.5);
      rect(g, sx, top - 1, 1, 2 + Math.round(v.z), cmix(cmix('#5b9a47', '#3f7a3c', 1 - light), haze, mist));
      px(g, sx, top - 1, cmix('#7cbb5a', haze, mist));
      const span = v.base - top - 2;
      const ravine = hash(Math.floor(a * 60)) < 0.12;
      for (let k = 0; k < STRATA.length; k++) {
        const y0 = top + 2 + Math.round((span * k) / STRATA.length + Math.sin(a * 9 + k) * 1.2 * v.z);
        const y1 = top + 2 + Math.round((span * (k + 1)) / STRATA.length + Math.sin(a * 9 + k + 1) * 1.2 * v.z);
        let col = cmix(STRATA[k], '#3a3530', (1 - light) * 0.8);
        if (ravine) col = cmix(col, '#3a3530', 0.35);
        // de près, on voit le grain de la roche
        if (v.z > 1.4 && hash(Math.floor(a * 400) + k * 7) < 0.18) col = cmix(col, '#5a5248', 0.3);
        rect(g, sx, y0, 1, Math.max(0, Math.min(v.base, y1) - y0), cmix(col, haze, mist));
      }
      rect(g, sx, v.base - Math.max(1, Math.round(v.z)), 1, Math.max(1, Math.round(v.z)), cmix('#4a443c', haze, mist));
    }
  }

  private disc(g: G, cx: number, cy: number, r: number, color: string) {
    for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); if (cy + dy < HORIZON + 1) hline(g, Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, color); }
  }

  private tree(g: G, x: number, top: number, pine: boolean, k: number, haze: string, t: number, dark: number) {
    const sway = Math.round(Math.sin(t * 1.3 + x * 0.1) * 0.6 * k);
    // le soir et la nuit, les arbres s'assombrissent avec le reste de l'île
    const c = (col: string, h: number) => cmix(cmix(col, haze, h), '#10142a', dark);
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

  /** Le ponton : il part du pied de l'échelle et avance droit vers le large, sur ses pieux. Il est posé sur l'eau comme
   *  la barque (en mètres) : il garde sa largeur et sa direction quand on tourne, et la barque vient s'y ranger. */
  private jetty(g: G, footX: number, sea: Sea, v: View, t: number) {
    const pl = this.plane;
    // son pied est sur la ligne d'eau, au pied de l'échelle (de loin comme de près, il reste attaché à l'île)
    const r0 = C / (pl.dw + E);
    const footU = (footX - CX) / (r0 * Q) + pl.at * RW;
    const d = angleDiff(LANDMARKS.pavilion, sea.at);
    // l'île est dessinée plus grande que sa vraie distance : de loin, le ponton grandit avec elle pour rester à
    // l'échelle (sinon, en perspective exacte, il ne serait plus qu'un trait au pied de l'échelle)
    const grow = Math.max(1, pl.dw / 14);
    const LEN = 13 * grow ** 0.75, HALF = 1.1 * grow ** 0.5, DECK = 0.6 * grow ** 0.5, STEP = LEN / 26;
    // il vise la place de la barque (à sa droite, quand on est en face) ; quand on tourne, son bout s'écarte, sans
    // jamais partir à plat le long de la falaise
    const u0 = footU + 1.8;
    const uT = pl.at * RW + 2.6 + d * 22;
    const k = clamp((uT - u0) / LEN, -1, 1), n = Math.hypot(1, k);
    const su = k / n, sw = 1 / n;
    const at = (s: number, side: number) => toScreen(pl, u0 + s * su + side * sw, s * sw - side * su);
    let end: { x: number; y: number; s: number } | null = null;
    for (let i = 0; i * STEP < LEN; i++) {
      const s0 = i * STEP, s1 = s0 + STEP;
      const a = at(s0, -HALF), b = at(s0, HALF), c = at(s1, HALF), e = at(s1, -HALF);
      if (!a || !b || !c || !e) break;
      if (Math.min(a.y, e.y) > H + 4) break;
      // son ombre sur l'eau, juste dessous
      poly(g, [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y }, { x: e.x, y: e.y }], 'rgba(8,20,40,0.28)');
      // les pieux, tous les trois mètres, avec un peu d'écume autour
      if (i % 5 === 2) for (const q of [a, b]) {
        const pw = Math.max(1, Math.round(q.s * 0.22));
        rect(g, q.x - pw / 2, q.y - DECK * q.s, pw, DECK * q.s + Math.max(1, q.s * 0.2), '#3e2818');
        if (Math.sin(t * 2 + q.x) > -0.3) { px(g, q.x - pw / 2 - 1, q.y, '#ffffff'); px(g, q.x + pw / 2 + 1, q.y, '#ffffff'); }
      }
      // le plancher : une planche par demi-mètre, l'épaisseur du bord sur les côtés
      const up = (q: { x: number; y: number; s: number }) => ({ x: q.x, y: q.y - DECK * q.s });
      const A = up(a), B = up(b), Cc = up(c), Ee = up(e);
      const th = Math.max(1, e.s * 0.18);
      poly(g, [A, Ee, { x: Ee.x, y: Ee.y + th }, { x: A.x, y: A.y + th }], '#5e3d26');
      poly(g, [B, Cc, { x: Cc.x, y: Cc.y + th }, { x: B.x, y: B.y + th }], '#5e3d26');
      poly(g, [A, B, Cc, Ee], i % 2 ? '#a8743f' : '#b78550');
      if (Cc.y - B.y >= 2) { g.fillStyle = '#7a4e2c'; g.fillRect(Math.round(Math.min(Ee.x, Cc.x)), Math.round((Ee.y + Cc.y) / 2), Math.max(1, Math.round(Math.abs(Cc.x - Ee.x))), 1); }
      end = { x: (Ee.x + Cc.x) / 2, y: (Ee.y + Cc.y) / 2, s: e.s };
    }
    if (!end || end.y > H) return;
    // au bout : le bord de face, une bitte d'amarrage et sa corde, une lanterne sur son poteau
    const s = end.s;
    rect(g, end.x - HALF * s, end.y, HALF * 2 * s, Math.max(1, s * 0.18), '#5e3d26');
    rect(g, end.x - HALF * s * 0.7, end.y - s * 0.35, Math.max(2, s * 0.25), s * 0.35, '#3e2818');
    vline(g, end.x + HALF * s * 0.8, end.y - s * 1.6, s * 1.6, '#3e2818');
    rect(g, end.x + HALF * s * 0.8 - 1, end.y - s * 1.6 - 3, 3, 3, '#2e2e3c');
    px(g, end.x + HALF * s * 0.8, end.y - s * 1.6 - 2, '#ffe9a0');
    // amarrée : une corde du ponton à la barque
    if (sea.near()?.kind === 'dock') {
      const bx = sea.screen.x + 30, by = sea.screen.y - 10;
      const ax = end.x - HALF * s * 0.7, ay = end.y - s * 0.3;
      for (let k = 0; k <= 16; k++) { const q = k / 16; px(g, ax + (bx - ax) * q, ay + (by - ay) * q + Math.sin(q * Math.PI) * 4, '#e8dcc0'); }
    }
  }

  /** La grotte au pied de la falaise : une arche sombre, l'eau qui y entre. Au fond, deux yeux qui luisent : le monstre
   *  marin. Quand la barque approche, il sort la tête, regarde, fredonne, puis replonge. */
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
      rect(g, cx + k, base - ah, 1, ah, cmix('#0a0e1a', '#1a2238', Math.abs(u)));
    }
    // l'eau qui entre dans la grotte, et quelques reflets
    for (let k = -w / 2 + 2; k < w / 2 - 2; k += 3) if (Math.sin(t * 1.7 + k) > 0.3) px(g, cx + k, base - 1, 'rgba(140,180,220,0.5)');
    // des stalactites
    for (let k = -w / 3; k <= w / 3; k += Math.max(3, Math.round(4 * z))) vline(g, cx + k, base - h + 2, Math.round((1 + hash(k) * 2) * z), '#2a2a34');
    const s = sea.serpent;
    if (s.phase === 'lair') {
      // le jour, il dort au fond : de petites bulles remontent
      if (!sea.night) {
        for (let i = 0; i < 3; i++) { const q = (t * 0.35 + i / 3) % 1; px(g, cx + (i - 1) * 3 * z, base - 2 - q * 7 * z, crgba('#cfe8ff', 0.55 * (1 - q))); }
        return;
      }
      if (!home) return;
      // la nuit, au fond : ses deux yeux s'ouvrent et se ferment, quelques bulles remontent
      const ey = Math.round(base - h * 0.4), es = Math.max(1, Math.round(z * 0.6));
      for (let i = 0; i < 2; i++) { const q = (t * 0.5 + i / 2) % 1; px(g, cx + (i * 2 - 1) * 2 * z, base - 2 - q * 6 * z, crgba('#cfe8ff', 0.5 * (1 - q))); }
      if ((t % 4.3) >= 0.15) { rect(g, cx - 2 * es, ey, es, es, GLOW); rect(g, cx + es, ey, es, es, GLOW); }
      this.eyes = { x: cx, y: ey };
      this.glowCol = GLOW;
      return;
    }
    // il sort de l'eau devant sa grotte (vers nous) : il est dessiné plus tard, par-dessus l'ombre du soir
    const rise = s.phase === 'peek' ? Math.min(1, s.t / 1.4) : Math.max(0, 1 - s.t / 1.4);
    const look = cx < sea.screen.x ? 1 : -1;
    this.peek = { x: cx + Math.round(look * w * 0.1), wl: base + Math.round(6 * z), rise, look, sc: z >= 1.5 ? 2 : 1, phase: s.phase, st: s.t, z };
  }

  /** Nessie devant sa grotte : il sort la tête, puis le cou et ses bosses, regarde la barque, tend le cou vers elle et
   *  s'avance un peu, curieux ; ses nageoires pagaient ; il replonge si on vient trop près. */
  private peeking(g: G, t: number) {
    const pk = this.peek;
    if (!pk) { this.lastPeek = 'lair'; return; }
    if (pk.phase !== this.lastPeek) { this.splash(pk.x, pk.wl, pk.phase === 'peek' ? -0.12 : -0.2, 2.5); this.lastPeek = pk.phase; }
    const z = pk.z;
    const curious = pk.phase === 'peek' ? clamp((pk.st - 1.5) / 2, 0, 1) : 0;
    const x = Math.round(pk.x + pk.look * Math.min(18, pk.st * 3) * z * (pk.phase === 'peek' ? 1 : 0));
    const ring = (t * 1.2) % 1;
    g.fillStyle = crgba('#ffffff', 0.5 * (1 - ring) * Math.min(1, pk.rise * 3));
    for (let q = 0; q < Math.PI * 2; q += 0.3) g.fillRect(Math.round(x + Math.cos(q) * (16 + ring * 10) * z), Math.round(pk.wl + Math.sin(q) * (2 + ring * 3) * z), 1, 1);
    const flap = Math.sin(t * 1.8);
    const eye = this.monster(g, x, pk.wl, { look: pk.look, sc: pk.sc, t, night: true, sub: 1 - pk.rise, flap, curious });
    if (flap > 0.8) this.splash(x + pk.look * 6 * z, pk.wl, -0.012, 1.2);
    if (eye) { this.eyes = eye; this.glowCol = GLOW; this.eyesFar = true; }
    if (pk.phase === 'dive' && pk.st > 0.6) for (let i = 0; i < 8; i++) px(g, x + (i - 3.5) * 3 * z, pk.wl - (pk.st - 0.6) * 30 * (1 - Math.abs(i - 3.5) / 4.5) + (pk.st - 0.6) ** 2 * 70, '#ffffff');
  }

  /** Nessie en pixel art : dessiné à l'échelle 1 dans son petit canevas, une pose tous les dixièmes de seconde (comme les
   *  images d'un sprite), cerné, puis posé à l'écran en pixels entiers (×1 ou ×2). Renvoie où est son œil, à l'écran. */
  private monster(g: G, x: number, y: number, o: { look: number; sc: number; t: number; night: boolean; sub: number; flap: number; curious?: number }) {
    const tq = Math.floor(o.t * 10) / 10;
    const mg = this.monG;
    mg.clearRect(0, 0, MON_W, MON_H);
    const eye = paintNessie(mg, MON_X, MON_Y, o.look, tq, o);
    if (!eye) return null;
    outline(this.monCan, o.night ? '#070a18' : '#10202e', { skipBottom: true });
    const dx = Math.round(x) - MON_X * o.sc, dy = Math.round(y) - MON_Y * o.sc;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.monCan, dx, dy, MON_W * o.sc, MON_H * o.sc);
    return { x: dx + eye.x * o.sc, y: dy + eye.y * o.sc };
  }

  /** La nuit, Nessie quitte sa grotte et nage au large : où il en est (ou null s'il est chez lui). */
  private roam(t: number) {
    const per = 46, on = 26;
    const cyc = Math.floor(t / per), k = t % per;
    if (k > on) return null;
    return { p: k / on, dir: cyc % 2 ? 1 : -1, y: 142 + Math.round(hash(cyc) * 12), cyc };
  }

  /** Nessie qui nage au large, la nuit : le cou dressé, ses bosses qui ondulent, l'eau qu'il pousse. Curieux, il
   *  s'approche de la barque en passant ; timide, il s'enfonce si Roré rame. Il reste toujours dans l'eau. */
  private roaming(g: G, r: { p: number; dir: number; y: number; cyc: number }, t: number, base: number, sea: Sea) {
    // son trajet est posé sur l'eau (en mètres) : quand la barque tourne ou avance, il reste à sa place sur la mer et
    // défile avec elle, au lieu de suivre l'écran ; il traverse la vue qu'on avait quand il est apparu
    const pl = this.plane;
    if (!this.route || this.route.cyc !== r.cyc) {
      const row = Math.max(r.y, base + 10) - HORIZON;
      const half = (CX + 90) / (row * Q);
      this.route = { cyc: r.cyc, u0: pl.at * RW - r.dir * half, u1: pl.at * RW + r.dir * half, w: Math.max(6, pl.dw - (C / row - E)) };
    }
    const rt = this.route;
    const u = rt.u0 + (rt.u1 - rt.u0) * r.p;
    // en passant près de la barque, il vient voir de plus près
    const p0 = toScreen(pl, u, rt.w);
    if (!p0) return;
    const near = Math.exp(-(((p0.x - sea.screen.x) / 110) ** 2));
    const p = toScreen(pl, u, rt.w + near * 4);
    if (!p || p.y > H + 40 || p.y <= base + 2) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    const SC = p.s > 5 ? 2 : 1;
    // il apparaît et disparaît doucement ; si Roré rame près de lui, il s'enfonce
    this.shy += ((sea.rowing && near > 0.3 ? 1 : 0) - this.shy) * Math.min(1, this.dt * 1.5);
    const show = Math.min(1, r.p * 6, (1 - r.p) * 6) * (1 - this.shy * 0.85);
    if (show < 0.05) return;
    // en nageant, il pousse l'eau : une vague devant son cou, la houle soulevée par ses bosses, un sillage en V
    if (show > 0.3 && t - this.lastFly > 0.1) {
      this.lastFly = t;
      this.splash(x + r.dir * 14, y, -0.06 * show, 2.4);
      this.splash(x - r.dir * 20, y, -0.05 * show, 2.2);
      this.splash(x - r.dir * 46, y, -0.04 * show, 2);
      for (const side of [-1, 1]) this.spawnAt('foam', x - r.dir * 70, y + side * 3, { vu: -r.dir * 0.4, vw: side * 0.9, a: 0.6 * show, max: 3.2 });
    }
    for (let k = 1; k < 14; k++) {
      g.fillStyle = crgba('#dfe6ff', 0.4 * (1 - k / 14) * show);
      g.fillRect(Math.round(x - r.dir * (72 + k * 6)), y - Math.round(k * 0.6), 4, 1);
      g.fillRect(Math.round(x - r.dir * (72 + k * 6)), y + 1 + Math.round(k * 0.9), 4, 1);
    }
    const eye = this.monster(g, x, y, { look: r.dir, sc: SC, t, night: true, sub: 1 - show, flap: Math.sin(t * 2.2), curious: near });
    if (eye && show > 0.3) { this.eyes = eye; this.eyesFar = true; this.glowCol = GLOW; }
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

  /** Le faisceau du phare : il part de la lanterne et balaie le ciel ; quand il passe face à nous, la lanterne éblouit. */
  private beam(g: G, x: number, base: number, z: number, t: number, tod: TimeOfDay) {
    if (tod === 'day') return;
    const a = Math.sin(t * 0.8);
    const lx = Math.round(x), ly = base - Math.round(30 * z);
    const L = 170 * z * Math.abs(a);
    const k = tod === 'night' ? 1 : 0.6;
    // il ne passe que dans le ciel : jamais sur la falaise, quel que soit l'endroit d'où on regarde
    g.save();
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(W, 0);
    for (let sx = W - 1; sx >= 0; sx--) g.lineTo(sx, this.tops[sx] ? this.tops[sx] - 2 : HORIZON);
    g.closePath();
    g.clip();
    if (L > 6) {
      const grd = g.createLinearGradient(lx, ly, lx + Math.sign(a) * L, ly);
      grd.addColorStop(0, crgba('#fff2c0', 0.3 * k));
      grd.addColorStop(1, crgba('#fff2c0', 0));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(lx, ly - 1); g.lineTo(lx + Math.sign(a) * L, ly - 12 * z); g.lineTo(lx + Math.sign(a) * L, ly + 7 * z); g.lineTo(lx, ly + 1); g.closePath(); g.fill();
    }
    const face = 1 - Math.abs(a);
    if (face > 0.6) {
      g.globalCompositeOperation = 'lighter';
      const r = 10 * z * face;
      const grd = g.createRadialGradient(lx, ly, 0, lx, ly, r);
      grd.addColorStop(0, crgba('#fff2c0', 0.6 * face * k));
      grd.addColorStop(1, crgba('#fff2c0', 0));
      g.fillStyle = grd; g.fillRect(lx - r, ly - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  /** Les remous : ils vivent, s'élargissent, retombent, et restent posés sur l'eau (ils défilent avec elle). */
  private water(g: G, hidden: (x: number, y: number) => boolean) {
    const dt = this.dt, pl = this.plane;
    for (const f of this.fx) {
      f.life += dt;
      f.u += f.vu * dt; f.w += f.vw * dt;
      if (f.kind === 'ring') f.r += 0.9 * dt;
      if (f.kind === 'drop') { f.h += f.vh * dt; f.vh -= 9.8 * dt; if (f.h < 0) f.life = f.max; }
      f.vu *= 1 - dt * 0.8; f.vw *= 1 - dt * 0.8;
    }
    this.fx = this.fx.filter((f) => f.life < f.max);
    for (const f of this.fx) {
      const p = toScreen(pl, f.u, f.w);
      if (!p || p.y > H + 20 || p.x < -60 || p.x > W + 60) continue;
      const k = 1 - f.life / f.max;
      if (f.kind === 'ring') {
        const rx = f.r * p.s, ry = Math.max(0.6, f.r * p.k);
        if (hidden(p.x, p.y)) continue;
        // un rond en pixels nets : on suit l'ellipse pas à pas
        g.fillStyle = crgba('#ffffff', f.a * k);
        const n = Math.max(12, Math.round((rx + ry) * 2.2));
        let lx = NaN, ly = NaN;
        for (let q = 0; q < n; q++) {
          const ex = Math.round(p.x + Math.cos((q / n) * Math.PI * 2) * rx), ey = Math.round(p.y + Math.sin((q / n) * Math.PI * 2) * ry);
          if (ex === lx && ey === ly) continue;
          lx = ex; ly = ey;
          if (!hidden(ex, ey)) g.fillRect(ex, ey, 1, 1);
        }
      } else if (f.kind === 'foam') {
        if (hidden(p.x, p.y)) continue;
        g.fillStyle = crgba('#ffffff', f.a * k);
        const w = Math.max(1, Math.round(p.s * 0.35 * (1 + f.life * 0.6)));
        g.fillRect(Math.round(p.x - w / 2), Math.round(p.y), w, 1);
      } else {
        g.fillStyle = crgba('#e8f4ff', f.a);
        g.fillRect(Math.round(p.x), Math.round(p.y - f.h * p.s), 1, 1);
      }
    }
  }

  /** Un remous, là où tombe un pixel de l'écran. */
  private spawnAt(kind: Fx['kind'], x: number, y: number, o: Partial<Fx> = {}) {
    if (this.fx.length > 300) this.fx.shift();
    const p = toWater(this.plane, x, y);
    this.fx.push({ kind, u: p.u, w: p.w, vu: 0, vw: 0, h: 0, vh: 0, life: 0, max: kind === 'ring' ? 1.8 : kind === 'foam' ? 2.8 : 2, r: 0.1, a: 0.7, ...o });
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
    if (!night) for (let i = 0; i < 4; i++) { const q = (t * 0.4 + i / 4) % 1; g.fillStyle = crgba('#e8e8ee', 0.6 * (1 - q)); g.fillRect(Math.round(x - 1 - q * 14), Math.round(y - 13 - q * 6), 2 + Math.round(q * 3), 2); }
  }

  /** Des poissons qui sautent hors de l'eau : un arc argenté, des gouttes, un rond dans l'eau. Eux aussi sont posés sur
   *  l'eau (en mètres) : ils restent à leur place quand la barque bouge. */
  private fish(g: G, t: number, hidden: (x: number, y: number) => boolean) {
    const pl = this.plane;
    this.jumps = this.jumps.filter((j) => t - j.t0 < 2 && t >= j.t0);
    if (t >= this.nextJump) {
      this.nextJump = t + 1.2 + Math.random() * 1.8;
      const r = 14 + Math.random() * 70;
      this.jumps.push({ u: pl.at * RW + (Math.random() * 2 - 1) * (CX / (r * Q)) * 0.9, w: pl.dw - (C / r - E), t0: t, dir: Math.random() < 0.5 ? -1 : 1, landed: false });
    }
    for (const j of this.jumps) {
      const p = toScreen(pl, j.u, j.w);
      if (!p) continue;
      const x0 = Math.round(p.x), y0 = Math.round(p.y);
      if (hidden(x0, y0) || y0 > H) continue;
      const s = p.s > 8.5 ? 2 : 1, dir = j.dir, k = t - j.t0, jump = 0.9;
      // il fend l'eau en sortant, et en retombant
      if (k < this.dt * 1.5) this.splash(x0 - dir * 8 * s, y0, -0.04 * s, 0.6);
      if (k >= jump && !j.landed) { j.landed = true; this.splash(x0 + dir * 8 * s, y0, -0.06 * s, 0.7); }
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
        g.fillStyle = crgba('#ffffff', 0.7 * (1 - u));
        for (let q = 0; q < Math.PI * 2; q += 0.3) g.fillRect(Math.round(x0 + dir * 8 * s + Math.cos(q) * rx), Math.round(y0 + Math.sin(q) * ry), 1, 1);
        if (u < 0.25) for (let d = -1; d <= 1; d++) px(g, x0 + dir * 8 * s + d * 2, y0 - 3 + u * 12 - Math.abs(d), '#ffffff');
      }
    }
  }

  /** La nuit, tout au large : le Kraken rôde sous la barque. Le bout de ses tentacules sort de l'eau autour d'elle, l'un
   *  après l'autre, s'enroule et replonge ; l'eau tourne. (E · Défier le Kraken.) */
  private krakenTips(g: G, t: number) {
    const tips: [number, number, number][] = [[-62, 3, 0], [60, 4, 2.4]];
    for (const [dx, dy, ph] of tips) {
      const k = Math.sin(t * 0.45 + ph);
      if (k < 0.08) continue;
      const far = dy < 0 ? 0.7 : 1, side = dx > 0 ? -1 : 1;
      const x0 = CX + dx, y0 = BOAT_Y + 6 + dy;
      // l'eau qui tourne autour de la base
      const ring = (t * 0.8 + ph) % 1;
      g.fillStyle = crgba('#ffffff', 0.4 * (1 - ring) * k);
      for (let q = 0; q < Math.PI * 2; q += 0.35) g.fillRect(Math.round(x0 + Math.cos(q) * (4 + ring * 9) * far), Math.round(y0 + Math.sin(q) * (1 + ring * 2) * far), 1, 1);
      const len = 32 * Math.min(1, k * 1.3) * far;
      // le tentacule : un trait épais et cerné de sombre, la face claire et ses ventouses vers la barque
      const pts: [number, number, number][] = [];
      let x = x0, y = y0;
      for (let s = 0; s <= len; s += 0.5) {
        const u = s / (32 * far);
        const a = -Math.PI / 2 + 0.3 * Math.sin(t * 1.3 - u * 3 + ph) * u + side * 2.8 * u ** 3;
        x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5;
        pts.push([x, y, Math.max(1, Math.round((6 * (1 - u) + 1.2) * far))]);
      }
      for (const [x1, y1, th] of pts) { g.fillStyle = '#12060c'; g.fillRect(Math.round(x1 - th / 2) - 1, Math.round(y1 - th / 2) - 1, th + 2, th + 2); }
      pts.forEach(([x1, y1, th], i) => {
        g.fillStyle = far < 1 ? '#5a2034' : '#8a2e44';
        g.fillRect(Math.round(x1 - th / 2), Math.round(y1 - th / 2), th, th);
        if (th >= 3) { g.fillStyle = '#b84c62'; g.fillRect(Math.round(x1 + side * (th / 2 - 1)), Math.round(y1), 1, 1); }
        if (th >= 3 && i % 8 === 0) { g.fillStyle = '#f0b8c0'; g.fillRect(Math.round(x1 + side * (th / 2 - 1)), Math.round(y1), 1, 1); }
      });
      g.fillStyle = crgba('#ffffff', 0.7);
      for (let i = -2; i <= 2; i++) g.fillRect(Math.round(x0 + i * 2 * far), Math.round(y0 + (i % 2 ? 0 : 1)), 1, 1);
    }
  }

  /** La barque au premier plan, vue d'un peu au-dessus : on voit l'intérieur (les membrures, le banc) et Roré assis
   *  DEDANS, le bordé devant cache ses jambes. Elle flotte : elle suit la hauteur de l'eau sous elle et penche quand
   *  un bout est soulevé avant l'autre, avec un peu de retard (un ressort amorti, jamais d'à-coups). */
  private boat(g: G, sea: Sea, roreKey: string, t: number, tod: TimeOfDay) {
    const shake = sea.bump > 0 ? Math.round(Math.sin(t * 70) * sea.bump * 2) : 0;
    const bx = Math.round(CX + sea.sway * clamp(sea.dist * 5, 0, 1)) + shake;
    const HL = 34, F = this.float, dt = this.dt;
    const wp = toWater(this.plane, bx, BOAT_Y);
    const sw = this.swell;
    const hc = sw.heightAt(wp.u, wp.w, t), hl = sw.heightAt(wp.u - 2, wp.w, t), hr = sw.heightAt(wp.u + 2, wp.w, t);
    F.vy += (14 * (-hc * 9 - F.y) - 4.5 * F.vy) * dt; F.y += F.vy * dt;
    F.vr += (18 * (-(hr - hl) * 8 - F.r) - 5.5 * F.vr) * dt; F.r += F.vr * dt;
    const by = Math.round(BOAT_Y + F.y);
    // un coup de rame la fait s'enfoncer un peu de l'arrière
    const tilt = clamp(F.r + (sea.heading === 0 ? -sea.pulse * sea.facing * 0.5 : 0), -2.5, 2.5);
    const f = sea.facing;
    const ph = sea.stroke * Math.PI * 2;
    const dip = sea.rowing && Math.cos(ph) > 0;
    const swing = sea.rowing ? Math.sin(ph) : 0.25;
    const [, nearSea] = SEA[tod];
    // la barque (boat.ts) : le fond, puis Roré, puis le devant ; son profil : le plat-bord de devant (gy), celui du fond
    // (fy, plus haut : on voit dedans), la quille (ky)
    const bt = paintBoat(HL, f > 0 ? 1 : -1, tilt, 6, tod !== 'day');
    const bdx = bx - bt.ox, bdy = by - bt.oy;
    const gy = (i: number) => bt.gy(i) + bdy, fy = (i: number) => bt.fy(i) + bdy, ky = (i: number) => bt.ky(i) + bdy;
    // l'ombre et le reflet dans l'eau, qui ondulent
    for (let i = -HL - 2; i <= HL + 2; i++) { g.fillStyle = crgba('#081430', 0.3); g.fillRect(bx + i, ky(clamp(i, -HL, HL)) - 1, 1, 3); }
    for (let k = 0; k < 6; k++) { const wob = Math.round(Math.sin(t * 2.6 + k * 1.3) * (1 + k * 0.4)); g.fillStyle = crgba('#8a5530', 0.22 - k * 0.035); g.fillRect(bx - HL + 5 + k * 3 + wob, by + 6 + k * 2, (HL - 5 - k * 3) * 2, 1); }
    // la rame du fond : elle part du tolet, passe derrière la barque, et sa pale plonge plus loin dans l'eau
    const lock = bx + 2;
    const farBlade = { x: lock + f * swing * 9 - 4, y: fy(2) - 10 + (dip ? 3 : 0) };
    {
      const sx = lock, sy = fy(2) - 1, ex = farBlade.x, ey = farBlade.y;
      for (let k = 0; k <= 12; k++) { const u = k / 12; px(g, sx + (ex - sx) * u, sy + (ey - sy) * u, '#b08a60'); }
      rect(g, ex - 2, ey - 1, 4, 2, '#24587e');
    }
    g.drawImage(bt.back, bdx, bdy);
    // Roré, assis sur son banc : il regarde l'île quand il se repose, il se tourne pour ramer
    const dir: Dir = sea.heading > 0 ? 'down' : sea.rowing && sea.heading === 0 ? (f > 0 ? 'right' : 'left') : 'up';
    const pose: Pose = sea.rowing ? 'type' : 'sit';
    g.drawImage(robotSprite(roreKey, pose, dir, sea.rowing ? (Math.sin(ph) > 0 ? 1 : 0) : 0, 'open'), bx - ANCHOR_X, gy(0) + 6 - ANCHOR_Y);
    // le devant de la barque ; ce qui est sous l'eau prend sa couleur, et la ligne d'eau ondule le long de la coque
    g.drawImage(bt.front, bdx, bdy);
    for (let i = -HL; i <= HL; i++) {
      const x = bx + i, bot = ky(i) + 1;
      const wl = by + 2 + Math.round(Math.sin(t * 2.2 + i * 0.25) * 0.6);
      if (wl < bot) { g.fillStyle = crgba(nearSea, 0.5); g.fillRect(x, wl, 1, bot - wl); }
      if (wl < bot && (i + Math.round(t * 6)) % 5 === 0) px(g, x, wl, 'rgba(255,255,255,0.7)');
    }
    // les tolets, et la rame de devant : elle descend vers nous, sa pale plonge devant la barque
    const nearBlade = { x: lock + f * swing * 12 + 6, y: by + 13 + (dip ? 3 : 0) };
    {
      const sx0 = lock, sy0 = gy(2) - 1, ex = nearBlade.x, ey = nearBlade.y;
      // le manche en bois clair, la pale peinte en bleu comme la coque, le bout blanc
      for (let k = 0; k <= 18; k++) { const u = k / 18; rect(g, sx0 + (ex - sx0) * u, sy0 + (ey - sy0) * u, 2, 1, k < 4 ? '#8a5f3e' : '#d8b080'); }
      if (dip) { rect(g, ex - 3, ey - 1, 6, 2, '#2f6f9a'); hline(g, ex - 3, ey - 1, 6, '#4a90c2'); g.fillStyle = crgba(nearSea, 0.6); g.fillRect(Math.round(ex - 3), Math.round(ey + 1), 6, 1); }
      else { rect(g, ex - 3, ey - 1, 6, 3, '#2f6f9a'); hline(g, ex - 3, ey - 1, 6, '#4a90c2'); hline(g, ex - 3, ey + 1, 6, '#f2ede0'); }
    }
    // les remous : un rond à chaque coup de rame, des gouttes quand la pale ressort, l'écume du sillage qui s'ouvre en
    // V derrière la barque, une ride autour de la coque quand elle retombe sur la houle, une gerbe sur les rochers
    const L = this.last;
    // l'eau répond : la pale qui entre, l'étrave qui pousse quand on avance, la coque qui retombe sur la houle
    if (dip && !L.dip) { this.splash(nearBlade.x, nearBlade.y, -0.05, 0.6); this.splash(farBlade.x, by - 4, -0.03, 0.6); }
    if (t - L.bow > 0.15) {
      L.bow = t;
      if (Math.abs(sea.speed) > 0.012) this.splash(bx + Math.sign(sea.speed) * (HL + 2), by + 2, -Math.min(0.05, Math.abs(sea.speed) * 0.4), 1);
      if (F.vy > 3) this.splash(bx, by + 2, -Math.min(0.04, F.vy * 0.004), 2);
    }
    if (sea.bump > 0.95) this.splash(bx + f * 20, by, -0.15, 2);
    if (dip && !L.dip) {
      this.spawnAt('ring', nearBlade.x, nearBlade.y + 1, { r: 0.12, a: 0.8 });
      this.spawnAt('ring', farBlade.x, by - 4, { r: 0.1, a: 0.5, max: 1.3 });
    }
    if (!dip && L.dip) for (let i = 0; i < 5; i++) this.spawnAt('drop', nearBlade.x + (i - 2) * 1.5, nearBlade.y, { h: 0.2, vu: (i - 2) * 0.25, vh: 1.4 + hash(i + t) * 0.8, a: 0.9 });
    L.dip = dip;
    if (t - L.wake > 0.08) {
      if (Math.abs(sea.speed) > 0.012) {
        L.wake = t;
        const sd = -Math.sign(sea.speed);
        this.spawnAt('foam', bx + sd * (HL + 2), by + 3, { vw: 0.55, a: 0.65 });
        this.spawnAt('foam', bx + sd * (HL + 2), by + 3, { vw: -0.55, a: 0.65 });
      } else if (Math.abs(sea.vdist) > 0.006) {
        L.wake = t;
        this.spawnAt('foam', bx - HL - 2, by + 3, { vu: -0.6, a: 0.55 });
        this.spawnAt('foam', bx + HL + 2, by + 3, { vu: 0.6, a: 0.55 });
      }
    }
    if (!sea.rowing && t - L.ring > 2.6 && F.vy > 4) { L.ring = t; this.spawnAt('ring', bx, by + 4, { r: 1.9, a: 0.35, max: 1.6 }); }
    if (sea.bump > 0.95) {
      this.spawnAt('ring', bx + f * 10, by + 2, { r: 0.4, a: 0.9 });
      for (let i = 0; i < 12; i++) this.spawnAt('drop', bx + (i - 6) * 3, by + 2, { h: 0.3, vu: (i - 6) * 0.25, vh: 2.5 + hash(i + t) * 2, a: 1 });
    }
    sea.screen = { x: bx, y: by + 6 };
  }

  /** Le soir et la nuit : la falaise s'assombrit (le ciel et la mer gardent leurs couleurs), le pavillon s'allume. */
  private shade(g: G, tod: TimeOfDay, pav: { x: number; front: number }, pavTop: number, v: View) {
    const l = this.lg;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = '#ffffff';
    l.fillRect(0, 0, W, H);
    l.fillStyle = AMBIENT[tod];
    for (let sx = 0; sx < W; sx++) if (this.tops[sx]) l.fillRect(sx, this.tops[sx] - 2, 1, v.base - this.tops[sx] + 3);
    l.globalCompositeOperation = 'lighter';
    const add = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = l.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, crgba(color, a));
      grd.addColorStop(0.55, crgba(color, a * 0.45));
      grd.addColorStop(1, crgba(color, 0));
      l.fillStyle = grd;
      l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    if (pav.front > 0.45) add(pav.x, pavTop - 6 * v.z, 16 * v.z, '#ffcf8a', 0.9);
    if (this.eyes) add(this.eyes.x, this.eyes.y, 8, this.glowCol, 0.8);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  /** La lanterne de la barque éclaire l'eau autour, et les yeux du monstre percent la nuit. */
  private glows(g: G, sea: Sea, tod: TimeOfDay) {
    g.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, crgba(color, a));
      grd.addColorStop(1, crgba(color, 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(sea.screen.x - sea.facing * 26, sea.screen.y - 16, 30, '#ffb860', tod === 'night' ? 0.28 : 0.16);
    if (this.eyes) glow(this.eyes.x, this.eyes.y, this.eyesFar ? 6 : 7, this.glowCol, (tod === 'night' ? 0.45 : 0.2) * (this.eyesFar ? 0.8 : 1));
    g.globalCompositeOperation = 'source-over';
  }

  /** La mini-carte : l'île vue de dessus, le phare, la grotte, les coins de pêche, et la barque (plus ou moins près). */
  private minimap(g: G, sea: Sea) {
    const cx = W - 26, cy = 26, R = 18;
    g.fillStyle = 'rgba(10,14,30,0.65)'; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(70,140,190,0.6)'; g.beginPath(); g.arc(cx, cy, R + 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fb86a'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
    const at = (a: number, r: number) => ({ x: cx + Math.sin(a) * r, y: cy + Math.cos(a) * r });
    const lh = at(LANDMARKS.lighthouse, R + 1);
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
