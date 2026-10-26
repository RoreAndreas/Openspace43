// Tu prends les commandes de Roré : double-clic sur lui, puis les flèches pour le faire marcher (dans le
// bureau ou dans la salle de pause ; Espace, dans la salle de pause, pour parler au collègue le plus proche).
// Échap (ou un nouveau double-clic sur lui) lui rend la main : en pleine mission, il retourne à son bureau.
import { sfx } from '../audio/sfx.ts';
import { annex, camera } from '../engine/instance.ts';
import { useOffice } from '../state/store.ts';
import { activeRoom } from './place.ts';

const KEYS: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
const held = new Set<string>();

function steer() {
  let dx = 0, dy = 0;
  for (const k of held) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
  activeRoom().steer(Math.sign(dx), Math.sign(dy));
}

/** Prendre ou rendre les commandes de Roré. */
export function setDriving(on: boolean) {
  if (useOffice.getState().driving === on) return;
  held.clear();
  activeRoom().drive(on);
  useOffice.setState({ driving: on });
  sfx(on ? 'check' : 'click');
  if (on) {
    // le clic sur Roré met le curseur dans le chat : on le retire, sinon les flèches iraient dans le texte
    const blur = () => (document.activeElement as HTMLElement | null)?.blur?.();
    blur();
    setTimeout(blur, 80);
  } else camera.wide(2);
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Écoute les flèches (avant les autres raccourcis du bureau) tant que tu diriges Roré. */
export function installDriving() {
  const down = (e: KeyboardEvent) => {
    if (!useOffice.getState().driving || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.stopPropagation(); setDriving(false); return; }
    if (k === ' ' && useOffice.getState().room === 'annex') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && annex.poke()) sfx('click');
      return;
    }
    if (!KEYS[k]) return;
    e.preventDefault();
    e.stopPropagation();
    held.add(k);
    steer();
  };
  const up = (e: KeyboardEvent) => { if (held.delete(e.key.toLowerCase())) steer(); };
  // la fenêtre perd le focus : on lâche toutes les touches
  const release = () => { held.clear(); steer(); };
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  window.addEventListener('blur', release);
  return () => {
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
    window.removeEventListener('blur', release);
  };
}
