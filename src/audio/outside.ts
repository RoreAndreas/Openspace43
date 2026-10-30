// L'ambiance de Dehors : le vent dans l'herbe, la mer au loin, et une petite musique lofi.
// Tout est fabriqué en direct avec Web Audio (du bruit filtré, quelques notes douces) : aucun fichier audio.
// Le bouton du son coupe tout. Si le jukebox joue déjà, la petite musique se tait (le vent et la mer restent).
import { jukebox } from './music.ts';

// Am7 – Dm7 – G7 – Cmaj7 : la boucle lofi classique, une mesure chacune (notes en demi-tons, A2 = 0)
const CHORDS: number[][] = [
  [0, 7, 15, 19, 22],  // Am7
  [5, 12, 17, 21, 24], // Dm7
  [10, 17, 20, 24, 27],// G7
  [3, 10, 14, 19, 22], // Cmaj7
];
const BPM = 68;
const BEAT = 60 / BPM;

const freq = (semi: number) => 110 * Math.pow(2, semi / 12);

class OutsideAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beatNo = 0;
  private on = false;
  private muted = false;
  private noise: AudioBuffer | null = null;

  setMuted(m: boolean) {
    this.muted = m;
    this.level(0.25);
  }

  private level(fade: number) {
    if (!this.ctx || !this.master) return;
    const v = this.on && !this.muted ? 0.9 : 0;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, fade);
  }

  private noiseBuffer(ctx: AudioContext) {
    if (this.noise) return this.noise;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    // un bruit un peu rose : plus doux que du bruit blanc
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 6; }
    this.noise = buf;
    return buf;
  }

  private build(ctx: AudioContext) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    const loop = (freqHz: number, q: number, gain: number, lfoRate: number, lfoDepth: number, type: BiquadFilterType) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freqHz;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      // une lente respiration : le vent monte et descend en rafales, la mer en vagues
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const depth = ctx.createGain();
      depth.gain.value = gain * lfoDepth;
      lfo.connect(depth);
      depth.connect(g.gain);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(0, Math.random() * 2);
      lfo.start();
      this.nodes.push(src, lfo);
    };
    // le vent : un souffle médium, qui varie (deux rythmes qui se croisent)
    loop(520, 0.7, 0.16, 0.11, 0.8, 'bandpass');
    loop(1300, 1.2, 0.05, 0.27, 0.9, 'bandpass');
    // la mer, tout en bas : un grondement sourd, une vague toutes les huit secondes environ
    loop(260, 0.5, 0.12, 0.125, 0.9, 'lowpass');

    const music = ctx.createGain();
    music.gain.value = 0.55;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    music.connect(tone);
    tone.connect(master);
    this.music = music;
  }

  private note(semi: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o2.type = 'sine';
    // un petit désaccord, comme une vieille cassette
    const f = freq(semi) * (1 + (Math.random() - 0.5) * 0.004);
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.music!);
    o.start(at); o2.start(at);
    o.stop(at + dur + 0.05); o2.stop(at + dur + 0.05);
  }

  private tick(at: number, hi: boolean) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hi ? 6000 : 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(hi ? 0.05 : 0.09, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + (hi ? 0.04 : 0.09));
    src.connect(f); f.connect(g); g.connect(this.music!);
    src.start(at, Math.random() * 2, 0.12);
  }

  private kick(at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g); g.connect(this.music!);
    o.start(at); o.stop(at + 0.25);
  }

  /** Programme les temps à venir (une mesure = 4 temps, avec un peu de « swing »). */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    // le jukebox joue déjà : pas de petite musique par-dessus
    this.music!.gain.value = jukebox.playing ? 0 : 0.55;
    while (this.nextBeat < ctx.currentTime + 0.4) {
      const at = this.nextBeat;
      const bar = Math.floor(this.beatNo / 4) % CHORDS.length;
      const beat = this.beatNo % 4;
      const chord = CHORDS[bar];
      if (beat === 0) {
        // l'accord, arpégé tout doucement, et la basse
        chord.slice(1).forEach((s, i) => this.note(s, at + i * 0.045, BEAT * 3.6, 0.07));
        this.note(chord[0] - 12, at, BEAT * 1.8, 0.11);
      }
      if (beat === 2) {
        const m = chord[1 + Math.floor(Math.random() * 3)] + 12;
        this.note(m, at + BEAT * 0.33, BEAT * 1.2, 0.05);
      }
      if (beat === 3 && Math.random() < 0.5) this.note(chord[2 + Math.floor(Math.random() * 3)] + 12, at + BEAT * 0.5, BEAT * 0.9, 0.04);
      if (beat === 0 || beat === 2) this.kick(at);
      if (beat === 1 || beat === 3) this.tick(at, false);
      this.tick(at + BEAT * 0.5 + BEAT * 0.12, true);
      this.nextBeat += BEAT;
      this.beatNo++;
    }
  }

  /** On entre Dehors : le vent, la mer et la musique reviennent en douceur. */
  start() {
    if (this.on) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.build(this.ctx);
      }
      void this.ctx.resume();
      this.on = true;
      this.nextBeat = this.ctx.currentTime + 0.3;
      this.level(0.6);
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 120);
    } catch { /* pas d'audio sur cet appareil */ }
  }

  /** On rentre : tout s'éteint en fondu. */
  stop() {
    if (!this.on) return;
    this.on = false;
    this.level(0.35);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const ctx = this.ctx;
    // quand le fondu est fini, on suspend le tout (plus de calcul pour rien)
    setTimeout(() => { if (!this.on && ctx && ctx.state === 'running') void ctx.suspend(); }, 1800);
  }
}

export const outsideAudio = new OutsideAudio();
