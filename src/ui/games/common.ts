// Ce que partagent les mini-jeux de la Pause : les scores (gardés dans le navigateur), le clavier,
// et une boucle d'animation à pas fixe.
import { useEffect, useRef } from 'react';

const KEY = 'bureau:jeux';

/** La pêche : la cagnotte, le matériel (niveaux), le compte des prises et la plus belle vente. */
export interface FishSave {
  coins: number;
  line: number;
  hook: number;
  hooks: number;
  knife: number;
  count: number;
  best: { name: string; coins: number } | null;
}

export const NEW_FISH: FishSave = { coins: 0, line: 0, hook: 0, hooks: 0, knife: 0, count: 0, best: null };

export interface Scores {
  /** Spartan Run : le meilleur score */
  run: number;
  /** ping-pong : victoires et défaites, par adversaire */
  pong: Record<string, { won: number; lost: number }>;
  /** la pêche (Dehors) */
  fish: FishSave;
}

export function loadScores(): Scores {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Scores>;
    return { run: typeof s.run === 'number' ? s.run : 0, pong: s.pong && typeof s.pong === 'object' ? s.pong : {}, fish: { ...NEW_FISH, ...(s.fish && typeof s.fish === 'object' ? s.fish : {}) } };
  } catch {
    return { run: 0, pong: {}, fish: { ...NEW_FISH } };
  }
}

export function saveScores(s: Scores) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* navigation privée */ }
}

/** Les touches enfoncées (en minuscules). Les flèches et Espace ne font pas défiler la page et ne vont pas
 *  aux raccourcis du bureau tant que le jeu est ouvert. */
export function useKeys() {
  const keys = useRef(new Set<string>());
  const pressed = useRef<string[]>([]);
  useEffect(() => {
    const GAME = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'z', 's', 'w', 'q', 'a', 'd', 'enter']);
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!GAME.has(k)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!keys.current.has(k)) pressed.current.push(k);
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()); };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return {
    held: (...k: string[]) => k.some((x) => keys.current.has(x)),
    /** les touches pressées depuis le dernier appel (une fois chacune) */
    take: () => { const p = pressed.current; pressed.current = []; return p; },
  };
}

/** Une boucle d'animation à pas fixe (1/120 s) : la physique ne dépend pas de la vitesse de l'écran. */
export function useLoop(step: (dt: number) => void, draw: () => void, deps: unknown[]) {
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; }
      draw();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
