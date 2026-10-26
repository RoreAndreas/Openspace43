// Le bureau et la Pause : on passe de l'un à l'autre par leurs portes, le bouton ☕ ou la touche D.
// Si tu diriges Roré et qu'il franchit une porte, il change de pièce avec toi.
import { sfx } from '../audio/sfx.ts';
import type { Annex, AnnexHit } from '../engine/annex.ts';
import { annex, camera, world } from '../engine/instance.ts';
import { jukebox } from '../audio/music.ts';
import { useOffice } from '../state/store.ts';

export type Room = 'office' | 'annex';

/** Changer de pièce. */
export function goRoom(room: Room) {
  const st = useOffice.getState();
  if (st.room === room) return;
  if (st.driving) {
    // Roré passe la porte avec toi : l'autre pièce le reprend juste derrière elle
    if (room === 'annex') {
      const y = world.chef.y;
      world.drive(false);
      annex.enterRore(y);
    } else {
      const y = annex.rore.y;
      annex.drive(false);
      world.chefAtDoor(y);
      world.drive(true);
    }
  }
  useOffice.setState({ room, modal: null });
  // un plan large, tout de suite (pas de travelling d'une pièce à l'autre)
  camera.wide();
  camera.x = camera.tx; camera.y = camera.ty; camera.zoom = camera.tzoom;
  sfx('open');
}

/** La pièce où tu diriges Roré (celle qu'on voit). */
export const activeRoom = (): typeof world | Annex => (useOffice.getState().room === 'annex' ? annex : world);

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
  if (hit.id === 'jukebox') jukebox.toggle();
  annex.objectFx(hit.id);
  sfx(hit.id === 'coffee' ? 'pour' : 'tick');
}

/** Les portes : Roré, quand tu le diriges, change de pièce en les franchissant. */
export function installDoors() {
  world.onDoor = () => goRoom('annex');
  annex.onDoor = () => goRoom('office');
}
