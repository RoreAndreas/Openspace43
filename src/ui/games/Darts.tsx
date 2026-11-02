// La cible de la Pause : « Les fléchettes ». Trois volées de trois fléchettes. On vise en deux temps : le viseur glisse de
// gauche à droite (Espace l'arrête), puis de haut en bas (Espace lance). La main tremble un peu ; après un café parfait
// (le bonus du café de la Pause), elle est plus sûre et le viseur va moins vite. Simple, double, triple, le 25 et le
// mille (50). Le meilleur total est gardé.
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { world } from '../../engine/instance.ts';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 144;
const CX = 128, CY = 72, R = 54;
/** L'ordre des secteurs, en partant du haut, dans le sens des aiguilles d'une montre */
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/** Les anneaux, en part du rayon (d'après une vraie cible) : le mille, le 25, le triple, le double */
const BULL = 0.04, OUTER = 0.095, T_IN = 0.58, T_OUT = 0.63, D_IN = 0.95;
const ROUNDS = 3, PER = 3;

/** Ce que vaut un point de la cible */
function scoreAt(x: number, y: number): { pts: number; label: string; ring: 'bull' | 'outer' | 'triple' | 'double' | 'single' | 'out' } {
  const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy) / R;
  if (d <= BULL) return { pts: 50, label: 'DANS LE MILLE !', ring: 'bull' };
  if (d <= OUTER) return { pts: 25, label: '25', ring: 'outer' };
  if (d > 1) return { pts: 0, label: 'A COTE...', ring: 'out' };
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const n = ORDER[Math.floor((((ang + 90 + 9) % 360) + 360) % 360 / 18)];
  if (d >= T_IN && d <= T_OUT) return { pts: n * 3, label: `TRIPLE ${n} !`, ring: 'triple' };
  if (d >= D_IN) return { pts: n * 2, label: `DOUBLE ${n}`, ring: 'double' };
  return { pts: n, label: `${n}`, ring: 'single' };
}

/** La cible, dessinée une fois au pixel près : les secteurs noirs et crème, les anneaux rouges et verts, le cerclage, les
 *  numéros tout autour, sur un fond de liège, au mur de la Pause. */
let board: HTMLCanvasElement | null = null;
function boardCanvas() {
  if (board) return board;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // le mur de la Pause (violet sombre), une plinthe, le néon « PAUSE » en haut à droite
  r(0, 0, W, H, '#3a2c48');
  for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) r(x, y, 15, 7, '#3e3050');
  r(0, H - 8, W, 8, '#2a2036'); r(0, H - 8, W, 1, '#4a3a5a');
  pixelText(g, 'PAUSE', 204, 8, '#ff5fa2');
  // le fond en liège, puis la cible
  for (let y = -R - 16; y <= R + 16; y++) for (let x = -R - 16; x <= R + 16; x++) {
    const d = Math.hypot(x, y);
    if (d > R + 15.5) continue;
    let col: string;
    if (d > R + 12) col = '#5a3418';
    else if (d > R + 1) col = (x * 7 + y * 13) % 5 === 0 ? '#9a6a3a' : '#b07a44';
    else {
      const k = d / R;
      const ang = (Math.atan2(y, x) * 180) / Math.PI;
      const sec = Math.floor((((ang + 90 + 9) % 360) + 360) % 360 / 18);
      const even = sec % 2 === 0;
      if (k <= BULL) col = '#d8323a';
      else if (k <= OUTER) col = '#2e8a4a';
      else if ((k >= T_IN && k <= T_OUT) || k >= D_IN) col = even ? '#d8323a' : '#2e8a4a';
      else col = even ? '#1d1a20' : '#f0e2c0';
      // le fil métallique entre les secteurs et autour des anneaux
      const edge = Math.abs(((((ang + 90 + 9) % 18) + 18) % 18)) < 0.9 * (18 / (Math.PI * d / 10 + 1));
      if (k > OUTER && (edge || Math.abs(k - T_IN) < 0.012 || Math.abs(k - T_OUT) < 0.012 || Math.abs(k - D_IN) < 0.012)) col = '#9a9aae';
    }
    r(CX + x, CY + y, 1, 1, col);
  }
  // le cerclage noir et les numéros
  for (let a = 0; a < 360; a += 1) { const t = (a * Math.PI) / 180; for (const rr of [R + 1, R + 2]) r(Math.round(CX + Math.cos(t) * rr), Math.round(CY + Math.sin(t) * rr), 1, 1, '#15121d'); }
  ORDER.forEach((n, i) => {
    const t = ((i * 18 - 90) * Math.PI) / 180, s = `${n}`;
    pixelText(g, s, Math.round(CX + Math.cos(t) * (R + 8) - textWidth(s) / 2), Math.round(CY + Math.sin(t) * (R + 8) - 3), '#f6f2e9');
  });
  board = c;
  return c;
}

/** Une fléchette plantée (vue de face, un peu de biais) : la pointe dans la cible, le fût, les ailettes orange */
function dart(g: CanvasRenderingContext2D, x: number, y: number, k = 1, wob = 0) {
  const p = (dx: number, dy: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x + dx * k + wob * dy * 0.3), Math.round(y + dy * k), Math.max(1, Math.round(k)), Math.max(1, Math.round(k))); };
  for (let i = 1; i <= 5; i++) { p(i, i, '#15121d'); p(i, i - 1, '#c8c8d8'); }
  for (const [dx, dy] of [[6, 4], [7, 4], [5, 6], [5, 7], [6, 6], [7, 7], [6, 5], [7, 6], [6, 7]]) p(dx, dy, '#ff8a3d');
  p(7, 5, '#ffb070'); p(0, 0, '#f6f6fa');
}

export function Darts() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const s = useRef({
    phase: 'ready' as 'ready' | 'aimX' | 'aimY' | 'fly' | 'hit' | 'volley' | 'end',
    t: 0, pt: 0, round: 0, n: 0,
    ax: CX, ay: CY, lockX: CX, from: { x: CX, y: H + 10 }, to: { x: CX, y: CY },
    darts: [] as { x: number; y: number; t0: number }[], volley: [] as number[], total: 0,
    last: { pts: 0, label: '' }, lastAt: -9, seed: Math.random() * 100,
  });
  const [hud, setHud] = useState({ phase: 'ready', total: 0, best: loadScores().darts ?? 0, record: false });
  if (import.meta.env.DEV) (window as unknown as { __darts?: unknown }).__darts = s.current;
  /** après un café parfait : la main est plus sûre, le viseur plus lent */
  const steady = () => world.time < world.coffeeUntil;

  const start = () => {
    Object.assign(s.current, { phase: 'aimX', pt: 0, round: 0, n: 0, darts: [], volley: [], total: 0, last: { pts: 0, label: '' }, lastAt: -9 });
    setHud((h) => ({ ...h, phase: 'play', total: 0, record: false }));
    sfx('open');
  };
  const press = () => {
    const st = s.current;
    if (st.phase === 'ready' || st.phase === 'end') { start(); return; }
    if (st.phase === 'aimX' && st.pt > 0.15) { st.lockX = st.ax; st.phase = 'aimY'; st.pt = 0; sfx('tick'); }
    else if (st.phase === 'aimY' && st.pt > 0.15) {
      // la fléchette part : là où était le viseur, à un souffle près
      const spread = steady() ? 0.8 : 1.6;
      st.to = { x: st.ax + (Math.random() - 0.5) * spread * 2, y: st.ay + (Math.random() - 0.5) * spread * 2 };
      st.from = { x: CX + 40, y: H + 12 };
      st.phase = 'fly'; st.pt = 0; sfx('send', 1.3);
    }
  };

  const step = (dt: number) => {
    const st = s.current;
    for (const k of keys.take()) if (k === ' ' || k === 'enter') press();
    st.t += dt; st.pt += dt;
    const t = st.t, calm = steady() ? 0.7 : 1;
    // la main tremble un peu, le viseur va et vient (de plus en plus vite à chaque volée)
    const wob = (steady() ? 0.8 : 1.8) * (1 + st.round * 0.25);
    const sp = (2.1 + st.round * 0.35) * calm;
    const wx = Math.sin(t * 2.3 + st.seed) * wob + Math.sin(t * 5.1) * wob * 0.4, wy = Math.cos(t * 1.9 + st.seed) * wob + Math.sin(t * 4.3 + 1) * wob * 0.4;
    if (st.phase === 'aimX') { st.ax = CX + Math.sin(st.pt * sp) * (R + 8) + wx; st.ay = CY + wy; }
    else if (st.phase === 'aimY') { st.ax = st.lockX + wx; st.ay = CY + Math.sin(st.pt * sp * 1.1) * (R + 8) + wy; }
    else if (st.phase === 'fly' && st.pt >= 0.3) {
      // plantée
      const sc = scoreAt(st.to.x, st.to.y);
      st.darts.push({ x: st.to.x, y: st.to.y, t0: t });
      st.volley.push(sc.pts); st.total += sc.pts; st.n++;
      st.last = { pts: sc.pts, label: sc.label }; st.lastAt = t;
      sfx(sc.ring === 'out' ? 'no' : sc.ring === 'bull' || sc.ring === 'triple' ? 'check' : 'tick', sc.ring === 'bull' ? 1.4 : 1);
      setHud((h) => ({ ...h, total: st.total }));
      st.phase = 'hit'; st.pt = 0;
    } else if (st.phase === 'hit' && st.pt >= 0.8) {
      if (st.n < PER) { st.phase = 'aimX'; st.pt = 0; }
      else {
        const v = st.volley.reduce((a, b) => a + b, 0);
        st.last = { pts: v, label: v === 180 ? '180 !!!' : `VOLEE : ${v}` }; st.lastAt = t;
        if (v >= 100) sfx('done');
        st.phase = 'volley'; st.pt = 0;
      }
    } else if (st.phase === 'volley' && st.pt >= 1.6) {
      st.round++; st.n = 0; st.volley = []; st.darts = [];
      if (st.round >= ROUNDS) {
        st.phase = 'end';
        const sc = loadScores();
        const record = st.total > (sc.darts ?? 0);
        if (record) { sc.darts = st.total; saveScores(sc); }
        setHud({ phase: 'end', total: st.total, best: Math.max(st.total, sc.darts ?? 0), record });
        sfx(record ? 'done' : 'check');
      } else { st.phase = 'aimX'; st.pt = 0; sfx('click'); }
    }
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current, t = st.t;
    const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    g.drawImage(boardCanvas(), 0, 0);
    // les fléchettes plantées (elles vibrent un instant)
    for (const d of st.darts) dart(g, d.x, d.y, 1, t - d.t0 < 0.4 ? Math.sin((t - d.t0) * 60) * (1 - (t - d.t0) / 0.4) * 2 : 0);
    // la fléchette en vol : elle part d'en bas (la main de Roré) et rapetisse en s'approchant
    if (st.phase === 'fly') {
      const u = Math.min(1, st.pt / 0.3), x = st.from.x + (st.to.x - st.from.x) * u, y = st.from.y + (st.to.y - st.from.y) * u - Math.sin(u * Math.PI) * 14;
      dart(g, x, y, 3 - u * 2);
    }
    // le viseur : d'abord une ligne qui glisse, puis la croix
    if (st.phase === 'aimX' || st.phase === 'aimY') {
      const x = Math.round(st.ax), y = Math.round(st.ay);
      const col = Math.floor(t * 8) % 2 ? '#ffffff' : '#ffd166';
      if (st.phase === 'aimX') { for (let yy = CY - R - 8; yy < CY + R + 8; yy += 3) r(x, yy, 1, 2, 'rgba(255,255,255,0.45)'); }
      else { r(st.lockX - 4, CY - R - 10, 9, 1, 'rgba(255,255,255,0.4)'); for (let xx = CX - R - 8; xx < CX + R + 8; xx += 3) r(xx, y, 2, 1, 'rgba(255,255,255,0.45)'); }
      r(x - 5, y, 4, 1, '#15121d'); r(x + 2, y, 4, 1, '#15121d'); r(x, y - 5, 1, 4, '#15121d'); r(x, y + 2, 1, 4, '#15121d');
      r(x - 4, y, 3, 1, col); r(x + 2, y, 3, 1, col); r(x, y - 4, 1, 3, col); r(x, y + 2, 1, 3, col);
    }
    // le mot du lancer, en grand
    if (t - st.lastAt < 1.4 && st.last.label) {
      const big = st.last.label.length < 14, k = big ? 2 : 1, tw = textWidth(st.last.label) * k;
      const col = st.last.pts >= 50 || st.last.label.startsWith('TRIPLE') || st.last.label === '180 !!!' ? '#ffd166' : st.last.pts === 0 ? '#e5484d' : '#ffffff';
      const y = 108 - Math.round((t - st.lastAt) * 6);
      r(W / 2 - tw / 2 - 4, y - 3, tw + 8, 7 * k + 5, 'rgba(21,18,29,0.75)');
      g.save(); g.scale(k, k); pixelText(g, st.last.label, Math.round((W / 2 - tw / 2) / k), Math.round(y / k), col); g.restore();
    }
    // en haut à gauche : la volée, les fléchettes qu'il reste, le total ; le café
    if (st.phase !== 'ready' && st.phase !== 'end') {
      pixelText(g, `VOLEE ${Math.min(ROUNDS, st.round + 1)} DE ${ROUNDS}`, 6, 6, '#ffffff');
      for (let i = 0; i < PER; i++) { const on = i >= st.n; r(6 + i * 9, 16, 2, 8, on ? '#c8c8d8' : '#4a3a5a'); r(5 + i * 9, 22, 4, 3, on ? '#ff8a3d' : '#4a3a5a'); }
      pixelText(g, `${st.total} PTS`, 6, 30, '#ffd166');
      if (steady()) pixelText(g, 'CAFE : MAIN SURE', 6, H - 18, '#c88a50');
    }
  };

  useLoop(step, draw, []);

  return (
    <div className="game">
      <div className="game-screen" onPointerDown={(e) => { e.preventDefault(); press(); }}>
        <canvas ref={canvas} width={W} height={H} />
        {(hud.phase === 'ready' || hud.phase === 'end') && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            {hud.phase === 'ready' ? (
              <>
                <b>Les fléchettes</b>
                <span>Le viseur glisse de gauche à droite : Espace l’arrête. Puis il monte et descend : Espace lance. Triple 20, le mille… trois volées de trois.</span>
                <span className="muted">Après un café parfait, la main de Roré est plus sûre. Record : {hud.best}</span>
              </>
            ) : (
              <>
                <b>{hud.record ? 'Nouveau record !' : 'Partie finie'}</b>
                <span>Total : {hud.total} · Record : {hud.best}</span>
              </>
            )}
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); start(); }}>{hud.phase === 'ready' ? 'Jouer' : 'Rejouer'}</button>
          </div>
        )}
      </div>
      <p className="small muted">Espace (ou un clic) : arrête le viseur à gauche-droite, puis lance en haut-bas. Le rouge et le vert comptent double ou triple.</p>
    </div>
  );
}
