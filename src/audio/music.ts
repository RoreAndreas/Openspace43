// Le jukebox du bureau : tes liens YouTube. Tu colles un lien, il rejoint la liste ; le jukebox joue, se met en
// pause, passe au suivant, repart en boucle sur la liste ou sur un seul morceau. Le lecteur YouTube (sans cookie
// publicitaire : youtube-nocookie.com) s'affiche en petit, en bas à gauche du bureau, tant que la musique joue.
// On le pilote par messages (l'API « iframe » de YouTube), sans script externe. La liste reste dans ce navigateur.
import { useOffice } from '../state/store.ts';

export interface Track { id: string; title: string }
export type Repeat = 'off' | 'all' | 'one';

const ORIGIN = 'https://www.youtube-nocookie.com';
const KEY = 'bureau:playlist';
const PREFS = 'bureau:jukebox';

/** L'identifiant (11 caractères) d'une vidéo YouTube, à partir d'un lien (ou de l'identifiant lui-même). */
export function youtubeId(raw: string): string | null {
  const s = raw.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (!id && m) id = m[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* navigation privée */ } };

class Jukebox {
  list: Track[] = load<Track[]>(KEY, []).filter((t) => t && /^[\w-]{11}$/.test(t.id));
  index = 0;
  playing = false;
  /** un morceau est chargé dans le lecteur (le petit écran est affiché) */
  loaded = false;
  repeat: Repeat = load<{ repeat?: Repeat }>(PREFS, {}).repeat ?? 'all';
  shuffle = load<{ shuffle?: boolean }>(PREFS, {}).shuffle ?? false;
  volume = load<{ volume?: number }>(PREFS, {}).volume ?? 0.6;
  /** l'énergie des basses (simulée : la musique vient de YouTube) et le coup de grosse caisse */
  level = 0;
  beat = false;
  error = '';
  private frame: HTMLIFrameElement | null = null;
  private host: HTMLElement | null = null;
  private ready = false;
  private queued: { func: string; args: unknown[] }[] = [];
  private muted = false;
  private ducked = false;
  private lastBeat = 0;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('message', (e) => this.onMessage(e));
    // la liste enregistrée dans ce navigateur s'affiche dès l'ouverture du bureau
    this.publish();
  }

  /** Le petit écran du jukebox (posé par l'interface) : le lecteur YouTube vit dedans. */
  attach(el: HTMLElement | null) {
    this.host = el;
    if (el && this.frame && this.frame.parentElement !== el) el.appendChild(this.frame);
  }

  get current(): Track | null { return this.list[this.index] ?? null; }

  private publish() {
    useOffice.setState({
      music: {
        playing: this.playing, index: this.index, volume: this.volume, list: [...this.list], repeat: this.repeat,
        shuffle: this.shuffle, loaded: this.loaded, error: this.error,
      },
    });
  }

  private saveList() { save(KEY, this.list); }
  private savePrefs() { save(PREFS, { repeat: this.repeat, shuffle: this.shuffle, volume: this.volume }); }

  private post(func: string, args: unknown[] = []) {
    if (!this.frame?.contentWindow || !this.ready) { this.queued.push({ func, args }); return; }
    this.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN);
  }

  private applyVolume() {
    this.post('setVolume', [Math.round((this.muted ? 0 : this.volume * (this.ducked ? 0.35 : 1)) * 100)]);
  }

  /** Crée le lecteur (la première fois) ou change de vidéo. */
  private open(id: string) {
    this.error = '';
    if (!this.frame) {
      const f = document.createElement('iframe');
      f.title = 'Le jukebox (YouTube)';
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.className = 'yt-frame';
      const origin = encodeURIComponent(location.origin);
      f.src = `${ORIGIN}/embed/${id}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&origin=${origin}`;
      f.addEventListener('load', () => {
        // on demande au lecteur de nous tenir au courant (état, titre)
        f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'openspace', channel: 'widget' }), ORIGIN);
        this.ready = true;
        this.applyVolume();
        const q = this.queued;
        this.queued = [];
        for (const c of q) this.post(c.func, c.args);
      });
      this.frame = f;
      this.host?.appendChild(f);
    } else this.post('loadVideoById', [id]);
    this.loaded = true;
  }

  private onMessage(e: MessageEvent) {
    if (e.origin !== ORIGIN || !this.frame || e.source !== this.frame.contentWindow) return;
    let d: { event?: string; info?: unknown };
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onReady') { this.ready = true; this.applyVolume(); return; }
    if (d.event === 'onError') { this.fail(); return; }
    const info = d.info as { playerState?: number; videoData?: { title?: string; video_id?: string } } | number | null;
    const state = typeof info === 'number' && d.event === 'onStateChange' ? info : typeof info === 'object' && info ? info.playerState : undefined;
    if (typeof info === 'object' && info?.videoData?.title) {
      // le vrai titre de la vidéo, pour la liste
      const t = this.list.find((x) => x.id === info.videoData!.video_id) ?? this.current;
      if (t && t.title !== info.videoData.title && /^Vidéo /.test(t.title)) { t.title = info.videoData.title; this.saveList(); this.publish(); }
    }
    if (state === undefined) return;
    if (state === 0) this.ended();
    else if (state === 1 && !this.playing) { this.playing = true; this.publish(); }
    else if (state === 2 && this.playing) { this.playing = false; this.publish(); }
  }

  /** La vidéo refuse d'être lue hors de YouTube : on le dit, et on passe à la suivante. */
  private fail() {
    this.error = 'Cette vidéo ne peut pas être lue dans le bureau (son auteur l’interdit). Je passe à la suivante.';
    this.publish();
    if (this.list.length > 1) setTimeout(() => this.next(), 1500);
    else { this.playing = false; this.publish(); }
  }

  private ended() {
    if (this.repeat === 'one') { this.post('seekTo', [0, true]); this.post('playVideo'); return; }
    const last = this.index >= this.list.length - 1;
    if (last && this.repeat === 'off' && !this.shuffle) { this.playing = false; this.publish(); return; }
    this.next();
  }

  add(raw: string): string | null {
    const id = youtubeId(raw);
    if (!id) return 'Ce lien ne ressemble pas à une vidéo YouTube. Colle par exemple : https://www.youtube.com/watch?v=…';
    if (this.list.some((t) => t.id === id)) return 'Cette vidéo est déjà dans la liste.';
    this.list.push({ id, title: `Vidéo ${id}` });
    if (this.list.length > 60) this.list.shift();
    this.saveList();
    this.publish();
    return null;
  }

  remove(i: number) {
    if (i < 0 || i >= this.list.length) return;
    const wasCurrent = i === this.index;
    this.list.splice(i, 1);
    if (i < this.index) this.index--;
    this.saveList();
    if (!this.list.length) { this.stop(); return; }
    if (wasCurrent) { this.index = Math.min(this.index, this.list.length - 1); if (this.playing) this.play(this.index); }
    this.publish();
  }

  rename(i: number, title: string) {
    const t = this.list[i];
    if (!t || !title.trim()) return;
    t.title = title.trim().slice(0, 120);
    this.saveList();
    this.publish();
  }

  play(index = this.index) {
    if (!this.list.length) { useOffice.setState({ modal: { kind: 'jukebox' } }); return; }
    const i = ((index % this.list.length) + this.list.length) % this.list.length;
    const change = i !== this.index || !this.loaded;
    this.index = i;
    if (change) this.open(this.list[i].id);
    this.post('playVideo');
    this.playing = true;
    this.publish();
  }

  pause() {
    this.post('pauseVideo');
    this.playing = false;
    this.level = 0;
    this.publish();
  }

  /** Arrête tout et range le petit écran. */
  stop() {
    this.frame?.remove();
    this.frame = null;
    this.ready = false;
    this.queued = [];
    this.loaded = false;
    this.playing = false;
    this.level = 0;
    this.publish();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  next() {
    if (!this.list.length) return;
    if (this.shuffle && this.list.length > 1) {
      let n = this.index;
      while (n === this.index) n = Math.floor(Math.random() * this.list.length);
      this.play(n);
    } else this.play(this.index + 1);
  }
  prev() { this.play(this.index - 1); }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    this.savePrefs();
    this.publish();
  }
  toggleShuffle() { this.shuffle = !this.shuffle; this.savePrefs(); this.publish(); }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    this.savePrefs();
    this.publish();
  }

  /** La voix du chef passe devant la musique. */
  duck(on: boolean) { this.ducked = on; this.applyVolume(); }
  setMuted(m: boolean) { this.muted = m; this.applyVolume(); }

  /** À chaque image : l'énergie des « basses » pour les lumières et la danse (un rythme de 120 battements par minute). */
  sample() {
    this.beat = false;
    if (!this.playing) { this.level *= 0.9; return this.level; }
    const now = performance.now();
    if (now - this.lastBeat > 500) { this.lastBeat = now; this.beat = true; }
    const phase = (now - this.lastBeat) / 500;
    this.level = 0.35 + 0.45 * Math.exp(-phase * 4);
    return this.level;
  }
}

export const jukebox = new Jukebox();
