// Dehors : le pavillon 43 (à droite), une prairie au vent qui s'arrête au bord de la falaise, et au-delà, la mer jusqu'à
// l'horizon, avec le phare au loin à gauche. Le sol (où l'on marche) est vu de dessus en 3/4, comme le bureau ; le fond
// (le ciel, la mer, l'horizon) est un panorama en perspective. Un petit promontoire avance vers le large : le banc y regarde la mer.
// On y arrive par la porte d'entrée du bureau. Pendant les heures de travail, seul Roré sort (quand tu le diriges) ;
// en dehors, quelques collègues viennent prendre l'air. Même taille que le bureau (352 × 256), vue de dessus en 3/4.
import { CHARACTERS, idleEffect, type CharacterInfo } from './characters.ts';
import { Fx } from './fx.ts';
import { COLS, OX, ROWS, T, tileFeet } from './layout.ts';
import { findPath, type Tile } from './path.ts';
import type { Dir, Eyes, Pose } from './robots.ts';

type Pt = { x: number; y: number };

// ── Le plan ──

/** La porte du pavillon : deux cases, dans la façade (rangée 5). Roré y entre en marchant vers le haut. */
export const OUT_DOOR = { col: 16, row: 5, x: 16 * T, y: 4 * T + 8, w: 2 * T, h: 2 * T - 8 };
/** Le pavillon, à droite (en pixels) : on ne marche pas dessus. */
export const HOUSE = { x0: 232, x1: 324, y1: 6 * T };
/** La ligne d'horizon (en pixels). */
export const HORIZON = 46;
/** La première rangée où l'on peut marcher. */
export const GRASS_ROW = 5;

const bump = (u: number) => (Math.abs(u) >= 1 ? 0 : Math.pow(1 - u * u, 1.5));

/** Le bord de la falaise : là où commence l'herbe (en pixels), pour chaque x ; au-dessus, c'est le vide et la mer, au loin.
 *  Un promontoire avance vers le large (le banc) ; à droite, le terrain remonte derrière le pavillon. */
export function coastY(x: number): number {
  const base = 118 - 6 * Math.sin(x * 0.02) - 15 * bump((x - 112) / 36) + 1.6 * Math.sin(x * 0.23) + 1.2 * Math.sin(x * 0.071 + 1);
  const k = Math.max(0, Math.min(1, (x - 188) / 52));
  const s = k * k * (3 - 2 * k);
  return base + (HORIZON - 2 - base) * s;
}

export type OutKind = 'bench' | 'log' | 'fishing' | 'pine' | 'tree' | 'windsock' | 'bollard';
export interface OutFurn { id: string; kind: OutKind; tx: number; ty: number; w: number; h: number; label: string }

const PINE = 'Un pin parasol, couché par le vent du large';
const TREE = 'Un arbre : le vent y passe';

export const OUTSIDE_FURNITURE: OutFurn[] = [
  // derrière et autour du pavillon
  { id: 'pine-1', kind: 'pine', tx: 21, ty: 2, w: 1, h: 1, label: PINE },
  { id: 'tree-1', kind: 'tree', tx: 21, ty: 6, w: 1, h: 1, label: TREE },
  { id: 'tree-2', kind: 'tree', tx: 13, ty: 5, w: 1, h: 1, label: TREE },
  // dans la prairie, au premier plan
  { id: 'pine-2', kind: 'pine', tx: 1, ty: 12, w: 1, h: 1, label: PINE },
  { id: 'tree-3', kind: 'tree', tx: 19, ty: 11, w: 1, h: 1, label: TREE },
  { id: 'pine-3', kind: 'pine', tx: 12, ty: 13, w: 1, h: 1, label: PINE },
  { id: 'tree-4', kind: 'tree', tx: 6, ty: 15, w: 1, h: 1, label: TREE },
  { id: 'tree-5', kind: 'tree', tx: 20, ty: 15, w: 1, h: 1, label: TREE },
  // où s'asseoir, où pêcher
  { id: 'bench', kind: 'bench', tx: 6, ty: 7, w: 3, h: 1, label: 'Le banc du promontoire, face au large' },
  { id: 'log', kind: 'log', tx: 3, ty: 13, w: 2, h: 1, label: 'Un vieux tronc, à l’ombre des pins : on s’y assoit' },
  { id: 'fishing', kind: 'fishing', tx: 1, ty: 8, w: 1, h: 1, label: 'Le chemin de la barque : il descend jusqu’au ponton' },
  { id: 'windsock', kind: 'windsock', tx: 11, ty: 8, w: 1, h: 1, label: 'La manche à air : elle dit d’où vient le vent' },
  // les bornes lumineuses le long du chemin (on passe à côté)
  { id: 'bollard-1', kind: 'bollard', tx: 15, ty: 6, w: 0, h: 0, label: 'Une borne lumineuse' },
  { id: 'bollard-2', kind: 'bollard', tx: 18, ty: 6, w: 0, h: 0, label: 'Une borne lumineuse' },
  { id: 'bollard-3', kind: 'bollard', tx: 14, ty: 10, w: 0, h: 0, label: 'Une borne lumineuse' },
  { id: 'bollard-4', kind: 'bollard', tx: 7, ty: 10, w: 0, h: 0, label: 'Une borne lumineuse' },
];

/** Le coin de pêche : là où l'on se tient pour lancer la ligne. */
export const FISH_SPOT = { x: 2 * T + 8, y: 9 * T + 4 };

/** Les places assises : les pieds une fois assis, la case d'où l'on s'assoit (et où l'on se relève), et le regard.
 *  Sur le banc, on tourne le dos : on regarde la mer. */
export const SEATS: { id: string; x: number; y: number; tile: Tile; face: Dir; verb: string }[] = [
  { id: 'bench-1', x: 6 * T + 12, y: 8 * T - 6, tile: [6, 8], face: 'up', verb: 'S’asseoir sur le banc (face à la mer)' },
  { id: 'bench-2', x: 8 * T + 4, y: 8 * T - 6, tile: [8, 8], face: 'up', verb: 'S’asseoir sur le banc (face à la mer)' },
  { id: 'log-1', x: 3 * T + 7, y: 14 * T - 3, tile: [3, 12], face: 'down', verb: 'S’asseoir sur le tronc' },
  { id: 'log-2', x: 4 * T + 9, y: 14 * T - 3, tile: [4, 12], face: 'down', verb: 'S’asseoir sur le tronc' },
];

/** Le chemin de gravier : de la porte au banc du cap, avec une branche vers le tronc et le chemin de la barque. */
export const PATHS: Pt[][] = [
  [{ x: 272, y: 97 }, { x: 272, y: 124 }, { x: 240, y: 146 }, { x: 186, y: 158 }, { x: 140, y: 154 }, { x: 120, y: 146 }],
  [{ x: 186, y: 158 }, { x: 150, y: 176 }, { x: 104, y: 190 }, { x: 70, y: 206 }],
  [{ x: 104, y: 190 }, { x: 64, y: 168 }, { x: 42, y: 146 }, { x: 40, y: 128 }],
];

/** Les cases où l'on marche : l'herbe, jusqu'au bord de la falaise (avec une marge). */
function outsideGrid(): boolean[][] {
  const g: boolean[][] = [];
  for (let y = 0; y < ROWS; y++) {
    g.push([]);
    for (let x = 0; x < COLS; x++) {
      let edge = -Infinity;
      for (let k = 0; k <= T; k += 4) edge = Math.max(edge, coastY(x * T + k));
      const house = (x + 1) * T > HOUSE.x0 && x * T < HOUSE.x1 && y * T < HOUSE.y1;
      g[y].push(x >= 1 && x <= 20 && y >= GRASS_ROW && y * T >= edge + 4 && !house);
    }
  }
  g[OUT_DOOR.row][OUT_DOOR.col] = true;
  g[OUT_DOOR.row][OUT_DOOR.col + 1] = true;
  for (const f of OUTSIDE_FURNITURE) for (let y = f.ty; y < f.ty + f.h; y++) for (let x = f.tx; x < f.tx + f.w; x++) if (g[y]?.[x] !== undefined) g[y][x] = false;
  return g;
}

/** Une feuille que le vent emporte. */
export interface Leaf { x: number; y: number; vx: number; ph: number; color: string }

export type OutHit =
  | { kind: 'pal'; id: string; label: string }
  | { kind: 'door'; label: string }
  | { kind: 'object'; id: string; label: string };

type Intent = 'sit' | 'look' | 'wander' | 'leave';

/** Quelqu'un dehors : Roré, ou un collègue sorti prendre l'air. */
export class Walker {
  info: CharacterInfo;
  x: number;
  y: number;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  frame = 0;
  eyes: Eyes = 'open';
  hop = 0;
  moving = false;
  seated = false;
  seatId: string | null = null;
  happyUntil = 0;
  path: Pt[] = [];
  intent: Intent | null = null;
  until = 1;
  animT = 0;
  phase = Math.random() * 10;
  nextBlink = 2;
  blinkUntil = 0;
  speed: number;
  /** il rentre : ce qui se passe une fois la porte du pavillon franchie */
  onIn?: () => void;

  constructor(info: CharacterInfo, x: number, y: number) {
    this.info = info;
    this.x = x;
    this.y = y;
    this.speed = 40 + info.energy * 7;
  }

  get id() { return this.info.id; }
  get name() { return this.info.name; }
  get tile(): Tile { return [Math.max(0, Math.min(COLS - 1, Math.floor(this.x / T))), Math.max(0, Math.min(ROWS - 1, Math.floor((this.y - 2) / T)))]; }
}

const DOOR_FEET = { x: 17 * T, y: 6 * T + 4 };

export class Outside {
  fx = new Fx();
  grid = outsideGrid();
  time = 0;
  rore = new Walker(CHARACTERS.find((c) => c.roles.includes('chef')) ?? CHARACTERS[0], DOOR_FEET.x, DOOR_FEET.y + 2);
  /** les collègues sortis prendre l'air (en dehors des heures de travail, voir day.ts) */
  guests: Walker[] = [];
  driving = false;
  /** Roré franchit la porte du pavillon en marchant (pour changer de pièce avec lui) */
  onDoor?: () => void;
  /** le coin de pêche : le jeu de pêche se branchera ici */
  onFish?: () => void;
  leaves: Leaf[] = [];
  /** quelqu'un arrive ou s'en va : pour les prénoms au-dessus des têtes */
  version = 0;
  private listeners = new Set<() => void>();
  private taken = new Map<string, Walker>();
  private steerX = 0;
  private steerY = 0;

  constructor() {
    for (let i = 0; i < 9; i++) this.leaves.push(this.newLeaf(Math.random() * 352));
  }

  /** Roré est parti en mer (la barque) : on ne le voit plus Dehors */
  roreAway = false;
  get walkers() { return this.roreAway ? [...this.guests] : [this.rore, ...this.guests]; }
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.version++; for (const fn of this.listeners) fn(); }

  /** Le vent : une rafale lente (de -1 à 1), la même pour l'herbe, les feuilles, les arbres et la manche à air. */
  gust(t = this.time) { return (Math.sin(t * 0.55) + Math.sin(t * 1.37 + 1.3)) * 0.5; }

  private newLeaf(x = -OX - 6): Leaf {
    const cols = ['#a8d86a', '#d9b04a', '#7fc062', '#e08a3d'];
    return { x, y: 130 + Math.random() * 110, vx: 14 + Math.random() * 16, ph: Math.random() * 6, color: cols[Math.floor(Math.random() * cols.length)] };
  }

  // ── Les collègues qui sortent (ou rentrent) : la journée (day.ts) décide ──
  /** Il sort prendre l'air : par la porte du pavillon, ou (au chargement) déjà quelque part dehors. */
  show(info: CharacterInfo, byDoor: boolean) {
    if (this.guests.some((g) => g.id === info.id && g.intent !== 'leave')) return;
    this.drop(info.id);
    const g = new Walker(info, DOOR_FEET.x - 8 + Math.random() * 16, DOOR_FEET.y);
    g.until = this.time + 0.4;
    if (!byDoor) {
      for (let i = 0; i < 30; i++) {
        const tx = 1 + Math.floor(Math.random() * 20), ty = 7 + Math.floor(Math.random() * 9);
        if (this.grid[ty]?.[tx]) { const f = tileFeet([tx, ty]); g.x = f.x; g.y = f.y; break; }
      }
    }
    this.guests.push(g);
    this.changed();
  }

  /** Il rentre : il marche jusqu'à la porte du pavillon, puis `then` (le bureau le reprend). Faux s'il n'est pas dehors. */
  sendIn(id: string, then?: () => void) {
    const g = this.guests.find((x) => x.id === id);
    if (!g || g.intent === 'leave') return false;
    this.stand(g);
    g.onIn = then;
    // pas de chemin : il rentre tout de suite
    if (!this.go(g, 'leave', [OUT_DOOR.col, 6])) { this.drop(id); this.changed(); then?.(); }
    return true;
  }

  /** Il disparaît tout de suite (appelé en mission, par exemple). */
  hide(id: string) {
    if (this.drop(id)) this.changed();
  }

  private drop(id: string) {
    const g = this.guests.find((x) => x.id === id);
    if (!g) return false;
    this.stand(g);
    this.guests = this.guests.filter((x) => x !== g);
    return true;
  }

  // ── Une image ──
  update(dtReal: number) {
    const dt = Math.min(0.1, dtReal);
    this.time += dt;
    this.fx.update(dt);
    const t = this.time;
    for (let i = 0; i < this.leaves.length; i++) {
      const l = this.leaves[i];
      l.x += (l.vx + this.gust(t) * 10) * dt;
      l.y += Math.sin(t * 2.1 + l.ph) * 6 * dt;
      if (l.x > 352 + OX + 6) this.leaves[i] = this.newLeaf();
    }
    for (const w of this.walkers) {
      if (w === this.rore && this.driving) this.driveStep(w, dt);
      else if (w.path.length) { if (this.walk(w, dt)) this.arrive(w); }
      else if (t > w.until) { if (w.seated) this.stand(w); else this.choose(w); }
      this.animate(w, dt);
    }
    // ceux qui sont rentrés disparaissent
    const back = this.guests.filter((g) => g.intent === 'leave' && !g.path.length);
    if (back.length) {
      this.guests = this.guests.filter((g) => !back.includes(g));
      this.changed();
      for (const g of back) g.onIn?.();
    }
  }

  // ── Quand personne ne les dirige : ils prennent l'air ──
  private choose(w: Walker) {
    const t = this.time;
    const r = Math.random();
    if (r < 0.35) {
      const free = SEATS.filter((s) => !this.taken.has(s.id));
      if (free.length) { this.go(w, 'sit', free[Math.floor(Math.random() * free.length)].tile); return; }
    }
    if (r < 0.65) {
      // le bord de la falaise : on regarde le large
      for (let i = 0; i < 20; i++) {
        const tx = 1 + Math.floor(Math.random() * 13);
        let ty = GRASS_ROW;
        while (ty < ROWS && !this.grid[ty][tx]) ty++;
        if (ty < ROWS - 2 && this.grid[ty][tx]) { this.go(w, 'look', [tx, ty]); return; }
      }
    }
    for (let i = 0; i < 20; i++) {
      const tx = 1 + Math.floor(Math.random() * 20), ty = 7 + Math.floor(Math.random() * 9);
      if (this.grid[ty]?.[tx]) { this.go(w, 'wander', [tx, ty]); return; }
    }
    w.until = t + 1;
  }

  private go(w: Walker, intent: Intent, to: Tile) {
    const path = findPath(this.grid, w.tile, to);
    if (!path) { w.until = this.time + 1; return false; }
    w.path = path.map(tileFeet);
    w.intent = intent;
    return true;
  }

  private walk(w: Walker, dt: number): boolean {
    let budget = w.speed * dt;
    while (budget > 0 && w.path.length) {
      const q = w.path[0];
      const dx = q.x - w.x, dy = q.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (d <= budget) { w.x = q.x; w.y = q.y; w.path.shift(); budget -= d; }
      else { w.x += (dx / d) * budget; w.y += (dy / d) * budget; budget = 0; }
    }
    w.moving = w.path.length > 0;
    return !w.path.length;
  }

  private arrive(w: Walker) {
    const t = this.time;
    w.moving = false;
    if (w.intent === 'leave') return;
    if (w.intent === 'sit') {
      const seat = SEATS.find((s) => s.tile[0] === w.tile[0] && s.tile[1] === w.tile[1] && !this.taken.has(s.id));
      if (seat) { this.sit(w, seat.id); w.until = t + 10 + Math.random() * 10; return; }
    }
    if (w.intent === 'look') { w.dir = 'up'; w.until = t + 5 + Math.random() * 5; return; }
    w.until = t + 1 + Math.random() * 3;
  }

  // ── S'asseoir ──
  private sit(w: Walker, id: string) {
    const s = SEATS.find((x) => x.id === id);
    if (!s || this.taken.has(id)) return;
    this.taken.set(id, w);
    w.seated = true;
    w.seatId = id;
    w.x = s.x;
    w.y = s.y;
    w.dir = s.face;
    w.moving = false;
    w.path = [];
    w.happyUntil = this.time + 0.8;
    this.fx.floatIcon(w.x, w.y - 26, 'heart');
  }

  /** Il se relève, sur la case d'où il s'était assis. */
  private stand(w: Walker) {
    if (!w.seated) return;
    const s = SEATS.find((x) => x.id === w.seatId);
    if (s) { const f = tileFeet(s.tile); w.x = f.x; w.y = f.y; this.taken.delete(s.id); }
    w.seated = false;
    w.seatId = null;
    w.until = this.time + 2;
  }

  /** Une place libre tout près de Roré : de quoi lui proposer « E · S'asseoir… ». */
  seatNear(): { id: string; verb: string } | null {
    const me = this.rore;
    if (me.seated) return null;
    let best: { id: string; verb: string; d: number } | null = null;
    for (const s of SEATS) {
      if (this.taken.has(s.id)) continue;
      const f = tileFeet(s.tile);
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < 15 && (!best || d < best.d)) best = { id: s.id, verb: s.verb, d };
    }
    return best;
  }

  sitRore(id: string) { this.sit(this.rore, id); }
  standRore() { this.stand(this.rore); }

  /** E au coin de pêche : le jeu de pêche s'ouvrira ici. */
  fish() {
    this.fx.floatIcon(FISH_SPOT.x, FISH_SPOT.y - 24, 'idea');
    this.fx.sparkle(FISH_SPOT.x, FISH_SPOT.y - 14, 8, '#9fe0ff');
    this.onFish?.();
  }

  // ── Tu diriges Roré ──
  drive(on: boolean) {
    if (on === this.driving) return;
    const me = this.rore;
    this.driving = on;
    this.steerX = this.steerY = 0;
    me.moving = false;
    if (on) {
      if (me.seated) this.stand(me);
      me.path = [];
      me.intent = null;
      me.happyUntil = this.time + 1;
    } else me.until = this.time + (me.seated ? 8 : 2);
  }

  steer(dx: number, dy: number) { this.steerX = dx; this.steerY = dy; }

  /** Roré descend au ponton et prend la barque : il quitte Dehors. */
  roreToSea() {
    this.drive(false);
    this.stand(this.rore);
    this.roreAway = true;
    this.changed();
  }

  /** Roré revient de la mer : il remonte du ponton, au coin de pêche. */
  roreFromSea(driving: boolean) {
    const me = this.rore;
    this.roreAway = false;
    me.x = FISH_SPOT.x + 10;
    me.y = FISH_SPOT.y + 4;
    me.dir = 'right';
    me.path = [];
    this.drive(false);
    if (driving) this.drive(true);
    this.changed();
  }

  /** Roré arrive par la porte du pavillon, avec toi aux commandes. */
  enterRore() {
    const me = this.rore;
    this.stand(me);
    me.x = DOOR_FEET.x;
    me.y = DOOR_FEET.y;
    me.dir = 'down';
    me.path = [];
    this.drive(false);
    this.drive(true);
  }

  private driveStep(me: Walker, dt: number) {
    let dx = this.steerX, dy = this.steerY;
    if (!dx && !dy) { me.moving = false; return; }
    if (me.seated) this.stand(me);
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    const step = 67 * dt;
    // ses pieds restent sur l'herbe, à bonne distance du vide
    const free = (x: number, y: number) => !!this.grid[Math.floor((y - 2) / T)]?.[Math.floor(x / T)];
    const ok = (x: number, y: number) => free(x - 4, y) && free(x + 4, y) && free(x - 4, y - 5) && free(x + 4, y - 5) && y >= coastY(x) + 9;
    const nx = me.x + dx * step, ny = me.y + dy * step;
    if (ok(nx, ny) || !ok(me.x, me.y)) { me.x = nx; me.y = ny; }
    else if (dx && ok(nx, me.y)) me.x = nx;
    else if (dy && ok(me.x, ny)) me.y = ny;
    me.x = Math.max(T + 4, Math.min(21 * T - 4, me.x));
    me.y = Math.max(OUT_DOOR.row * T + 8, Math.min(16 * T - 2, me.y));
    me.moving = true;
    me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    // il pousse la porte : retour au bureau
    if (me.y <= OUT_DOOR.row * T + 10 && me.x >= OUT_DOOR.col * T && me.x <= (OUT_DOOR.col + 2) * T) this.onDoor?.();
  }

  private animate(w: Walker, dt: number) {
    w.animT += dt;
    const t = this.time;
    let pose: Pose = 'stand';
    if (w.moving && !w.seated) pose = 'walk';
    else if (w.happyUntil > t && !w.seated) pose = 'cheer';
    else if (w.seated) pose = 'sit';
    if (pose !== w.pose) { w.pose = pose; w.animT = 0; }
    switch (pose) {
      case 'walk': w.frame = Math.floor(w.animT * 8) % 4; break;
      case 'cheer': w.frame = Math.floor(w.animT * 5) % 2; break;
      default: w.frame = 0;
    }
    if (t > w.nextBlink) { w.blinkUntil = t + 0.12; w.nextBlink = t + 2.2 + Math.random() * 3.5; }
    let eyes: Eyes = 'open';
    w.hop = 0;
    if (w.happyUntil > t || pose === 'cheer') eyes = 'happy';
    else if (w.intent === 'look' && !w.moving && !w.seated) eyes = 'down';
    else if (pose === 'stand' || pose === 'sit') {
      const fx = idleEffect(w.info.idle, t + w.phase, pose === 'stand');
      w.hop = fx.hop;
      if (fx.eyes) eyes = fx.eyes;
      if (fx.frame !== undefined) w.frame = fx.frame;
    }
    if (w.blinkUntil > t && eyes !== 'happy') eyes = 'blink';
    w.eyes = eyes;
  }
}

// ── Les clics ──
export function outsideHitAt(o: Outside, x: number, y: number, place: (f: OutFurn) => { x: number; y: number; w: number; h: number }): OutHit | null {
  const ws = [...o.walkers].sort((a, b) => b.y - a.y);
  for (const w of ws) {
    if (x >= w.x - 7 && x <= w.x + 7 && y >= w.y - 21 && y <= w.y + 1) {
      if (w === o.rore) return { kind: 'pal', id: w.id, label: o.driving ? 'Roré : tu le diriges (Échap pour le laisser)' : 'Roré prend l’air (double-clic pour le diriger)' };
      return { kind: 'pal', id: w.id, label: `${w.name}, ${w.info.archetype.toLowerCase()} · prend l’air (c’est l’heure de la pause)` };
    }
  }
  if (x >= OUT_DOOR.x && x < OUT_DOOR.x + OUT_DOOR.w && y >= OUT_DOOR.y && y < (OUT_DOOR.row + 1) * T) return { kind: 'door', label: 'La porte du bureau : retour au travail' };
  // les petits objets d'abord : un arbre ne doit pas cacher le coin de pêche ou le banc
  const order = [...OUTSIDE_FURNITURE].sort((a, b) => Number(a.kind === 'tree' || a.kind === 'pine') - Number(b.kind === 'tree' || b.kind === 'pine'));
  for (const f of order) {
    const p = place(f);
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return { kind: 'object', id: f.id, label: f.label };
  }
  return null;
}
