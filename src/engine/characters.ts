// Les personnages du bureau (le catalogue : src/characters/catalog.json). Chacun est un robot du bureau,
// au même gabarit que les autres (robots.ts), avec sa tenue : ses couleurs et ses pièces (capuche,
// chapeau, cape…), et sa façon d'attendre (world.ts, `animate`). Ici : qui porte quel personnage.
import catalog from '../characters/catalog.json';
import { NAMES } from '../../shared/activity.ts';
import type { Role } from '../../shared/protocol.ts';
import type { Eyes, Outfit } from './robots.ts';

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
  silhouette: string;
  accessories: string[];
  temperament: string;
  energy: number;
  idle: Idle;
  workLabel: string;
  outfit: Outfit;
  /** ses activités préférées dans la Pause (annex.ts) */
  hobbies: string[];
  /** ce qu'il te dit quand tu viens lui parler, dans la Pause */
  lines: string[];
}

/** Sa personnalité quand il n'a rien à faire (debout ou assis) : son regard, un petit saut, l'image à montrer.
 *  `t` est son horloge (celle du bureau, décalée pour chacun). */
export function idleEffect(idle: Idle | undefined, t: number, standing: boolean): { eyes?: Eyes; hop: number; frame?: number } {
  const k = t % 6;
  switch (idle) {
    case 'bounce': return { hop: k < 0.9 && Math.floor(k * 7) % 2 ? 1 : 0 }; // trois petits sauts, puis elle se calme
    case 'shimmer': return { hop: 0, frame: Math.floor(t * 2.5) % 2 }; // le cristal de son bâton scintille
    case 'blink': return { hop: 0, eyes: (k > 2 && k < 2.12) || (k > 2.3 && k < 2.42) ? 'blink' : undefined }; // son écran cligne deux fois
    case 'check': return { hop: 0, eyes: k > 3.6 ? 'down' : undefined }; // elle consulte sa tablette
    case 'pose': return k < 1.1 ? { hop: standing ? 1 : 0, eyes: 'happy' } : { hop: 0 }; // elle prend la pose
    case 'scan': return { hop: 0, eyes: (['left', 'open', 'right', 'up', 'open', 'left'] as Eyes[])[Math.floor(k)] }; // il regarde partout
    case 'supervise': return { hop: 0, eyes: k > 4.4 ? (k > 5.2 ? 'right' : 'left') : undefined }; // il passe en revue son équipe
    default: return { hop: 0 };
  }
}

/** Tout le catalogue. */
export const CHARACTERS = catalog.characters as unknown as CharacterInfo[];
export const characterInfo = (id: string | null | undefined) => CHARACTERS.find((c) => c.id === id) ?? null;
/** La tenue d'un personnage (null : ce n'est pas un personnage, mais un métier). */
export const outfitOf = (id: string) => characterInfo(id)?.outfit ?? null;

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
  if (chosen && characterInfo(chosen)) return chosen;
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
