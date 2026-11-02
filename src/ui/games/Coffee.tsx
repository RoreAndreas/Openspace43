// La machine à café de la Pause : « Le barista ». Les collègues viennent un par un commander leur boisson préférée ;
// Roré la prépare, tout au timing (Espace) : moudre, tasser, faire couler jusqu'au trait, mousser le lait à la bonne
// température, dessiner un cœur dans la mousse. Chaque tasse vaut jusqu'à 100 points ; un service, cinq tasses. Un bon
// service donne à Roré le plein d'énergie au bureau : une tasse fumante sur son bureau, et il marche plus vite.
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { CHARACTERS } from '../../engine/characters.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { world } from '../../engine/instance.ts';
import { robotSprite } from '../../engine/robots.ts';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 144;
const COUNTER = 106;

type Step = 'grind' | 'tamp' | 'pull' | 'steam' | 'art' | 'pour';
type Drink = 'espresso' | 'ristretto' | 'allonge' | 'cappuccino' | 'latte' | 'chocolat';
const DRINKS: Record<Drink, { name: string; steps: Step[]; line: number; milk: boolean; dark: string }> = {
  espresso: { name: 'un espresso', steps: ['grind', 'tamp', 'pull'], line: 0.4, milk: false, dark: '#3a2014' },
  ristretto: { name: 'un ristretto', steps: ['grind', 'tamp', 'pull'], line: 0.25, milk: false, dark: '#2a160c' },
  allonge: { name: 'un allongé', steps: ['grind', 'tamp', 'pull'], line: 0.78, milk: false, dark: '#4a2a18' },
  cappuccino: { name: 'un cappuccino', steps: ['grind', 'tamp', 'pull', 'steam', 'art'], line: 0.35, milk: true, dark: '#3a2014' },
  latte: { name: 'un latte', steps: ['grind', 'tamp', 'pull', 'steam', 'art'], line: 0.3, milk: true, dark: '#3a2014' },
  chocolat: { name: 'un chocolat chaud', steps: ['steam', 'pour'], line: 0.8, milk: true, dark: '#5a3018' },
};
/** La boisson préférée de chacun (par personnage du catalogue) */
const FAVORITE: Record<string, Drink> = {
  hacker_cyberpunk: 'espresso', mage_du_code: 'allonge', robot_ingenieur: 'chocolat', analyste_strategique: 'cappuccino',
  styliste_extravagant: 'latte', explorateur_futuriste: 'espresso', hares: 'ristretto',
};
const STEP_LABEL: Record<Step, string> = { grind: 'MOUDRE', tamp: 'TASSER', pull: 'FAIRE COULER', steam: 'MOUSSER LE LAIT', art: 'LE DESSIN', pour: 'VERSER' };
const SERVICE = 5;

interface Order { who: string; name: string; drink: Drink }
interface Bit { x: number; y: number; vx: number; vy: number; life: number; col: string }

/** Le score d'un geste : parfait, bien, raté (selon l'écart à la cible, de 0 à 1) */
const grade = (d: number, perfect: number, good: number) => (d <= perfect ? 100 : d <= good ? 60 : 20);
const word = (s: number) => (s >= 100 ? 'PARFAIT !' : s >= 60 ? 'BIEN' : 'RATE...');

export function Coffee() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const s = useRef({
    phase: 'ready' as 'ready' | 'walk' | 'step' | 'judge' | 'leave' | 'end',
    t: 0, pt: 0,
    orders: [] as Order[], oi: 0, si: 0,
    /** le geste en cours : le curseur (0 à 1), le niveau dans la tasse, la température */
    cur: 0, level: 0, temp: 20, speed: 1,
    /** les notes des gestes de la tasse en cours, et de chaque tasse servie */
    marks: [] as number[], cups: [] as number[],
    lastMark: -1, markAt: -9, artX: 0,
    bits: [] as Bit[], steamPuffs: [] as { x: number; y: number; t0: number }[],
  });
  const [hud, setHud] = useState({ phase: 'ready', total: 0, best: loadScores().coffee ?? 0, record: false, boost: false });
  // en développement seulement : l'état du jeu, pour les essais
  if (import.meta.env.DEV) (window as unknown as { __coffee?: unknown }).__coffee = s.current;
  const order = () => s.current.orders[s.current.oi];
  const step = () => DRINKS[order().drink].steps[s.current.si];

  const start = () => {
    const st = s.current;
    const pool = CHARACTERS.filter((c) => FAVORITE[c.id]);
    const picks: Order[] = [];
    // (jamais deux fois de suite le même)
    for (let i = 0; i < SERVICE; i++) { const free = pool.filter((c) => c.id !== picks[i - 1]?.who); const c = free[Math.floor(Math.random() * free.length)]; picks.push({ who: c.id, name: c.name, drink: FAVORITE[c.id] }); }
    Object.assign(st, { orders: picks, oi: 0, si: 0, cups: [], marks: [], phase: 'walk', pt: 0, level: 0, temp: 20, artX: 0, lastMark: -1, speed: 1 });
    setHud((h) => ({ ...h, phase: 'play', total: 0, record: false, boost: false }));
    sfx('open');
  };

  /** un nouveau geste : le curseur repart, de plus en plus vite au fil du service */
  const beginStep = () => {
    const st = s.current;
    st.phase = 'step'; st.pt = 0; st.cur = 0;
    st.speed = 1 + st.oi * 0.12;
    if (step() === 'pull' || step() === 'pour') st.level = 0;
    if (step() === 'steam') st.temp = 20;
  };

  const press = () => {
    const st = s.current;
    if (st.phase === 'ready' || st.phase === 'end') return;
    if (st.phase !== 'step' || st.pt < 0.15) return;
    const d = DRINKS[order().drink], sp = step();
    let mark = 20;
    if (sp === 'grind' || sp === 'tamp') mark = grade(Math.abs(st.cur - 0.5), 0.05, 0.14);
    else if (sp === 'pull' || sp === 'pour') mark = grade(Math.abs(st.level - d.line), 0.025, 0.07);
    else if (sp === 'steam') mark = st.temp >= 60 && st.temp <= 65 ? 100 : st.temp >= 55 && st.temp <= 70 ? 60 : 20;
    else if (sp === 'art') { mark = grade(Math.abs(st.cur - 0.5), 0.06, 0.16); st.artX = (st.cur - 0.5) * 2; }
    finishStep(mark);
  };

  const finishStep = (mark: number) => {
    const st = s.current;
    st.marks.push(mark); st.lastMark = mark; st.markAt = st.t;
    sfx(mark >= 100 ? 'check' : mark >= 60 ? 'tick' : 'no', mark >= 100 ? 1.3 : 1);
    if (step() === 'grind') for (let i = 0; i < 10; i++) st.bits.push({ x: 34 + Math.random() * 6, y: 66, vx: (Math.random() - 0.5) * 10, vy: 10 + Math.random() * 20, life: 0.6, col: '#5a3418' });
    if (st.si + 1 < DRINKS[order().drink].steps.length) { st.si++; st.phase = 'step'; st.pt = -0.5; st.cur = 0; beginLater(); }
    else { st.phase = 'judge'; st.pt = 0; const cup = Math.round(st.marks.reduce((a, b) => a + b, 0) / st.marks.length); st.cups.push(cup); setHud((h) => ({ ...h, total: st.cups.reduce((a, b) => a + b, 0) })); sfx(cup >= 80 ? 'done' : 'check'); }
  };
  // (un petit temps entre deux gestes : on voit le résultat)
  const beginLater = () => { const st = s.current; st.phase = 'walk'; st.pt = 0.9; };

  const finishService = () => {
    const st = s.current;
    st.phase = 'end';
    const total = st.cups.reduce((a, b) => a + b, 0);
    const sc = loadScores();
    const record = total > (sc.coffee ?? 0);
    if (record) { sc.coffee = total; saveScores(sc); }
    // un bon service : Roré a le plein d'énergie au bureau pendant dix minutes
    const boost = total >= SERVICE * 70;
    if (boost) world.coffeeUntil = world.time + 600;
    setHud({ phase: 'end', total, best: Math.max(total, sc.coffee ?? 0), record, boost });
    sfx(record || boost ? 'done' : 'check');
  };

  const stepFn = (dt: number) => {
    const st = s.current;
    for (const k of keys.take()) if (k === ' ' || k === 'enter') press();
    st.t += dt; st.pt += dt;
    const t = st.t;
    for (const b of st.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 60 * dt; b.life -= dt; }
    st.bits = st.bits.filter((b) => b.life > 0);
    st.steamPuffs = st.steamPuffs.filter((p) => t - p.t0 < 1.2);
    if (st.phase === 'walk') {
      // le collègue arrive au comptoir (ou on souffle entre deux gestes)
      if (st.pt >= 1.2) { if (st.si === 0 && st.marks.length === 0) sfx('pour'); beginStep(); }
    } else if (st.phase === 'step') {
      const sp = step();
      if (sp === 'grind' || sp === 'tamp' || sp === 'art') st.cur = 0.5 - 0.5 * Math.cos(st.pt * (sp === 'art' ? 3.2 : 3.8) * st.speed);
      else if (sp === 'pull' || sp === 'pour') {
        st.level = Math.min(1, st.level + dt * (0.16 + (sp === 'pour' ? 0.05 : 0)) * st.speed * (0.8 + 0.4 * Math.sin(st.pt * 2)));
        if (st.level >= 1) finishStep(20);
      } else if (sp === 'steam') {
        st.temp += dt * (14 + st.temp * 0.22) * st.speed;
        if (Math.random() < dt * 20) st.steamPuffs.push({ x: 178 + Math.random() * 6, y: 70, t0: t });
        if (st.temp >= 85) finishStep(20);
      }
    } else if (st.phase === 'judge') {
      if (st.pt >= 2.2) { st.phase = 'leave'; st.pt = 0; }
    } else if (st.phase === 'leave') {
      if (st.pt >= 1) {
        st.oi++; st.si = 0; st.marks = []; st.artX = 0; st.level = 0; st.temp = 20;
        if (st.oi >= SERVICE) finishService(); else { st.phase = 'walk'; st.pt = 0; }
      }
    }
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current, t = st.t;
    const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    // le mur de la Pause, la crédence en carreaux, l'étagère et ses tasses
    r(0, 0, W, H, '#3a2c3e');
    for (let y = 40; y < COUNTER; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < W; x += 12) { r(x, y, 11, 5, '#e8dccb'); r(x, y + 5, 11, 1, '#c8b8a4'); }
    r(0, 24, W, 3, '#6b4a2e'); r(0, 27, W, 1, '#3e2a1a');
    for (let i = 0; i < 9; i++) { const x = 14 + i * 28; r(x, 17, 9, 7, ['#e5484d', '#4fb3ff', '#ffd166', '#3ddc97'][i % 4]); r(x + 9, 19, 2, 3, '#15121d'); r(x, 17, 9, 1, 'rgba(255,255,255,0.4)'); }
    pixelText(g, 'CAFE 43', 8, 4, '#ffd166');
    // le moulin, à gauche : la trémie pleine de grains, le corps, le bec
    const grinding = st.phase === 'step' && step() === 'grind';
    const gj = grinding ? Math.round(Math.sin(t * 60)) : 0;
    r(24 + gj, 34, 22, 18, '#15121d'); r(25 + gj, 35, 20, 16, 'rgba(200,220,240,0.35)');
    for (let i = 0; i < 18; i++) r(27 + gj + (i * 7) % 16, 42 + Math.floor(i / 6) * 3, 3, 2, '#6b3f22');
    r(22, 52, 26, 30, '#15121d'); r(23, 53, 24, 28, '#2e2e3c'); r(23, 53, 24, 2, '#4a4a5a'); r(30, 60, 10, 6, '#c8c8d8');
    r(32, 66, 6, 3, '#15121d'); r(22, 82, 26, 24, '#15121d'); r(23, 83, 24, 23, '#3a3a4a');
    // la machine : rouge et crème, le manomètre, le groupe, le porte-filtre, la buse vapeur, l'égouttoir
    r(66, 32, 108, 76, '#15121d');
    r(67, 33, 106, 74, '#c8403a'); r(67, 33, 106, 3, '#e86a5a'); r(67, 60, 106, 4, '#f2e6d0'); r(67, 104, 106, 3, '#8a2a24');
    r(70, 26, 100, 7, '#15121d'); r(71, 27, 98, 5, '#c8c8d8'); for (let i = 0; i < 6; i++) r(76 + i * 15, 22, 9, 5, '#f6f2e9');
    // le manomètre : son aiguille suit la pression (et la vapeur)
    const gauge = st.phase === 'step' && step() === 'tamp' ? st.cur : st.phase === 'step' && step() === 'steam' ? Math.min(1, (st.temp - 20) / 65) : 0.3 + Math.sin(t) * 0.02;
    r(80, 38, 18, 18, '#15121d'); r(81, 39, 16, 16, '#f6f2e9');
    const ga = Math.PI * (0.8 + gauge * 1.4);
    for (let k = 0; k < 7; k++) r(89 + Math.cos(ga) * k, 47 + Math.sin(ga) * k, 1, 1, '#e5484d');
    r(88, 46, 2, 2, '#15121d');
    pixelText(g, '43', 140, 44, '#f6f2e9');
    // le groupe et le porte-filtre (le manche vers nous) ; le café qui coule
    r(110, 64, 22, 8, '#15121d'); r(111, 65, 20, 6, '#c8c8d8');
    r(108, 72, 26, 5, '#15121d'); r(109, 73, 24, 3, '#9a9aae'); r(88, 73, 22, 3, '#15121d'); r(89, 74, 20, 1, '#2a2a36');
    const pulling = st.phase === 'step' && (step() === 'pull' || step() === 'pour');
    if (pulling) for (let k = 0; k < 2; k++) r(118 + k * 5, 77, 1, 16 - Math.round(st.level * 6), step() === 'pour' ? '#7a4424' : '#5a3018');
    // la tamponnette qui appuie
    if (st.phase === 'step' && step() === 'tamp') { const d = Math.round(st.cur * 6); r(116, 50 + d, 10, 4, '#15121d'); r(117, 51 + d, 8, 2, '#c8c8d8'); r(119, 42 + d, 4, 8, '#6b4a2e'); }
    // la buse vapeur et le pot à lait
    r(164, 58, 3, 16, '#15121d'); r(165, 58, 1, 16, '#c8c8d8');
    const steaming = st.phase === 'step' && step() === 'steam';
    r(172 + (steaming ? Math.round(Math.sin(t * 30)) : 0), 70, 14, 14, '#15121d'); r(173, 71, 12, 12, '#d8d8e4'); r(173, 71, 12, 2, '#f6f6fa'); r(185, 74, 3, 6, '#9a9aae');
    for (const p of st.steamPuffs) { const k = (t - p.t0) / 1.2; g.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; g.fillRect(Math.round(p.x + Math.sin(k * 6) * 2), Math.round(p.y - k * 30), 2, 2); }
    // l'égouttoir, la tasse posée dessous
    r(98, 98, 46, 4, '#15121d'); r(99, 99, 44, 2, '#9a9aae');
    // ce qu'il y a dans la tasse : le café coulé (puis le lait par-dessus, une fois servie)
    let cupFill = 0;
    const od = order() ? DRINKS[order().drink] : null;
    if (od) {
      const pi = Math.max(od.steps.indexOf('pull'), od.steps.indexOf('pour'));
      if (st.phase === 'judge' || st.phase === 'leave') cupFill = Math.min(1, st.level + (od.milk && od.steps.includes('pull') ? 0.35 : 0));
      else if (pi >= 0 && st.si >= pi && st.phase !== 'walk') cupFill = st.level;
      else if (pi >= 0 && st.si > pi) cupFill = st.level;
    }
    const cx = 114, cy = 88;
    if (st.phase !== 'ready' && st.phase !== 'end' && order()) {
      r(cx - 1, cy - 1, 16, 11, '#15121d'); r(cx, cy, 14, 9, '#f6f2e9'); r(cx + 14, cy + 2, 3, 5, '#15121d'); r(cx + 15, cy + 3, 1, 3, '#f6f2e9');
      const lv = Math.round(cupFill * 7);
      if (lv > 0) r(cx + 1, cy + 8 - lv, 12, lv, DRINKS[order().drink].dark);
      if (lv > 0) r(cx + 1, cy + 8 - lv, 12, 1, '#c88a50');
      // dans la tasse, le trait à atteindre
      if (st.phase === 'step' && (step() === 'pull' || step() === 'pour')) r(cx + 1, cy + 8 - Math.round(DRINKS[order().drink].line * 7), 12, 1, '#e5484d');
    }
    // le comptoir
    r(0, COUNTER, W, 4, '#15121d'); r(0, COUNTER + 1, W, 3, '#8a5a34'); r(0, COUNTER + 4, W, H - COUNTER - 4, '#6b4428');
    for (let x = 0; x < W; x += 16) r(x, COUNTER + 6, 1, H, '#5a3820');
    // le collègue qui commande, derrière le comptoir, à droite ; il arrive, attend, repart avec sa tasse
    const o = order();
    if (o && st.phase !== 'end') {
      const arrive = st.phase === 'walk' && st.si === 0 && st.marks.length === 0 ? Math.min(1, st.pt / 1.1) : 1;
      const away = st.phase === 'leave' ? Math.min(1, st.pt) : 0;
      const px = Math.round(W + 10 - arrive * 52 + away * 60);
      const cup = st.cups[st.oi] ?? -1;
      const pose = st.phase === 'judge' ? (cup >= 80 ? 'cheer' : cup >= 50 ? 'wave' : 'stand') : st.phase === 'walk' && arrive < 1 ? 'walk' : 'stand';
      const eyes = st.phase === 'judge' ? (cup >= 80 ? 'happy' : cup >= 50 ? 'open' : 'down') : 'open';
      const spr = robotSprite(o.who, pose, arrive < 1 || away > 0 ? (away > 0 ? 'right' : 'left') : 'down', Math.floor(t * 6) % 2, eyes);
      g.drawImage(spr, px - 20, COUNTER - 46, 40, 48);
      // sa commande, dans une bulle
      if (arrive >= 1 && st.phase !== 'leave') {
        const line = st.phase === 'judge' ? (cup >= 80 ? 'PARFAIT, MERCI !' : cup >= 50 ? 'PAS MAL !' : 'HMM...') : `${o.name.toUpperCase()} : ${DRINKS[o.drink].name.toUpperCase()}`.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const tw = textWidth(line), bx = Math.max(4, Math.min(W - tw - 10, px - tw / 2 - 30)), by = COUNTER - 62;
        r(bx - 3, by - 3, tw + 6, 11, '#15121d'); r(bx - 2, by - 2, tw + 4, 9, '#f6f6fa');
        pixelText(g, line, bx, by, '#15121d');
      }
      if (st.phase === 'judge') {
        // les étoiles de la tasse
        const stars = cup >= 80 ? 3 : cup >= 50 ? 2 : 1;
        for (let i = 0; i < 3; i++) { const x = 104 + i * 12, y = 80 - Math.min(1, st.pt * 3) * 6; r(x, y, 7, 7, '#15121d'); r(x + 1, y + 1, 5, 5, i < stars ? '#ffd166' : '#4a4458'); }
      }
    }
    for (const b of st.bits) { g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
    // ── le geste en cours : son nom, sa jauge (ou le lait, ou le dessin) ──
    if (st.phase === 'step' && o) {
      const sp = step();
      pixelText(g, STEP_LABEL[sp], Math.round((W - textWidth(STEP_LABEL[sp])) / 2), 116, '#ffd166');
      const gx = 48, gy = 128, gw = 160;
      const frame = () => { r(gx - 2, gy - 2, gw + 4, 9, '#15121d'); r(gx, gy, gw, 5, '#2a2636'); };
      if (sp === 'grind' || sp === 'tamp' || sp === 'art') {
        frame();
        const good = sp === 'art' ? 0.16 : 0.14, perf = sp === 'art' ? 0.06 : 0.05;
        r(gx + gw * (0.5 - good), gy, gw * good * 2, 5, '#3ddc97');
        r(gx + gw * (0.5 - perf), gy, gw * perf * 2, 5, '#ffd166');
        r(gx + gw * st.cur - 1, gy - 3, 2, 11, '#ffffff');
        if (sp === 'grind') { pixelText(g, 'GROS', gx - 26, gy, '#8a8698'); pixelText(g, 'FIN', gx + gw + 5, gy, '#8a8698'); }
        if (sp === 'tamp') { pixelText(g, 'MOU', gx - 22, gy, '#8a8698'); pixelText(g, 'FORT', gx + gw + 5, gy, '#8a8698'); }
      } else if (sp === 'steam') {
        // le thermomètre
        frame();
        const k = Math.min(1, (st.temp - 20) / 65);
        r(gx + gw * (40 / 65), gy, gw * (5 / 65), 5, '#ffd166');
        r(gx + gw * (35 / 65), gy, gw * (5 / 65), 5, '#3ddc97'); r(gx + gw * (45 / 65), gy, gw * (5 / 65), 5, '#3ddc97');
        r(gx, gy + 1, gw * k, 3, k > 0.85 ? '#e5484d' : '#ff8a3d');
        pixelText(g, `${Math.round(st.temp)} C`, gx + gw + 5, gy, '#ffffff');
      }
      // le dessin dans la mousse : vu de dessus, le pot qui va et vient au-dessus de la tasse
      if (sp === 'art') {
        const ax = 121, ay = 38;
        r(ax - 18, ay - 18, 36, 36, '#15121d');
        for (let dy = -16; dy <= 16; dy++) { const w = Math.round(Math.sqrt(256 - dy * dy)); r(ax - w, ay + dy, w * 2, 1, '#8a5a34'); }
        const px = ax + (st.cur - 0.5) * 24;
        r(px - 2, ay - 2, 4, 4, '#f6f2e9'); r(px - 1, ay - 26, 2, 22, 'rgba(246,242,233,0.7)');
      }
    }
    // la tasse finie, vue de dessus, avec son dessin (un cœur droit… ou de travers)
    if ((st.phase === 'judge' || st.phase === 'leave') && o && DRINKS[o.drink].steps.includes('art')) {
      const ax = 121, ay = 38, off = Math.round(st.artX * 8), mark = st.marks[st.marks.length - 1] ?? 0;
      r(ax - 18, ay - 18, 36, 36, '#15121d');
      for (let dy = -16; dy <= 16; dy++) { const w = Math.round(Math.sqrt(256 - dy * dy)); r(ax - w, ay + dy, w * 2, 1, '#8a5a34'); }
      const sk = mark >= 100 ? 0 : mark >= 60 ? 1 : 3;
      for (let dy = -6; dy <= 7; dy++) {
        const w = dy < 0 ? 0 : Math.round((7 - dy) * 0.9);
        if (dy < -1) { const lw = Math.round(3 * Math.sqrt(Math.max(0, 1 - ((dy + 4) / 3.2) ** 2))); r(ax + off - 3 - lw, ay + dy, lw * 2, 1, '#f6f2e9'); r(ax + off + 3 - lw + sk, ay + dy, lw * 2, 1, '#f6f2e9'); }
        else if (w > 0) r(ax + off - w + Math.round(sk * (dy / 7)), ay + dy, w * 2, 1, '#f6f2e9');
      }
    }
    // le mot du geste (PARFAIT, BIEN, RATE)
    if (t - st.markAt < 0.8 && st.lastMark >= 0) {
      const w2 = word(st.lastMark), col = st.lastMark >= 100 ? '#ffd166' : st.lastMark >= 60 ? '#3ddc97' : '#e5484d';
      g.save(); g.scale(2, 2); pixelText(g, w2, Math.round((W / 2 - textWidth(w2)) / 2), 40 - Math.round((t - st.markAt) * 6), col); g.restore();
    }
    // en haut à droite : la tasse en cours et le score
    if (st.phase !== 'ready' && st.phase !== 'end') {
      const lbl = `TASSE ${Math.min(SERVICE, st.oi + 1)}/${SERVICE}  ${st.cups.reduce((a, b) => a + b, 0)} PTS`;
      pixelText(g, lbl, W - textWidth(lbl) - 6, 4, '#ffffff');
    }
  };

  useLoop(stepFn, draw, []);

  return (
    <div className="game">
      <div className="game-screen" onPointerDown={(e) => { e.preventDefault(); press(); }}>
        <canvas ref={canvas} width={W} height={H} />
        {hud.phase !== 'play' && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            {hud.phase === 'ready' ? (
              <>
                <b>Le barista</b>
                <span>Les collègues viennent commander leur boisson préférée. Moudre, tasser, faire couler, mousser le lait, dessiner un cœur : tout se joue au bon moment.</span>
                <span className="muted">Espace (ou un clic) à chaque geste. Cinq tasses par service. Record : {hud.best}</span>
              </>
            ) : (
              <>
                <b>{hud.record ? 'Nouveau record !' : 'Service terminé'}</b>
                <span>Score : {hud.total} · Record : {hud.best}</span>
                {hud.boost && <span>☕ Roré a le plein d’énergie : une tasse fumante l’attend sur son bureau, et il file plus vite pendant dix minutes.</span>}
              </>
            )}
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); start(); }}>{hud.phase === 'ready' ? 'Ouvrir le comptoir' : 'Un autre service'}</button>
          </div>
        )}
      </div>
      <p className="small muted">Espace ou un clic, à chaque geste : arrête le curseur dans le doré, le café au trait, le lait entre 60 et 65 °C, le pot au milieu pour un cœur bien droit.</p>
    </div>
  );
}
