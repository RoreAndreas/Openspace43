// La radio de la pêche : pendant qu'on pêche, une longue vidéo YouTube de musiques de jeux de pêche (le lien de
// l'utilisatrice), découpée en morceaux d'après ses repères de temps ; on en joue un au hasard, puis un autre quand il se
// termine. Un petit lecteur YouTube (youtube-nocookie.com, comme le jukebox) dans la fenêtre de la pêche. Si le jukebox
// jouait, il se met en pause pendant la pêche et reprend après ; la petite musique de Dehors se tait aussi.
import { useOffice } from '../state/store.ts';
import { jukebox } from './music.ts';

const ORIGIN = 'https://www.youtube-nocookie.com';
const VIDEO = '7od_srRcQo0';
/** Les morceaux de la vidéo : leur titre et leur début (en secondes) ; chacun finit où commence le suivant */
const MARKS: [string, string][] = [
  ['0:00', 'Reel Fishing II · Prologue Intro'], ['2:20', 'Reel Fishing II · Brave New Life'], ['4:01', 'Sega Bass Fishing · End Credits'],
  ['4:48', 'Reel Fishing III · Old Bridge'], ['7:17', 'Reel Fishing · Seq 3'], ['10:11', 'Reel Fishing · Seq 1'],
  ['11:43', 'SEGA Marine Fishing · Shop'], ['12:59', 'Sega Bass Fishing · Bridge Area'], ['13:34', 'Reel Fishing III · Inside Cabin'],
  ['15:27', 'Reel Fishing II · At Home'], ['18:21', 'Reel Fishing · Seq 4'], ['20:37', 'SEGA Marine Fishing · The Offing'],
  ['22:51', 'Sega Bass Fishing · Inlet Area'], ['23:57', 'Reel Fishing Wild · Track 05'], ['26:25', 'Reel Fishing · Seq 5'],
  ['29:17', 'SEGA Marine Fishing · Aquarium'], ['34:43', 'Sega Bass Fishing · Reeds Area'], ['35:42', 'Sega Bass Fishing · Original Mode Menu'],
  ['36:48', 'Reel Fishing · Seq 6'], ['39:38', 'Reel Fishing Wild · Track 04'], ['41:42', 'Reel Fishing III · Aerated Tank'],
  ['44:15', 'Reel Fishing III · New Game'], ['45:27', 'Reel Fishing III · Misty Cove'], ['48:34', 'Sega Bass Fishing · Diary Menu'],
  ['49:32', 'Reel Fishing III · Unaerated Tank'], ['52:28', 'Reel Fishing · Seq 9'], ['54:53', 'SeaBass Fishing (Japan)'],
  ['59:18', 'SEGA Marine Fishing · Shallow'], ['1:02:06', 'Reel Fishing Wild · Track 07'], ['1:04:28', 'Reel Fishing II · Natsume Intro'],
];
const secs = (s: string) => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);
export const FISH_TRACKS = MARKS.map(([at, title], i) => ({ title, start: secs(at), end: i + 1 < MARKS.length ? secs(MARKS[i + 1][0]) : secs(at) + 150 }));

class FishRadio {
  playing = false;
  index = -1;
  /** qui écoute le titre du morceau en cours (la fenêtre de la pêche) */
  onChange: ((title: string) => void) | null = null;
  private frame: HTMLIFrameElement | null = null;
  private ready = false;
  private queued: { func: string; args: unknown[] }[] = [];
  private resumeJukebox = false;
  private recent: number[] = [];

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('message', (e) => this.onMessage(e));
  }

  get title() { return FISH_TRACKS[this.index]?.title ?? ''; }

  /** On commence à pêcher : le lecteur s'installe dans `host`, un morceau au hasard. */
  start(host: HTMLElement) {
    if (this.frame) { host.appendChild(this.frame); return; }
    if (jukebox.playing) { this.resumeJukebox = true; jukebox.pause(); }
    this.index = this.pick();
    const tr = FISH_TRACKS[this.index];
    const f = document.createElement('iframe');
    f.title = 'La radio de la pêche (YouTube)';
    f.allow = 'autoplay; encrypted-media';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.className = 'yt-frame';
    const origin = encodeURIComponent(location.origin);
    f.src = `${ORIGIN}/embed/${VIDEO}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&start=${tr.start}&end=${tr.end}&origin=${origin}`;
    f.addEventListener('load', () => {
      f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'fishradio', channel: 'widget' }), ORIGIN);
      this.ready = true;
      this.volume();
      const q = this.queued; this.queued = [];
      for (const c of q) this.post(c.func, c.args);
    });
    this.frame = f;
    host.appendChild(f);
    this.playing = true;
    this.onChange?.(tr.title);
  }

  /** On range la canne : la radio s'arrête, le jukebox reprend s'il jouait. */
  stop() {
    this.frame?.remove();
    this.frame = null;
    this.ready = false;
    this.queued = [];
    this.playing = false;
    if (this.resumeJukebox) { this.resumeJukebox = false; jukebox.play(); }
  }

  /** Un autre morceau, au hasard (jamais un des derniers entendus). */
  next() {
    if (!this.frame) return;
    this.index = this.pick();
    const tr = FISH_TRACKS[this.index];
    this.post('loadVideoById', [{ videoId: VIDEO, startSeconds: tr.start, endSeconds: tr.end }]);
    this.playing = true;
    this.onChange?.(tr.title);
  }

  /** Le bouton du son (le même que pour tout le bureau) */
  volume() { this.post('setVolume', [useOffice.getState().sound ? Math.round(jukebox.volume * 100) : 0]); }

  private pick() {
    const n = FISH_TRACKS.length;
    let i = Math.floor(Math.random() * n), guard = 0;
    while (this.recent.includes(i) && guard++ < 20) i = Math.floor(Math.random() * n);
    this.recent = [...this.recent, i].slice(-6);
    return i;
  }

  private post(func: string, args: unknown[] = []) {
    if (!this.frame?.contentWindow || !this.ready) { this.queued.push({ func, args }); return; }
    this.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN);
  }

  private onMessage(e: MessageEvent) {
    if (e.origin !== ORIGIN || !this.frame || e.source !== this.frame.contentWindow) return;
    let d: { event?: string; info?: unknown };
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onReady') { this.ready = true; this.volume(); return; }
    const info = d.info as { playerState?: number } | number | null;
    const state = typeof info === 'number' && d.event === 'onStateChange' ? info : typeof info === 'object' && info ? info.playerState : undefined;
    // le morceau est fini (la vidéo s'arrête au repère suivant) : un autre
    if (state === 0) this.next();
  }
}

export const fishRadio = new FishRadio();
