// La Pause, à droite du bureau : une cuisine et une salle de loisirs, où tous les personnages se
// retrouvent. Chacun y fait ce qu'il aime (catalogue : « hobbies ») ; ils se croisent, discutent, jouent à
// deux (ping-pong, baby-foot). Clique sur l'un d'eux, ou dirige Roré jusqu'à lui et appuie sur Espace : il te parle.
import { CHARACTERS, idleEffect, type CharacterInfo } from './characters.ts';
import { Fx } from './fx.ts';
import type { IconName } from './icons.ts';
import { COLS, ROWS, T, tileFeet } from './layout.ts';
import { findPath, type Tile } from './path.ts';
import type { Dir, Eyes, Pose } from './robots.ts';

type Pt = { x: number; y: number };

// ── Le plan ──

export type AnnexKind = 'counter' | 'fridge' | 'table' | 'stool' | 'tv' | 'arcade' | 'pingpong' | 'foosball' | 'beanbag';
export type ReusedKind = 'coffee' | 'sofa' | 'shelf' | 'plantBig' | 'plantTall' | 'jukebox' | 'cooler' | 'bin' | 'lamp';

export interface AnnexFurn { id: string; kind: AnnexKind | ReusedKind; tx: number; ty: number; w: number; h: number; seed?: number; label: string }

/** La porte du bureau : dans le mur de gauche (la Pause est à droite du bureau), sur deux cases (rangées 9 et 10). */
export const ANNEX_BACK_DOOR = { row: 9 };

export const ANNEX_FURNITURE: AnnexFurn[] = [
  // la cuisine
  { id: 'counter', kind: 'counter', tx: 1, ty: 3, w: 5, h: 1, label: 'La cuisine : l’évier et les plaques' },
  { id: 'fridge', kind: 'fridge', tx: 6, ty: 3, w: 1, h: 1, label: 'Le frigo (clique pour l’ouvrir)' },
  { id: 'coffee', kind: 'coffee', tx: 7, ty: 3, w: 3, h: 1, label: 'La machine à café' },
  { id: 'table', kind: 'table', tx: 2, ty: 7, w: 4, h: 2, label: 'La grande table' },
  { id: 'stool-1', kind: 'stool', tx: 3, ty: 6, w: 0, h: 0, label: 'Un tabouret' },
  { id: 'stool-2', kind: 'stool', tx: 4, ty: 6, w: 0, h: 0, label: 'Un tabouret' },
  { id: 'stool-3', kind: 'stool', tx: 3, ty: 9, w: 0, h: 0, label: 'Un tabouret' },
  { id: 'stool-4', kind: 'stool', tx: 4, ty: 9, w: 0, h: 0, label: 'Un tabouret' },
  { id: 'cooler', kind: 'cooler', tx: 1, ty: 12, w: 1, h: 1, label: 'La fontaine à eau' },
  { id: 'bin', kind: 'bin', tx: 8, ty: 13, w: 0, h: 0, label: 'La poubelle (le tri, c’est important)' },
  { id: 'plant-k', kind: 'plantTall', tx: 9, ty: 14, w: 1, h: 1, seed: 4, label: 'Une plante (elle aime qu’on la chatouille)' },
  // la salle de loisirs
  { id: 'shelf', kind: 'shelf', tx: 11, ty: 3, w: 2, h: 1, seed: 8, label: 'La bibliothèque : romans, BD et vieux manuels' },
  { id: 'sofa', kind: 'sofa', tx: 13, ty: 3, w: 3, h: 1, label: 'Le canapé : on y joue à la console' },
  { id: 'tv', kind: 'tv', tx: 13, ty: 5, w: 3, h: 1, label: 'La console et la télé' },
  { id: 'plant-w', kind: 'plantBig', tx: 16, ty: 3, w: 1, h: 1, seed: 13, label: 'Une plante (elle aime qu’on la chatouille)' },
  { id: 'arcade-1', kind: 'arcade', tx: 18, ty: 3, w: 1, h: 1, seed: 1, label: 'La borne d’arcade : Spartan Run (clique pour jouer)' },
  { id: 'arcade-2', kind: 'arcade', tx: 19, ty: 3, w: 1, h: 1, seed: 2, label: 'La borne d’arcade : Spartan Run (clique pour jouer)' },
  { id: 'plant-r', kind: 'plantTall', tx: 20, ty: 3, w: 1, h: 1, seed: 7, label: 'Une plante (elle aime qu’on la chatouille)' },
  { id: 'pingpong', kind: 'pingpong', tx: 12, ty: 9, w: 4, h: 2, label: 'La table de ping-pong (clique pour jouer contre un collègue)' },
  { id: 'foosball', kind: 'foosball', tx: 18, ty: 8, w: 2, h: 1, label: 'Le baby-foot' },
  { id: 'beanbag-1', kind: 'beanbag', tx: 13, ty: 13, w: 0, h: 0, seed: 1, label: 'Un pouf (pour la sieste)' },
  { id: 'beanbag-2', kind: 'beanbag', tx: 15, ty: 13, w: 0, h: 0, seed: 2, label: 'Un pouf (pour la sieste)' },
  { id: 'jukebox', kind: 'jukebox', tx: 19, ty: 13, w: 2, h: 1, label: 'Le jukebox (clique pour la musique)' },
  { id: 'lamp', kind: 'lamp', tx: 10, ty: 14, w: 1, h: 1, label: 'Un lampadaire' },
];

/** Les cases où l'on peut marcher dans la Pause. */
function annexGrid(): boolean[][] {
  const g: boolean[][] = [];
  for (let y = 0; y < ROWS; y++) {
    g.push([]);
    for (let x = 0; x < COLS; x++) g[y].push(x >= 1 && x <= 20 && y >= 3 && y <= 14);
  }
  g[ANNEX_BACK_DOOR.row][0] = true;
  g[ANNEX_BACK_DOOR.row + 1][0] = true;
  for (const f of ANNEX_FURNITURE) for (let y = f.ty; y < f.ty + f.h; y++) for (let x = f.tx; x < f.tx + f.w; x++) if (g[y]?.[x] !== undefined) g[y][x] = false;
  return g;
}

// ── Les activités ──

export type Act = 'coffee' | 'fridge' | 'cook' | 'eat' | 'sofa' | 'arcade' | 'books' | 'window' | 'plant' | 'dance' | 'beanbag' | 'pingpong' | 'foosball' | 'chat' | 'wander';

interface Spot {
  id: string;
  act: Act;
  /** la case où il se rend */
  tile: Tile;
  face: Dir;
  pose: Pose;
  /** s'il s'assoit : ses pieds une fois assis (en pixels) */
  seat?: Pt;
  icons?: IconName[];
  /** l'autre place d'un jeu à deux */
  pair?: string;
}

const seatAt = (tx: number, y: number): Pt => ({ x: tx * T + 8, y });

const SPOTS: Spot[] = [
  { id: 'coffee-1', act: 'coffee', tile: [7, 4], face: 'up', pose: 'play', icons: ['coffee'] },
  { id: 'coffee-2', act: 'coffee', tile: [9, 4], face: 'up', pose: 'play', icons: ['coffee'] },
  { id: 'fridge', act: 'fridge', tile: [6, 4], face: 'up', pose: 'stand', icons: ['drop', 'idea'] },
  { id: 'cook-1', act: 'cook', tile: [2, 4], face: 'up', pose: 'play', icons: ['heart', 'drop'] },
  { id: 'cook-2', act: 'cook', tile: [4, 4], face: 'up', pose: 'play', icons: ['heart'] },
  { id: 'eat-1', act: 'eat', tile: [3, 6], face: 'down', pose: 'read', seat: seatAt(3, 7 * T - 1), icons: ['heart', 'coffee'] },
  { id: 'eat-2', act: 'eat', tile: [4, 6], face: 'down', pose: 'read', seat: seatAt(4, 7 * T - 1), icons: ['coffee'] },
  { id: 'eat-3', act: 'eat', tile: [3, 9], face: 'up', pose: 'sit', seat: seatAt(3, 9 * T + 12), icons: ['heart'] },
  { id: 'eat-4', act: 'eat', tile: [4, 9], face: 'up', pose: 'sit', seat: seatAt(4, 9 * T + 12) },
  { id: 'sofa-1', act: 'sofa', tile: [13, 4], face: 'down', pose: 'type', seat: seatAt(13, 4 * T - 1), icons: ['note', 'heart'] },
  { id: 'sofa-2', act: 'sofa', tile: [14, 4], face: 'down', pose: 'type', seat: seatAt(14, 4 * T - 1), icons: ['note2'] },
  { id: 'sofa-3', act: 'sofa', tile: [15, 4], face: 'down', pose: 'type', seat: seatAt(15, 4 * T - 1), icons: ['idea'] },
  { id: 'arcade-1', act: 'arcade', tile: [18, 4], face: 'up', pose: 'play', icons: ['idea', 'check'] },
  { id: 'arcade-2', act: 'arcade', tile: [19, 4], face: 'up', pose: 'play', icons: ['check'] },
  { id: 'books-1', act: 'books', tile: [11, 4], face: 'down', pose: 'carry', icons: ['idea'] },
  { id: 'books-2', act: 'books', tile: [12, 4], face: 'down', pose: 'carry', icons: ['idea'] },
  { id: 'window-1', act: 'window', tile: [16, 4], face: 'up', pose: 'stand' },
  { id: 'window-2', act: 'window', tile: [17, 4], face: 'up', pose: 'stand' },
  { id: 'plant-1', act: 'plant', tile: [20, 4], face: 'up', pose: 'stand', icons: ['drop'] },
  { id: 'plant-2', act: 'plant', tile: [9, 13], face: 'down', pose: 'stand', icons: ['drop'] },
  { id: 'dance-1', act: 'dance', tile: [17, 12], face: 'down', pose: 'cheer', icons: ['note', 'note2'] },
  { id: 'dance-2', act: 'dance', tile: [18, 12], face: 'down', pose: 'cheer', icons: ['note2'] },
  { id: 'dance-3', act: 'dance', tile: [17, 13], face: 'down', pose: 'cheer', icons: ['note'] },
  { id: 'beanbag-1', act: 'beanbag', tile: [13, 13], face: 'down', pose: 'sit', seat: seatAt(13, 13 * T + 13), icons: ['zzz'] },
  { id: 'beanbag-2', act: 'beanbag', tile: [15, 13], face: 'down', pose: 'sit', seat: seatAt(15, 13 * T + 13), icons: ['zzz'] },
  { id: 'pingpong-a', act: 'pingpong', tile: [11, 9], face: 'right', pose: 'wave', pair: 'pingpong-b' },
  { id: 'pingpong-b', act: 'pingpong', tile: [16, 9], face: 'left', pose: 'wave', pair: 'pingpong-a' },
  { id: 'foosball-a', act: 'foosball', tile: [18, 7], face: 'down', pose: 'play', pair: 'foosball-b' },
  { id: 'foosball-b', act: 'foosball', tile: [19, 9], face: 'up', pose: 'play', pair: 'foosball-a' },
];

/** Ce qu'il fait, en français (pour l'infobulle). */
export const ACT_LABEL: Record<Act, string> = {
  coffee: 'se fait un café', fridge: 'fouille dans le frigo', cook: 'cuisine', eat: 'mange à la grande table', sofa: 'joue à la console',
  arcade: 'joue à l’arcade', books: 'lit à la bibliothèque', window: 'regarde par la fenêtre', plant: 'arrose les plantes', dance: 'danse',
  beanbag: 'fait une sieste sur un pouf', pingpong: 'joue au ping-pong', foosball: 'joue au baby-foot', chat: 'discute', wander: 'se promène',
};

const SOLO: Act[] = ['coffee', 'fridge', 'cook', 'eat', 'sofa', 'arcade', 'books', 'window', 'plant', 'dance', 'beanbag', 'wander'];

// ── Les personnages ──

export class Pal {
  id: string;
  info: CharacterInfo;
  x: number;
  y: number;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  frame = 0;
  eyes: Eyes = 'open';
  hop = 0;
  path: Pt[] = [];
  moving = false;
  seated = false;
  state: 'idle' | 'going' | 'waiting' | 'doing' | 'talking' | 'exiting' = 'idle';
  /** il n'est pas dans la Pause (à son bureau, Dehors, ou chez lui : day.ts) */
  away = false;
  /** il repart vers le bureau : appelé quand il passe la porte */
  onOut?: () => void;
  act: Act = 'wander';
  spot: Spot | null = null;
  partner: Pal | null = null;
  /** jusqu'à quand il fait ce qu'il fait (ou attend avant de choisir) */
  until = 0;
  animT = 0;
  phase = Math.random() * 10;
  nextIcon = 0;
  nextBlink = 1 + Math.random() * 3;
  blinkUntil = 0;
  happyUntil = 0;
  /** pendant une discussion : celui qui parle (chacun son tour ; `first` parle le premier) */
  speaking = false;
  first = false;
  /** sa réplique quand tu viens lui parler */
  line = '';
  lineUntil = 0;
  lastLine = -1;
  /** une vitesse à son caractère : les énergiques marchent plus vite */
  speed: number;

  constructor(info: CharacterInfo, x: number, y: number) {
    this.id = info.id;
    this.info = info;
    this.x = x;
    this.y = y;
    this.speed = 40 + info.energy * 7;
  }

  get name() { return this.info.name; }
  get tile(): Tile { return [Math.max(0, Math.min(COLS - 1, Math.floor(this.x / T))), Math.max(0, Math.min(ROWS - 1, Math.floor((this.y - 2) / T)))]; }
  /** ce qu'il fait, en français */
  get doing(): string {
    if (this.state === 'talking') return 'te parle';
    if (this.act === 'chat' && this.partner) return `discute avec ${this.partner.name}`;
    if ((this.act === 'pingpong' || this.act === 'foosball') && this.partner) return `${ACT_LABEL[this.act]} avec ${this.partner.name}`;
    return this.state === 'going' ? 'se promène' : ACT_LABEL[this.act];
  }
}

export class Annex {
  /** tout le monde, même ceux qui ne sont pas là */
  everyone: Pal[] = [];
  /** ceux qui sont dans la Pause en ce moment */
  get pals() { return this.everyone.filter((p) => !p.away); }
  /** l'heure du déjeuner (on mange plus volontiers), et le vendredi, les pizzas sur la grande table (day.ts) */
  lunch = false;
  pizza = false;
  fx = new Fx();
  grid = annexGrid();
  time = 0;
  private taken = new Map<string, string>();
  /** tu diriges Roré dans la Pause */
  driving = false;
  private steerX = 0;
  private steerY = 0;
  /** Roré passe une porte en marchant (pour changer de pièce avec lui) */
  onDoor?: () => void;
  /** la musique du jukebox (la même qu'au bureau) : est-ce qu'elle joue, et l'énergie des basses */
  musicOn = false;
  musicLevel = 0;
  private noteAt = 0;
  /** quelqu'un se met à parler (ou se tait) : pour les bulles */
  version = 0;
  private listeners = new Set<() => void>();

  constructor() {
    // tout le monde arrive déjà installé, dispersé dans la pièce
    const starts: Tile[] = [[6, 6], [10, 7], [8, 10], [17, 10], [12, 7], [6, 12], [14, 11], [11, 12], [7, 8], [16, 6]];
    CHARACTERS.forEach((info, i) => {
      const t = starts[i % starts.length];
      const f = tileFeet(t);
      const p = new Pal(info, f.x, f.y);
      p.until = 0.3 + i * 0.4;
      this.everyone.push(p);
    });
  }

  get rore() { return this.everyone.find((p) => p.info.roles.includes('chef')) ?? this.everyone[0]; }
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.version++; for (const fn of this.listeners) fn(); }

  // ── Une image ──
  update(dtReal: number) {
    const dt = Math.min(0.1, dtReal);
    this.time += dt;
    this.fx.update(dt);
    const t = this.time;
    // le jukebox joue : des notes s'envolent
    if (this.musicOn && t > this.noteAt) {
      this.noteAt = t + 0.7 + Math.random() * 0.5;
      this.fx.floatIcon(19 * T + 10 + Math.random() * 12, 13 * T + 2, Math.random() < 0.5 ? 'note' : 'note2');
    }
    for (const p of this.everyone) {
      if (p.away) continue;
      if (p.lineUntil && t > p.lineUntil) { p.line = ''; p.lineUntil = 0; this.changed(); }
      if (p === this.rore && this.driving) { this.driveStep(p, dt); this.animate(p, dt); continue; }
      switch (p.state) {
        case 'idle':
          if (t > p.until) this.choose(p);
          break;
        case 'going':
          if (this.walk(p, dt)) this.arrive(p);
          break;
        case 'waiting':
          // son partenaire de jeu n'est pas encore là : il attend (pas plus de 12 s)
          if (!p.partner || p.partner.partner !== p || t > p.until) this.leave(p);
          break;
        case 'doing':
          this.play(p, t);
          if (t > p.until) this.leave(p);
          break;
        case 'talking':
          if (t > p.until) { p.state = 'idle'; p.until = t + 0.6; if (p.seated && p.spot) { p.state = 'doing'; p.until = t + 4; } }
          break;
        case 'exiting':
          // il passe la porte du bureau : il quitte la Pause
          if (this.walk(p, dt)) { p.away = true; p.moving = false; p.state = 'idle'; const fn = p.onOut; p.onOut = undefined; this.changed(); fn?.(); }
          break;
      }
      this.animate(p, dt);
    }
  }

  /** Il choisit ce qu'il va faire : ses activités préférées d'abord, parfois une discussion avec quelqu'un de libre. */
  private choose(p: Pal) {
    const t = this.time;
    const free = this.pals.filter((o) => o !== p && o.state === 'idle' && !(o === this.rore && this.driving));
    const r = Math.random();
    // une discussion (ou une partie à deux) avec un collègue libre
    if (free.length && r < 0.3) {
      const o = free[Math.floor(Math.random() * free.length)];
      const duo = (['pingpong', 'foosball'] as Act[]).filter((a) => p.info.hobbies.includes(a) || o.info.hobbies.includes(a));
      if (duo.length && Math.random() < 0.6 && this.duo(p, o, duo[Math.floor(Math.random() * duo.length)])) return;
      if (this.chat(p, o)) return;
    }
    // une activité seule : ses préférées comptent triple
    const pool: Act[] = [];
    const meal = (a: Act) => (this.lunch && (a === 'eat' || a === 'cook' || a === 'fridge') ? 3 : 0) + (this.pizza && a === 'eat' ? 4 : 0);
    for (const a of SOLO) for (let k = 0; k < (p.info.hobbies.includes(a) ? 3 : 1) + (a === 'dance' && this.musicOn ? 3 : 0) + meal(a); k++) pool.push(a);
    for (let tries = 0; tries < 6; tries++) {
      const act = pool[Math.floor(Math.random() * pool.length)];
      if (act === 'wander') { this.wander(p); return; }
      const spot = SPOTS.filter((s) => s.act === act && !s.pair && !this.taken.has(s.id));
      if (!spot.length) continue;
      this.go(p, act, spot[Math.floor(Math.random() * spot.length)]);
      return;
    }
    p.until = t + 1;
  }

  private go(p: Pal, act: Act, spot: Spot | null, tile?: Tile) {
    if (spot) this.taken.set(spot.id, p.id);
    p.act = act;
    p.spot = spot;
    const to = tile ?? spot!.tile;
    const path = findPath(this.grid, p.tile, to);
    p.path = (path ?? [to]).map(tileFeet);
    p.state = 'going';
  }

  private wander(p: Pal) {
    for (let i = 0; i < 20; i++) {
      const tx = 1 + Math.floor(Math.random() * 20), ty = 4 + Math.floor(Math.random() * 10);
      if (this.grid[ty]?.[tx]) { this.go(p, 'wander', null, [tx, ty]); return; }
    }
    p.until = this.time + 1;
  }

  /** Deux collègues se retrouvent quelque part pour discuter, face à face. */
  private chat(a: Pal, b: Pal): boolean {
    for (let i = 0; i < 20; i++) {
      const tx = 2 + Math.floor(Math.random() * 17), ty = 4 + Math.floor(Math.random() * 10);
      if (!this.grid[ty]?.[tx] || !this.grid[ty]?.[tx + 1]) continue;
      a.partner = b; b.partner = a;
      this.go(a, 'chat', null, [tx, ty]);
      this.go(b, 'chat', null, [tx + 1, ty]);
      return true;
    }
    return false;
  }

  /** Une partie à deux : chacun à son bout de la table. */
  private duo(a: Pal, b: Pal, act: Act): boolean {
    const spots = SPOTS.filter((s) => s.act === act);
    if (spots.length < 2 || spots.some((s) => this.taken.has(s.id))) return false;
    a.partner = b; b.partner = a;
    this.go(a, act, spots[0]);
    this.go(b, act, spots[1]);
    return true;
  }

  /** Avance le long de son chemin. Vrai quand il est arrivé. */
  private walk(p: Pal, dt: number): boolean {
    let budget = (p.seated ? 30 : p.speed) * dt;
    while (budget > 0 && p.path.length) {
      const q = p.path[0];
      const dx = q.x - p.x, dy = q.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && !p.seated) p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (d <= budget) { p.x = q.x; p.y = q.y; p.path.shift(); budget -= d; }
      else { p.x += (dx / d) * budget; p.y += (dy / d) * budget; budget = 0; }
    }
    p.moving = p.path.length > 0;
    return !p.path.length;
  }

  private arrive(p: Pal) {
    const t = this.time;
    p.moving = false;
    if (p.act === 'wander') { p.state = 'idle'; p.until = t + 0.8 + Math.random() * 2; return; }
    if (p.act === 'chat') {
      const o = p.partner;
      if (!o || o.partner !== p) { p.state = 'idle'; p.partner = null; p.until = t + 0.5; return; }
      p.dir = o.x > p.x ? 'right' : 'left';
      if (o.state === 'waiting') this.startDuo(p, o);
      else { p.state = 'waiting'; p.until = t + 12; }
      return;
    }
    const s = p.spot!;
    if (s.seat && !p.seated) {
      // il s'assoit
      p.seated = true;
      p.path = [s.seat];
      p.state = 'going';
      return;
    }
    p.dir = s.face;
    if (s.pair) {
      const o = p.partner;
      if (o && o.state === 'waiting') this.startDuo(p, o);
      else { p.state = 'waiting'; p.until = t + 12; }
      return;
    }
    p.state = 'doing';
    p.until = t + 7 + Math.random() * 9;
  }

  private startDuo(a: Pal, b: Pal) {
    const t = this.time;
    const len = a.act === 'chat' ? 5 + Math.random() * 4 : 10 + Math.random() * 8;
    for (const p of [a, b]) { p.state = 'doing'; p.until = t + len; p.speaking = false; p.first = p === a; p.path = []; }
    if (a.act === 'chat') { a.dir = b.x > a.x ? 'right' : 'left'; b.dir = a.x > b.x ? 'right' : 'left'; }
  }

  /** Pendant l'activité : les petites icônes, et le tour de parole des discussions. */
  private play(p: Pal, t: number) {
    if (p.act === 'chat') {
      // chacun son tour : celui qui parle fait de grands gestes
      p.speaking = (Math.floor(t / 1.4) % 2 === 0) === p.first;
      if (p.speaking && t > p.nextIcon) {
        p.nextIcon = t + 1.1 + Math.random();
        this.fx.floatIcon(p.x, p.y - 26, (['idea', 'heart', 'note', 'coffee', 'check'] as IconName[])[Math.floor(Math.random() * 5)]);
      }
      return;
    }
    const icons = p.spot?.icons;
    if (icons && t > p.nextIcon) {
      p.nextIcon = t + 2.5 + Math.random() * 3;
      this.fx.floatIcon(p.x, (p.seated && p.spot?.seat ? p.spot.seat.y : p.y) - 26, icons[Math.floor(Math.random() * icons.length)]);
      if (p.act === 'coffee') for (let i = 0; i < 4; i++) this.fx.steam(p.x - 2 + Math.random() * 4, 3 * T + 6);
    }
  }

  /** Il a fini : il se lève, libère sa place, et réfléchit à la suite. */
  private leave(p: Pal) {
    const t = this.time;
    if (p.spot) this.taken.delete(p.spot.id);
    const o = p.partner;
    // la fin d'une discussion : parfois, un « tope là »
    if (p.act === 'chat' && o && o.partner === p && o.state === 'doing' && Math.random() < 0.4) {
      for (const q of [p, o]) q.happyUntil = t + 0.9;
      this.fx.sparkle((p.x + o.x) / 2, p.y - 18, 8, '#ffd166');
    }
    if (o && o.partner === p) { o.partner = null; if (o.state === 'doing' || o.state === 'waiting') o.until = Math.min(o.until, t + 0.2); }
    p.partner = null;
    p.speaking = false;
    if (p.seated && p.spot) {
      // il se relève vers la case d'où il s'était assis
      p.seated = false;
      const f = tileFeet(p.spot.tile);
      p.x = f.x; p.y = f.y;
    }
    p.spot = null;
    p.state = 'idle';
    p.until = t + 0.6 + Math.random() * 2.5;
  }

  private animate(p: Pal, dt: number) {
    p.animT += dt;
    const t = this.time;
    const doing = p.state === 'doing';
    let pose: Pose = 'stand';
    if (p.moving && !p.seated) pose = 'walk';
    else if (p.state === 'talking') pose = t < p.until - 2.2 ? 'wave' : p.seated ? 'sit' : 'stand';
    else if (p.happyUntil > t && !p.seated) pose = 'cheer';
    else if (p.seated) pose = doing && p.spot ? p.spot.pose : 'sit';
    else if (doing && p.act === 'chat') pose = p.speaking ? 'wave' : 'stand';
    else if (doing && p.spot) pose = p.spot.pose;
    if (pose !== p.pose) { p.pose = pose; p.animT = 0; }
    const ft = p.animT;
    switch (pose) {
      case 'walk': p.frame = Math.floor(ft * 8) % 4; break;
      case 'type': case 'play': p.frame = Math.floor(ft * 7) % 2; break;
      case 'cheer': p.frame = Math.floor(ft * 5) % 2; break;
      case 'wave': p.frame = Math.floor(ft * (p.act === 'pingpong' ? 3 : 6)) % 2; break;
      default: p.frame = 0;
    }
    // le regard
    if (t > p.nextBlink) { p.blinkUntil = t + 0.12; p.nextBlink = t + 2.2 + Math.random() * 3.5; }
    let eyes: Eyes = 'open';
    p.hop = 0;
    if (p.happyUntil > t || pose === 'cheer') eyes = 'happy';
    else if (pose === 'type' || pose === 'carry' || pose === 'play') eyes = 'down';
    else if (p.act === 'window' && doing) eyes = 'up';
    else if (p.act === 'beanbag' && doing) eyes = 'blink';
    else if (pose === 'stand' || pose === 'sit') {
      const fx = idleEffect(p.info.idle, t + p.phase, pose === 'stand');
      p.hop = fx.hop;
      if (fx.eyes) eyes = fx.eyes;
      if (fx.frame !== undefined) p.frame = fx.frame;
    }
    if (p.blinkUntil > t && eyes !== 'happy') eyes = 'blink';
    p.eyes = eyes;
  }

  // ── Tu viens parler à quelqu'un ──
  /** Il s'arrête, se tourne vers toi, te salue et te dit une de ses répliques. */
  talk(p: Pal, from?: Pt) {
    const t = this.time;
    // debout, il lâche ce qu'il faisait (sa place se libère) ; assis, il reste assis et se remet à table après
    if (!p.seated) { if (p.spot) this.taken.delete(p.spot.id); p.spot = null; }
    if (p.partner) { if (p.partner.partner === p) { p.partner.partner = null; p.partner.until = t; } p.partner = null; }
    p.path = [];
    p.moving = false;
    if (!p.seated && from) {
      const dx = from.x - p.x, dy = from.y - p.y;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    const lines = p.info.lines;
    let i = Math.floor(Math.random() * lines.length);
    if (lines.length > 1 && i === p.lastLine) i = (i + 1) % lines.length;
    p.lastLine = i;
    p.line = lines[i] ?? '';
    p.lineUntil = t + 4.2;
    p.state = 'talking';
    p.until = t + 3.4;
    p.happyUntil = t + 0.8;
    this.fx.floatIcon(p.x, (p.seated && p.spot?.seat ? p.spot.seat.y : p.y) - 26, 'heart');
    this.changed();
  }

  /** Il réagit à voix haute (la fin d'un match de ping-pong, un record à l'arcade…). */
  shout(id: string, text: string) {
    const p = this.pals.find((x) => x.id === id);
    if (!p) return;
    p.line = text;
    p.lineUntil = this.time + 5;
    p.happyUntil = this.time + 1.2;
    this.fx.sparkle(p.x, (p.seated && p.spot?.seat ? p.spot.seat.y : p.y) - 20, 8, '#ffd166');
    this.changed();
  }

  /** Espace, quand tu diriges Roré : il parle au collègue le plus proche (à moins de deux cases). */
  poke() {
    const me = this.rore;
    let best: Pal | null = null, bd = 30;
    for (const p of this.pals) {
      if (p === me) continue;
      const d = Math.hypot(p.x - me.x, (p.seated && p.spot?.seat ? p.spot.seat.y : p.y) - me.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) { this.fx.floatIcon(me.x, me.y - 26, 'idea'); return false; }
    const dx = best.x - me.x, dy = best.y - me.y;
    me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    me.happyUntil = this.time + 0.6;
    this.talk(best, me);
    return true;
  }

  /** Un petit geste quand on clique sur un objet. */
  objectFx(id: string) {
    const f = ANNEX_FURNITURE.find((x) => x.id === id);
    if (!f) return;
    const cx = f.tx * T + (f.w || 1) * 8, cy = f.ty * T;
    if (id === 'coffee') { for (let i = 0; i < 10; i++) this.fx.steam(cx + Math.random() * 6, cy + 4); this.fx.floatIcon(cx, cy - 6, 'coffee'); }
    else if (id === 'fridge') this.fx.floatIcon(cx, cy - 10, 'drop');
    else if (id.startsWith('arcade')) { this.fx.sparkle(cx, cy - 8, 10, '#3fd8ff'); this.fx.floatIcon(cx, cy - 12, 'check'); }
    else if (id === 'jukebox') this.fx.floatIcon(cx, cy - 10, 'note');
    else this.fx.sparkle(cx, cy, 6, '#ffd2a8');
  }

  // ── Les allées et venues (l'heure du déjeuner, une pause, la fin de journée : day.ts) ──
  /** Il arrive dans la Pause : par la porte du bureau, ou (au chargement) déjà quelque part dans la pièce. */
  show(id: string, byDoor: boolean) {
    const p = this.everyone.find((x) => x.id === id);
    if (!p || (!p.away && p.state !== 'exiting')) return;
    this.drop(p);
    p.away = false;
    p.onOut = undefined;
    p.state = 'idle';
    if (byDoor) {
      const f = tileFeet([0, ANNEX_BACK_DOOR.row + (Math.random() < 0.5 ? 0 : 1)]);
      p.x = 4; p.y = f.y; p.dir = 'right';
      p.until = this.time + 0.2;
    } else {
      for (let i = 0; i < 30; i++) {
        const tx = 2 + Math.floor(Math.random() * 18), ty = 5 + Math.floor(Math.random() * 9);
        if (this.grid[ty]?.[tx]) { const f = tileFeet([tx, ty]); p.x = f.x; p.y = f.y; break; }
      }
      p.until = this.time + Math.random() * 2;
    }
    this.changed();
  }

  /** Il disparaît tout de suite (appelé en mission, par exemple). */
  hide(id: string) {
    const p = this.everyone.find((x) => x.id === id);
    if (!p || p.away) return;
    this.drop(p);
    p.away = true;
    p.state = 'idle';
    p.onOut = undefined;
    this.changed();
  }

  /** Il repart vers le bureau : il marche jusqu'à la porte, puis `out` (il réapparaît de l'autre côté). */
  sendOff(id: string, out: () => void, line?: string) {
    const p = this.everyone.find((x) => x.id === id);
    if (!p || p.away || p.state === 'exiting') return false;
    this.drop(p);
    const row = ANNEX_BACK_DOOR.row + (Math.random() < 0.5 ? 0 : 1);
    const path = findPath(this.grid, p.tile, [1, row]);
    p.path = [...(path ?? [[1, row] as Tile]).map(tileFeet), { x: 2, y: tileFeet([1, row]).y }];
    p.state = 'exiting';
    p.act = 'wander';
    p.onOut = out;
    if (line) { p.line = line; p.lineUntil = this.time + 3; }
    this.changed();
    return true;
  }

  /** Il lâche ce qu'il faisait : sa place, son partenaire, sa chaise. */
  private drop(p: Pal) {
    if (p.spot) this.taken.delete(p.spot.id);
    if (p.partner) { if (p.partner.partner === p) { p.partner.partner = null; p.partner.until = this.time; } p.partner = null; }
    if (p.seated && p.spot) { const f = tileFeet(p.spot.tile); p.x = f.x; p.y = f.y; }
    p.seated = false;
    p.spot = null;
    p.speaking = false;
    p.path = [];
    p.moving = false;
  }

  // ── Tu diriges Roré ──
  drive(on: boolean) {
    if (on === this.driving) return;
    const me = this.rore;
    this.driving = on;
    this.steerX = this.steerY = 0;
    me.moving = false;
    if (on) {
      if (me.spot) this.taken.delete(me.spot.id);
      if (me.partner?.partner === me) { me.partner.partner = null; me.partner.until = this.time; }
      me.partner = null;
      if (me.seated && me.spot) { const f = tileFeet(me.spot.tile); me.x = f.x; me.y = f.y; }
      me.seated = false;
      me.spot = null;
      me.path = [];
      me.state = 'idle';
      me.happyUntil = this.time + 1;
    } else if (me.seated && me.spot) {
      // il garde sa place un moment, puis se lève tout seul
      me.state = 'doing';
      me.until = this.time + 8;
    } else {
      me.state = 'idle';
      me.until = this.time + 2;
    }
  }

  /** Une place libre tout près de Roré (pouf, tabouret, canapé) : de quoi lui proposer « E · S'asseoir ». */
  seatNear(): { id: string; verb: string } | null {
    const me = this.rore;
    if (me.seated) return null;
    let best: Spot | null = null, bd = 15;
    for (const s of SPOTS) {
      if (!s.seat || this.taken.has(s.id)) continue;
      const f = tileFeet(s.tile);
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    const what = best.act === 'beanbag' ? 'le pouf' : best.act === 'sofa' ? 'le canapé' : 'le tabouret';
    return { id: best.id, verb: `S’asseoir sur ${what}` };
  }

  /** Roré s'assoit (E, quand tu le diriges). */
  sitRore(id: string) {
    const me = this.rore;
    const s = SPOTS.find((x) => x.id === id);
    if (!s?.seat || this.taken.has(s.id) || !this.driving) return;
    this.taken.set(s.id, me.id);
    me.spot = s;
    me.seated = true;
    me.x = s.seat.x;
    me.y = s.seat.y;
    me.dir = s.face;
    me.moving = false;
    me.path = [];
    me.happyUntil = this.time + 0.8;
    this.fx.floatIcon(me.x, me.y - 26, s.icons?.[0] ?? 'heart');
  }

  /** Il se relève, sur la case d'où il s'était assis. */
  standRore() {
    const me = this.rore;
    if (!me.seated) return;
    if (me.spot) {
      this.taken.delete(me.spot.id);
      const f = tileFeet(me.spot.tile);
      me.x = f.x;
      me.y = f.y;
    }
    me.seated = false;
    me.spot = null;
    me.state = 'idle';
  }

  steer(dx: number, dy: number) { this.steerX = dx; this.steerY = dy; }

  /** Roré arrive par la porte du bureau, avec toi aux commandes. */
  enterRore(y: number) {
    const me = this.rore;
    me.x = 6;
    me.y = Math.max(ANNEX_BACK_DOOR.row * T + 6, Math.min((ANNEX_BACK_DOOR.row + 2) * T - 2, y));
    me.dir = 'right';
    me.seated = false;
    this.drive(false);
    this.drive(true);
  }

  private driveStep(a: Pal, dt: number) {
    let dx = this.steerX, dy = this.steerY;
    if (!dx && !dy) { a.moving = false; return; }
    // assis (E sur un pouf, un tabouret, le canapé) : une flèche, et il se lève
    if (a.seated) this.standRore();
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    const step = 67 * dt;
    const free = (x: number, y: number) => !!this.grid[Math.floor((y - 2) / T)]?.[Math.floor(x / T)];
    const ok = (x: number, y: number) => free(x - 4, y) && free(x + 4, y) && free(x - 4, y - 5) && free(x + 4, y - 5);
    const nx = a.x + dx * step, ny = a.y + dy * step;
    if (ok(nx, ny) || !ok(a.x, a.y)) { a.x = nx; a.y = ny; }
    else if (dx && ok(nx, a.y)) a.x = nx;
    else if (dy && ok(a.x, ny)) a.y = ny;
    const row = Math.floor((a.y - 2) / T);
    const atDoor = row >= ANNEX_BACK_DOOR.row && row <= ANNEX_BACK_DOOR.row + 1;
    a.x = Math.max(atDoor ? 2 : T + 4, Math.min(21 * T - 4, a.x));
    a.y = Math.max(3 * T + 8, Math.min(15 * T - 2, a.y));
    a.moving = true;
    a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    // il franchit la porte : retour au bureau
    if (atDoor && a.x < 8) this.onDoor?.();
  }
}

// ── Les clics ──
export type AnnexHit =
  | { kind: 'pal'; id: string; label: string }
  | { kind: 'door'; label: string }
  | { kind: 'object'; id: string; label: string };

export function annexHitAt(annex: Annex, x: number, y: number, place: (f: AnnexFurn) => { x: number; y: number; w: number; h: number; sortY: number }): AnnexHit | null {
  const pals = [...annex.pals].sort((a, b) => (b.seated && b.spot?.seat ? b.spot.seat.y : b.y) - (a.seated && a.spot?.seat ? a.spot.seat.y : a.y));
  for (const p of pals) {
    const py = p.seated && p.spot?.seat ? p.spot.seat.y : p.y;
    if (x >= p.x - 7 && x <= p.x + 7 && y >= py - 21 && y <= py + 1) {
      const me = p === annex.rore && annex.driving;
      return { kind: 'pal', id: p.id, label: me ? 'Roré : tu le diriges (Espace pour parler, Échap pour le laisser)' : `${p.name}, ${p.info.archetype.toLowerCase()} · ${p.doing}` };
    }
  }
  if (x < T + 30 && y >= ANNEX_BACK_DOOR.row * T - 18 && y < (ANNEX_BACK_DOOR.row + 2) * T && (x < T || y < ANNEX_BACK_DOOR.row * T - 9)) return { kind: 'door', label: 'La porte du bureau : retour au travail' };
  const placed = ANNEX_FURNITURE.map((f) => ({ f, ...place(f) })).sort((a, b) => b.sortY - a.sortY);
  for (const p of placed) {
    if (x >= p.x + 1 && x < p.x + p.w - 1 && y >= p.y + 1 && y < p.y + p.h - 1) return { kind: 'object', id: p.f.id, label: p.f.label };
  }
  return null;
}
