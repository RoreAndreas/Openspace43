// La journée du bureau. Les habitués (les personnages du catalogue) ont leur bureau et leurs horaires : ils
// arrivent le matin, déjeunent dans la Pause, font des pauses (un café, une visite à un collègue), et rentrent le
// soir, chacun à son heure (Nyx tard, Boulon jamais : la nuit, il se met en veille). En dehors de tes heures de
// travail (les Réglages), ceux qui aiment le grand air sortent Dehors ; les jours non travaillés, les autres restent
// chez eux. Et de temps en temps, il se passe quelque chose : l'imprimante se bloque, Pixel fait tomber une tasse, un
// anniversaire. Le vendredi midi, pizza. L'heure est celle de ton ordinateur. Le monde (world.ts), la Pause (annex.ts)
// et Dehors (outside.ts) les font marcher ; ici, on décide.
import { DEFAULT_HOURS, isWorkTime, type WorkHours } from '../state/hours.ts';
import type { Annex } from './annex.ts';
import { CHARACTERS, characterInfo } from './characters.ts';
import type { Outside } from './outside.ts';
import type { Actor, World } from './world.ts';

type Place = Actor['place'];

const hm = (h: number, m = 0) => h * 60 + m;

interface Hours {
  arrive: number;
  lunch: [number, number];
  leave: number;
  /** l'afterwork dans la Pause, jusqu'à cette heure */
  after?: number;
  /** la nuit, il reste à son bureau, en veille */
  night?: boolean;
}

/** Les horaires de chacun (en minutes depuis minuit). */
const HOURS: Record<string, Hours> = {
  hacker_cyberpunk: { arrive: hm(10, 5), lunch: [hm(13, 10), hm(13, 50)], leave: hm(23, 30) },
  mage_du_code: { arrive: hm(8, 40), lunch: [hm(12), hm(13)], leave: hm(17, 45) },
  robot_ingenieur: { arrive: hm(7, 30), lunch: [hm(12, 20), hm(12, 50)], leave: hm(20), night: true },
  analyste_strategique: { arrive: hm(8, 15), lunch: [hm(12, 30), hm(13, 15)], leave: hm(18, 40) },
  styliste_extravagant: { arrive: hm(9, 30), lunch: [hm(12, 45), hm(14)], leave: hm(17, 30), after: hm(20, 30) },
  explorateur_futuriste: { arrive: hm(8, 50), lunch: [hm(12, 10), hm(13)], leave: hm(18), after: hm(19, 30) },
  hares: { arrive: hm(8), lunch: [hm(12), hm(12, 40)], leave: hm(19, 15) },
};

const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Les horaires d'un personnage (un nouveau venu du catalogue a des horaires de bureau, décalés selon son nom). */
function hoursOf(id: string): Hours {
  if (HOURS[id]) return HOURS[id];
  const k = hash(id) % 40;
  return { arrive: hm(8, 30) + k, lunch: [hm(12) + k, hm(13) + k], leave: hm(18) + k };
}

/** Ceux qui aiment prendre l'air (la fenêtre, les plantes, la promenade) : les trois premiers sortent Dehors. */
const AIRY = new Set(CHARACTERS
  .filter((c) => !c.roles.includes('chef'))
  .map((c) => ({ id: c.id, k: ['window', 'plant', 'wander'].filter((x) => c.hobbies.includes(x)).length }))
  .filter((x) => x.k > 0)
  .sort((a, b) => b.k - a.k)
  .slice(0, 3)
  .map((x) => x.id));

/** Ce qu'il faut savoir de l'heure : les minutes depuis minuit, et tes heures de travail (aujourd'hui, maintenant). */
interface Now { min: number; workday: boolean; free: boolean; freeAt: (min: number) => boolean }

/** Où il devrait être à cette heure. */
export function wanted(id: string, h: Hours, n: Now): { place: Place; asleep: boolean } {
  const { min } = n;
  const airy = AIRY.has(id);
  // un jour non travaillé : personne au bureau (Boulon reste en veille) ; les amateurs de grand air passent l'après-midi Dehors
  if (!n.workday) {
    if (h.night) return { place: 'office', asleep: true };
    return { place: airy && min >= hm(11) && min < hm(17) ? 'outside' : 'home', asleep: false };
  }
  const w = inDay(h, min);
  if (!airy || !n.free || w.asleep) return w;
  // en dehors des heures de travail, il prend l'air au lieu de rester ; et s'il part après la fin, il traîne un peu Dehors
  if (w.place !== 'home') return { place: 'outside', asleep: false };
  if (min >= h.leave && min < h.leave + 75 && n.freeAt(h.leave)) return { place: 'outside', asleep: false };
  return w;
}

/** Sa journée à lui, d'après ses horaires. */
function inDay(h: Hours, min: number): { place: Place; asleep: boolean } {
  if (min < h.arrive) return h.night ? { place: 'office', asleep: true } : { place: 'home', asleep: false };
  if (min >= h.lunch[0] && min < h.lunch[1]) return { place: 'annex', asleep: false };
  if (min < h.leave) return { place: 'office', asleep: false };
  if (h.after && min < h.after) return { place: 'annex', asleep: false };
  return h.night ? { place: 'office', asleep: true } : { place: 'home', asleep: false };
}

const HELLO = ['Salut l’équipe !', 'Bonjour Roré !', 'Bonjour tout le monde !', 'Le café est prêt ?'];
const LUNCH = ['On va manger ?', 'J’ai faim !', 'À tout à l’heure !'];
const BYE = ['Bonne soirée !', 'À demain !', 'Je file !'];
const AFTER = ['Un petit afterwork ?', 'Une partie de baby-foot ?'];
const AIR = ['Je vais prendre l’air !', 'Un tour au bord de la mer ?', 'Allez, dehors !'];
const BACK = ['Ça fait du bien, l’air du large !', 'Me revoilà !'];
const BREAK = ['Une petite pause !', 'Je reviens !'];
const COFFEE = ['Un petit café ?', 'Pause café !', 'Il me faut un café.'];
const VISITS: [string, string][] = [
  ['Tu as une minute ?', 'Bien sûr !'], ['Tu as vu le dernier rapport ?', 'Oui, top !'], ['On déjeune ensemble ?', 'Avec plaisir !'],
  ['Ton écran est magnifique.', 'Merci !'], ['Tu m’aides sur un truc ?', 'J’arrive !'], ['Il est où, le chat ?', 'Sur le canapé, je crois.'],
];

const pick = <X,>(list: X[]): X => list[Math.floor(Math.random() * list.length)];

export type DayEvent = 'printer' | 'mug' | 'cake';

export class Day {
  /** pour essayer une autre heure (en heures décimales), sinon celle de l'ordinateur */
  private fakeHour: number | null = null;
  private nextCheck = 0;
  private nextBreak = 25 + Math.random() * 20;
  private nextEvent = 80 + Math.random() * 60;
  private forced: DayEvent | null = null;
  /** ceux qui font une pause dans la Pause : jusqu'à quand */
  private pauseUntil = new Map<string, number>();
  private cakeDay = '';
  private world: World;
  private annex: Annex;
  private outside: Outside;
  /** tes heures de travail (les Réglages ; la boucle d'Office.tsx les tient à jour) */
  hours: WorkHours = DEFAULT_HOURS;

  constructor(world: World, annex: Annex, outside: Outside) {
    this.world = world;
    this.annex = annex;
    this.outside = outside;
    for (const c of CHARACTERS) if (!c.roles.includes('chef') && c.roles[0]) world.addRegular(c.id, c.roles[0], c.name);
    // appelé en mission pendant qu'il était dans la Pause ou Dehors : il en sort tout de suite
    world.onEnlist = (id) => { annex.hide(id); outside.hide(id); this.pauseUntil.delete(id); };
    this.settle();
  }

  private date() {
    const d = new Date();
    if (this.fakeHour !== null) d.setHours(Math.floor(this.fakeHour), Math.round((this.fakeHour % 1) * 60), 0, 0);
    return d;
  }

  private now(): Now {
    const d = this.date();
    const at = (min: number) => { const x = new Date(d); x.setHours(Math.floor(min / 60), min % 60, 0, 0); return x; };
    return {
      min: d.getHours() * 60 + d.getMinutes(),
      workday: this.hours.days.includes(d.getDay()),
      free: !isWorkTime(this.hours, d),
      freeAt: (min) => !isWorkTime(this.hours, at(min)),
    };
  }

  private where(a: Actor, n = this.now()) { return wanted(a.regular!, hoursOf(a.regular!), n); }

  /** Il sort Dehors (par la porte du pavillon, ou déjà installé). */
  private showOutside(id: string, byDoor: boolean) {
    const info = characterInfo(id);
    if (info) this.outside.show(info, byDoor);
  }

  /** Essayer une autre heure (null : celle de l'ordinateur). Tout le monde se met aussitôt à sa place. */
  setClock(hour: number | null) {
    this.fakeHour = hour;
    this.settle();
  }

  /** Provoquer un événement tout de suite (pour essayer). */
  trigger(e: DayEvent) {
    this.forced = e;
    this.nextEvent = 0;
    this.nextCheck = 0;
  }

  /** Tout le monde à sa place, sans les voir marcher (au chargement). */
  settle() {
    const n = this.now();
    for (const a of this.world.regulars.values()) {
      if (!a.resident) continue;
      const w = this.where(a, n);
      this.world.placeRegular(a, w.place, w.asleep);
      if (w.place === 'annex') this.annex.show(a.regular!, false);
      else this.annex.hide(a.regular!);
      if (w.place === 'outside') this.showOutside(a.regular!, false);
      else this.outside.hide(a.regular!);
    }
    this.pauseUntil.clear();
    this.flags();
  }

  private flags() {
    const d = this.date();
    const min = d.getHours() * 60 + d.getMinutes();
    this.annex.lunch = min >= hm(11, 50) && min < hm(14, 15);
    this.annex.pizza = this.annex.lunch && d.getDay() === 5;
  }

  /** Une fois par seconde : qui doit bouger, une pause, un événement. */
  update() {
    const now = this.world.time;
    if (now < this.nextCheck) return;
    this.nextCheck = now + 1;
    this.flags();
    this.reconcile(now);
    if (now > this.nextBreak) { this.nextBreak = now + 35 + Math.random() * 40; this.takeBreak(now); }
    if (now > this.nextEvent) { this.nextEvent = now + 150 + Math.random() * 150; this.happen(this.forced); this.forced = null; }
  }

  /** Chacun là où il devrait être (un départ par seconde au plus : ils ne partent pas en troupeau). */
  private reconcile(now: number) {
    const { world, annex, outside } = this;
    const n = this.now();
    const min = n.min;
    let moved = false;
    for (const a of world.regulars.values()) {
      if (!a.resident || a.outing) continue;
      const id = a.regular!;
      const h = hoursOf(id);
      const w = wanted(id, h, n);
      if (a.place === w.place) {
        // Boulon se met en veille le soir, et se réveille le matin
        if (a.place === 'office' && a.seated && a.asleep !== w.asleep) {
          a.asleep = w.asleep;
          world.say(a, w.asleep ? 'Mise en veille…' : pick(HELLO));
        }
        continue;
      }
      // une pause dans la Pause : il y reste jusqu'à l'heure dite
      if (a.place === 'annex' && w.place === 'office' && (this.pauseUntil.get(id) ?? 0) > now) continue;
      if (moved) continue;
      const friday = this.date().getDay() === 5;
      switch (`${a.place}>${w.place}`) {
        case 'home>office': case 'home>annex':
          world.comeIn(a, pick(HELLO)); moved = true; break;
        case 'office>annex':
          world.toPause(a, () => annex.show(id, true), min >= h.leave ? pick(AFTER) : friday ? 'C’est vendredi : pizza !' : pick(LUNCH)); moved = true; break;
        case 'office>home':
          world.goHome(a, pick(BYE)); moved = true; break;
        case 'annex>office':
          this.pauseUntil.delete(id);
          moved = annex.sendOff(id, () => world.fromPause(a, 'desk'));
          break;
        case 'annex>home':
          moved = annex.sendOff(id, () => world.fromPause(a, 'home', pick(BYE)), pick(BYE));
          break;
        case 'office>outside':
          world.goOut(a, pick(AIR), () => this.showOutside(id, true)); moved = true; break;
        case 'annex>outside':
          moved = annex.sendOff(id, () => world.fromPause(a, 'outside', pick(AIR), () => this.showOutside(id, true)), pick(AIR));
          break;
        case 'home>outside':
          world.placeRegular(a, 'outside', false); this.showOutside(id, true); moved = true; break;
        case 'outside>office':
          // il rentre par la porte du pavillon, et réapparaît à la porte d'entrée du bureau
          moved = outside.sendIn(id, () => { world.placeRegular(a, 'home', false); world.comeIn(a, pick(BACK)); });
          break;
        case 'outside>annex':
          moved = outside.sendIn(id, () => { world.placeRegular(a, 'annex', false); annex.show(id, true); });
          break;
        case 'outside>home':
          moved = outside.sendIn(id, () => world.placeRegular(a, 'home', false));
          break;
      }
    }
  }

  /** Ceux qui sont à leur bureau, libres (ni en mission, ni en route, ni en veille). */
  private atDesks() {
    const n = this.now();
    return [...this.world.regulars.values()].filter((a) => a.resident && a.place === 'office' && a.seated && !a.outing && !a.asleep
      && this.where(a, n).place === 'office');
  }

  /** Une pause : un café, la fontaine, une visite à un collègue, ou un tour dans la Pause. */
  private takeBreak(now: number) {
    const free = this.atDesks();
    if (!free.length) return;
    const a = pick(free);
    const r = Math.random();
    if (r < 0.35) this.world.drinkBreak(a, true, Math.random() < 0.6 ? pick(COFFEE) : undefined);
    else if (r < 0.5) this.world.drinkBreak(a, false);
    else if (r < 0.82 && free.length > 1) this.world.visit(a, pick(free.filter((b) => b !== a)), pick(VISITS));
    else {
      this.pauseUntil.set(a.regular!, now + 40 + Math.random() * 40);
      this.world.toPause(a, () => this.annex.show(a.regular!, true), pick(BREAK));
    }
  }

  /** Il se passe quelque chose au bureau. */
  private happen(force: DayEvent | null) {
    const { world } = this;
    const free = this.atDesks();
    const today = this.date().toDateString();
    const hour = this.date().getHours();
    const can: DayEvent[] = [];
    if (free.length && world.time > world.jamUntil) can.push('printer');
    if (free.length) can.push('mug');
    if (free.length >= 3 && this.cakeDay !== today && hour >= 10 && hour < 18) can.push('cake');
    const e = force && can.includes(force) ? force : can.length ? pick(can) : null;
    if (!e) return;
    if (e === 'printer') {
      const fixer = pick(free);
      const others = free.filter((b) => b !== fixer);
      world.printerJam(fixer, others.length ? pick(others) : fixer);
    } else if (e === 'mug') {
      world.catMug(pick(free));
    } else {
      this.cakeDay = today;
      const hero = pick(free);
      world.cake(hero, free.filter((b) => b !== hero));
    }
  }
}
