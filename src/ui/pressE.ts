// « Appuie sur E » : quand tu diriges Roré, ce qui est à portée de main — un collègue, le chat, un meuble,
// une porte. Une étiquette « E · … » flotte au-dessus de lui ; la touche E fait la même chose qu'un clic.
import { ANNEX_BACK_DOOR, ANNEX_FURNITURE } from '../engine/annex.ts';
import { furnitureLabel } from '../engine/hits.ts';
import { annex, outside, sea, world } from '../engine/instance.ts';
import { FISH_SPOT, OUT_DOOR } from '../engine/outside.ts';
import { ANNEX_DOOR, BOARD, FURNITURE, T, W, WINDOWS } from '../engine/layout.ts';
import { useOffice } from '../state/store.ts';
import { interact } from './interact.ts';
import { goRoom, interactAnnex, interactOutside, interactSea, roreHere } from './place.ts';

export interface Near { verb: string; act: () => void }

/** La distance d'un point à un rectangle (0 s'il est dedans). */
const toRect = (px: number, py: number, x0: number, y0: number, x1: number, y1: number) =>
  Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));

/** Ce que Roré peut atteindre, le plus proche d'abord. */
export function nearRore(): Near | null {
  const room = useOffice.getState().room;
  // en mer : un coin de pêche (là où les oiseaux tournent)
  if (room === 'sea') {
    const n = sea.near();
    return n ? { verb: `Pêcher ici : ${n.spot.name.toLowerCase()}`, act: interactSea } : null;
  }
  const inAnnex = room === 'annex';
  const me = roreHere();
  const px = me.x, py = me.y - 4;
  const row = Math.floor((me.y - 2) / T);
  let best: Near | null = null, bd = Infinity;
  const offer = (d: number, range: number, near: Near) => { if (d <= range && d < bd) { bd = d; best = near; } };

  // assis : une seule chose à faire, se relever (les flèches aussi)
  if (me.seated) {
    const stand = room === 'annex' ? () => annex.standRore() : room === 'outside' ? () => outside.standRore() : () => world.standChef();
    return { verb: 'Se lever', act: stand };
  }

  if (room === 'outside') {
    const seat = outside.seatNear();
    if (seat) offer(0, 1, { verb: seat.verb, act: () => outside.sitRore(seat.id) });
    // la canne à pêche (dans la brèche de la clôture)
    offer(Math.hypot(px - FISH_SPOT.x, py - FISH_SPOT.y), 20, { verb: 'Descendre à la barque', act: () => interactOutside({ kind: 'object', id: 'fishing', label: '' }) });
    if (me.y < 7 * T && me.x >= OUT_DOOR.x && me.x <= OUT_DOOR.x + OUT_DOOR.w) offer(0, 1, { verb: 'Rentrer au bureau', act: () => interactOutside({ kind: 'door', label: '' }) });
    return best;
  }

  if (inAnnex) {
    // une place libre tout près (pouf, tabouret, canapé) : on peut s'y asseoir
    const seat = annex.seatNear();
    if (seat) offer(-6, 1, { verb: seat.verb, act: () => annex.sitRore(seat.id) });
    for (const p of annex.pals) {
      if (p === me) continue;
      offer(Math.hypot(p.x - me.x, p.y - me.y), 26, { verb: `Parler à ${p.name}`, act: () => annex.poke() });
    }
    for (const f of ANNEX_FURNITURE) {
      if (f.kind === 'stool') continue;
      const verb = f.id === 'pingpong' ? 'Jouer au ping-pong'
        : f.id.startsWith('arcade') ? 'Jouer à Spartan Run'
          : f.id === 'coffee' ? 'Se faire un café'
            : f.id === 'fridge' ? 'Ouvrir le frigo'
              : f.id === 'jukebox' ? 'Lancer la musique'
                : f.label.split(' (')[0].split(' : ')[0];
      offer(toRect(px, py, f.tx * T, f.ty * T, (f.tx + Math.max(1, f.w)) * T, (f.ty + Math.max(1, f.h)) * T), 10, { verb, act: () => interactAnnex({ kind: 'object', id: f.id, label: f.label }) });
    }
    if (me.x < 2 * T && row >= ANNEX_BACK_DOOR.row && row <= ANNEX_BACK_DOOR.row + 1) offer(0, 1, { verb: 'Retour au bureau', act: () => interactAnnex({ kind: 'door', label: '' }) });
    return best;
  }

  const seat = world.seatNear();
  if (seat) offer(-6, 1, { verb: seat.verb, act: () => world.sitChef(seat.seat) });
  for (const a of world.actors.values()) {
    if (a === me || a.alpha < 0.3) continue;
    const ay = a.seated && a.seat ? a.seat.y : a.y;
    offer(Math.hypot(a.x - me.x, ay - me.y), 26, { verb: a.resident ? `Parler à ${a.name}` : `Voir la fiche de ${a.name}`, act: () => interact({ kind: 'actor', id: a.id, label: a.name }) });
  }
  offer(Math.hypot(world.cat.x - me.x, world.cat.y - me.y), 20, { verb: 'Caresser le chat', act: () => interact({ kind: 'cat', label: '' }) });
  for (const f of FURNITURE) {
    if (f.kind === 'chair' || f.kind === 'chefChair') continue;
    const label = furnitureLabel(f.id, f.kind, f.role).split(' (')[0];
    offer(toRect(px, py, f.tx * T, f.ty * T, (f.tx + Math.max(1, f.w)) * T, (f.ty + Math.max(1, f.h)) * T), 10, { verb: label, act: () => interact({ kind: 'object', id: f.id, label, role: f.role }) });
  }
  // contre le mur du fond : le tableau, les fenêtres
  if (me.y < 4 * T + 6) {
    if (me.x >= BOARD.x && me.x <= BOARD.x + BOARD.w) offer(1, 2, { verb: 'Le tableau : le plan', act: () => interact({ kind: 'object', id: 'board', label: '' }) });
    for (const w of WINDOWS) if (me.x >= w.x && me.x <= w.x + w.w) offer(1, 2, { verb: 'La fenêtre (l’heure du bureau)', act: () => interact({ kind: 'object', id: 'window', label: '' }) });
  }
  // la porte d'entrée, en bas : Roré sort prendre l'air
  if (me.y > 14 * T && me.x >= 10 * T - 4 && me.x <= 12 * T + 4) offer(0, 1, { verb: 'Sortir dehors', act: () => goRoom('outside') });
  if (me.x > W - 2 * T && row >= ANNEX_DOOR.row && row <= ANNEX_DOOR.row + 1) offer(0, 1, { verb: 'Entrer dans la Pause', act: () => interact({ kind: 'object', id: 'annexDoor', label: '' }) });
  return best;
}

/** L'étiquette « E · … » au-dessus de Roré (placée à chaque image, sans repasser par React). */
let el: HTMLElement | null = null;
export const pressERef = (node: HTMLElement | null) => { el = node; };

export function placePressE(scale: number) {
  if (!el) return;
  const st = useOffice.getState();
  const near = st.driving && !st.modal ? nearRore() : null;
  if (!near) { el.style.opacity = '0'; return; }
  const me = roreHere();
  const label = el.lastElementChild as HTMLElement | null;
  if (label && label.textContent !== near.verb) label.textContent = near.verb;
  el.style.opacity = '1';
  el.style.transform = `translate3d(${Math.round(me.x * scale)}px, ${Math.round((me.y - 37) * scale)}px, 0) translate(-50%, -100%)`;
}
