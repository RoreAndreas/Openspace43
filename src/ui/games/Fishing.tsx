// La pêche, à la manière de « Scale the Depths » : Roré part en barque au large (on voit la falaise de loin, le pavillon
// 43, le phare). Il plonge sa ligne : l'hameçon descend tout seul, on le guide (← →, ou la souris) et on percute les
// poissons pour les accrocher (les gros, et le homard dans sa carapace, demandent plusieurs coups). Plus on descend, plus
// les prises sont belles. On remonte, on écaille chaque poisson sur l'établi, et on le vend aux clients du large
// (une mouette, un phoque, une loutre… parfois Nessie). Les pièces paient le matériel : une ligne plus longue,
// un hameçon plus lourd, plus de crochets, un couteau mieux aiguisé. Tout est gardé dans le navigateur.
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { outside, timeOfDay } from '../../engine/instance.ts';
import { robotSprite } from '../../engine/robots.ts';
import { useOffice } from '../../state/store.ts';
import { loadScores, saveScores, useKeys, useLoop, type FishSave } from './common.ts';

const W = 256, H = 144;
/** l'horizon, et la surface de l'eau devant la barque (coordonnées du monde ; la vue descend avec l'hameçon) */
const HORIZON = 54, SURFACE = 72;
const BOAT_X = 150;
const TIP = { x: BOAT_X + 34, y: SURFACE - 26 };

// ── Les poissons ──
type Kind = 'sardine' | 'maquereau' | 'rouget' | 'dorade' | 'bar' | 'congre' | 'homard' | 'lotte' | 'lune';
interface Spec { name: string; w: number; h: number; body: string; belly: string; fin: string; depth: [number, number]; hp: number; value: number; speed: number; often: number; armor?: number }
const FISH: Record<Kind, Spec> = {
  sardine: { name: 'Sardine', w: 7, h: 3, body: '#9fb4c8', belly: '#e4edf5', fin: '#6f8aa4', depth: [8, 180], hp: 1, value: 3, speed: 30, often: 10 },
  maquereau: { name: 'Maquereau', w: 10, h: 4, body: '#3f8f7a', belly: '#d8eee4', fin: '#235e50', depth: [40, 280], hp: 1, value: 5, speed: 26, often: 8 },
  rouget: { name: 'Rouget', w: 9, h: 4, body: '#d9574a', belly: '#f6c8b8', fin: '#a83a30', depth: [140, 440], hp: 2, value: 9, speed: 22, often: 6 },
  dorade: { name: 'Dorade', w: 11, h: 6, body: '#c8b48a', belly: '#f1e6c8', fin: '#e0b040', depth: [200, 540], hp: 2, value: 12, speed: 18, often: 5 },
  bar: { name: 'Bar', w: 14, h: 5, body: '#8a98aa', belly: '#e8edf2', fin: '#5a6678', depth: [300, 720], hp: 3, value: 18, speed: 21, often: 4 },
  congre: { name: 'Congre', w: 22, h: 3, body: '#4a4e5e', belly: '#8a8e9e', fin: '#2e3240', depth: [450, 920], hp: 3, value: 24, speed: 15, often: 3 },
  homard: { name: 'Homard', w: 12, h: 6, body: '#2f4f8a', belly: '#4a6ea8', fin: '#1f3560', depth: [520, 1100], hp: 4, value: 38, speed: 7, often: 2, armor: 2 },
  lotte: { name: 'Lotte', w: 14, h: 9, body: '#6a5440', belly: '#8a7058', fin: '#3e3024', depth: [760, 1400], hp: 5, value: 55, speed: 9, often: 2 },
  lune: { name: 'Poisson-lune', w: 18, h: 16, body: '#a8b4c0', belly: '#d8e0e8', fin: '#7a8898', depth: [1100, 1600], hp: 7, value: 130, speed: 6, often: 1 },
};
const KINDS = Object.keys(FISH) as Kind[];

interface Fish { kind: Kind; x: number; y: number; vx: number; hp: number; ph: number; hitAt: number }

// ── Le matériel (les niveaux et leurs prix) ──
const LINE = [180, 340, 520, 760, 1040, 1400];
const GEAR = {
  line: { label: 'Ligne plus longue', what: (l: number) => `${Math.round(LINE[l] / 8)} m`, cost: [20, 45, 90, 160, 260], max: 5 },
  hook: { label: 'Hameçon plus lourd', what: (l: number) => `${l + 1} de dégât${l ? 's' : ''}`, cost: [30, 80, 180], max: 3 },
  hooks: { label: 'Plus de crochets', what: (l: number) => `${l + 1} prise${l ? 's' : ''} par plongée`, cost: [25, 60, 120, 220], max: 4 },
  knife: { label: 'Couteau aiguisé', what: (l: number) => `${l + 1} écaille${l ? 's' : ''} par coup`, cost: [20, 60], max: 2 },
} as const;
type Gear = keyof typeof GEAR;

// ── Les clients ──
type Who = 'mouette' | 'phoque' | 'loutre' | 'crabe' | 'nessie';
const WHO: Record<Who, string> = { mouette: 'Une mouette', phoque: 'Un phoque', loutre: 'Une loutre', crabe: 'Un crabe', nessie: 'Nessie !' };
interface Client { who: Who; wants: Kind }

const SKY = { day: ['#7cbaec', '#9bcdf1', '#bcdff5', '#dcedf7'], evening: ['#3a2f6a', '#7a4579', '#d9786a', '#ffb27a'], night: ['#0b1030', '#121a42', '#18234c', '#202d5a'] };
const SEA = { day: ['#a6d2ea', '#5aa0cc', '#2a78b2'], evening: ['#f0a88a', '#8a5a88', '#4a3a72'], night: ['#28335e', '#1a2850', '#0f1c40'] };

const mixHex = (a: string, b: string, k: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

/** Les poissons de la plongée : plus profond, plus rares et plus beaux. On en voit un peu plus bas que la ligne (pour donner envie). */
function populate(reach: number): Fish[] {
  const out: Fish[] = [];
  const bottom = Math.min(1650, reach + 220);
  const n = Math.round(bottom / 16);
  for (let i = 0; i < n; i++) {
    const d = 10 + Math.random() * (bottom - 10);
    const here = KINDS.filter((k) => d >= FISH[k].depth[0] && d <= FISH[k].depth[1]);
    if (!here.length) continue;
    let r = Math.random() * here.reduce((s, k) => s + FISH[k].often, 0);
    let kind = here[0];
    for (const k of here) { r -= FISH[k].often; if (r <= 0) { kind = k; break; } }
    const sp = FISH[kind];
    out.push({ kind, x: 10 + Math.random() * (W - 20), y: SURFACE + d, vx: (Math.random() < 0.5 ? -1 : 1) * sp.speed * (0.6 + Math.random() * 0.7), hp: sp.hp, ph: Math.random() * 6, hitAt: -9 });
  }
  return out;
}

/** Un poisson (ou le homard, la lotte et sa lanterne, le poisson-lune), centré en (x, y), tourné vers `dir`. */
function drawFish(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number, dir: number, t: number, ph = 0, flash = false) {
  const s = FISH[kind];
  const r = (dx: number, dy: number, w: number, h: number, c: string) => { g.fillStyle = flash ? '#ffffff' : c; g.fillRect(Math.round(x + (dir > 0 ? dx : -dx - w)), Math.round(y + dy), w, h); };
  const tail = Math.floor(t * 8 + ph) % 2;
  if (kind === 'homard') {
    r(-6, -2, 10, 4, s.body); r(-6, -1, 10, 1, s.belly); r(-9, -1, 3, 3, s.fin);
    r(4, -4, 4, 3, s.body); r(4, 2, 4, 3, s.body); r(7, -5, 2, 2, s.fin); r(7, 4, 2, 2, s.fin);
    for (let i = 0; i < 3; i++) r(-4 + i * 3, 2 + ((Math.floor(t * 6) + i) % 2), 1, 2, s.fin);
    r(5, -1, 1, 1, '#15121d');
    return;
  }
  const hw = Math.floor(s.w / 2);
  for (let i = 0; i < s.w; i++) {
    const u = i / (s.w - 1);
    const shape = kind === 'lune' ? Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) : kind === 'lotte' ? Math.min(1, 0.35 + u * 0.9) : kind === 'congre' ? 1 : Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.9));
    const hh = Math.max(1, Math.round(s.h * shape));
    const wob = kind === 'congre' ? Math.round(Math.sin(t * 6 + ph + i * 0.5) * 1) : 0;
    r(i - hw, -Math.floor(hh / 2) + wob, 1, hh, s.body);
    if (hh > 2) r(i - hw, Math.ceil(hh / 2) - 1 + wob, 1, 1, s.belly);
  }
  // la queue qui bat, l'œil
  if (kind !== 'congre') { r(-hw - 2, -1 - tail, 2, 1, s.fin); r(-hw - 2, tail, 2, 1, s.fin); }
  r(s.w - hw - 3, -1 - (kind === 'lune' ? 3 : 0), 1, 1, '#15121d');
  if (kind === 'dorade') r(s.w - hw - 5, -2, 1, 3, s.fin);
  if (kind === 'maquereau') for (let i = -3; i <= 2; i += 2) r(i, -2, 1, 1, s.fin);
  if (kind === 'lune') { r(-2, -s.h / 2 - 3, 3, 4, s.fin); r(-2, s.h / 2 - 1, 3, 4, s.fin); }
  if (kind === 'lotte') {
    // la lanterne, au bout de son fil
    r(s.w - hw - 2, -6, 1, 3, s.fin); r(s.w - hw - 1, -7, 3, 1, s.fin);
    g.fillStyle = flash ? '#ffffff' : (Math.sin(t * 3 + ph) > -0.3 ? '#fff2a0' : '#c8a850');
    g.fillRect(Math.round(x + (dir > 0 ? s.w - hw + 2 : -(s.w - hw + 2) - 2)), Math.round(y - 8), 2, 2);
    r(s.w - hw - 4, 2, 3, 1, '#f1ede6');
  }
}

/** Un client du large, debout (ou dans l'eau) à droite de l'établi. */
function drawClient(g: CanvasRenderingContext2D, who: Who, x: number, y: number, t: number) {
  const r = (dx: number, dy: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x + dx), Math.round(y + dy), w, h); };
  const bob = Math.floor(t * 2) % 2;
  switch (who) {
    case 'mouette':
      r(-6, -10 - bob, 12, 7, '#f6f6fa'); r(-8, -8 - bob, 6, 3, '#a8acb8'); r(4, -14 - bob, 6, 6, '#f6f6fa'); r(10, -12 - bob, 4, 2, '#ffb02e'); r(7, -13 - bob, 1, 1, '#15121d');
      r(-2, -3, 1, 3, '#ffb02e'); r(2, -3, 1, 3, '#ffb02e');
      break;
    case 'phoque':
      r(-12, -8, 22, 8, '#7a7f8c'); r(-10, -10, 18, 3, '#8a909e'); r(6, -16 + bob, 9, 9, '#8a909e'); r(9, -13 + bob, 1, 1, '#15121d'); r(13, -13 + bob, 1, 1, '#15121d'); r(11, -11 + bob, 2, 1, '#2e2e3c');
      r(-14, -4, 4, 3, '#6a6f7c');
      break;
    case 'loutre':
      r(-5, -14, 10, 14, '#8a5a36'); r(-4, -10, 8, 8, '#c89b6a'); r(-6, -20 + bob, 12, 8, '#8a5a36'); r(-3, -17 + bob, 1, 1, '#15121d'); r(2, -17 + bob, 1, 1, '#15121d'); r(-1, -15 + bob, 2, 1, '#2e2e3c');
      r(-6, -21 + bob, 2, 2, '#6b4528'); r(4, -21 + bob, 2, 2, '#6b4528');
      break;
    case 'crabe':
      r(-7, -6, 14, 6, '#d9473f'); r(-5, -8, 10, 2, '#e8695f'); r(-11, -10 - bob, 4, 4, '#d9473f'); r(7, -10 - bob, 4, 4, '#d9473f');
      r(-3, -10, 1, 2, '#15121d'); r(2, -10, 1, 2, '#15121d');
      for (let i = 0; i < 3; i++) { r(-9 + i * 2, 0, 1, 2, '#a83a30'); r(4 + i * 2, 0, 1, 2, '#a83a30'); }
      break;
    case 'nessie':
      r(-14, -6, 18, 6, '#3f8a5a'); r(2, -24 + bob, 4, 20, '#3f8a5a'); r(2, -28 + bob, 9, 5, '#4fa06a'); r(8, -27 + bob, 1, 1, '#15121d');
      for (let i = 0; i < 3; i++) r(-12 + i * 5, -8, 3, 2, '#2f6a42');
      break;
  }
}

const newClient = (): Client => {
  const who: Who = Math.random() < 0.06 ? 'nessie' : (['mouette', 'phoque', 'loutre', 'crabe'] as Who[])[Math.floor(Math.random() * 4)];
  const shallow: Kind[] = ['sardine', 'maquereau', 'rouget', 'dorade', 'bar'];
  const pool = who === 'nessie' ? (['lotte', 'lune', 'homard'] as Kind[]) : shallow;
  return { who, wants: pool[Math.floor(Math.random() * pool.length)] };
};

type Phase = 'ready' | 'boat' | 'dive' | 'rise' | 'scale';

export function Fishing() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const tod = timeOfDay(useOffice.getState().tod);
  const save = useRef<FishSave>(loadScores().fish);
  const s = useRef({
    phase: 'ready' as Phase,
    t: 0, cam: 0, hookX: TIP.x, hookY: TIP.y, aimX: -1,
    fish: [] as Fish[], caught: [] as Fish[],
    // l'établi : le poisson du moment, ses écailles, le client qui attend
    scales: [] as { x: number; y: number }[], client: newClient(), sold: 0, saleText: '', saleAt: -9,
    clang: -9,
  });
  const [hud, setHud] = useState({ phase: 'ready' as Phase, save: save.current, today: 0, msg: '' });
  const refresh = (msg = '') => setHud({ phase: s.current.phase, save: { ...save.current }, today: s.current.sold, msg });
  const persist = () => { const sc = loadScores(); sc.fish = save.current; saveScores(sc); };

  const reach = () => SURFACE + LINE[save.current.line];
  const hooksMax = () => save.current.hooks + 1;

  const toBoat = (msg = '') => { const st = s.current; st.phase = 'boat'; st.hookX = TIP.x; st.hookY = TIP.y; st.cam = 0; refresh(msg); };

  const dive = () => {
    const st = s.current;
    st.fish = populate(LINE[save.current.line]);
    st.caught = [];
    st.hookX = TIP.x;
    st.hookY = SURFACE + 2;
    st.phase = 'dive';
    refresh();
    sfx('tick');
  };

  /** Le poisson suivant sur l'établi : ses écailles, posées sur son corps. */
  const nextScale = () => {
    const st = s.current;
    const f = st.caught[0];
    if (!f) { toBoat(st.sold ? '' : 'Rien au bout de la ligne cette fois.'); return; }
    const sp = FISH[f.kind];
    const k = boardScale(f.kind);
    const n = Math.max(5, Math.min(16, Math.round((sp.w * sp.h) / 6)));
    st.scales = Array.from({ length: n }, () => ({
      x: 120 + (Math.random() - 0.5) * sp.w * k * 0.7,
      y: 82 + (Math.random() - 0.5) * Math.max(2, sp.h - 1) * k * 0.6,
    }));
    st.phase = 'scale';
    refresh();
  };

  /** Retirer des écailles (le couteau en retire plus quand il est aiguisé) ; plus d'écaille : le client achète. */
  const scrape = (px?: number, py?: number) => {
    const st = s.current;
    if (st.phase !== 'scale' || !st.scales.length) return;
    const knife = save.current.knife + 1;
    if (px !== undefined && py !== undefined) {
      const before = st.scales.length;
      st.scales = st.scales.filter((c) => Math.hypot(c.x - px, c.y - py) > 4 + knife * 2);
      if (st.scales.length < before) sfx('tick', 1.4);
    } else {
      st.scales.splice(0, knife);
      sfx('tick', 1.4);
    }
    if (!st.scales.length) sell();
  };

  const sell = () => {
    const st = s.current;
    const f = st.caught.shift()!;
    const sp = FISH[f.kind];
    const wanted = st.client.wants === f.kind;
    const price = sp.value * (wanted ? 2 : 1) * (st.client.who === 'nessie' ? 2 : 1);
    save.current.coins += price;
    save.current.count += 1;
    if (!save.current.best || price > save.current.best.coins) save.current.best = { name: sp.name, coins: price };
    st.sold += 1;
    st.saleText = `${WHO[st.client.who]} achète : ${sp.name.toLowerCase()}, ${price} pièces${wanted ? ' (c’est ce qu’il voulait : double !)' : ''}`;
    st.saleAt = st.t;
    persist();
    sfx(wanted ? 'done' : 'check');
    outside.fx.floatIcon(outside.rore.x, outside.rore.y - 26, 'heart');
    st.client = newClient();
    nextScale();
    refresh(st.saleText);
  };

  const buy = (gear: Gear) => {
    const g = GEAR[gear];
    const lvl = save.current[gear];
    if (lvl >= g.max) return;
    const cost = g.cost[lvl];
    if (save.current.coins < cost) { sfx('no'); return; }
    save.current.coins -= cost;
    save.current[gear] = lvl + 1;
    persist();
    sfx('check');
    refresh(`${g.label} : ${g.what(lvl + 1)}.`);
  };

  /** Espace (ou un clic) : monter dans la barque, plonger, remonter plus tôt, ou écailler. */
  const action = () => {
    const st = s.current;
    if (st.phase === 'ready') { toBoat(); sfx('click'); return; }
    if (st.phase === 'boat') { dive(); return; }
    if (st.phase === 'dive') { st.phase = 'rise'; refresh(); return; }
    if (st.phase === 'scale') scrape();
  };

  const step = (dt: number) => {
    const st = s.current;
    for (const k of keys.take()) if (k === ' ' || k === 'enter') action();
    st.t += dt;
    // les poissons nagent d'un bord à l'autre
    for (const f of st.fish) {
      f.x += f.vx * dt;
      if (f.x < 6 || f.x > W - 6) { f.vx = -f.vx; f.x = Math.max(6, Math.min(W - 6, f.x)); }
      f.y += Math.sin(st.t * 1.3 + f.ph) * 2 * dt;
    }
    if (st.phase !== 'dive' && st.phase !== 'rise') return;
    // l'hameçon : il descend tout seul (puis remonte) ; ← → ou la souris pour le guider
    const left = keys.held('arrowleft', 'q', 'a'), right = keys.held('arrowright', 'd');
    if (left || right) { st.hookX += (right ? 1 : -1) * 95 * dt; st.aimX = -1; }
    else if (st.aimX >= 0) st.hookX += Math.max(-95 * dt, Math.min(95 * dt, st.aimX - st.hookX));
    st.hookX = Math.max(6, Math.min(W - 6, st.hookX));
    if (st.phase === 'dive') {
      st.hookY += 72 * dt;
      if (st.hookY >= reach()) { st.hookY = reach(); st.phase = 'rise'; refresh(); }
    } else {
      st.hookY -= 120 * dt;
      if (st.hookY <= SURFACE) { st.hookY = SURFACE; st.cam = 0; nextScale(); return; }
    }
    // on percute les poissons : chacun a ses points de vie ; le homard ne craint qu'un hameçon assez lourd
    const dmg = save.current.hook + 1;
    if (st.caught.length < hooksMax()) {
      for (const f of st.fish) {
        const sp = FISH[f.kind];
        if (st.t - f.hitAt < 0.35) continue;
        if (Math.abs(f.x - st.hookX) > sp.w / 2 + 2 || Math.abs(f.y - st.hookY) > sp.h / 2 + 2) continue;
        f.hitAt = st.t;
        if (sp.armor && dmg < sp.armor) { st.clang = st.t; sfx('no'); f.vx = -f.vx; continue; }
        f.hp -= dmg;
        f.vx = -f.vx * 1.3;
        if (f.hp <= 0) {
          st.fish = st.fish.filter((x) => x !== f);
          st.caught.push(f);
          sfx('check');
          if (st.caught.length >= hooksMax() && st.phase === 'dive') { st.phase = 'rise'; refresh(); }
          break;
        }
        sfx('tick');
      }
    }
    // la vue suit l'hameçon
    st.cam = Math.max(0, st.hookY - 56);
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current, t = st.t, cam = Math.round(st.cam);
    const sky = SKY[tod], sea = SEA[tod];
    const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y - cam), Math.round(w), Math.round(h)); };
    // l'eau, qui s'assombrit avec la profondeur
    for (let sy = 0; sy < H; sy += 2) {
      const y = sy + cam;
      if (y < SURFACE) continue;
      const k = Math.min(1, (y - SURFACE) / 1500);
      g.fillStyle = mixHex(sea[2], '#03050f', Math.pow(k, 0.7));
      g.fillRect(0, sy, W, 2);
    }
    // le ciel, l'astre, les nuages, la falaise au loin, la mer jusqu'à l'horizon
    if (cam < SURFACE + 10) {
      const bh = Math.ceil(HORIZON / sky.length);
      sky.forEach((col, i) => r(0, i * bh, W, bh, col));
      if (tod === 'night') { r(200, 10, 5, 5, '#eef2ff'); for (let i = 0; i < 30; i++) r((i * 73) % W, (i * 37) % 44, 1, 1, '#c9d0f0'); }
      else r(200, tod === 'evening' ? 42 : 12, 8, 8, tod === 'evening' ? '#ffcf8a' : '#fffbe8');
      for (let i = 0; i < 3; i++) { const x = ((t * (2 + i) + i * 90) % (W + 50)) - 40; r(x, 8 + i * 9, 26, 4, tod === 'night' ? '#2a3460' : '#ffffff'); r(x + 4, 6 + i * 9, 14, 3, tod === 'night' ? '#2a3460' : '#ffffff'); }
      const haze = tod === 'day' ? ['#7f9a86', '#9aa49a', '#8a8e88', '#767a76'] : tod === 'evening' ? ['#6a4a6a', '#8a6070', '#7a5468', '#684860'] : ['#1a2440', '#222c4a', '#1e2744', '#18203a'];
      // une côte irrégulière : le haut ondule, la paroi a ses strates et ses ravines
      for (let x = 8; x < 170; x++) {
        const edge = x < 16 ? (16 - x) * 2 : x > 162 ? (x - 162) * 2.5 : 0;
        const top = Math.round(27 + Math.sin(x * 0.13) * 1.4 + Math.sin(x * 0.37 + 1) * 0.8 + edge);
        if (top >= HORIZON) continue;
        r(x, top, 1, 2, haze[0]);
        const n = Math.sin(x * 12.9898) * 43758.5453, v = n - Math.floor(n);
        r(x, top + 2, 1, HORIZON - top - 2, haze[1 + Math.floor(v * 2.99)]);
        for (let y = top + 5; y < HORIZON; y += 6) r(x, y + Math.round(Math.sin(x * 0.2 + y) * 1), 1, 1, haze[3]);
        if (v > 0.93) r(x, top + 3, 1, HORIZON - top - 4, haze[3]);
      }
      r(128, 19, 18, 8, '#e8e2d6'); r(127, 18, 20, 2, '#8a8a92'); r(135, 22, 4, 5, '#ffd9a0'); r(141, 21, 4, 4, tod === 'day' ? '#9fd4f2' : '#ffcf8a'); r(129, 21, 3, 6, '#9a6a3e');
      for (const [px, h] of [[30, 6], [44, 5], [96, 6], [158, 5]]) { r(px, 26 - h, 1, h, '#4a3a2c'); r(px - 3, 26 - h - 2, 8, 3, '#2f5e36'); }
      r(226, HORIZON - 3, 16, 3, haze[2]); r(232, HORIZON - 13, 3, 10, '#f1ede6'); r(232, HORIZON - 10, 3, 2, '#d24a40'); r(231, HORIZON - 15, 5, 2, '#2e2e3c');
      if (t % 4 < 0.5) r(232, HORIZON - 15, 3, 1, '#fff7c0');
      for (let y = HORIZON; y < SURFACE; y++) r(0, y, W, 1, (y - HORIZON) < 6 ? sea[0] : sea[1]);
      for (let i = 0; i < 22; i++) {
        const p = (i * 0.13 + t * 0.03) % 1;
        const x = ((i * 47 + t * (3 + p * 8)) % (W + 20)) - 10;
        g.fillStyle = `rgba(255,255,255,${0.2 + 0.4 * Math.sin(p * Math.PI)})`;
        g.fillRect(Math.round(x), Math.round(HORIZON + 1 + p * (SURFACE - HORIZON - 3) - cam), 1 + Math.round(p * 5), 1);
      }
    }
    // sous l'eau : des rayons de lumière près de la surface, de la « neige marine » plus bas, les repères de profondeur
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 4; i++) { const x0 = 30 + i * 60 + Math.sin(t * 0.3 + i) * 10; for (let y = SURFACE; y < SURFACE + 90; y += 2) if (y - cam >= 0 && y - cam < H) g.fillRect(Math.round(x0 + (y - SURFACE) * 0.4), y - cam, 6, 2); }
    for (let i = 0; i < 60; i++) {
      const y = SURFACE + ((i * 97 + t * 4) % 1600);
      if (y - cam < 0 || y - cam >= H) continue;
      g.fillStyle = 'rgba(220,235,255,0.25)';
      g.fillRect((i * 53 + Math.round(Math.sin(t + i) * 3)) % W, Math.round(y - cam), 1, 1);
    }
    for (let d = 100; d <= 1600; d += 100) { const y = SURFACE + d - cam; if (y >= 0 && y < H) { r(0, SURFACE + d, 4, 1, 'rgba(255,255,255,0.35)'); pixelText(g, `${Math.round(d / 8)}M`, 6, y - 2, 'rgba(255,255,255,0.45)'); } }
    // le bout de la ligne : une limite, tout en bas
    { const y = reach() + 6; if (y - cam >= 0 && y - cam < H) for (let x = 0; x < W; x += 6) r(x, y, 3, 1, 'rgba(255,120,100,0.5)'); }
    // les poissons
    for (const f of st.fish) {
      const y = f.y - cam;
      if (y < -12 || y > H + 12) continue;
      drawFish(g, f.kind, f.x, y, f.vx >= 0 ? 1 : -1, t, f.ph, t - f.hitAt < 0.12);
      if (f.hp < FISH[f.kind].hp) for (let i = 0; i < FISH[f.kind].hp; i++) { g.fillStyle = i < f.hp ? '#3ddc97' : '#5a2a2a'; g.fillRect(Math.round(f.x - FISH[f.kind].hp * 1.5 + i * 3), Math.round(y - FISH[f.kind].h / 2 - 4), 2, 1); }
    }
    // la surface : des vagues qui roulent, la barque qui tangue, Roré et sa canne
    const bob = Math.sin(t * 1.8) * 1.2;
    if (cam < SURFACE + 20) {
      const wave = (x: number) => SURFACE + Math.sin(x * 0.08 + t * 2.2) * 1.2 + Math.sin(x * 0.21 - t * 1.4) * 0.6;
      for (let x = 0; x < W; x++) { const y = wave(x); r(x, y - 1, 1, 2, sea[1]); r(x, y + 1, 1, 1, 'rgba(255,255,255,0.35)'); if (Math.sin(x * 0.3 + t * 3) > 0.92) r(x, y - 1, 1, 1, '#ffffff'); }
      const by = SURFACE - 5 + bob, tilt = Math.sin(t * 1.3) * 0.8;
      const pose = st.phase === 'dive' || st.phase === 'rise' ? 'type' : st.phase === 'scale' ? 'play' : 'sit';
      g.drawImage(robotSprite(outside.rore.id, pose, 'right', Math.floor(t * 6) % 2, 'open'), BOAT_X + 8, Math.round(by - 18 - cam));
      for (let i = 0; i < 44; i++) {
        const u = i / 43, h = 8 - Math.round(Math.pow(Math.abs(u - 0.5) * 2, 3) * 5);
        const y0 = by + Math.round(tilt * (u - 0.5) * 2) + (8 - h);
        r(BOAT_X + i, y0, 1, h, '#8a5530'); r(BOAT_X + i, y0, 1, 1, '#b07c4c'); r(BOAT_X + i, y0 + 2, 1, 1, '#d24a40');
      }
      for (let k = 0; k <= 16; k++) r(BOAT_X + 20 + (k * 14) / 16, by - 8 - (k * (by - 8 - TIP.y - bob)) / 16 - Math.sin((k / 16) * Math.PI) * 2, 1, 1, k < 4 ? '#563821' : '#8a5530');
    }
    // la ligne et l'hameçon, avec les prises accrochées
    const tipY = TIP.y + bob;
    if (st.phase === 'dive' || st.phase === 'rise') {
      g.fillStyle = 'rgba(235,240,250,0.75)';
      const n = Math.max(1, Math.round(st.hookY - tipY));
      for (let k = 0; k < n; k += 1) { const u = k / n; const y = tipY + k - cam; if (y >= 0 && y < H) g.fillRect(Math.round(TIP.x + (st.hookX - TIP.x) * u * u), Math.round(y), 1, 1); }
      const hy = st.hookY - cam;
      st.caught.forEach((f, i) => drawFish(g, f.kind, st.hookX + (i % 2 ? 4 : -4), hy + 6 + i * 5, i % 2 ? 1 : -1, t * 2, f.ph));
      g.fillStyle = '#cfd2e0';
      g.fillRect(Math.round(st.hookX) - 1, Math.round(hy), 3, 1); g.fillRect(Math.round(st.hookX) + 1, Math.round(hy) - 2, 1, 2); g.fillRect(Math.round(st.hookX) - 1, Math.round(hy) - 1, 1, 1);
      if (t - st.clang < 0.4) pixelText(g, 'CLANG', Math.round(st.hookX) - 9, Math.round(hy) - 10, '#ffd166');
      // la jauge : profondeur et prises
      const depth = Math.max(0, Math.round((st.hookY - SURFACE) / 8));
      const label = `${depth}M  PRISES ${st.caught.length} SUR ${hooksMax()}`;
      g.fillStyle = 'rgba(8,10,24,0.6)'; g.fillRect(W - textWidth(label) - 10, 4, textWidth(label) + 6, 9);
      pixelText(g, label, W - textWidth(label) - 7, 6, '#ffd2a8');
    } else if (st.phase === 'boat' || st.phase === 'ready') {
      g.fillStyle = 'rgba(235,240,250,0.75)';
      for (let y = tipY; y < tipY + 8; y++) g.fillRect(TIP.x, Math.round(y - cam), 1, 1);
    }
    // l'établi : le poisson à écailler, ses écailles, le client qui attend
    if (st.phase === 'scale' && st.caught[0]) {
      const f = st.caught[0];
      g.fillStyle = 'rgba(8,10,24,0.55)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#8a5530'; g.fillRect(40, 60, 166, 46); g.fillStyle = '#b07c4c'; g.fillRect(40, 60, 166, 3);
      g.fillStyle = '#6b4528'; g.fillRect(46, 106, 6, 22); g.fillRect(194, 106, 6, 22);
      const k = boardScale(f.kind);
      g.save(); g.translate(120, 82); g.scale(k, k);
      drawFish(g, f.kind, 0, 0, 1, t, f.ph);
      g.restore();
      for (const sc of st.scales) {
        g.fillStyle = '#f4f8ff'; g.fillRect(Math.round(sc.x) - 1, Math.round(sc.y) - 1, 3, 2);
        g.fillStyle = '#b8c8d8'; g.fillRect(Math.round(sc.x) - 1, Math.round(sc.y) + 1, 3, 1);
      }
      drawClient(g, st.client.who, 228, 104, t);
      // la bulle du client : ce qu'il voudrait
      g.fillStyle = '#f6f2e9'; g.fillRect(186, 34, 66, 26); g.fillRect(222, 60, 4, 4);
      g.save(); g.translate(219, 47); g.scale(1, 1); drawFish(g, st.client.wants, 0, 0, -1, t); g.restore();
      const left = `${st.scales.length}`;
      pixelText(g, `ECAILLES ${left}`, 46, 52, '#ffd2a8');
      pixelText(g, `${st.caught.length} A VENDRE`, 46, 110, '#ffd2a8');
    }
    // la cagnotte
    const coins = `${save.current.coins} PIECES`;
    g.fillStyle = 'rgba(8,10,24,0.6)'; g.fillRect(4, 4, textWidth(coins) + 12, 9);
    g.fillStyle = '#ffd166'; g.fillRect(6, 6, 4, 5); g.fillStyle = '#c8a040'; g.fillRect(7, 7, 2, 3);
    pixelText(g, coins, 12, 6, '#ffd166');
  };

  useLoop(step, draw, []);

  /** Le pointeur : il guide l'hameçon pendant la plongée, il écaille sur l'établi. */
  const pointer = (e: React.PointerEvent, click: boolean) => {
    const c = canvas.current;
    if (!c) return;
    const rc = c.getBoundingClientRect();
    const x = ((e.clientX - rc.left) / rc.width) * W, y = ((e.clientY - rc.top) / rc.height) * H;
    const st = s.current;
    if (st.phase === 'dive' || st.phase === 'rise') st.aimX = x;
    if (st.phase === 'scale' && (click || e.buttons || e.pointerType === 'mouse')) scrape(x, y);
    else if (click) action();
  };

  const tip: Record<Phase, string> = {
    ready: '',
    boat: 'Espace (ou un clic sur l’eau) pour plonger la ligne. Améliore ton matériel avec les pièces gagnées.',
    dive: 'L’hameçon descend : ← → (ou la souris) pour percuter les poissons. Espace pour remonter plus tôt.',
    rise: 'Ça remonte ! Tu peux encore accrocher des poissons au passage.',
    scale: 'Passe la souris sur les écailles (ou Espace) pour écailler. Le client paie double s’il reçoit le poisson qu’il voulait.',
  };

  const sv = hud.save;
  return (
    <div className="game">
      <div className="game-screen" onPointerMove={(e) => pointer(e, false)} onPointerDown={(e) => { e.preventDefault(); pointer(e, true); }}>
        <canvas ref={canvas} width={W} height={H} style={{ cursor: 'crosshair' }} />
        {hud.phase === 'ready' && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            <b>La pêche au large</b>
            <span>Roré part en barque. Plonge la ligne, percute les poissons pour les accrocher (les gros demandent plusieurs coups), remonte, écaille, et vends tes prises aux clients du large.</span>
            <span className="muted">Plus la ligne est longue, plus tu descends : les plus beaux poissons vivent tout au fond.</span>
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); toBoat(); sfx('click'); }}>Monter dans la barque</button>
          </div>
        )}
      </div>
      <p className="small">{hud.msg || tip[hud.phase]}</p>
      {hud.phase === 'boat' && (
        <div className="row">
          {(Object.keys(GEAR) as Gear[]).map((k) => {
            const gear = GEAR[k], lvl = sv[k], max = lvl >= gear.max;
            return (
              <button key={k} className="btn small" disabled={max || sv.coins < gear.cost[lvl]} onClick={() => buy(k)} title={max ? 'Au maximum' : `Passe à : ${gear.what(lvl + 1)}`}>
                {gear.label} · {gear.what(lvl)}{max ? ' (max)' : ` → ${gear.cost[lvl]} pièces`}
              </button>
            );
          })}
          <button className="btn primary small" onClick={dive}>🎣 Plonger</button>
        </div>
      )}
      <p className="small muted">
        Vendus aujourd’hui : {hud.today} · En tout : {sv.count}
        {sv.best ? ` · Plus belle vente : ${sv.best.name.toLowerCase()}, ${sv.best.coins} pièces` : ''}
      </p>
    </div>
  );
}

/** La taille du poisson sur l'établi (il doit tenir dessus). */
function boardScale(kind: Kind) {
  const sp = FISH[kind];
  return Math.max(2, Math.min(6, Math.floor(110 / (sp.w + 4)), Math.floor(40 / (sp.h + 2))));
}
