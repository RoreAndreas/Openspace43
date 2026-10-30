// Les quatre espaces : le bureau au milieu, la Pause à sa droite (☕, touche D), Dehors derrière la porte d'entrée
// (🌿, touche O), et la mer, qu'on rejoint en barque depuis le ponton de Dehors (⛵, touche L).
// Si tu diriges Roré et qu'il franchit une porte, il change de pièce avec toi.
import { sfx } from '../audio/sfx.ts';
import type { Annex, AnnexHit } from '../engine/annex.ts';
import { annex, camera, outside, sea, world } from '../engine/instance.ts';
import type { Sea } from '../engine/sea.ts';
import type { Outside, OutHit } from '../engine/outside.ts';
import { jukebox } from '../audio/music.ts';
import { outsideAudio } from '../audio/outside.ts';
import { useOffice } from '../state/store.ts';

export type Room = 'office' | 'annex' | 'outside' | 'sea';

/** Qui touche qui : on ne passe que d'une pièce à sa voisine (le chemin le plus court s'il faut en traverser). */
const NEXT: Record<Room, Room[]> = { office: ['annex', 'outside'], annex: ['office'], outside: ['office', 'sea'], sea: ['outside'] };
function hop(from: Room, to: Room): Room {
  const prev = new Map<Room, Room>([[from, from]]);
  const queue: Room[] = [from];
  while (queue.length) {
    const r = queue.shift()!;
    for (const n of NEXT[r]) if (!prev.has(n)) { prev.set(n, r); queue.push(n); }
  }
  let step = to;
  while (prev.get(step) !== from) step = prev.get(step)!;
  return step;
}

/** Changer de pièce. */
export function goRoom(room: Room) {
  const st = useOffice.getState();
  const from = st.room;
  if (from === room) return;
  // pas voisines : on traverse les pièces du milieu
  const next = hop(from, room);
  if (next !== room) { goRoom(next); goRoom(room); return; }
  const driving = st.driving;
  if (room === 'sea') {
    // Roré descend au ponton et prend la barque (on la dirige toujours)
    outside.roreToSea();
    sea.enter();
  } else if (from === 'sea') {
    sea.drive(false);
    outside.roreFromSea(true);
  } else if (driving) {
    if (from === 'office') {
      // Roré passe la porte avec toi : l'autre pièce le reprend juste derrière elle
      const y = world.chef.y;
      world.drive(false);
      if (room === 'annex') annex.enterRore(y);
      else outside.enterRore();
    } else {
      if (from === 'annex') {
        const y = annex.rore.y;
        annex.drive(false);
        world.chefAtDoor(y);
      } else {
        outside.drive(false);
        world.chefAtMainDoor();
      }
      world.drive(true);
    }
  }
  useOffice.setState({ room, modal: null, driving: room === 'sea' || from === 'sea' ? true : driving });
  // le vent, la mer et la petite musique : Dehors et en mer
  if (room === 'outside' || room === 'sea') outsideAudio.start();
  else if (from === 'outside' || from === 'sea') outsideAudio.stop();
  // un plan large, tout de suite (pas de travelling d'une pièce à l'autre)
  camera.wide();
  camera.x = camera.tx; camera.y = camera.ty; camera.zoom = camera.tzoom;
  sfx('open');
}

/** La pièce où tu diriges Roré (celle qu'on voit). */
export const activeRoom = (): typeof world | Annex | Outside | Sea => {
  const room = useOffice.getState().room;
  return room === 'annex' ? annex : room === 'outside' ? outside : room === 'sea' ? sea : world;
};

/** Roré, là où tu le vois : le bureau, la Pause ou Dehors (ses coordonnées). */
export const roreHere = () => {
  const room = useOffice.getState().room;
  return room === 'annex' ? annex.rore : room === 'outside' ? outside.rore : room === 'sea' ? sea.rore : world.chef;
};

/** Un clic Dehors. */
export function interactOutside(hit: OutHit) {
  if (hit.kind === 'door') { goRoom('office'); return; }
  if (hit.kind === 'pal') return;
  sfx('click');
  if (hit.id === 'fishing') { outside.fish(); return; }
  outside.fx.sparkle(outside.rore.x, outside.rore.y - 10, 6, '#ffd2a8');
}

/** Un clic dans la Pause. */
export function interactAnnex(hit: AnnexHit) {
  if (hit.kind === 'door') { goRoom('office'); return; }
  if (hit.kind === 'pal') {
    const p = annex.pals.find((x) => x.id === hit.id);
    // Roré, quand tu le diriges, ne se parle pas à lui-même
    if (!p || (p === annex.rore && annex.driving)) return;
    sfx('click');
    annex.talk(p);
    return;
  }
  // les mini-jeux : la table de ping-pong et les bornes d'arcade
  if (hit.id === 'pingpong' || hit.id.startsWith('arcade')) {
    sfx('open');
    // les flèches servent au jeu : Roré, s'il était piloté, reprend sa vie
    if (useOffice.getState().driving) annex.drive(false);
    useOffice.setState({ driving: false, modal: { kind: 'game', game: hit.id === 'pingpong' ? 'pingpong' : 'arcade' } });
    return;
  }
  if (hit.id === 'jukebox') jukebox.toggle();
  annex.objectFx(hit.id);
  sfx(hit.id === 'coffee' ? 'pour' : 'tick');
}

/** Les portes : Roré, quand tu le diriges, change de pièce en les franchissant. */
export function installDoors() {
  world.onDoor = () => goRoom('annex');
  world.onExit = () => goRoom('outside');
  annex.onDoor = () => goRoom('office');
  outside.onDoor = () => goRoom('office');
  // le ponton : Roré prend la barque et part faire le tour de l'île
  outside.onFish = () => goRoom('sea');
}

/** En mer : E sur un coin de pêche (là où les oiseaux tournent) pour pêcher. Pour revenir : X. */
export function interactSea() {
  const n = sea.near();
  if (!n) return;
  if (n.kind === 'dock') { goRoom('outside'); return; }
  sfx('open');
  sea.rest(n.spot);
  useOffice.setState({ modal: { kind: 'game', game: 'fishing', lucky: n.spot.lucky } });
}
