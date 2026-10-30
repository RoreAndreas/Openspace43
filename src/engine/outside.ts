// Dehors : l'entrée du bâtiment, une étendue d'herbe au vent, et la falaise. La mer est tout en bas, au loin.
// On y arrive par la porte d'entrée du bureau (celle par où entre l'équipe). Seul Roré sort, quand tu le diriges :
// les autres travaillent. Même taille que le bureau (352 × 256), même pixel art, vue de dessus en 3/4.
import { CHARACTERS, idleEffect, type CharacterInfo } from './characters.ts';
import { Fx } from './fx.ts';
import { COLS, ROWS, T, tileFeet } from './layout.ts';
import { findPath, type Tile } from './path.ts';
import type { Dir, Eyes, Pose } from './robots.ts';

type Pt = { x: number; y: number };

// ── Le plan ──

/** La porte du bâtiment : deux cases, dans la façade (rangée 5). Roré y entre en marchant vers le haut. */
export const OUT_DOOR = { col: 10, row: 5, x: 10 * T, y: 3 * T + 12, w: 2 * T, h: 2 * T + 4 };
/** L'herbe où l'on marche : de la rangée 6 à la rangée 11 (la falaise commence juste en dessous). */
export const GRASS = { row0: 6, row1: 11 };

export type OutKind = 'bench' | 'fishing' | 'tree' | 'lamp';
export interface OutFurn { id: string; kind: OutKind; tx: number; ty: number; w: number; h: number; label: string }

export const OUTSIDE_FURNITURE: OutFurn[] = [
  { id: 'lamp-l', kind: 'lamp', tx: 8, ty: 6, w: 1, h: 1, label: 'Un lampadaire' },
  { id: 'lamp-r', kind: 'lamp', tx: 13, ty: 6, w: 1, h: 1, label: 'Un lampadaire' },
  { id: 'tree-0', kind: 'tree', tx: 0, ty: 1, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-1', kind: 'tree', tx: 2, ty: 2, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-2', kind: 'tree', tx: 4, ty: 3, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-3', kind: 'tree', tx: 1, ty: 4, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-4', kind: 'tree', tx: 3, ty: 5, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-5', kind: 'tree', tx: 21, ty: 1, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-6', kind: 'tree', tx: 19, ty: 2, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-7', kind: 'tree', tx: 17, ty: 3, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-8', kind: 'tree', tx: 20, ty: 4, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-9', kind: 'tree', tx: 18, ty: 5, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-10', kind: 'tree', tx: 2, ty: 8, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-11', kind: 'tree', tx: 19, ty: 8, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-12', kind: 'tree', tx: 5, ty: 7, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-13', kind: 'tree', tx: 16, ty: 8, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-14', kind: 'tree', tx: 8, ty: 10, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-15', kind: 'tree', tx: 19, ty: 10, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'tree-16', kind: 'tree', tx: 6, ty: 9, w: 1, h: 1, label: 'Un arbre : le vent y passe' },
  { id: 'bench', kind: 'bench', tx: 13, ty: 11, w: 3, h: 1, label: 'Le banc : on y regarde la mer' },
  { id: 'fishing', kind: 'fishing', tx: 4, ty: 11, w: 1, h: 1, label: 'La canne à pêche : bientôt un jeu' },
];

/** Les deux places du banc : les pieds de Roré une fois assis, et la case où il se relève. */
export const BENCH_SEATS = [
  { id: 'bench-1', x: 13 * T + 12, y: 12 * T - 4, tile: [13, 10] as Tile },
  { id: 'bench-2', x: 15 * T + 12, y: 12 * T - 4, tile: [15, 10] as Tile },
];

function outsideGrid(): boolean[][] {
  const g: boolean[][] = [];
  for (let y = 0; y < ROWS; y++) {
    g.push([]);
    for (let x = 0; x < COLS; x++) g[y].push(x >= 1 && x <= 20 && y >= GRASS.row0 && y <= GRASS.row1);
  }
  // la porte du bâtiment
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

export class Outside {
  info: CharacterInfo = CHARACTERS.find((c) => c.roles.includes('chef')) ?? CHARACTERS[0];
  fx = new Fx();
  grid = outsideGrid();
  time = 0;
  // Roré
  x = 11 * T;
  y = 6 * T + 6;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  frame = 0;
  eyes: Eyes = 'open';
  hop = 0;
  moving = false;
  seated = false;
  seatId: string | null = null;
  happyUntil = 0;
  driving = false;
  /** Roré franchit la porte du bâtiment en marchant (pour changer de pièce avec lui) */
  onDoor?: () => void;
  /** la canne à pêche : le jeu de pêche se branchera ici */
  onFish?: () => void;
  leaves: Leaf[] = [];
  private steerX = 0;
  private steerY = 0;
  private path: Pt[] = [];
  private intent: 'sit' | 'look' | 'wander' | null = null;
  private until = 2;
  private animT = 0;
  private phase = Math.random() * 10;
  private nextBlink = 2;
  private blinkUntil = 0;
  private speed: number;

  constructor() {
    this.speed = 40 + this.info.energy * 7;
    for (let i = 0; i < 9; i++) this.leaves.push(this.newLeaf(Math.random() * 352));
  }

  /** Le vent : une rafale lente (de -1 à 1), la même pour l'herbe, les feuilles et les arbres. */
  gust(t = this.time) { return (Math.sin(t * 0.55) + Math.sin(t * 1.37 + 1.3)) * 0.5; }

  private newLeaf(x = -6): Leaf {
    const cols = ['#a8d86a', '#d9b04a', '#7fc062', '#e08a3d'];
    return { x, y: 100 + Math.random() * 88, vx: 14 + Math.random() * 16, ph: Math.random() * 6, color: cols[Math.floor(Math.random() * cols.length)] };
  }

  // ── Une image ──
  update(dtReal: number) {
    const dt = Math.min(0.1, dtReal);
    this.time += dt;
    this.fx.update(dt);
    const t = this.time;
    // les feuilles filent avec le vent, plus vite dans les rafales
    for (let i = 0; i < this.leaves.length; i++) {
      const l = this.leaves[i];
      l.x += (l.vx + this.gust(t) * 10) * dt;
      l.y += Math.sin(t * 2.1 + l.ph) * 6 * dt;
      if (l.x > 358) this.leaves[i] = this.newLeaf();
    }
    if (this.driving) this.driveStep(dt);
    else if (this.path.length) { if (this.walk(dt)) this.arrive(); }
    else if (t > this.until) { if (this.seated) this.stand(); else this.choose(); }
    this.animate(dt);
  }

  // ── Quand tu ne le diriges pas : Roré prend l'air ──
  private choose() {
    const t = this.time;
    const r = Math.random();
    if (r < 0.35) {
      const free = BENCH_SEATS.filter((s) => s.id !== this.seatId);
      const seat = free[Math.floor(Math.random() * free.length)];
      this.go('sit', seat.tile);
    } else if (r < 0.65) {
      // le bord de la falaise : il regarde la mer
      for (let i = 0; i < 20; i++) {
        const tx = 3 + Math.floor(Math.random() * 16);
        if (this.grid[GRASS.row1 - 1]?.[tx]) { this.go('look', [tx, GRASS.row1 - 1]); return; }
      }
      this.until = t + 1;
    } else {
      for (let i = 0; i < 20; i++) {
        const tx = 1 + Math.floor(Math.random() * 20), ty = GRASS.row0 + Math.floor(Math.random() * 6);
        if (this.grid[ty]?.[tx]) { this.go('wander', [tx, ty]); return; }
      }
      this.until = t + 1;
    }
  }

  private go(intent: 'sit' | 'look' | 'wander', to: Tile) {
    const from: Tile = [Math.max(0, Math.min(COLS - 1, Math.floor(this.x / T))), Math.max(0, Math.min(ROWS - 1, Math.floor((this.y - 2) / T)))];
    const path = findPath(this.grid, from, to);
    if (!path) { this.until = this.time + 1; return; }
    this.path = path.map(tileFeet);
    this.intent = intent;
  }

  private walk(dt: number): boolean {
    let budget = this.speed * dt;
    while (budget > 0 && this.path.length) {
      const q = this.path[0];
      const dx = q.x - this.x, dy = q.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (d <= budget) { this.x = q.x; this.y = q.y; this.path.shift(); budget -= d; }
      else { this.x += (dx / d) * budget; this.y += (dy / d) * budget; budget = 0; }
    }
    this.moving = this.path.length > 0;
    return !this.path.length;
  }

  private arrive() {
    const t = this.time;
    this.moving = false;
    if (this.intent === 'sit') {
      const seat = BENCH_SEATS.find((s) => Math.abs(tileFeet(s.tile).x - this.x) < 6);
      if (seat) { this.sit(seat.id); this.until = t + 9 + Math.random() * 8; return; }
    }
    if (this.intent === 'look') { this.dir = 'down'; this.until = t + 4 + Math.random() * 4; return; }
    this.until = t + 1 + Math.random() * 3;
  }

  // ── S'asseoir ──
  /** Une place libre tout près de Roré (le banc, ou la canne à pêche) : de quoi lui proposer « E · … ». */
  seatNear(): { id: string; verb: string } | null {
    if (this.seated) return null;
    let best: { id: string; d: number } | null = null;
    for (const s of BENCH_SEATS) {
      const f = tileFeet(s.tile);
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if (d < 15 && (!best || d < best.d)) best = { id: s.id, d };
    }
    return best ? { id: best.id, verb: 'S’asseoir sur le banc' } : null;
  }

  sit(id: string) {
    const s = BENCH_SEATS.find((x) => x.id === id);
    if (!s) return;
    this.seated = true;
    this.seatId = id;
    this.x = s.x;
    this.y = s.y;
    this.dir = 'down';
    this.moving = false;
    this.path = [];
    this.happyUntil = this.time + 0.8;
    this.fx.floatIcon(this.x, this.y - 26, 'heart');
  }

  /** Il se relève, sur la case derrière le banc. */
  stand() {
    if (!this.seated) return;
    const s = BENCH_SEATS.find((x) => x.id === this.seatId);
    if (s) { const f = tileFeet(s.tile); this.x = f.x; this.y = f.y; }
    this.seated = false;
    this.seatId = null;
    this.until = this.time + 2;
  }

  /** E devant la canne à pêche : le jeu de pêche s'ouvrira ici. */
  fish() {
    this.fx.floatIcon(4 * T + 8, 11 * T - 6, 'idea');
    this.fx.sparkle(4 * T + 8, 11 * T + 2, 8, '#9fe0ff');
    this.onFish?.();
  }

  // ── Tu diriges Roré ──
  drive(on: boolean) {
    if (on === this.driving) return;
    this.driving = on;
    this.steerX = this.steerY = 0;
    this.moving = false;
    if (on) {
      if (this.seated) this.stand();
      this.path = [];
      this.intent = null;
      this.happyUntil = this.time + 1;
    } else if (this.seated) this.until = this.time + 8;
    else this.until = this.time + 2;
  }

  steer(dx: number, dy: number) { this.steerX = dx; this.steerY = dy; }

  /** Roré arrive par la porte du bâtiment, avec toi aux commandes. */
  enterRore() {
    this.seated = false;
    this.seatId = null;
    this.x = 11 * T;
    this.y = 6 * T + 4;
    this.dir = 'down';
    this.path = [];
    this.drive(false);
    this.drive(true);
  }

  private driveStep(dt: number) {
    let dx = this.steerX, dy = this.steerY;
    if (!dx && !dy) { this.moving = false; return; }
    if (this.seated) this.stand();
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    const step = 67 * dt;
    const free = (x: number, y: number) => !!this.grid[Math.floor((y - 2) / T)]?.[Math.floor(x / T)];
    const ok = (x: number, y: number) => free(x - 4, y) && free(x + 4, y) && free(x - 4, y - 5) && free(x + 4, y - 5);
    const nx = this.x + dx * step, ny = this.y + dy * step;
    if (ok(nx, ny) || !ok(this.x, this.y)) { this.x = nx; this.y = ny; }
    else if (dx && ok(nx, this.y)) this.x = nx;
    else if (dy && ok(this.x, ny)) this.y = ny;
    this.x = Math.max(T + 4, Math.min(21 * T - 4, this.x));
    this.y = Math.max(OUT_DOOR.row * T + 8, Math.min((GRASS.row1 + 1) * T - 2, this.y));
    this.moving = true;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    // il pousse la porte : retour au bureau
    if (this.y <= OUT_DOOR.row * T + 10 && this.x >= OUT_DOOR.col * T && this.x <= (OUT_DOOR.col + 2) * T) this.onDoor?.();
  }

  private animate(dt: number) {
    this.animT += dt;
    const t = this.time;
    let pose: Pose = 'stand';
    if (this.moving && !this.seated) pose = 'walk';
    else if (this.happyUntil > t && !this.seated) pose = 'cheer';
    else if (this.seated) pose = 'sit';
    if (pose !== this.pose) { this.pose = pose; this.animT = 0; }
    switch (pose) {
      case 'walk': this.frame = Math.floor(this.animT * 8) % 4; break;
      case 'cheer': this.frame = Math.floor(this.animT * 5) % 2; break;
      default: this.frame = 0;
    }
    if (t > this.nextBlink) { this.blinkUntil = t + 0.12; this.nextBlink = t + 2.2 + Math.random() * 3.5; }
    let eyes: Eyes = 'open';
    this.hop = 0;
    if (this.happyUntil > t || pose === 'cheer') eyes = 'happy';
    else if (pose === 'stand' || pose === 'sit') {
      const fx = idleEffect(this.info.idle, t + this.phase, pose === 'stand');
      this.hop = fx.hop;
      if (fx.eyes) eyes = fx.eyes;
      if (fx.frame !== undefined) this.frame = fx.frame;
    }
    if (this.blinkUntil > t && eyes !== 'happy') eyes = 'blink';
    this.eyes = eyes;
  }
}

// ── Les clics ──
export function outsideHitAt(o: Outside, x: number, y: number, place: (f: OutFurn) => { x: number; y: number; w: number; h: number }): OutHit | null {
  const py = o.y;
  if (x >= o.x - 7 && x <= o.x + 7 && y >= py - 21 && y <= py + 1) {
    return { kind: 'pal', id: o.info.id, label: o.driving ? 'Roré : tu le diriges (Échap pour le laisser)' : `${o.info.name} prend l’air (double-clic pour le diriger)` };
  }
  if (x >= OUT_DOOR.x && x < OUT_DOOR.x + OUT_DOOR.w && y >= OUT_DOOR.y && y < (OUT_DOOR.row + 1) * T) return { kind: 'door', label: 'La porte du bureau : retour au travail' };
  for (const f of OUTSIDE_FURNITURE) {
    const p = place(f);
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return { kind: 'object', id: f.id, label: f.label };
  }
  return null;
}
