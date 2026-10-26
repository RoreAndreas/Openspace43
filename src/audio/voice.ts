// La voix du chef (dans la version d'origine : « Léo », une voix ElevenLabs) : la visite guidée du bureau, et quelques répliques
// pendant les missions. La musique baisse pendant qu'il parle.
import { jukebox } from './music.ts';

export type Line =
  | 'parti' | 'equipe' | 'accomplie' | 'feu-vert' | 'afterwork'
  | 'visite-1' | 'visite-2' | 'visite-3' | 'visite-4' | 'visite-5' | 'visite-6' | 'visite-7' | 'visite-8';

// pas de fichiers de voix dans l'open space (on allège) : la voix reste coupée
let enabled = false;
let current: HTMLAudioElement | null = null;
let lastAt = 0;

export function setVoice(on: boolean) {
  enabled = on && false;
  if (!on) stopVoice();
}

export function stopVoice() {
  if (current) { current.pause(); current = null; }
  jukebox.duck(false);
}

/**
 * Fait parler le chef. Renvoie une promesse tenue à la fin de la réplique (tout de suite si la voix est coupée).
 * `force` : la visite guidée passe même juste après une autre réplique.
 */
export function say(line: Line, force = false): Promise<void> {
  if (!enabled) return Promise.resolve();
  const now = performance.now();
  if (!force && now - lastAt < 2500) return Promise.resolve();
  lastAt = now;
  stopVoice();
  const a = new Audio(`/voice/${line}.mp3`);
  a.volume = 0.95;
  current = a;
  jukebox.duck(true);
  return new Promise((resolve) => {
    const done = () => {
      if (current === a) { current = null; jukebox.duck(false); }
      resolve();
    };
    a.addEventListener('ended', done);
    a.addEventListener('error', done);
    a.play().catch(done);
  });
}
