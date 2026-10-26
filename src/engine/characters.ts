// Les personnages en pixel art, générés avec PixelLab (le catalogue : src/characters/catalog.json ;
// l'import des images : scripts/characters.py). Chacun a ses huit rotations et, parfois, sa marche ou
// son geste de travail. Ce qu'il n'a pas, on le joue avec ses rotations : il respire, se retourne,
// sautille, ses lumières scintillent. Tant que ses images chargent, le robot de son métier le remplace.
import catalog from '../characters/catalog.json';
import sheetsJson from '../characters/sheets.json';
import { NAMES } from '../../shared/activity.ts';
import type { Role } from '../../shared/protocol.ts';
import { darken, g2d, lighten, makeCanvas, mirror, P } from './pixels.ts';
import type { Dir, Pose } from './robots.ts';

/** Ce qu'il fait quand il attend (sa personnalité, en mouvement). */
export type Idle = 'breathe' | 'bounce' | 'shimmer' | 'blink' | 'check' | 'pose' | 'scan' | 'supervise';

export interface CharacterInfo {
  id: string;
  name: string;
  roles: Role[];
  family: string;
  archetype: string;
  pitch: string;
  palette: string[];
  accent: string;
  /** une lumière qui brille dans le noir (visière, cristal…), à y pixels au-dessus des pieds */
  glow?: { y: number; color: string };
  silhouette: string;
  accessories: string[];
  temperament: string;
  energy: number;
  idle: Idle;
  workLabel: string;
  pixellab: string | null;
  prompt: string;
}

interface Sheet {
  cell: [number, number];
  /** les pieds, dans la case */
  anchor: [number, number];
  /** des pieds au haut de la tête */
  height: number;
  /** ses couleurs principales, mesurées sur son image de face */
  palette?: string[];
  rotations: string[];
  anims: Record<string, { dirs: string[]; frames: number }>;
  v?: string;
}

const SHEETS = sheetsJson as unknown as Record<string, Sheet>;
/** Tout le catalogue, même les personnages qui n'ont pas encore d'images. */
export const CATALOG = catalog.characters as unknown as CharacterInfo[];
/** Ceux qu'on peut afficher : leurs images sont dans public/characters/. */
export const CHARACTERS = CATALOG.filter((c) => SHEETS[c.id]);
export const characterInfo = (id: string | null | undefined) => CHARACTERS.find((c) => c.id === id) ?? null;
export const characterAnims = (id: string) => Object.keys(SHEETS[id]?.anims ?? {});
/** Ses vraies couleurs (mesurées sur ses images), sinon celles prévues au catalogue. */
export const characterPalette = (c: CharacterInfo) => SHEETS[c.id]?.palette ?? c.palette;

/** Assis, il s'enfonce un peu : le bureau cache le bas de son corps. */
export const SIT_DROP = 5;

const DIR: Record<Dir, string> = { down: 'south', up: 'north', right: 'east', left: 'west' };

// ── Le chargement ──
interface Loaded {
  rot: Map<string, HTMLCanvasElement>;
  /** la même rotation, le haut du corps un pixel plus bas (il expire) */
  breath: Map<string, HTMLCanvasElement>;
  /** de face : ses lumières plus vives, ou éteintes (un clignement) */
  glint: HTMLCanvasElement;
  dim: HTMLCanvasElement;
  /** `${animation}|${direction}` → ses images */
  anims: Map<string, HTMLCanvasElement[]>;
}

const loaded = new Map<string, Loaded>();
const pending = new Map<string, Promise<boolean>>();

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

function cut(img: HTMLImageElement, w: number, h: number, col: number, row: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  g2d(c).drawImage(img, col * w, row * h, w, h, 0, 0, w, h);
  return c;
}

/** Le haut du corps descend d'un pixel ; les jambes ne bougent pas. */
function exhale(src: HTMLCanvasElement, waist: number): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const g = g2d(c);
  g.drawImage(src, 0, waist, src.width, src.height - waist, 0, waist, src.width, src.height - waist);
  g.drawImage(src, 0, 0, src.width, waist, 0, 1, src.width, waist);
  return c;
}

/** Une marche de secours, quand PixelLab n'a pas dessiné cette direction : à partir de la rotation,
 *  le pied gauche puis le pied droit se lèvent d'un pixel (4 images : appui, pas, appui, pas). */
function steps(src: HTMLCanvasElement, feet: number): HTMLCanvasElement[] {
  const top = feet - 5;
  const h = feet - top + 1;
  const mid = Math.floor(src.width / 2);
  const lift = (right: boolean) => {
    const c = makeCanvas(src.width, src.height);
    const g = g2d(c);
    g.drawImage(src, 0, 0);
    const x = right ? mid : 0, w = right ? src.width - mid : mid;
    g.clearRect(x, top, w, h);
    g.drawImage(src, x, top, w, h, x, top - 1, w, h);
    return c;
  };
  return [src, lift(false), src, lift(true)];
}

function hueOf(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max / 255 };
}

/** Recolore ses pixels lumineux (ceux qui ont la teinte de sa lumière). */
function relight(src: HTMLCanvasElement, color: string, fn: (hex: string) => string): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const g = g2d(c);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const n = parseInt(color.slice(1), 16);
  const target = hueOf((n >> 16) & 255, (n >> 8) & 255, n & 255).h;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const { h, s, v } = hueOf(d[i], d[i + 1], d[i + 2]);
    const gap = Math.min(Math.abs(h - target), 360 - Math.abs(h - target));
    if (gap > 24 || s < 0.35 || v < 0.5) continue;
    const out = parseInt(fn('#' + [d[i], d[i + 1], d[i + 2]].map((x) => x.toString(16).padStart(2, '0')).join('')).slice(1), 16);
    d[i] = (out >> 16) & 255; d[i + 1] = (out >> 8) & 255; d[i + 2] = out & 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Charge ses images (une seule fois). Vrai quand il est prêt à s'afficher. */
export function loadCharacter(id: string): Promise<boolean> {
  const sheet = SHEETS[id];
  const info = characterInfo(id);
  if (!sheet || !info) return Promise.resolve(false);
  let p = pending.get(id);
  if (p) return p;
  const url = (file: string) => `${import.meta.env.BASE_URL}characters/${id}/${file}.png${sheet.v ? `?v=${sheet.v}` : ''}`;
  const keys = Object.keys(sheet.anims);
  p = Promise.all([image(url('rotations')), ...keys.map((k) => image(url(k)))]).then(([rotImg, ...animImgs]) => {
    const [w, h] = sheet.cell;
    const waist = sheet.anchor[1] - Math.round(sheet.height * 0.42);
    const L: Loaded = { rot: new Map(), breath: new Map(), glint: makeCanvas(1, 1), dim: makeCanvas(1, 1), anims: new Map() };
    sheet.rotations.forEach((d, i) => {
      const c = cut(rotImg, w, h, i, 0);
      L.rot.set(d, c);
      L.breath.set(d, exhale(c, waist));
    });
    const light = info.glow?.color ?? info.accent;
    const south = L.rot.get('south') ?? [...L.rot.values()][0];
    L.glint = relight(south, light, (x) => lighten(x, 0.45));
    L.dim = relight(south, light, (x) => darken(x, 0.7));
    keys.forEach((k, i) => {
      const a = sheet.anims[k];
      a.dirs.forEach((d, row) => {
        const frames: HTMLCanvasElement[] = [];
        for (let col = 0; col < a.frames; col++) frames.push(cut(animImgs[i], w, h, col, row));
        L.anims.set(`${k}|${d}`, frames);
      });
      // vers la gauche : le miroir de la droite, si PixelLab n'a pas dessiné la gauche
      if (!L.anims.has(`${k}|west`) && L.anims.has(`${k}|east`)) L.anims.set(`${k}|west`, L.anims.get(`${k}|east`)!.map(mirror));
    });
    // les directions de marche qui manquent encore : des pas à partir de ses rotations (jamais de glissade)
    for (const d of ['south', 'east', 'north', 'west']) {
      if (!L.anims.has(`walk|${d}`) && L.rot.has(d)) L.anims.set(`walk|${d}`, steps(L.rot.get(d)!, sheet.anchor[1]));
    }
    loaded.set(id, L);
    return true;
  }).catch(() => false);
  pending.set(id, p);
  return p;
}

// ── Quelle image, maintenant ──
export interface FrameArgs {
  pose: Pose;
  dir: Dir;
  moving: boolean;
  seated: boolean;
  /** depuis quand il est dans cette pose (secondes) */
  animT: number;
  /** l'horloge du bureau, décalée pour chacun (ils ne respirent pas tous en même temps) */
  t: number;
}

/** L'image à dessiner, et où la poser par rapport à ses pieds. null tant qu'elle n'est pas chargée. */
export interface Frame { c: HTMLCanvasElement; x: number; y: number }

export function characterFrame(id: string, p: FrameArgs): Frame | null {
  const L = loaded.get(id);
  const sheet = SHEETS[id];
  const info = characterInfo(id);
  if (!L || !sheet || !info) { void loadCharacter(id); return null; }
  const [ax, ay] = sheet.anchor;
  const t = p.t;
  const out = (c: HTMLCanvasElement, dx = 0, dy = 0): Frame => ({ c, x: -ax + dx, y: -ay + dy });
  const rot = (d: string) => L.rot.get(d) ?? L.rot.get('south')!;
  const anim = (k: string, d: string) => L.anims.get(`${k}|${d}`) ?? null;
  const loop = (frames: HTMLCanvasElement[], fps: number) => frames[Math.floor(p.animT * fps) % frames.length];
  const dir = DIR[p.dir];
  const sway = (period: number) => (Math.floor(t / period) % 2 ? 'south-east' : 'south-west');

  if (p.seated) {
    const dy = SIT_DROP;
    if (p.pose === 'cheer') return out(rot(sway(0.25)), 0, dy - (Math.floor(t * 8) % 2));
    // il demande la permission : il s'agite sur sa chaise pour qu'on le voie
    if (p.pose === 'raise') return out(rot('south'), 0, dy - (Math.floor(t * 6) % 2));
    if (p.pose === 'type') {
      const work = anim('work', 'south');
      if (work) return out(loop(work, 8), 0, dy);
      // sans animation de travail : les épaules qui bougent au rythme des touches
      return out(Math.floor(t * 4) % 2 ? L.breath.get('south')! : rot('south'), 0, dy);
    }
    if (p.pose === 'read') return out(rot(['south', 'south-east', 'south', 'south-west'][Math.floor(t / 1.1) % 4]), 0, dy);
    return idle(L, info, 'south', t, dy, out, rot);
  }

  switch (p.pose) {
    case 'walk':
    case 'carry': {
      if (!p.moving) return out(rot(dir));
      // un cycle de pas toutes les demi-secondes, quel que soit le nombre d'images
      const walk = anim('walk', dir) ?? [rot(dir)];
      return out(loop(walk, walk.length * 2));
    }
    case 'cheer':
      return out(rot(sway(0.25)), 0, -Math.round(Math.abs(Math.sin(t * Math.PI * 4)) * 2));
    case 'wave': {
      const hi = anim('interact', dir);
      if (hi) return out(loop(hi, 8));
      return out(rot(dir === 'south' ? sway(0.35) : dir), 0, -(Math.floor(t * 6) % 2));
    }
    case 'raise':
      return out(rot(dir), 0, -(Math.floor(t * 6) % 2));
    case 'write':
      // au tableau, de dos : le bras qui écrit fait bouger tout le buste
      return out(Math.floor(t * 3) % 2 ? L.breath.get(dir) ?? rot(dir) : rot(dir), Math.floor(t * 1.5) % 2);
    default:
      return idle(L, info, dir, t, 0, out, rot);
  }
}

/** Debout ou assis, sans rien à faire : sa personnalité. */
function idle(L: Loaded, info: CharacterInfo, dir: string, t: number, dy: number, out: (c: HTMLCanvasElement, dx?: number, dy?: number) => Frame, rot: (d: string) => HTMLCanvasElement): Frame {
  const breathing = t % 2.4 > 1.5;
  const still = (d: string) => (breathing ? L.breath.get(d) : null) ?? rot(d);
  if (dir !== 'south') return out(still(dir), 0, dy);
  switch (info.idle) {
    case 'bounce': {
      // l'impatience : trois petits sauts, puis elle se calme
      const k = t % 3;
      return out(still('south'), 0, dy - (k < 0.84 && Math.floor(k * 7) % 2 ? 1 : 0));
    }
    case 'shimmer':
      return out(t % 3.2 < 0.5 ? L.glint : still('south'), 0, dy);
    case 'blink': {
      const k = t % 3.6;
      return out(k < 0.14 || (k > 0.3 && k < 0.44) ? L.dim : still('south'), 0, dy);
    }
    case 'check':
      // elle baisse les yeux vers sa tablette, un long moment
      return out(t % 6 > 4.2 ? L.breath.get('south')! : rot('south'), 0, dy);
    case 'pose':
      return out(still(['south', 'south-east', 'south', 'south-west'][Math.floor(t / 1.6) % 4]), 0, dy);
    case 'scan':
      return out(still(['south', 'south-east', 'east', 'south', 'south-west', 'west'][Math.floor(t / 1.2) % 6]), 0, dy);
    case 'supervise': {
      const k = t % 9;
      return out(still(k < 6 ? 'south' : k < 7.5 ? 'south-east' : 'south-west'), 0, dy);
    }
    default:
      return out(still('south'), 0, dy);
  }
}

/** Sa tête et ses épaules, en 16 × 16 (le portrait du dialogue). */
export function characterPortrait(id: string | null): HTMLCanvasElement | null {
  const L = id ? loaded.get(id) : null;
  const sheet = id ? SHEETS[id] : null;
  if (!L || !sheet) { if (id) void loadCharacter(id); return null; }
  const [ax, ay] = sheet.anchor;
  const top = ay - sheet.height + 1;
  const c = makeCanvas(16, 16);
  g2d(c).drawImage(L.rot.get('south')!, ax - 8, top - 1, 16, 16, 0, 0, 16, 16);
  return c;
}

/** Debout, de face (les avatars de l'interface) : son image et le cadre 24 × 32 autour de lui, pieds en bas. */
export function characterStill(id: string | null, dir = 'south'): { c: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null {
  const L = id ? loaded.get(id) : null;
  const sheet = id ? SHEETS[id] : null;
  if (!L || !sheet) return null;
  const [ax, ay] = sheet.anchor;
  return { c: L.rot.get(dir) ?? L.rot.get('south')!, x: ax - 12, y: ay - 30, w: 24, h: 32 };
}

/** Une animation de l'aperçu de la galerie : ses images, dans une direction. */
export function characterClip(id: string, anim: string, dir = 'south'): HTMLCanvasElement[] | null {
  return loaded.get(id)?.anims.get(`${anim}|${dir}`) ?? null;
}

/** Sa hauteur au-dessus des pieds : pour les bulles, les icônes et les clics. */
export function lookTop(id: string | null, seated: boolean): number {
  const s = id ? SHEETS[id] : null;
  if (!s) return seated ? 19 : 22;
  return s.height - (seated ? SIT_DROP : 0);
}

/** La lumière qui brille sur lui dans le noir (les yeux du robot, la visière du hacker…). */
export function lookGlow(id: string | null, seated: boolean): { y: number; color: string } | null {
  if (!id || !SHEETS[id]) return { y: 13, color: P.orange };
  const g = characterInfo(id)?.glow;
  return g ? { y: g.y + (seated ? SIT_DROP : 0), color: g.color } : null;
}

// ── Qui porte quel personnage ──
const LOOKS_KEY = 'bureau:looks';
/** On a choisi le robot du métier plutôt qu'un personnage. */
export const ROBOT = 'robot';

let looks: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem(LOOKS_KEY) ?? '{}') ?? {}; } catch { return {}; }
})();
let looksVersion = 0;
const lookListeners = new Set<() => void>();

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
/** Le chef n'a qu'un prénom ; les agents gardent le personnage de leur prénom d'une mission à l'autre. */
const lookKey = (role: Role, name: string) => (role === 'chef' ? '@chef' : name);

/** Le personnage d'un agent : celui qu'on lui a choisi, sinon un personnage de son métier, toujours le même pour
 *  un même prénom (Ada, Linus et Grace, les trois premiers prénoms du code, n'ont pas le même). S'il est déjà porté
 *  par un collègue présent (`taken`), on prend le suivant libre. null = le robot du métier. */
export function lookFor(role: Role, name: string, taken: Iterable<string | null> = []): string | null {
  const chosen = looks[lookKey(role, name)];
  if (chosen === ROBOT) return null;
  if (chosen && SHEETS[chosen]) return chosen;
  const mine = CHARACTERS.filter((c) => c.roles.includes(role));
  const pool = mine.length || role === 'chef' ? mine : CHARACTERS.filter((c) => !c.roles.includes('chef'));
  if (!pool.length) return null;
  const at = NAMES[role].indexOf(name);
  const start = at >= 0 ? at : hash(name);
  const busy = new Set(taken);
  for (let i = 0; i < pool.length; i++) {
    const c = pool[(start + i) % pool.length];
    if (!busy.has(c.id)) return c.id;
  }
  // tous ceux de son métier sont déjà là : un personnage libre d'un autre métier, plutôt qu'un sosie
  const others = role === 'chef' ? [] : CHARACTERS.filter((c) => !c.roles.includes('chef') && !busy.has(c.id));
  return others.length ? others[start % others.length].id : pool[start % pool.length].id;
}

/** Est-ce un choix (et pas le personnage par défaut de son métier) ? */
export const lookChosen = (role: Role, name: string) => lookKey(role, name) in looks;

/** Change le personnage d'un agent (null = le robot ; undefined = revenir au choix du métier). */
export function setLook(role: Role, name: string, id: string | null | undefined) {
  const key = lookKey(role, name);
  if (id === undefined) delete looks[key];
  else looks[key] = id ?? ROBOT;
  looks = { ...looks };
  try { localStorage.setItem(LOOKS_KEY, JSON.stringify(looks)); } catch { /* navigation privée */ }
  looksVersion++;
  for (const fn of lookListeners) fn();
}

export function onLooks(fn: () => void) { lookListeners.add(fn); return () => { lookListeners.delete(fn); }; }
export const getLooksVersion = () => looksVersion;
