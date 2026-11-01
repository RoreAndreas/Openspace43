// Les géants de la mer ne se pêchent pas à la ligne.
// - Le Kraken (le rouge, l'abyssal, le calamar géant) : une rencontre-boss. Ses tentacules énormes sortent de l'eau autour de
//   la barque, l'un après l'autre (à gauche, derrière, à droite) ; ← ↑ → pour frapper celui qui se dresse avant qu'il ne
//   s'abatte sur la barque. Trois coups encaissés et c'est fini ; assez de coups donnés et il repart au fond.
// - Nessie : on l'apprivoise. Elle sort au loin, timide ; quand elle regarde la barque, Espace lui lance une sardine. Elle
//   l'attrape et s'approche ; si elle ne regardait pas, elle prend peur et plonge. En confiance, elle vient jusqu'à Roré.
import { pixelText, textWidth } from '../../engine/font.ts';
import { paintNessie } from '../../engine/nessie.ts';
import { outline } from '../../engine/pixels.ts';

const W = 256, H = 144, SURFACE = 76;
type G = CanvasRenderingContext2D;
export type KrakenKind = 'kraken' | 'abyssal' | 'geant';
export type GiantEvent = 'boil' | 'rise' | 'hurt' | 'hit' | 'whiff' | 'win' | 'lose' | 'toss' | 'catch' | 'startle' | 'trust';

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; return [c, g] as const; };
const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
interface Bit { x: number; y: number; vx: number; vy: number; life: number; col: string }

// ─────────────────────────────── le Kraken ───────────────────────────────

type Lane = 'left' | 'back' | 'right';
const LANES: Lane[] = ['left', 'back', 'right'];
type TentPhase = 'boil' | 'rise' | 'poise' | 'slam' | 'hurt' | 'sink';
interface Tent { lane: Lane; phase: TentPhase; t0: number; dur: number; seed: number; len: number }

const STYLE: Record<KrakenKind, { name: string; body: string; dark: string; inner: string; hi: string; sucker: string; core: string; eye: string; hp: number; poise: number; club: boolean; glow: boolean }> = {
  kraken: { name: 'LE KRAKEN ROUGE', body: '#8e2e40', dark: '#5a1828', inner: '#c0566a', hi: '#e07a80', sucker: '#f2c4b4', core: '#8a3040', eye: '#ffd45a', hp: 8, poise: 1.05, club: false, glow: false },
  abyssal: { name: 'LE KRAKEN ABYSSAL', body: '#3a2160', dark: '#1e1236', inner: '#5a3488', hi: '#8a5ab8', sucker: '#7ff0ff', core: '#1e3a5a', eye: '#9ff8ff', hp: 9, poise: 0.9, club: false, glow: true },
  geant: { name: 'LE CALAMAR GEANT', body: '#b4482e', dark: '#6a2418', inner: '#dc6c46', hi: '#f8a070', sucker: '#ffd8b8', core: '#8a3a28', eye: '#ffe2a0', hp: 7, poise: 0.85, club: true, glow: false },
};

/** Les touches : les flèches, et ZQSD / WASD. */
const KEY_LANE: Record<string, Lane> = { arrowleft: 'left', q: 'left', a: 'left', arrowup: 'back', z: 'back', w: 'back', arrowright: 'right', d: 'right' };

export class KrakenBoss {
  readonly kind: KrakenKind;
  readonly maxHp: number;
  hp: number;
  lives = 3;
  t = 0;
  tents: Tent[] = [];
  next = 1.4;
  over: null | 'win' | 'lose' = null;
  overAt = 0;
  swing = { at: -9, lane: 'right' as Lane, ok: false };
  hurtAt = -9;
  eyeAt = 3;
  bits: Bit[] = [];
  rings: { x: number; t0: number; w: number }[] = [];
  private events: GiantEvent[] = [];
  private can = canvas(W, H);
  private seed = 0;

  constructor(kind: KrakenKind) { this.kind = kind; this.maxHp = STYLE[kind].hp; this.hp = this.maxHp; }
  get style() { return STYLE[this.kind]; }

  /** où sort le tentacule de chaque couloir, selon la place de la barque (BX : son bord gauche) */
  laneX(lane: Lane, BX: number) { return lane === 'left' ? BX - 30 : lane === 'back' ? BX + 36 : BX + 88; }

  press(key: string) {
    const lane = KEY_LANE[key];
    if (!lane || this.over || this.t - this.swing.at < 0.22) return;
    // on frappe le tentacule dressé de ce côté (ou qui finit de sortir) ; sinon, Roré frappe dans le vide
    const tent = this.tents.find((x) => x.lane === lane && (x.phase === 'poise' || (x.phase === 'rise' && this.t - x.t0 > x.dur * 0.5)));
    this.swing = { at: this.t, lane, ok: !!tent };
    if (!tent) { this.events.push('whiff'); return; }
    this.go(tent, 'hurt', 0.55);
    this.hp--;
    this.events.push('hurt');
    if (this.hp <= 0) this.finish('win');
  }

  update(dt: number): GiantEvent[] {
    this.t += dt;
    const t = this.t;
    const progress = 1 - this.hp / this.maxHp;
    // un nouveau tentacule, de plus en plus souvent ; deux à la fois quand il enrage
    if (!this.over && t > this.next) {
      const busy = new Set(this.tents.filter((x) => x.phase !== 'sink' && x.phase !== 'hurt').map((x) => x.lane));
      const max = progress >= 0.5 ? 2 : 1;
      const free = LANES.filter((l) => !busy.has(l));
      if (busy.size < max && free.length) {
        const lane = free[Math.floor(Math.random() * free.length)];
        this.tents.push({ lane, phase: 'boil', t0: t, dur: 0.95 - progress * 0.3, seed: this.seed++ * 1.7, len: lane === 'back' ? 96 : 80 + Math.random() * 10 });
        this.events.push('boil');
      }
      this.next = t + 1.7 - progress * 0.7 + Math.random() * 0.5;
    }
    for (const x of this.tents) {
      if (t - x.t0 < x.dur) continue;
      if (x.phase === 'boil') { this.go(x, 'rise', 0.45); this.events.push('rise'); this.spray(x, 14); }
      else if (x.phase === 'rise') this.go(x, 'poise', this.style.poise * (1 - progress * 0.3));
      else if (x.phase === 'poise') this.go(x, 'slam', 0.32);
      else if (x.phase === 'slam') {
        // il s'abat sur la barque
        this.lives--;
        this.hurtAt = t;
        this.events.push('hit');
        this.spray(x, 22);
        this.go(x, 'sink', 0.6);
        if (this.lives <= 0) this.finish('lose');
      } else x.dur = -1;
    }
    this.tents = this.tents.filter((x) => x.dur >= 0);
    if (t > this.eyeAt) this.eyeAt = t + 4 + Math.random() * 3;
    for (const b of this.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt; b.life -= dt; }
    this.bits = this.bits.filter((b) => b.life > 0 && b.y < SURFACE + 3);
    this.rings = this.rings.filter((r) => t - r.t0 < 1.4);
    const ev = this.events;
    this.events = [];
    return ev;
  }

  private go(x: Tent, phase: TentPhase, dur: number) { x.phase = phase; x.t0 = this.t; x.dur = dur; }
  private finish(how: 'win' | 'lose') {
    this.over = how;
    this.overAt = this.t;
    for (const x of this.tents) if (x.phase !== 'hurt') this.go(x, 'sink', 0.8);
    this.events.push(how);
  }
  private spray(x: Tent, n: number) {
    const bx = this.lastX[x.lane];
    for (let i = 0; i < n; i++) this.bits.push({ x: bx + (Math.random() - 0.5) * 12, y: SURFACE - 1, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70, life: 1, col: Math.random() < 0.7 ? '#ffffff' : '#bfe6ff' });
    this.rings.push({ x: bx, t0: this.t, w: 2 });
  }
  private lastX: Record<Lane, number> = { left: 60, back: 120, right: 180 };

  /** Sous la barque : l'ombre immense du Kraken, son œil qui s'ouvre parfois dans le noir ; l'eau qui bouillonne. */
  drawUnder(g: G, BX: number) {
    const t = this.t, st = this.style;
    for (const l of LANES) this.lastX[l] = this.laneX(l, BX);
    const sink = this.over ? smooth((t - this.overAt) / 2.5) : 0;
    const cx = BX + 40 + Math.sin(t * 0.3) * 10, cy = SURFACE + 36 + sink * 30;
    g.fillStyle = `rgba(4,6,18,${0.42 * (1 - sink)})`;
    g.beginPath(); g.ellipse(cx, cy, st.club ? 96 : 76, 20, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(4,6,18,${0.3 * (1 - sink)})`;
    g.beginPath(); g.ellipse(cx, cy - 6, st.club ? 70 : 54, 12, 0, 0, Math.PI * 2); g.fill();
    // l'œil, sous l'eau, qui s'ouvre et regarde la barque (et une dernière fois quand il s'en va)
    const open = this.over === 'win' ? Math.min(1, (t - this.overAt) * 2) * (1 - sink) : Math.max(0, 1 - Math.abs(t - (this.eyeAt - 2)) / 0.7);
    if (open > 0.05) {
      const ex = Math.round(cx + 22), ey = Math.round(cy - 6), h = Math.max(1, Math.round(7 * open));
      // un œil immense en amande : la paupière, l'iris, la pupille fendue, un reflet
      for (let dy = -Math.ceil(h / 2) - 1; dy <= Math.ceil(h / 2) + 1; dy++) { const w = Math.round(10 * Math.sqrt(Math.max(0, 1 - (dy / (h / 2 + 1.5)) ** 2))); g.fillStyle = 'rgba(10,6,16,0.92)'; g.fillRect(ex - w - 1, ey + dy, w * 2 + 3, 1); }
      for (let dy = -Math.floor(h / 2); dy <= Math.floor(h / 2); dy++) { const w = Math.round(9 * Math.sqrt(Math.max(0, 1 - (dy / (h / 2 + 0.6)) ** 2))); g.fillStyle = st.eye; g.fillRect(ex - w, ey + dy, w * 2 + 1, 1); }
      g.fillStyle = '#15121d'; g.fillRect(ex - 6, ey - (h > 2 ? 1 : 0), 13, h > 2 ? 2 : 1);
      if (h > 3) { g.fillStyle = '#ffffff'; g.fillRect(ex - 4, ey - 2, 2, 1); }
      if (st.glow) { g.fillStyle = 'rgba(159,248,255,0.25)'; g.fillRect(ex - 8, ey - h, 17, h * 2); }
    }
    // l'eau qui bouillonne là où un tentacule va sortir
    for (const x of this.tents) if (x.phase === 'boil') {
      const lx = this.laneX(x.lane, BX), k = (t - x.t0) / x.dur;
      g.fillStyle = `rgba(4,6,18,${0.5 * k})`;
      g.beginPath(); g.ellipse(lx, SURFACE + 10, 6 + k * 6, 4 + k * 3, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 5; i++) { const q = (t * 2.2 + i / 5) % 1; g.fillStyle = 'rgba(220,240,255,0.8)'; g.fillRect(Math.round(lx - 8 + i * 4 + Math.sin(t * 5 + i) * 2), Math.round(SURFACE + 14 - q * 14), 1, 1); }
    }
  }

  /** La surface : les ronds, l'écume à la base des tentacules. */
  drawSurface(g: G, BX: number) {
    const t = this.t;
    for (const rg of this.rings) {
      const k = (t - rg.t0) / 1.4, rx = (5 + k * 20) * rg.w, ry = rx * 0.22;
      g.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      for (let q = 0; q < Math.PI * 2; q += 0.2) g.fillRect(Math.round(rg.x + Math.cos(q) * rx), Math.round(SURFACE + 1 + Math.sin(q) * ry), 1, 1);
    }
    for (const x of this.tents) if (x.phase === 'boil') {
      const lx = this.laneX(x.lane, BX), k = (t * 1.6) % 1;
      g.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      for (let q = 0; q < Math.PI * 2; q += 0.3) g.fillRect(Math.round(lx + Math.cos(q) * (3 + k * 10)), Math.round(SURFACE + 1 + Math.sin(q) * (1 + k * 2)), 1, 1);
    }
  }

  /** Les tentacules derrière la barque (plus loin : plus sombres), puis devant. */
  drawBack(g: G, BX: number) { for (const x of this.tents) if (x.lane === 'back') this.drawTent(g, x, BX); }
  drawFront(g: G, BX: number, roreX: number, roreY: number) {
    const t = this.t;
    for (const x of this.tents) if (x.lane !== 'back') this.drawTent(g, x, BX);
    // le coup de rame de Roré : un arc blanc vers le couloir
    const sk = (t - this.swing.at) / 0.22;
    if (sk >= 0 && sk < 1) {
      const lx = this.laneX(this.swing.lane, BX), ty = SURFACE - 34;
      g.fillStyle = this.swing.ok ? `rgba(255,255,255,${1 - sk})` : `rgba(180,190,210,${0.7 * (1 - sk)})`;
      for (let i = 0; i <= 12; i++) {
        const u = i / 12, a = sk * 0.9 + u * 0.6;
        const x0 = roreX + (lx - roreX) * u, y0 = roreY + (ty - roreY) * u - Math.sin(u * Math.PI) * 14 * (1 - a * 0.3);
        g.fillRect(Math.round(x0), Math.round(y0), 2, 2);
      }
    }
    for (const b of this.bits) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
  }

  /** En haut de l'écran : son nom et sa vie ; tes vies (des bouées) ; au-dessus de chaque tentacule, la touche à presser. */
  drawHud(g: G, BX: number) {
    const t = this.t, st = this.style;
    g.save(); g.scale(2, 2);
    pixelText(g, st.name, Math.round((W / 2 - textWidth(st.name)) / 2), 2, '#ffd166');
    g.restore();
    const bw = 120, bx = (W - bw) / 2, by = 18;
    g.fillStyle = '#15121d'; g.fillRect(bx - 2, by - 2, bw + 4, 8);
    g.fillStyle = '#4a2a30'; g.fillRect(bx, by, bw, 4);
    g.fillStyle = '#e5484d'; g.fillRect(bx, by, Math.round(bw * Math.max(0, this.hp) / this.maxHp), 4);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(bx, by, Math.round(bw * Math.max(0, this.hp) / this.maxHp), 1);
    // les bouées : tes vies
    for (let i = 0; i < 3; i++) {
      const x = 8 + i * 11, y = 8, on = i < this.lives;
      g.fillStyle = on ? '#ff5a4a' : '#3a2a30'; g.fillRect(x, y, 8, 8);
      g.fillStyle = on ? '#ffffff' : '#4a3a40'; g.fillRect(x, y + 3, 8, 2); g.fillRect(x + 3, y, 2, 8);
      g.fillStyle = '#15121d'; g.fillRect(x + 3, y + 3, 2, 2);
    }
    for (const x of this.tents) {
      if (x.phase !== 'boil' && x.phase !== 'rise' && x.phase !== 'poise') continue;
      const lx = Math.round(this.laneX(x.lane, BX)), y = 30;
      const hot = x.phase === 'poise' || x.phase === 'rise';
      const col = hot ? (Math.floor(t * 10) % 2 ? '#ffd166' : '#ffffff') : '#8a8698';
      g.fillStyle = '#15121d'; g.fillRect(lx - 7, y - 1, 15, 13);
      g.fillStyle = hot ? '#4a4458' : '#2a2636'; g.fillRect(lx - 6, y, 13, 11);
      arrow(g, lx, y + 5, x.lane, col);
    }
    if (!this.over && t < 3.5) {
      const tip = 'FRAPPE LE TENTACULE QUI SE DRESSE';
      pixelText(g, tip, Math.round((W - textWidth(tip)) / 2), H - 12, '#ffffff');
    }
  }

  /** Un tentacule énorme : il sort de l'eau, se dresse en ondulant lentement, le bout enroulé ; il se penche vers la
   *  barque, puis s'abat ; touché, il blanchit et replonge. La face claire, vers nous, porte des rangées de ventouses. */
  private drawTent(g: G, x: Tent, BX: number) {
    const t = this.t, st = this.style;
    const lx = this.laneX(x.lane, BX);
    const k = Math.min(1, (t - x.t0) / Math.max(0.01, x.dur));
    let h = 0, lean = 0, flash = false;
    // vers la barque : le couloir de gauche penche à droite, celui de droite à gauche ; derrière, il se penche en avant
    const side = x.lane === 'left' ? 1 : x.lane === 'right' ? -1 : 0.5, sg = side > 0 ? 1 : -1;
    if (x.phase === 'boil') return;
    if (x.phase === 'rise') h = smooth(k) * 1.05;
    else if (x.phase === 'poise') { h = 1 + Math.sin(k * Math.PI) * 0.03; lean = 0.25 * k + Math.sin(t * 2 + x.seed) * 0.06; }
    else if (x.phase === 'slam') { h = 1; lean = 0.3 + Math.pow(k, 1.6) * 1.9; }
    else if (x.phase === 'hurt') { h = 1 - smooth(k) * 1.05; lean = -0.35 * (1 - k); flash = k < 0.18; }
    else { h = (1 - smooth(k)) * (this.over === 'win' ? 1 : 0.9); lean = this.over ? 0 : 1.6 * (1 - k); }
    if (h <= 0.02) return;
    const len = x.len * h * (x.lane === 'back' ? 0.85 : 1);
    const [c, cg] = this.can;
    cg.clearRect(0, 0, W, H);
    // l'épine : une onde lente qui monte de la base au bout, le bout qui s'enroule (une massue pour le calamar)
    const pts: { x: number; y: number; a: number; th: number; u: number }[] = [];
    let px = lx, py = SURFACE + 6;
    const curl = (st.club ? 0.8 : 2.8 + 0.7 * Math.sin(t * 1.1 + x.seed)) * (x.phase === 'slam' ? 0.5 : 1);
    const step = 0.5, full = x.len * (x.lane === 'back' ? 0.85 : 1);
    for (let s = 0; s <= len; s += step) {
      const u = s / full;
      const a = -Math.PI / 2 + side * (lean * u * 1.3 + 0.12) + 0.32 * Math.sin(t * 1.5 - u * 3.2 + x.seed) * u + side * curl * Math.pow(u, 3) * (x.phase === 'hurt' ? Math.sin(t * 30) : 1);
      px += Math.cos(a) * step; py += Math.sin(a) * step;
      let th = 15 * Math.pow(1 - u, 0.8) + 1.4;
      if (st.club && u > 0.72) th = Math.max(th, 1.4 + 5.5 * Math.sin(Math.PI * Math.min(1, (u - 0.72) / 0.26)));
      pts.push({ x: px, y: py, a, th, u });
    }
    // le corps, puis la face claire (vers l'intérieur de la courbe) et ses ventouses, puis le liseré de lumière
    for (const q of pts) disc(cg, q.x, q.y, q.th / 2, st.body);
    for (const q of pts) {
      const nx = -Math.sin(q.a) * sg, ny = Math.cos(q.a) * sg;
      disc(cg, q.x + nx * q.th * 0.22, q.y + ny * q.th * 0.22, q.th * 0.3, st.inner);
    }
    let last = -1;
    for (const q of pts) {
      const n = Math.floor((q.u * full) / 4.2);
      if (n === last || q.th < 3 || q.u < 0.04) continue;
      last = n;
      const nx = -Math.sin(q.a) * sg, ny = Math.cos(q.a) * sg;
      const sx = Math.round(q.x + nx * q.th * 0.3), sy = Math.round(q.y + ny * q.th * 0.3);
      const pulse = st.glow ? 0.5 + 0.5 * Math.sin(t * 4 - q.u * 8) : 1;
      if (q.th > 6) { cg.fillStyle = st.glow ? mixHex(st.core, st.sucker, pulse) : st.sucker; cg.fillRect(sx - 1, sy - 1, 3, 3); cg.fillStyle = st.core; cg.fillRect(sx, sy, 1, 1); }
      else { cg.fillStyle = st.glow ? mixHex(st.core, st.sucker, pulse) : st.sucker; cg.fillRect(sx, sy, 1, 1); }
    }
    for (const q of pts) {
      const nx = Math.sin(q.a) * sg, ny = -Math.cos(q.a) * sg;
      cg.fillStyle = st.dark; cg.fillRect(Math.round(q.x + nx * (q.th / 2 - 1)), Math.round(q.y + ny * (q.th / 2 - 1)), 1, 1);
      if (q.th > 4 && q.u > 0.05) { cg.fillStyle = st.hi; cg.fillRect(Math.round(q.x - nx * (q.th / 2 - 1.5)), Math.round(q.y - ny * (q.th / 2 - 1.5)), 1, 1); }
    }
    if (flash) { cg.globalCompositeOperation = 'source-atop'; cg.fillStyle = '#ffffff'; cg.fillRect(0, 0, W, H); cg.globalCompositeOperation = 'source-over'; }
    // ce qui est sous l'eau ne se voit pas (juste une ombre)
    cg.clearRect(0, SURFACE + 2, W, H);
    outline(c, '#0a0612');
    if (x.lane === 'back') { cg.globalCompositeOperation = 'source-atop'; cg.fillStyle = 'rgba(10,16,40,0.32)'; cg.fillRect(0, 0, W, H); cg.globalCompositeOperation = 'source-over'; }
    g.drawImage(c, 0, 0);
    // l'écume autour de la base
    const fk = (t * 3) % 1;
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = -3; i <= 3; i++) g.fillRect(Math.round(lx + i * 2.5 + Math.sin(t * 6 + i) * 1), SURFACE + (i % 2 ? 0 : 1), 2, 1);
    g.fillStyle = `rgba(255,255,255,${0.5 * (1 - fk)})`;
    g.fillRect(Math.round(lx - 9 - fk * 4), SURFACE + 2, Math.round(18 + fk * 8), 1);
  }
}

function disc(g: G, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  const R = Math.max(0.5, r);
  for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) {
    const w = Math.sqrt(Math.max(0, R * R - dy * dy));
    if (w <= 0 && R > 1) continue;
    g.fillRect(Math.round(x - w), Math.round(y + dy), Math.max(1, Math.round(w * 2)), 1);
  }
}
const mixHex = (a: string, b: string, k: number) => {
  const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
/** une flèche en pixels, centrée en (x, y) */
function arrow(g: G, x: number, y: number, lane: Lane, col: string) {
  g.fillStyle = col;
  if (lane === 'back') { for (let i = 0; i < 4; i++) g.fillRect(x - i, y - 2 + i, i * 2 + 1, 1); g.fillRect(x - 1, y + 2, 3, 3); }
  else { const d = lane === 'left' ? -1 : 1; for (let i = 0; i < 4; i++) g.fillRect(x + d * (2 - i), y - i, 1, i * 2 + 1); g.fillRect(lane === 'left' ? x + 2 : x - 4, y - 1, 3, 3); }
}

// ─────────────────────────────── Nessie ───────────────────────────────

type NessPhase = 'under' | 'rise' | 'away' | 'wake' | 'look' | 'track' | 'snap' | 'gulp' | 'dive' | 'startle' | 'final' | 'leave';

/** Une sardine en vol : elle tourne sur elle-même (quatre poses). */
function sardine(g: G, x: number, y: number, f: number) {
  const X = Math.round(x), Y = Math.round(y);
  const p = (dx: number, dy: number, col: string) => { g.fillStyle = col; g.fillRect(X + dx, Y + dy, 1, 1); };
  const [back, body, belly, fin] = ['#4f6a84', '#b8cadc', '#eef4fa', '#6f8aa4'];
  if (f === 0 || f === 2) {
    const d = f === 0 ? 1 : -1;
    for (let i = -3; i <= 2; i++) { p(i * d, -1, back); p(i * d, 0, body); if (i > -3 && i < 2) p(i * d, 1, belly); }
    p(-4 * d, -2, fin); p(-4 * d, 1, fin); p(-4 * d, -1, fin); p(-4 * d, 0, fin);
    p(2 * d, -1, '#15121d'); p(1 * d, 0, '#ffffff');
  } else {
    const d = f === 1 ? 1 : -1;
    for (let i = -2; i <= 2; i++) { p(i * d, i, back); p(i * d + 1, i, body); p(i * d + 1, i + 1, belly); }
    p(-3 * d, -3, fin); p(-3 * d + 1, -3, fin); p(-3 * d, -2, fin);
    p(2 * d + 1, 2, '#15121d');
  }
}

/** Un ressort amorti : la valeur suit sa cible en douceur, sans à-coups (et sans osciller). */
class Spring {
  v = 0; vel = 0;
  constructor(v = 0) { this.v = v; }
  to(target: number, dt: number, k = 70) { const d = 2 * Math.sqrt(k); this.vel += (k * (target - this.v) - d * this.vel) * dt; this.v += this.vel * dt; return this.v; }
}

export class NessieMeet {
  t = 0;
  trust = 0;
  scares = 0;
  phase: NessPhase = 'under';
  pt = 0;
  dur = 0.6;
  x = 214;
  over: null | 'win' | 'lose' = null;
  overAt = 0;
  /** distrait : il regarde le ciel (la lune, les mouettes) ou il somnole */
  mood: 'sky' | 'doze' = 'sky';
  /** la sardine en vol : d'où, où elle tombe (ou la bouche qu'elle vise), si Nessie l'attend */
  fish: null | { t0: number; x0: number; y0: number; x1: number; y1: number; good: boolean } = null;
  hearts: { x: number; y: number; t0: number }[] = [];
  bits: Bit[] = [];
  rings: { x: number; t0: number; w: number }[] = [];
  readonly night: boolean;
  private events: GiantEvent[] = [];
  /** Nessie est dessiné au pixel près, à sa taille (moyenne), dans ce canevas ; sa ligne d'eau en (AX, AY) */
  private can = canvas(170, 86);
  private mouth = { x: 214, y: SURFACE - 30 };
  private head = { x: 214, y: SURFACE - 40 };
  private target = 214;
  // ce qui bouge en douceur : le cou (curieux, tendu ou en arrière), la gueule, la plongée, la tête qui suit
  private sCur = new Spring(-0.3);
  private sOpen = new Spring(0);
  private sSub = new Spring(1);
  private sX = new Spring(214);
  static readonly GOAL = 5;
  static readonly FLIGHT = 0.75;
  static readonly SIZE = 1.5;
  static readonly AX = 85;
  static readonly AY = 80;

  constructor(night: boolean) { this.night = night; }

  /** sa place selon sa confiance : loin au début, de plus en plus près ; à la fin, contre la barque */
  private spot() { return Math.round(214 - this.trust * 20); }
  private set(p: NessPhase, dur: number) {
    if (p === 'rise' || p === 'dive') this.rings.push({ x: this.x - 8, t0: this.t, w: 1.5 });
    this.phase = p; this.pt = 0; this.dur = dur;
  }

  /** Espace : Roré lance une sardine (une à la fois). S'il te regarde, il la guette ; sinon, elle tombe à l'eau devant lui. */
  toss(roreX: number, roreY: number) {
    if (this.over || this.fish || !['away', 'wake', 'look'].includes(this.phase)) return;
    const good = this.phase === 'look';
    this.fish = { t0: this.t, x0: roreX, y0: roreY, x1: good ? this.mouth.x : this.head.x - 10, y1: good ? this.mouth.y : SURFACE, good };
    if (good) this.set('track', NessieMeet.FLIGHT);
    this.events.push('toss');
  }

  update(dt: number): GiantEvent[] {
    this.t += dt;
    this.pt += dt;
    const t = this.t;
    // la sardine : s'il la guette, elle file droit dans sa gueule (qui bouge) ; sinon, plouf devant lui
    const f = this.fish;
    if (f) {
      if (f.good) { f.x1 = this.mouth.x; f.y1 = this.mouth.y; }
      if (t - f.t0 >= NessieMeet.FLIGHT) {
        this.fish = null;
        if (f.good) {
          // il referme la gueule dessus : clac
          this.trust++;
          this.events.push('catch');
          for (let i = 0; i < 6; i++) this.bits.push({ x: this.mouth.x, y: this.mouth.y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, life: 0.5, col: '#ffffff' });
          this.set('snap', 0.18);
        } else {
          this.splash(f.x1, 12);
          this.scares++;
          this.trust = Math.max(0, this.trust - 1);
          this.events.push('startle');
          this.set('startle', 0.5);
        }
      }
    }
    if (!this.over && this.pt >= this.dur) this.next();
    // les ressorts : la pose suit ce que fait Nessie, en douceur
    const k = Math.min(1, this.pt / Math.max(0.01, this.dur)), ph = this.phase;
    const cur = ph === 'away' ? (this.mood === 'sky' ? -0.55 : -0.15) : ph === 'wake' || ph === 'look' ? 1 : ph === 'track' ? 1.7 : ph === 'snap' ? 1.5
      : ph === 'gulp' ? 0.9 : ph === 'startle' ? -0.8 : ph === 'final' ? 1.8 : 0.3;
    this.sCur.to(cur, dt, ph === 'snap' || ph === 'startle' ? 160 : 40);
    const u = f ? Math.min(1, (t - f.t0) / NessieMeet.FLIGHT) : 0;
    this.sOpen.to(ph === 'track' ? smooth((u - 0.3) / 0.45) : 0, dt, ph === 'snap' ? 400 : 90);
    this.sSub.to(ph === 'under' || ph === 'leave' ? 1.25 : ph === 'dive' ? 1.25 * smooth(k * 1.4) : 0, dt, 30);
    if (ph === 'under') this.x = this.target;
    this.sX.to(this.x, dt, 20);
    if (this.over === 'win' && Math.random() < dt * 2.5) this.hearts.push({ x: this.head.x + (Math.random() - 0.5) * 10, y: this.head.y - 6, t0: t });
    if (ph === 'gulp' && this.pt < dt * 1.5) for (let i = 0; i < 3; i++) this.hearts.push({ x: this.head.x + (i - 1) * 6, y: this.head.y - 8, t0: t + i * 0.15 });
    this.hearts = this.hearts.filter((h) => t - h.t0 < 1.6);
    for (const b of this.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt; b.life -= dt; }
    this.bits = this.bits.filter((b) => b.life > 0 && b.y < SURFACE + 3);
    this.rings = this.rings.filter((r) => t - r.t0 < 1.4);
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /** la suite : il sort, rêvasse (le ciel, ou il somnole), revient à toi, te regarde… (avec un peu de hasard : pas d'horloge) */
  private next() {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    switch (this.phase) {
      case 'under':
        if (this.scares >= 3) { this.over = 'lose'; this.overAt = this.t; this.events.push('lose'); this.phase = 'leave'; return; }
        this.x = this.target;
        this.set('rise', 1.2);
        return;
      case 'rise':
        if (this.trust >= NessieMeet.GOAL) { this.set('final', 2.8); for (let i = 0; i < 6; i++) this.hearts.push({ x: this.head.x + (i - 3) * 4, y: this.head.y - 8, t0: this.t + 0.8 + i * 0.18 }); return; }
        this.mood = Math.random() < 0.6 ? 'sky' : 'doze';
        this.set('away', rnd(1.2, 3));
        return;
      case 'away': this.set('wake', rnd(0.3, 0.5)); return;
      case 'wake': this.set('look', rnd(0.9, 1.6) - this.trust * 0.06); return;
      case 'look': this.mood = Math.random() < 0.6 ? 'sky' : 'doze'; this.set('away', rnd(1.2, 3.2)); return;
      case 'snap': this.set('gulp', 1.1); return;
      case 'gulp': this.target = this.trust >= NessieMeet.GOAL ? 104 : this.spot(); this.set('dive', 0.7); return;
      case 'startle': this.target = Math.min(214, this.spot() + 16); this.set('dive', 0.6); return;
      case 'dive': this.set('under', 1); return;
      case 'final': this.over = 'win'; this.overAt = this.t; this.events.push('win'); return;
      default: return;
    }
  }

  private splash(x: number, n: number) {
    for (let i = 0; i < n; i++) this.bits.push({ x, y: SURFACE - 1, vx: (Math.random() - 0.5) * 50, vy: -25 - Math.random() * 45, life: 0.8, col: '#ffffff' });
    this.rings.push({ x, t0: this.t, w: 1 });
  }

  /** Nessie, toujours tourné vers Roré : il rêvasse (il regarde le ciel, ou il somnole), revient à toi (un cœur : il te
   *  regarde) ; il guette la sardine, le cou tendu, ouvre grand la gueule, la happe, l'avale (la bouchée descend le long
   *  du cou, il ferme les yeux de plaisir) ; puis il replonge et ressort plus près. S'il ne regardait pas : plouf, il
   *  sursaute et file sous l'eau. Toutes ses poses suivent des ressorts : rien ne bouge d'un bloc. */
  draw(g: G) {
    const t = this.t, ph = this.phase;
    if (ph === 'leave' && this.sSub.v > 1.2) return;
    const curious = this.sCur.v;
    const [c, cg] = this.can;
    cg.clearRect(0, 0, c.width, c.height);
    const eye = paintNessie(cg, NessieMeet.AX, NessieMeet.AY, -1, t, {
      night: this.night, sub: Math.max(0, this.sSub.v), flap: Math.sin(t * 1.8), curious, open: Math.max(0, this.sOpen.v),
      happy: ph === 'gulp' || (ph === 'final' && this.pt > 0.9) || this.over === 'win',
      shut: ph === 'away' && this.mood === 'doze', up: ph === 'away' && this.mood === 'sky',
      gulp: ph === 'gulp' ? Math.min(1, this.pt / this.dur) : undefined,
      // la tête suit le cou avec un peu de retard
      nod: Math.max(-2, Math.min(2, -this.sCur.vel * 0.35)),
      size: NessieMeet.SIZE,
    });
    outline(c, this.night ? '#070a18' : '#10202e', { skipBottom: true });
    const dx = Math.round(this.sX.v) - NessieMeet.AX, dy = SURFACE + 1 - NessieMeet.AY;
    g.drawImage(c, dx, dy);
    this.mouth = { x: dx + eye.mx, y: dy + eye.my };
    this.head = { x: dx + eye.x, y: dy + eye.y };
    // il te regarde : un petit cœur au-dessus de sa tête ; il somnole : des « z » ; il a peur : un « ! »
    if (ph === 'look' && this.pt > 0.2) heart(g, Math.round(this.head.x), Math.round(this.head.y - 13 + Math.sin(t * 5) * 1.2), Math.floor(t * 5) % 2 ? '#ff6fa8' : '#ffb0d0');
    if (ph === 'away' && this.mood === 'doze') for (let i = 0; i < 2; i++) { const q = (t * 0.6 + i * 0.5) % 1; pixelText(g, 'Z', Math.round(this.head.x + 4 + q * 8), Math.round(this.head.y - 10 - q * 10), `rgba(220,230,255,${1 - q})`); }
    if (ph === 'startle') { const hx = Math.round(this.head.x), hy = Math.round(this.head.y - 16); g.fillStyle = '#ffd166'; g.fillRect(hx, hy, 2, 5); g.fillRect(hx, hy + 6, 2, 2); }
  }

  drawFront(g: G) {
    const t = this.t;
    for (const rg of this.rings) {
      const k = (t - rg.t0) / 1.4, rx = (4 + k * 16) * rg.w, ry = rx * 0.22;
      g.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
      for (let q = 0; q < Math.PI * 2; q += 0.25) g.fillRect(Math.round(rg.x + Math.cos(q) * rx), Math.round(SURFACE + 1 + Math.sin(q) * ry), 1, 1);
    }
    // l'eau qu'il pousse quand il nage sous la surface
    if (this.phase === 'under' || this.phase === 'dive') { const q = (t * 2) % 1; g.fillStyle = `rgba(255,255,255,${0.4 * (1 - q)})`; for (let a = 0; a < Math.PI * 2; a += 0.3) g.fillRect(Math.round(this.sX.v + Math.cos(a) * (6 + q * 10)), Math.round(SURFACE + 1 + Math.sin(a) * (1 + q * 2)), 1, 1); }
    // la sardine : un bel arc, elle tourne sur elle-même, quelques gouttes derrière
    if (this.fish) {
      const f = this.fish, u = Math.min(1, (t - f.t0) / NessieMeet.FLIGHT);
      const peak = 30 + Math.abs(f.x1 - f.x0) * 0.12;
      const x = f.x0 + (f.x1 - f.x0) * u, y = f.y0 + (f.y1 - f.y0) * u - Math.sin(u * Math.PI) * peak;
      sardine(g, x, y, Math.floor(t * 14) % 4);
      g.fillStyle = 'rgba(220,240,255,0.7)';
      for (let i = 1; i <= 3; i++) { const v = Math.max(0, u - i * 0.05); g.fillRect(Math.round(f.x0 + (f.x1 - f.x0) * v), Math.round(f.y0 + (f.y1 - f.y0) * v - Math.sin(v * Math.PI) * peak + i), 1, 1); }
    }
    for (const h of this.hearts) { const k = (t - h.t0) / 1.6; if (k < 0) continue; heart(g, Math.round(h.x + Math.sin(k * 8) * 2), Math.round(h.y - k * 20), k < 0.7 ? '#ff6fa8' : '#ffb0d0'); }
    for (const b of this.bits) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
  }

  drawHud(g: G) {
    const t = this.t;
    // en bas, sous l'eau : son nom, sa confiance (cinq cœurs) et tes erreurs (trois gouttes : à la dernière, il s'en va)
    const name = 'NESSIE', y = H - 22;
    pixelText(g, name, Math.round((W - textWidth(name)) / 2), y, '#ff9ab0');
    for (let i = 0; i < NessieMeet.GOAL; i++) heart(g, W / 2 - NessieMeet.GOAL * 6 + i * 12 + 6, y + 12, i < this.trust ? '#ff6fa8' : '#3a2a3a');
    for (let i = 0; i < 3; i++) { const on = i < 3 - this.scares; g.fillStyle = on ? '#bfe6ff' : '#2a3040'; g.fillRect(8 + i * 8, H - 12, 3, 4); g.fillRect(9 + i * 8, H - 14, 1, 2); }
    if (!this.over && t < 5) {
      const tip = 'ESPACE QUAND IL TE REGARDE';
      pixelText(g, tip, Math.round((W - textWidth(tip)) / 2), 4, '#ffffff');
    }
  }
}

function heart(g: G, x: number, y: number, col: string) {
  g.fillStyle = col;
  g.fillRect(x - 3, y - 1, 2, 2); g.fillRect(x + 1, y - 1, 2, 2);
  g.fillRect(x - 3, y, 6, 2); g.fillRect(x - 2, y + 2, 4, 1); g.fillRect(x - 1, y + 3, 2, 1);
}
