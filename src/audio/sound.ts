// Le bouton du son coupe tout : les bruitages, la musique du jukebox et la voix de Roré.
import { useOffice } from '../state/store.ts';
import { jukebox } from './music.ts';
import { outsideAudio } from './outside.ts';
import { setMuted } from './sfx.ts';
import { setVoice } from './voice.ts';

export function applySound(on: boolean) {
  setMuted(!on);
  jukebox.setMuted(!on);
  outsideAudio.setMuted(!on);
  setVoice(on && useOffice.getState().voiceOn);
}
