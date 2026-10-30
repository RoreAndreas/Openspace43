// La pêche au large, au timing. Roré est en barque ; on voit la falaise de loin, le pavillon 43 et le phare.
// 1. Le lancer : une jauge va et vient, Espace la fige. Dans la zone dorée, c'est un lancer parfait (plus loin, plus beau).
// 2. La touche : une ombre s'approche, la flotte frémit (fausses touches, parfois une mouette s'y pose)… puis plonge :
//    Espace, vite, pour ferrer. Trop tôt, le poisson a peur ; trop tard, il file.
// 3. Le combat : un curseur va et vient sur une barre ; Espace quand il est dans la zone verte (au centre doré : parfait).
//    Chaque coup réussi lui ôte de la vie ; chaque raté tend la ligne : trop tendue, elle casse.
// Les poissons légendaires (le Thon d'Or le jour, Nessie le soir et la nuit) arrivent comme un boss : un grand (!),
// un flash rouge, une barre de vie en haut de l'écran. Le carnet de pêche garde chaque espèce prise (dans le navigateur).
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { outside, timeOfDay } from '../../engine/instance.ts';
import { robotSprite } from '../../engine/robots.ts';
import type { TimeOfDay } from '../../engine/room.ts';
import { useOffice } from '../../state/store.ts';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 144;
const HORIZON = 54, SURFACE = 76;
const BOAT_X = 20;
/** le bout de la canne */
const TIP = { x: BOAT_X + 56, y: SURFACE - 30 };
/** la barre du combat */
const BAR = { x: 48, y: 126, w: 160, h: 7 };

// ── Les prises ──
type Kind = 'sardine' | 'maquereau' | 'rouget' | 'dorade' | 'bar' | 'lotte' | 'thon' | 'nessie' | 'botte' | 'algue';
interface Spec {
  name: string; kg: [number, number]; hp: number;
  /** la vitesse du curseur, la largeur de la zone verte, le temps pour ferrer (s) */
  speed: number; zone: number; window: number;
  /** la longueur de lancer minimale (0 à 1), les heures où il sort, sa fréquence */
  far: number; when?: TimeOfDay[]; often: number;
  w: number; h: number; body: string; belly: string; fin: string;
  legend?: boolean; junk?: boolean; hint: string;
}
const FISH: Record<Kind, Spec> = {
  sardine: { name: 'Sardine', kg: [0.05, 0.1], hp: 2, speed: 0.9, zone: 0.26, window: 0.6, far: 0, often: 10, w: 7, h: 3, body: '#9fb4c8', belly: '#e4edf5', fin: '#6f8aa4', hint: 'près de la barque' },
  maquereau: { name: 'Maquereau', kg: [0.3, 0.7], hp: 3, speed: 1.1, zone: 0.22, window: 0.5, far: 0.15, often: 8, w: 10, h: 4, body: '#3f8f7a', belly: '#d8eee4', fin: '#235e50', hint: 'surtout au coucher du soleil' },
  rouget: { name: 'Rouget', kg: [0.2, 0.5], hp: 3, speed: 1.2, zone: 0.2, window: 0.45, far: 0.25, often: 6, w: 9, h: 4, body: '#d9574a', belly: '#f6c8b8', fin: '#a83a30', hint: 'un peu au large' },
  dorade: { name: 'Dorade', kg: [0.6, 1.8], hp: 4, speed: 1.3, zone: 0.18, window: 0.42, far: 0.4, often: 5, w: 11, h: 6, body: '#c8b48a', belly: '#f1e6c8', fin: '#e0b040', hint: 'au large' },
  bar: { name: 'Bar', kg: [1, 4], hp: 5, speed: 1.5, zone: 0.15, window: 0.36, far: 0.6, often: 3, w: 14, h: 5, body: '#8a98aa', belly: '#e8edf2', fin: '#5a6678', hint: 'loin, avec un bon lancer' },
  lotte: { name: 'Lotte', kg: [2, 8], hp: 6, speed: 1.4, zone: 0.14, window: 0.36, far: 0.45, when: ['night'], often: 3, w: 14, h: 9, body: '#6a5440', belly: '#8a7058', fin: '#3e3024', hint: 'seulement la nuit' },
  thon: { name: 'Le Thon d’Or', kg: [40, 80], hp: 12, speed: 1.9, zone: 0.13, window: 0.55, far: 0.7, when: ['day', 'evening'], often: 0, w: 26, h: 9, body: '#e8b830', belly: '#fff0a8', fin: '#b88010', legend: true, hint: 'légendaire : un lancer parfait, au loin, de jour' },
  nessie: { name: 'Nessie', kg: [300, 500], hp: 14, speed: 2.1, zone: 0.12, window: 0.55, far: 0.7, when: ['evening', 'night'], often: 0, w: 30, h: 8, body: '#3f8a5a', belly: '#7fc08a', fin: '#2f6a42', legend: true, hint: 'légendaire : un lancer parfait, au loin, le soir ou la nuit' },
  botte: { name: 'Une vieille botte…', kg: [0.8, 0.8], hp: 1, speed: 0.6, zone: 0.4, window: 0.8, far: 0, often: 0, w: 8, h: 8, body: '#4a3a2c', belly: '#6b5440', fin: '#2e2418', junk: true, hint: '' },
  algue: { name: 'Une algue, sur la tête', kg: [0.1, 0.1], hp: 1, speed: 0.6, zone: 0.4, window: 0.8, far: 0, often: 0, w: 8, h: 6, body: '#3f7a42', belly: '#5a9a52', fin: '#2f5e36', junk: true, hint: '' },
};
const SPECIES = (Object.keys(FISH) as Kind[]).filter((k) => !FISH[k].junk);

/** Ce qui mord : selon la longueur du lancer, l'heure, et la chance (un lancer parfait attire les légendes). */
function pickCatch(power: number, perfect: boolean, tod: TimeOfDay, lucky = false): Kind {
  const r = Math.random();
  if (r < 0.05) return 'botte';
  if (r < 0.08) return 'algue';
  const legends = (['thon', 'nessie'] as Kind[]).filter((k) => FISH[k].when!.includes(tod) && power >= FISH[k].far);
  if (legends.length && Math.random() < (perfect ? 0.12 : 0.02) * (lucky ? 2.5 : 1)) return legends[Math.floor(Math.random() * legends.length)];
  const pool = SPECIES.filter((k) => !FISH[k].legend && power >= FISH[k].far && (!FISH[k].when || FISH[k].when!.includes(tod)));
  const weight = (k: Kind) => FISH[k].often * (k === 'maquereau' && tod === 'evening' ? 3 : 1) * (perfect && FISH[k].far >= 0.4 ? 2 : 1);
  let x = Math.random() * pool.reduce((s, k) => s + weight(k), 0);
  for (const k of pool) { x -= weight(k); if (x <= 0) return k; }
  return 'sardine';
}

const fmtKg = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(1).replace('.', ',')} kg`);

/** Un poisson, centré en (0, 0), tourné vers la droite. */
function drawFish(g: CanvasRenderingContext2D, kind: Kind, t: number, flash = false) {
  const s = FISH[kind];
  const r = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = flash ? '#ffffff' : c; g.fillRect(x, y, w, h); };
  if (kind === 'botte') { r(-2, -4, 4, 6, s.body); r(-3, 1, 8, 3, s.body); r(-2, 2, 6, 1, s.belly); return; }
  if (kind === 'algue') { for (let i = 0; i < 5; i++) r(-4 + i * 2, -3 + Math.round(Math.sin(t * 4 + i) * 1), 1, 6, i % 2 ? s.body : s.belly); return; }
  const hw = Math.floor(s.w / 2);
  for (let i = 0; i < s.w; i++) {
    const u = i / (s.w - 1);
    const shape = kind === 'lotte' ? Math.min(1, 0.35 + u * 0.9) : kind === 'nessie' ? 0.6 + 0.4 * Math.sin(u * Math.PI * 3 + t * 4) * 0.5 : Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.9));
    const hh = Math.max(1, Math.round(s.h * shape));
    const wob = kind === 'nessie' ? Math.round(Math.sin(t * 5 + i * 0.4) * 1.5) : 0;
    r(i - hw, -Math.floor(hh / 2) + wob, 1, hh, s.body);
    if (hh > 2) r(i - hw, Math.ceil(hh / 2) - 1 + wob, 1, 1, s.belly);
  }
  const tail = Math.floor(t * 8) % 2;
  r(-hw - 2, -1 - tail - (s.h > 6 ? 2 : 0), 2, 1 + (s.h > 6 ? 2 : 0), s.fin);
  r(-hw - 2, tail, 2, 1 + (s.h > 6 ? 2 : 0), s.fin);
  r(s.w - hw - 3, -1, 1, 1, '#15121d');
  if (kind === 'thon') { r(-2, -s.h / 2 - 3, 4, 3, s.fin); r(-2, s.h / 2, 4, 2, s.fin); for (let i = -8; i < 8; i += 4) r(i, -1, 2, 1, '#fff6c8'); }
  if (kind === 'nessie') { r(s.w - hw - 2, -6, 3, 6, s.body); r(s.w - hw - 2, -8, 6, 3, s.body); r(s.w - hw + 2, -8, 1, 1, '#15121d'); }
  if (kind === 'lotte') { r(s.w - hw - 2, -7, 1, 3, s.fin); g.fillStyle = '#fff2a0'; g.fillRect(s.w - hw - 2, -9, 2, 2); }
  if (kind === 'dorade') r(s.w - hw - 5, -2, 1, 3, s.fin);
}

const SKY = { day: ['#7cbaec', '#9bcdf1', '#bcdff5', '#dcedf7'], evening: ['#3a2f6a', '#7a4579', '#d9786a', '#ffb27a'], night: ['#0b1030', '#121a42', '#18234c', '#202d5a'] };
const SEA = { day: ['#a6d2ea', '#5aa0cc', '#2a78b2', '#175a92'], evening: ['#f0a88a', '#8a5a88', '#4a3a72', '#2c2858'], night: ['#28335e', '#1a2850', '#0f1c40', '#0a1532'] };

type Phase = 'ready' | 'boat' | 'aim' | 'cast' | 'wait' | 'warn' | 'bite' | 'fight' | 'catch' | 'fail';
interface Bit { x: number; y: number; vx: number; vy: number; life: number; col: string }
interface Card { title: string; sub: string; legend: boolean; junk: boolean; record: boolean }

export function Fishing({ lucky = false }: { lucky?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const tod = timeOfDay(useOffice.getState().tod);
  const journal = useRef(loadScores().fish.journal);
  const s = useRef({
    phase: 'ready' as Phase, t: 0, until: 0,
    power: 0, powDir: 1, perfect: false, castT: 0, landX: 160,
    bobX: TIP.x, bobY: TIP.y, dip: 0,
    kind: 'sardine' as Kind, kg: 0, hp: 0, shownHp: 0, trailHp: 0,
    shadow: null as null | { x: number; vx: number; y: number },
    nibbles: 0, nextNibble: 0, nextEvent: 0,
    gull: null as null | { x: number; y: number; t: number },
    cursor: 0, curDir: 1, zone: 0.5, tension: 0, rage: false,
    hitAt: -9, missAt: -9, jumpAt: -9, flashAt: -9, shake: 0,
    catchAt: -9, failAt: -9, algaeUntil: -9, sadUntil: -9,
    bits: [] as Bit[], confetti: [] as Bit[],
    msg: '', msgAt: -9,
  });
  const [hud, setHud] = useState({ phase: 'ready' as Phase, card: null as Card | null, journal: { ...journal.current } });
  // en développement seulement : l'état du jeu, pour les essais (forcer une légende…)
  if (import.meta.env.DEV) (window as unknown as { __fishing?: unknown }).__fishing = s.current;
  const set = (phase: Phase, card: Card | null = null) => { s.current.phase = phase; setHud({ phase, card, journal: { ...journal.current } }); };
  const say = (msg: string) => { s.current.msg = msg; s.current.msgAt = s.current.t; };
  const spec = () => FISH[s.current.kind];

  const splash = (x: number, n: number, col = '#ffffff') => {
    for (let i = 0; i < n; i++) s.current.bits.push({ x, y: SURFACE, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 45, life: 0.8, col });
  };
  const confetti = (n: number) => {
    const cols = ['#ffd166', '#ff6fa8', '#3ddc97', '#4fb3ff', '#ffffff', '#ff8a3d'];
    for (let i = 0; i < n; i++) s.current.confetti.push({ x: BOAT_X + 30, y: SURFACE - 40, vx: (Math.random() - 0.5) * 140, vy: -40 - Math.random() * 80, life: 1.8, col: cols[i % cols.length] });
  };

  /** Une nouvelle touche se prépare : quelle espèce, quand arrive son ombre. */
  const prepare = () => {
    const st = s.current;
    st.kind = pickCatch(st.power, st.perfect, tod, lucky);
    st.shadow = null;
    st.nibbles = Math.floor(Math.random() * 4);
    st.nextEvent = st.t + 0.8 + Math.random() * 1.8;
  };

  const action = () => {
    const st = s.current;
    switch (st.phase) {
      case 'ready': set('boat'); sfx('click'); return;
      case 'boat': st.power = 0; st.powDir = 1; set('aim'); sfx('tick'); return;
      case 'aim': {
        st.perfect = st.power >= 0.82 && st.power <= 0.94;
        st.landX = 104 + st.power * 140;
        st.castT = 0;
        set('cast');
        sfx('send');
        if (st.perfect) say('LANCER PARFAIT !');
        else if (st.power < 0.2) say('PLOUF... JUSTE A COTE');
        return;
      }
      case 'wait':
        // trop tôt : le poisson prend peur
        if (st.shadow) { st.shadow.vx = (st.shadow.x < st.bobX ? -1 : 1) * 90; say('TROP TOT ! IL A EU PEUR'); sfx('no'); st.nextEvent = st.t + 1.6; st.shadow = null; prepare(); }
        return;
      case 'bite': {
        const sp = spec();
        st.hp = sp.hp; st.shownHp = sp.hp; st.trailHp = sp.hp;
        st.kg = Math.round((sp.kg[0] + Math.random() * (sp.kg[1] - sp.kg[0])) * 100) / 100;
        st.cursor = 0; st.curDir = 1; st.zone = 0.3 + Math.random() * 0.4; st.tension = 0; st.rage = false;
        set('fight');
        sfx('check');
        say(sp.legend ? 'FERRE ! LE COMBAT COMMENCE' : 'FERRE !');
        splash(st.bobX, 10);
        return;
      }
      case 'fight': strike(); return;
    }
  };

  /** Un coup pendant le combat : dans la zone verte, il perd de la vie ; à côté, la ligne se tend. */
  const strike = () => {
    const st = s.current, sp = spec();
    const d = Math.abs(st.cursor - st.zone);
    if (d < sp.zone / 2) {
      const perfect = d < sp.zone / 6;
      st.hp -= perfect ? 2 : 1;
      st.hitAt = st.t;
      st.zone = sp.zone / 2 + Math.random() * (1 - sp.zone);
      sfx('check', perfect ? 1.3 : 1);
      say(perfect ? 'PARFAIT !' : 'BIEN !');
      if (Math.random() < (sp.legend ? 0.45 : 0.3)) { st.jumpAt = st.t; splash(st.bobX, 8); }
      if (sp.legend && !st.rage && st.hp <= sp.hp / 2) { st.rage = true; st.flashAt = st.t; st.shake = 0.6; say('IL ENRAGE !'); sfx('error'); }
      if (st.hp <= 0) land();
    } else {
      st.tension += sp.legend ? 0.3 : 0.34;
      st.missAt = st.t;
      st.shake = 0.25;
      sfx('no');
      say('RATE !');
      if (st.tension >= 1) snap();
    }
  };

  const land = () => {
    const st = s.current, sp = spec();
    st.catchAt = st.t;
    st.until = st.t + (sp.legend ? 4 : 3);
    splash(st.bobX, 14);
    let record = false;
    if (!sp.junk) {
      const prev = journal.current[st.kind];
      record = !!prev && st.kg > prev.kg;
      journal.current = { ...journal.current, [st.kind]: { n: (prev?.n ?? 0) + 1, kg: Math.max(prev?.kg ?? 0, st.kg) } };
      const sc = loadScores();
      sc.fish = { journal: journal.current };
      saveScores(sc);
      confetti(sp.legend ? 90 : record || !prev ? 40 : 18);
      sfx(sp.legend || record ? 'done' : 'check');
      outside.fx.floatIcon(outside.rore.x, outside.rore.y - 26, 'heart');
    } else {
      if (st.kind === 'algue') st.algaeUntil = st.t + 6;
      st.sadUntil = st.t + 3;
      sfx('no');
    }
    const card: Card = sp.junk
      ? { title: sp.name, sub: st.kind === 'botte' ? 'Elle n’est même pas à sa taille.' : 'Roré la garde comme un chapeau.', legend: false, junk: true, record: false }
      : { title: sp.legend ? `${sp.name} !` : sp.name, sub: `${fmtKg(st.kg)}${record ? ' · nouveau record !' : !journal.current[st.kind] || journal.current[st.kind].n === 1 ? ' · nouveau dans le carnet' : ''}`, legend: !!sp.legend, junk: false, record };
    set('catch', card);
  };

  const snap = () => {
    const st = s.current;
    st.failAt = st.t;
    st.until = st.t + 2.4;
    st.shake = 0.5;
    say('TCHAC ! LA LIGNE A CASSE');
    sfx('error');
    set('fail', { title: 'La ligne a cassé…', sub: spec().legend ? `${spec().name} est reparti au fond. Il reviendra.` : 'Roré tombe à la renverse dans la barque.', legend: false, junk: true, record: false });
  };

  const step = (dt: number) => {
    const st = s.current;
    for (const k of keys.take()) if (k === ' ' || k === 'enter') action();
    st.t += dt;
    const t = st.t;
    st.shake = Math.max(0, st.shake - dt);
    st.dip = Math.max(0, st.dip - dt * 6);
    for (const b of [...st.bits, ...st.confetti]) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt; b.life -= dt; }
    st.bits = st.bits.filter((b) => b.life > 0 && b.y < SURFACE + 2);
    st.confetti = st.confetti.filter((b) => b.life > 0);
    if (st.gull) { st.gull.t += dt; if (st.gull.t > 3) st.gull = null; }
    switch (st.phase) {
      case 'aim':
        st.power += st.powDir * 1.25 * dt;
        if (st.power >= 1) { st.power = 1; st.powDir = -1; }
        if (st.power <= 0) { st.power = 0; st.powDir = 1; }
        break;
      case 'cast': {
        st.castT += dt / 0.75;
        const u = Math.min(1, st.castT);
        st.bobX = TIP.x + (st.landX - TIP.x) * u;
        st.bobY = TIP.y + (SURFACE - TIP.y) * u - Math.sin(u * Math.PI) * 34;
        if (u >= 1) { st.bobY = SURFACE; splash(st.bobX, 9); sfx('glug'); prepare(); set('wait'); }
        break;
      }
      case 'wait': {
        // parfois, une mouette se pose sur la flotte (une fausse touche, pour rire)
        if (!st.gull && Math.random() < dt * 0.06) st.gull = { x: st.bobX, y: SURFACE - 3, t: 0 };
        if (st.gull && st.gull.t > 0.8 && st.gull.t < 2.2 && Math.random() < dt * 3) st.dip = 0.4;
        if (!st.shadow && t > st.nextEvent) {
          const side = Math.random() < 0.5 ? -1 : 1;
          st.shadow = { x: st.bobX + side * (50 + Math.random() * 30), vx: 42, y: SURFACE + 22 + Math.random() * 26 };
        }
        if (st.shadow) {
          const sh = st.shadow;
          const dx = st.bobX - sh.x;
          if (Math.abs(dx) > 3) sh.x += Math.sign(dx) * Math.min(Math.abs(dx), Math.abs(sh.vx) * dt);
          sh.y += (SURFACE + 10 - sh.y) * dt * 0.8;
          if (Math.abs(dx) <= 3 && t > st.nextNibble) {
            if (st.nibbles > 0) { st.nibbles--; st.dip = 0.45; st.nextNibble = t + 0.6 + Math.random() * 0.9; sfx('tick', 1.6); }
            else if (spec().legend) { st.until = t + 1.3; st.flashAt = t; st.shake = 1.3; set('warn'); sfx('error'); }
            else { st.until = t + spec().window; st.dip = 1; set('bite'); sfx('ask'); }
          }
        }
        break;
      }
      case 'warn':
        if (t > st.until) { st.until = t + spec().window; st.dip = 1; set('bite'); sfx('ask'); }
        break;
      case 'bite':
        st.dip = 1;
        if (t > st.until) { say('TROP TARD... IL A FILE'); sfx('no'); st.shadow = null; prepare(); set('wait'); }
        break;
      case 'fight': {
        const sp = spec();
        const speed = sp.speed * (st.rage ? 1.35 : 1);
        st.cursor += st.curDir * speed * dt;
        if (st.cursor >= 1) { st.cursor = 1; st.curDir = -1; }
        if (st.cursor <= 0) { st.cursor = 0; st.curDir = 1; }
        if (sp.legend) st.zone = Math.max(sp.zone / 2, Math.min(1 - sp.zone / 2, st.zone + Math.sin(t * 1.7) * 0.12 * dt));
        st.tension = Math.max(0, st.tension - 0.05 * dt);
        st.dip = 0.8;
        break;
      }
      case 'catch': case 'fail':
        if (t > st.until) { st.bobX = TIP.x; st.bobY = TIP.y; set('boat'); }
        break;
    }
    // la barre de vie suit en douceur ; la traînée claire la rattrape plus lentement (comme pour un boss)
    st.shownHp += (Math.max(0, st.hp) - st.shownHp) * Math.min(1, dt * 10);
    st.trailHp += (st.shownHp - st.trailHp) * Math.min(1, dt * 2.2);
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current, t = st.t, sp = spec();
    const sky = SKY[tod], sea = SEA[tod];
    const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    g.save();
    if (st.shake > 0) g.translate(Math.round((Math.random() - 0.5) * 4 * Math.min(1, st.shake * 3)), Math.round((Math.random() - 0.5) * 3 * Math.min(1, st.shake * 3)));
    // le ciel, l'astre, les nuages
    const bh = Math.ceil(HORIZON / sky.length);
    sky.forEach((col, i) => r(0, i * bh, W, bh, col));
    if (tod === 'night') { r(214, 10, 5, 5, '#eef2ff'); for (let i = 0; i < 30; i++) r((i * 73) % W, (i * 37) % 44, 1, 1, '#c9d0f0'); }
    else r(214, tod === 'evening' ? 42 : 12, 8, 8, tod === 'evening' ? '#ffcf8a' : '#fffbe8');
    for (let i = 0; i < 3; i++) { const x = ((t * (2 + i) + i * 90) % (W + 50)) - 40; r(x, 8 + i * 9, 26, 4, tod === 'night' ? '#2a3460' : '#ffffff'); r(x + 4, 6 + i * 9, 14, 3, tod === 'night' ? '#2a3460' : '#ffffff'); }
    // la falaise, vue de loin, avec le pavillon et les pins ; le phare sur son îlot
    const haze = tod === 'day' ? ['#7f9a86', '#9aa49a', '#8a8e88', '#767a76'] : tod === 'evening' ? ['#6a4a6a', '#8a6070', '#7a5468', '#684860'] : ['#1a2440', '#222c4a', '#1e2744', '#18203a'];
    for (let x = 60; x < 214; x++) {
      const edge = x < 68 ? (68 - x) * 2 : x > 206 ? (x - 206) * 2.5 : 0;
      const top = Math.round(29 + Math.sin(x * 0.13) * 1.4 + Math.sin(x * 0.37 + 1) * 0.8 + edge);
      if (top >= HORIZON) continue;
      r(x, top, 1, 2, haze[0]);
      const n = Math.sin(x * 12.9898) * 43758.5453, v = n - Math.floor(n);
      r(x, top + 2, 1, HORIZON - top - 2, haze[1 + Math.floor(v * 2.99)]);
      for (let y = top + 5; y < HORIZON; y += 6) r(x, y + Math.round(Math.sin(x * 0.2 + y) * 1), 1, 1, haze[3]);
    }
    r(176, 21, 18, 8, '#e8e2d6'); r(175, 20, 20, 2, '#8a8a92'); r(183, 24, 4, 5, '#ffd9a0'); r(189, 23, 4, 4, tod === 'day' ? '#9fd4f2' : '#ffcf8a'); r(177, 23, 3, 6, '#9a6a3e');
    for (const [px, h] of [[80, 6], [96, 5], [150, 6], [204, 5]]) { r(px, 28 - h, 1, h, '#4a3a2c'); r(px - 3, 28 - h - 2, 8, 3, '#2f5e36'); }
    r(232, HORIZON - 3, 16, 3, haze[2]); r(238, HORIZON - 13, 3, 10, '#f1ede6'); r(238, HORIZON - 10, 3, 2, '#d24a40'); r(237, HORIZON - 15, 5, 2, '#2e2e3c');
    if (t % 4 < 0.5) r(238, HORIZON - 15, 3, 1, '#fff7c0');
    // la mer au loin, puis sous la surface
    for (let y = HORIZON; y < SURFACE; y++) r(0, y, W, 1, (y - HORIZON) < 6 ? sea[0] : sea[1]);
    for (let i = 0; i < 24; i++) {
      const p = (i * 0.13 + t * 0.03) % 1;
      const x = ((i * 47 + t * (3 + p * 8)) % (W + 20)) - 10;
      g.fillStyle = `rgba(255,255,255,${0.2 + 0.4 * Math.sin(p * Math.PI)})`;
      g.fillRect(Math.round(x), Math.round(HORIZON + 1 + p * (SURFACE - HORIZON - 3)), 1 + Math.round(p * 5), 1);
    }
    for (let y = SURFACE; y < H; y++) r(0, y, W, 1, sea[Math.min(3, 2 + Math.floor((y - SURFACE) / 40))]);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 4; i++) { const x0 = 40 + i * 60 + Math.sin(t * 0.3 + i) * 10; for (let y = SURFACE; y < H; y += 2) g.fillRect(Math.round(x0 + (y - SURFACE) * 0.4), y, 6, 2); }
    // l'ombre du poisson qui approche (énorme pour une légende)
    if (st.shadow && (st.phase === 'wait' || st.phase === 'warn' || st.phase === 'bite')) {
      const k = sp.legend ? 2.2 : 1;
      g.fillStyle = 'rgba(5,10,30,0.45)';
      g.beginPath(); g.ellipse(st.shadow.x, st.shadow.y, (sp.w / 2 + 3) * k, (sp.h / 2 + 1) * k, 0, 0, Math.PI * 2); g.fill();
    }
    // le poisson accroché, qui se débat sous l'eau (ou qui saute)
    const jump = (t - st.jumpAt) / 0.9;
    if (st.phase === 'fight') {
      if (jump >= 0 && jump < 1) {
        g.save();
        g.translate(Math.round(st.bobX + (jump - 0.5) * 34), Math.round(SURFACE - Math.sin(jump * Math.PI) * (sp.legend ? 46 : 32)));
        g.rotate((jump - 0.5) * 2.2);
        if (sp.legend) g.scale(1.5, 1.5);
        drawFish(g, st.kind, t, t - st.hitAt < 0.1);
        g.restore();
      } else {
        g.save();
        g.translate(Math.round(st.bobX + Math.sin(t * 3) * 10), Math.round(SURFACE + 22 + Math.sin(t * 2.3) * 5));
        if (Math.sin(t * 3) < 0) g.scale(-1, 1);
        if (sp.legend) g.scale(1.5, 1.5);
        drawFish(g, st.kind, t, t - st.hitAt < 0.1);
        g.restore();
      }
    }
    // la surface et ses vagues
    const wave = (x: number) => SURFACE + Math.sin(x * 0.08 + t * 2.2) * 1.2 + Math.sin(x * 0.21 - t * 1.4) * 0.6;
    for (let x = 0; x < W; x++) { const y = wave(x); r(x, y - 1, 1, 2, sea[1]); r(x, y + 1, 1, 1, 'rgba(255,255,255,0.35)'); if (Math.sin(x * 0.3 + t * 3) > 0.92) r(x, y - 1, 1, 1, '#ffffff'); }
    // la barque, et Roré (il tombe à la renverse quand la ligne casse)
    const bob = Math.sin(t * 1.8) * (st.phase === 'fight' ? 2 : 1.2), tilt = Math.sin(t * 1.3) * (st.phase === 'fight' ? 1.6 : 0.8);
    const by = SURFACE - 5 + bob;
    const fall = (t - st.failAt) / 0.5;
    const caught = (t - st.catchAt) / 1.1;
    const pose = st.phase === 'aim' ? 'raise' : st.phase === 'cast' ? 'cheer' : st.phase === 'fight' ? (t - st.hitAt < 0.2 ? 'cheer' : 'type') : st.phase === 'catch' && !sp.junk ? 'cheer' : 'sit';
    const eyes = st.sadUntil > t ? 'down' : st.phase === 'catch' || st.phase === 'bite' || st.phase === 'warn' ? 'happy' : 'open';
    const sprite = robotSprite(outside.rore.id, pose, 'right', Math.floor(t * 6) % 2, eyes);
    if (st.phase === 'fail' && fall >= 0) {
      g.save(); g.translate(BOAT_X + 18, Math.round(by)); g.rotate(-Math.min(1, fall) * 1.4); g.drawImage(sprite, -10, -20); g.restore();
    } else g.drawImage(sprite, BOAT_X + 8, Math.round(by - 18));
    if (st.algaeUntil > t) for (let i = 0; i < 5; i++) r(BOAT_X + 12 + i * 2, by - 18 + (i % 2), 1, 5 + (i % 3), i % 2 ? '#3f7a42' : '#5a9a52');
    for (let i = 0; i < 44; i++) {
      const u = i / 43, h = 8 - Math.round(Math.pow(Math.abs(u - 0.5) * 2, 3) * 5);
      const y0 = by + Math.round(tilt * (u - 0.5) * 2) + (8 - h);
      r(BOAT_X + i, y0, 1, h, '#8a5530'); r(BOAT_X + i, y0, 1, 1, '#b07c4c'); r(BOAT_X + i, y0 + 2, 1, 1, '#d24a40');
    }
    // la canne : elle plie avec la tension
    if (st.phase !== 'fail') {
      const bend = st.phase === 'fight' ? 3 + st.tension * 6 + (t - st.missAt < 0.2 ? 3 : 0) : st.phase === 'bite' ? 4 : 1;
      for (let k = 0; k <= 18; k++) {
        const u = k / 18;
        r(BOAT_X + 20 + (TIP.x - BOAT_X - 20) * u, by - 8 + (TIP.y + bob - (by - 8)) * u + Math.sin(u * Math.PI * 0.9) * -2 + u * u * bend, 1, 1, k < 5 ? '#563821' : '#8a5530');
      }
    }
    // la ligne et la flotte
    const tipX = TIP.x, tipY = TIP.y + bob + (st.phase === 'fight' ? 3 + st.tension * 6 : 0);
    const bx = st.bobX, byb = st.bobY + (st.phase === 'wait' || st.phase === 'bite' || st.phase === 'fight' || st.phase === 'warn' ? Math.sin(t * 2.4) * 0.8 + st.dip * 3 : 0);
    if (st.phase !== 'ready' && st.phase !== 'boat' && st.phase !== 'aim' && st.phase !== 'fail') {
      const taut = st.phase === 'fight';
      g.fillStyle = taut && st.tension > 0.66 ? 'rgba(255,120,110,0.95)' : 'rgba(235,240,250,0.8)';
      const n = Math.max(8, Math.round(Math.hypot(bx - tipX, byb - tipY)));
      for (let k = 0; k <= n; k++) { const u = k / n; g.fillRect(Math.round(tipX + (bx - tipX) * u), Math.round(tipY + (byb - tipY) * u + (taut ? 0 : Math.sin(u * Math.PI) * 5)), 1, 1); }
      if (st.phase !== 'cast' && st.dip < 0.9) { r(bx - 1, byb - 2, 3, 2, '#e5484d'); r(bx, byb - 3, 1, 1, '#ffffff'); }
      else if (st.phase === 'cast') { r(bx - 1, byb - 1, 3, 2, '#e5484d'); }
      if (st.phase === 'bite' || st.phase === 'fight') for (let i = 0; i < 2; i++) { const k = (t * 1.6 + i * 0.5) % 1; g.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; g.fillRect(Math.round(bx - 2 - k * 8), Math.round(SURFACE + 1), Math.round(5 + k * 16), 1); }
    } else if (st.phase === 'fail') {
      // le bout de ligne cassé qui retombe
      g.fillStyle = 'rgba(235,240,250,0.8)';
      for (let k = 0; k < 14; k++) g.fillRect(BOAT_X + 30 + k, Math.round(by - 14 + k * 0.6 + Math.sin(t * 8 + k) * 1), 1, 1);
    } else {
      g.fillStyle = 'rgba(235,240,250,0.8)';
      for (let y = tipY; y < tipY + 8; y++) g.fillRect(tipX, Math.round(y), 1, 1);
    }
    // la mouette posée sur la flotte
    if (st.gull) {
      const gt = st.gull.t;
      const gx = gt < 0.8 ? st.gull.x - 40 + gt * 50 : gt < 2.2 ? st.gull.x : st.gull.x + (gt - 2.2) * 60;
      const gy = gt < 0.8 ? SURFACE - 30 + gt * 33 : gt < 2.2 ? SURFACE - 4 : SURFACE - 4 - (gt - 2.2) * 40;
      const up = Math.floor(t * 8) % 2 && (gt < 0.8 || gt > 2.2);
      r(gx - 3, gy - 3, 6, 3, '#f6f6fa'); r(gx + 2, gy - 5, 3, 3, '#f6f6fa'); r(gx + 5, gy - 4, 2, 1, '#ffb02e'); r(gx - 4, gy - 3 - (up ? 2 : 0), 3, 1, '#a8acb8'); r(gx + 1, gy - 3 - (up ? 2 : 0), 1, 1, '#a8acb8');
    }
    // le poisson qui s'envole au-dessus de Roré, pour la photo
    if (st.phase === 'catch' && caught >= 0) {
      const u = Math.min(1, caught);
      g.save();
      g.translate(Math.round(st.bobX + (BOAT_X + 20 - st.bobX) * u), Math.round(SURFACE - Math.sin(u * Math.PI * 0.5) * 40 - (u >= 1 ? Math.sin(t * 4) * 2 : 0)));
      g.rotate(u < 1 ? u * Math.PI * 4 : 0);
      g.scale(sp.legend ? 2 : 2, 2);
      drawFish(g, st.kind, t);
      g.restore();
    }
    // les éclaboussures, les confettis
    for (const b of st.bits) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
    for (const b of st.confetti) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 2, 1 + (Math.floor(b.life * 10) % 2)); }
    // le « ! » au-dessus de Roré quand ça mord
    if (st.phase === 'bite' && !sp.legend) {
      const big = Math.floor(t * 10) % 2;
      r(BOAT_X + 16, by - 40 - big, 4, 9, '#ffd166'); r(BOAT_X + 16, by - 29, 4, 3, '#ffd166');
      r(BOAT_X + 15, by - 41 - big, 1, 15, '#15121d');
    }
    g.restore();

    // ── l'interface par-dessus ──
    // la jauge du lancer
    if (st.phase === 'aim') {
      const gx = BOAT_X + 50, gy = 26, gw = 70;
      r(gx - 1, gy - 1, gw + 2, 7, '#15121d');
      r(gx, gy, gw, 5, '#3a3a48');
      r(gx + gw * 0.82, gy, gw * 0.12, 5, '#ffd166');
      r(gx, gy, gw * st.power, 5, st.power >= 0.82 && st.power <= 0.94 ? '#ffd166' : '#3ddc97');
      r(gx + gw * st.power - 1, gy - 2, 2, 9, '#ffffff');
      pixelText(g, 'LANCER', gx, gy - 8, '#ffffff');
    }
    // la barre du combat : le curseur, la zone verte (au centre doré : parfait), la tension de la ligne
    if (st.phase === 'fight') {
      const zx = BAR.x + BAR.w * st.zone, zw = BAR.w * sp.zone;
      r(BAR.x - 1, BAR.y - 1, BAR.w + 2, BAR.h + 2, '#15121d');
      r(BAR.x, BAR.y, BAR.w, BAR.h, t - st.missAt < 0.15 ? '#7a2a2a' : '#3a3a48');
      r(zx - zw / 2, BAR.y, zw, BAR.h, t - st.hitAt < 0.12 ? '#ffffff' : '#3ddc97');
      r(zx - zw / 6, BAR.y, zw / 3, BAR.h, '#ffd166');
      const cx = BAR.x + BAR.w * st.cursor;
      r(cx - 1, BAR.y - 3, 2, BAR.h + 6, '#ffffff');
      r(cx - 2, BAR.y - 4, 4, 1, '#ffffff');
      // la tension
      r(BAR.x, BAR.y + BAR.h + 3, BAR.w, 2, '#2a2030');
      r(BAR.x, BAR.y + BAR.h + 3, BAR.w * Math.min(1, st.tension), 2, st.tension > 0.66 ? '#e5484d' : '#ffb02e');
      // la vie d'un poisson ordinaire : des petites pastilles
      if (!sp.legend) for (let i = 0; i < sp.hp; i++) r(BAR.x + BAR.w / 2 - sp.hp * 3 + i * 6, BAR.y - 9, 4, 4, i < st.hp ? '#3ddc97' : '#4a2a30');
    }
    // une légende : flash rouge d'alerte, grand (!), puis barre de vie de boss
    if (sp.legend && (st.phase === 'warn' || st.phase === 'bite' || st.phase === 'fight')) {
      const alarm = st.phase !== 'fight' || t - st.flashAt < 1.2;
      if (alarm) {
        const a = 0.18 + 0.22 * Math.abs(Math.sin(t * 9));
        g.fillStyle = `rgba(229,72,77,${a})`;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(229,72,77,${0.4 + a})`;
        g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
      }
      if (st.phase !== 'fight') {
        // le grand (!) au milieu de l'écran, qui bat
        const k = 1 + 0.12 * Math.sin(t * 12);
        g.save();
        g.translate(W / 2, 62);
        g.scale(k, k);
        g.fillStyle = '#15121d'; g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e5484d'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e5484d'; g.fillRect(-3, -13, 6, 17); g.fillRect(-3, 7, 6, 6);
        g.restore();
        const label = 'POISSON LEGENDAIRE !';
        g.save(); g.scale(2, 2);
        pixelText(g, label, Math.round((W / 2 - textWidth(label)) / 2), 49, Math.floor(t * 6) % 2 ? '#ffffff' : '#ffd166');
        g.restore();
        if (st.phase === 'bite') { const f = 'ESPACE ! FERRE !'; pixelText(g, f, Math.round(W / 2 - textWidth(f) / 2), 92 + 18, '#ffffff'); }
      } else {
        // la barre de vie, comme pour un boss : rouge, avec une traînée claire qui la rattrape
        const bx0 = 36, bw = W - 72, byy = 10;
        r(bx0 - 2, byy - 9, bw + 4, 17, 'rgba(10,8,18,0.8)');
        const name = sp.name.toUpperCase().replace('’', "'");
        pixelText(g, name, Math.round(W / 2 - textWidth(name) / 2), byy - 7, '#ffd166');
        r(bx0, byy, bw, 5, '#2a1018');
        r(bx0, byy, bw * Math.max(0, st.trailHp) / sp.hp, 5, '#ffe2b8');
        r(bx0, byy, bw * Math.max(0, st.shownHp) / sp.hp, 5, st.rage ? (Math.floor(t * 8) % 2 ? '#ff3040' : '#e5484d') : '#e5484d');
        r(bx0, byy, bw * Math.max(0, st.shownHp) / sp.hp, 1, '#ff9aa0');
        for (let i = 1; i < sp.hp; i++) r(bx0 + (bw * i) / sp.hp, byy, 1, 5, 'rgba(10,8,18,0.6)');
      }
    }
    // les petits messages (PARFAIT, RATE, TROP TOT…)
    if (st.msg && t - st.msgAt < 1.3 && st.phase !== 'warn' && st.phase !== 'catch') {
      const y = Math.round(st.phase === 'fight' ? BAR.y - 20 : 40 - (t - st.msgAt) * 6);
      const col = st.msg.startsWith('RATE') || st.msg.startsWith('TROP') || st.msg.startsWith('TCHAC') || st.msg.startsWith('IL ENRAGE') ? '#ff8a80' : '#ffd166';
      r(W / 2 - textWidth(st.msg) / 2 - 3, y - 2, textWidth(st.msg) + 6, 9, 'rgba(10,8,18,0.7)');
      pixelText(g, st.msg, Math.round(W / 2 - textWidth(st.msg) / 2), y, col);
    }
  };

  useLoop(step, draw, []);

  const tip: Record<Phase, string> = {
    ready: '',
    boat: 'Espace (ou un clic) pour préparer le lancer.',
    aim: 'Espace pour lancer ! Dans la zone dorée, c’est un lancer parfait : plus loin, et les légendes rôdent.',
    cast: 'Plouf !',
    wait: 'Attends… La flotte frémit parfois pour rien (et les mouettes s’en mêlent). Ferre seulement quand elle plonge !',
    warn: 'Attention : quelque chose d’énorme approche…',
    bite: 'Ça mord ! Espace, vite !',
    fight: 'Espace quand le curseur est dans la zone verte (le centre doré compte double). Chaque raté tend la ligne.',
    catch: '',
    fail: '',
  };

  const caught = SPECIES.filter((k) => hud.journal[k]);
  return (
    <div className="game">
      <div className="game-screen" onPointerDown={(e) => { e.preventDefault(); action(); }}>
        <canvas ref={canvas} width={W} height={H} style={{ cursor: 'pointer' }} />
        {hud.card && (hud.phase === 'catch' || hud.phase === 'fail') && (
          <div className={`fish-card ${hud.card.legend ? 'legend' : ''} ${hud.card.junk ? 'junk' : ''}`}>
            <b>{hud.card.title}</b>
            <span>{hud.card.sub}</span>
          </div>
        )}
        {hud.phase === 'ready' && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            <b>La pêche au large</b>
            <span>Tout est dans le timing : lance au bon moment, ferre quand la flotte plonge (pas avant !), puis frappe quand le curseur passe dans la zone verte.</span>
            <span className="muted">On raconte qu’un Thon d’Or rôde le jour, et Nessie la nuit… Il faut un lancer parfait pour les attirer.</span>
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); set('boat'); sfx('click'); }}>Monter dans la barque</button>
          </div>
        )}
      </div>
      <p className="small">{tip[hud.phase] || ' '}</p>
      <div className="fish-journal">
        <span className="muted small">Carnet de pêche : {caught.length} sur {SPECIES.length}</span>
        <div className="fish-journal-list">
          {SPECIES.map((k) => {
            const e = hud.journal[k];
            const sp = FISH[k];
            return e
              ? <span key={k} className={`fish-chip ${sp.legend ? 'legend' : ''}`}>{sp.legend ? '★ ' : ''}{sp.name} ×{e.n} · {fmtKg(e.kg)}</span>
              : <span key={k} className="fish-chip unknown" title={sp.hint}>??? · {sp.hint}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
