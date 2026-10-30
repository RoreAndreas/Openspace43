// Le bureau et la Pause : on passe de l'un à l'autre par leurs portes, le bouton ☕ ou la touche D.
// Si tu diriges Roré et qu'il franchit une porte, il change de pièce avec toi.
import { sfx } from '../audio/sfx.ts';
import type { Annex, AnnexHit } from '../engine/annex.ts';
import { annex, camera, outside, world } from '../engine/instance.ts';
import type { Outside, OutHit } from '../engine/outside.ts';
import { jukebox } from '../audio/music.ts';
import { outsideAudio } from '../audio/outside.ts';
import { CHARACTERS } from '../engine/characters.ts';
import { isWorkTime, useOffice } from '../state/store.ts';

export type Room = 'office' | 'annex' | 'outside';

/** Changer de pièce. Le bureau est au milieu : la Pause est à sa droite, Dehors derrière sa porte d'entrée. */
export function goRoom(room: Room) {
  const st = useOffice.getState();
  const from = st.room;
  if (from === room) return;
  // d'une pièce annexe à l'autre, on repasse par le bureau
  if (from !== 'office' && room !== 'office') { goRoom('office'); goRoom(room); return; }
  if (st.driving) {
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
  useOffice.setState({ room, modal: null });
  // le vent, la mer et la petite musique : seulement Dehors
  if (room === 'outside') outsideAudio.start();
  else if (from === 'outside') outsideAudio.stop();
  // un plan large, tout de suite (pas de travelling d'une pièce à l'autre)
  camera.wide();
  camera.x = camera.tx; camera.y = camera.ty; camera.zoom = camera.tzoom;
  sfx('open');
}

/** La pièce où tu diriges Roré (celle qu'on voit). */
export const activeRoom = (): typeof world | Annex | Outside => {
  const room = useOffice.getState().room;
  return room === 'annex' ? annex : room === 'outside' ? outside : world;
};

/** Roré, là où tu le vois : le bureau, la Pause ou Dehors (ses coordonnées). */
export const roreHere = () => {
  const room = useOffice.getState().room;
  return room === 'annex' ? annex.rore : room === 'outside' ? outside.rore : world.chef;
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
  // la canne à pêche : Roré part en barque (le mini-jeu de la pêche)
  outside.onFish = () => { sfx('open'); useOffice.setState({ modal: { kind: 'game', game: 'fishing' } }); };
}

/** Ceux qui aiment prendre l'air sortent en premier (la fenêtre, les plantes, la promenade). */
const GUESTS = CHARACTERS
  .filter((c) => !c.roles.includes('chef'))
  .map((c) => ({ c, k: ['window', 'plant', 'wander'].filter((h) => c.hobbies.includes(h)).length }))
  .sort((a, b) => b.k - a.k)
  .slice(0, 3)
  .map((x) => x.c);

let lastSync = -1e9;
let lastFree: boolean | null = null;

/** En dehors des heures de travail, trois collègues quittent la Pause pour aller dehors ; ils rentrent quand le travail reprend. */
export function syncOutside(now: number) {
  if (now - lastSync < 1000) return;
  lastSync = now;
  const free = !isWorkTime(useOffice.getState().workHours);
  if (free === lastFree) return;
  lastFree = free;
  outside.setGuests(free ? GUESTS : []);
  annex.setAway(free ? GUESTS.map((c) => c.id) : []);
}
