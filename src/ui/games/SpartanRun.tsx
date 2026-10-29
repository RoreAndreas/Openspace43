// La borne d'arcade de la Pause : « Spartan Run ». Hares court sur le parquet du bureau et saute
// par-dessus les bugs, les cafés renversés et les piles de dossiers. Plus il tient, plus ça va vite.
// Espace ou ↑ (ou un clic) pour sauter ; tenir la touche fait sauter plus haut.
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { annex } from '../../engine/instance.ts';
import { rng } from '../../engine/pixels.ts';
import { robotSprite } from '../../engine/robots.ts';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 128;
const GROUND = 106;
const HX = 40;

type Kind = 'bug' | 'coffee' | 'files' | 'mails';
interface Obstacle { x: number; kind: Kind; w: number; h: number }
const SIZES: Record<Kind, [number, number]> = { bug: [11, 7], coffee: [7, 10], files: [12, 16], mails: [18, 9] };

/** Le décor du fond : une ligne d'immeubles qui défile lentement. */
const SKYLINE = (() => {
  const r = rng(43);
  const out: { x: number; w: number; h: number; lit: number[] }[] = [];
  let x = 0;
  while (x < W * 2) {
    const w = 10 + Math.floor(r() * 22), h = 18 + Math.floor(r() * 38);
    out.push({ x, w, h, lit: Array.from({ length: 6 }, () => Math.floor(r() * 1000)) });
    x += w + 2;
  }
  return { list: out, span: x };
})();

function drawObstacle(g: CanvasRenderingContext2D, o: Obstacle, t: number) {
  const x = Math.round(o.x), y = GROUND - o.h;
  const r = (dx: number, dy: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x + dx, y + dy, w, h); };
  switch (o.kind) {
    case 'bug': // un bug : un scarabée rouge qui gigote
      r(-1, 1, o.w + 2, o.h - 1, '#15121d');
      r(0, 2, o.w, o.h - 3, '#e5484d'); r(5, 2, 1, o.h - 3, '#7a1f22');
      r(2, 0, 2, 2, '#15121d'); r(o.w - 4, 0, 2, 2, '#15121d');
      for (let i = 0; i < 3; i++) r(1 + i * 4, o.h - 1 + (Math.floor(t * 12 + i) % 2), 1, 1, '#15121d');
      break;
    case 'coffee': // un café renversé (et fumant)
      r(-1, 2, o.w + 2, o.h - 1, '#15121d');
      r(0, 3, o.w, o.h - 3, '#f1eef6'); r(0, 5, o.w, 1, '#ff8a3d');
      r(-3, o.h - 1, o.w + 6, 1, '#6b3f22');
      r(2, Math.floor(t * 8) % 2 ? 0 : 1, 1, 2, '#cfd2e0');
      break;
    case 'files': // une pile de dossiers urgents
      r(-1, -1, o.w + 2, o.h + 1, '#15121d');
      for (let i = 0; i < 4; i++) r(0, i * 4, o.w, 3, ['#f6c85f', '#4fb3ff', '#ff6fa8', '#3ddc97'][i]);
      r(3, 1, 6, 1, '#e5484d');
      break;
    case 'mails': // une rafale de mails « URGENT »
      r(-1, -1, o.w + 2, o.h + 1, '#15121d');
      r(0, 0, o.w, o.h, '#f6f2e9');
      r(0, 0, o.w, 1, '#d8d1c3'); r(1, 1, 8, 4, '#e5e1d6');
      g.fillStyle = '#a19a8c';
      for (let i = 0; i < o.w; i++) g.fillRect(x + i, y + 1 + Math.abs(i - o.w / 2) * 0.35, 1, 1);
      r(o.w - 5, o.h - 4, 4, 3, '#e5484d');
      break;
  }
}

export function SpartanRun() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const best0 = useRef(loadScores().run);
  const s = useRef({
    phase: 'ready' as 'ready' | 'run' | 'over',
    t: 0, dist: 0, speed: 95,
    y: 0, vy: 0, ground: true,
    obstacles: [] as Obstacle[],
    next: 140,
    jumpReq: false,
  });
  const [hud, setHud] = useState<{ phase: 'ready' | 'run' | 'over'; score: number; best: number; record: boolean }>({ phase: 'ready', score: 0, best: best0.current, record: false });

  const start = () => {
    const st = s.current;
    Object.assign(st, { phase: 'run', t: 0, dist: 0, speed: 95, y: 0, vy: 0, ground: true, obstacles: [], next: 160, jumpReq: false });
    setHud((h) => ({ ...h, phase: 'run', score: 0, record: false }));
    sfx('click');
  };

  const jump = () => {
    const st = s.current;
    if (st.phase !== 'run') { start(); return; }
    st.jumpReq = true;
  };

  const step = (dt: number) => {
    const st = s.current;
    for (const k of keys.take()) if (k === ' ' || k === 'arrowup' || k === 'z' || k === 'w' || k === 'enter') jump();
    if (st.phase !== 'run') return;
    st.t += dt;
    st.speed = Math.min(270, 95 + st.t * 3.6);
    st.dist += st.speed * dt;
    // le saut : plus haut si on tient la touche
    if (st.jumpReq && st.ground) { st.vy = -245; st.ground = false; sfx('tick'); }
    st.jumpReq = false;
    const holding = keys.held(' ', 'arrowup', 'z', 'w');
    st.vy += (st.vy < 0 && holding ? 480 : 820) * dt;
    st.y += st.vy * dt;
    if (st.y >= 0) { st.y = 0; st.vy = 0; st.ground = true; }
    // les obstacles arrivent, de plus en plus serrés
    for (const o of st.obstacles) o.x -= st.speed * dt;
    st.obstacles = st.obstacles.filter((o) => o.x + o.w > -4);
    st.next -= st.speed * dt;
    if (st.next <= 0) {
      const kinds: Kind[] = st.t < 12 ? ['bug', 'coffee'] : ['bug', 'coffee', 'files', 'mails'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const [w, h] = SIZES[kind];
      st.obstacles.push({ x: W + 4, kind, w, h });
      st.next = (st.speed * 0.62) + 40 + Math.random() * 110;
    }
    // la collision (des boîtes un peu indulgentes)
    const hx0 = HX + 5, hx1 = HX + 14, hy0 = GROUND + st.y - 19, hy1 = GROUND + st.y - 1;
    for (const o of st.obstacles) {
      if (o.x + 1 < hx1 && o.x + o.w - 1 > hx0 && GROUND - o.h + 1 < hy1 && GROUND > hy0) {
        st.phase = 'over';
        const score = Math.floor(st.dist / 8);
        const record = score > best0.current;
        if (record) {
          best0.current = score;
          const sc = loadScores();
          sc.run = score;
          saveScores(sc);
          annex.shout('hares', `Nouveau record : ${score} ! Gloire à Sparte. 🛡️`);
          sfx('done');
        } else sfx('no');
        setHud({ phase: 'over', score, best: best0.current, record });
        return;
      }
    }
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current;
    // le ciel du soir et la ville
    const bands = ['#1c1a45', '#231e50', '#2f2560', '#432c6a', '#5a3570'];
    bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 14, W, 14); });
    g.fillStyle = '#5a3570'; g.fillRect(0, 70, W, GROUND - 70);
    const off = (st.dist * 0.15) % SKYLINE.span;
    for (const b of SKYLINE.list) {
      for (const rep of [0, SKYLINE.span]) {
        const x = Math.round(b.x - off + rep);
        if (x > W || x + b.w < 0) continue;
        g.fillStyle = '#16122a'; g.fillRect(x, GROUND - b.h, b.w, b.h);
        g.fillStyle = '#ffcf6b';
        b.lit.forEach((n, i) => { if ((n + Math.floor(st.t)) % 5 === 0) g.fillRect(x + 2 + (n % Math.max(1, b.w - 4)), GROUND - b.h + 3 + i * 5, 1, 2); });
      }
    }
    // le parquet qui défile
    g.fillStyle = '#3f3138'; g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = '#504048'; g.fillRect(0, GROUND, W, 1);
    const p = Math.floor(st.dist) % 24;
    for (let x = -p; x < W; x += 24) { g.fillStyle = '#30252c'; g.fillRect(x, GROUND + 6, 1, 5); g.fillRect(x + 12, GROUND + 13, 1, 5); }
    for (let y = GROUND + 6; y < H; y += 7) { g.fillStyle = '#30252c'; g.fillRect(0, y, W, 1); }
    // les obstacles
    for (const o of st.obstacles) drawObstacle(g, o, st.t);
    // Hares : il court au sol, il se fige en l'air, il a le regard baissé quand il a perdu
    const yy = Math.round(GROUND + st.y);
    g.fillStyle = 'rgba(8,6,16,0.35)'; g.fillRect(HX + 4, GROUND - 1, 12 - Math.min(6, -st.y / 8), 2);
    const frame = Math.floor(st.dist / 9) % 4;
    const pose = st.phase === 'over' ? 'stand' : !st.ground ? 'cheer' : st.phase === 'run' ? 'walk' : 'stand';
    g.drawImage(robotSprite('hares', pose, 'right', st.ground ? frame : 0, st.phase === 'over' ? 'down' : st.ground ? 'open' : 'happy'), HX, yy - 22);
    // le score
    const score = Math.floor(st.dist / 8);
    const label = `SCORE ${score}   RECORD ${Math.max(best0.current, score)}`;
    pixelText(g, label, W - textWidth(label) - 6, 6, '#ffd2a8');
    pixelText(g, 'SPARTAN RUN', 6, 6, '#e5484d');
  };

  useLoop(step, draw, []);

  return (
    <div className="game">
      <div className="game-screen arcade" onPointerDown={(e) => { e.preventDefault(); jump(); }}>
        <canvas ref={canvas} width={W} height={H} />
        {hud.phase !== 'run' && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            {hud.phase === 'ready' ? (
              <>
                <b>Spartan Run</b>
                <span>Hares court : saute par-dessus les bugs, les cafés renversés et les dossiers urgents.</span>
                <span className="muted">Espace ou ↑ pour sauter (tiens la touche pour sauter plus haut). Record : {hud.best}</span>
              </>
            ) : (
              <>
                <b>{hud.record ? 'Nouveau record !' : 'Aïe !'}</b>
                <span>Score : {hud.score} · Record : {hud.best}</span>
              </>
            )}
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); start(); }}>{hud.phase === 'ready' ? 'Jouer' : 'Rejouer'}</button>
          </div>
        )}
      </div>
      <p className="small muted">Espace, ↑ ou un clic sur l’écran pour sauter. Plus Hares tient, plus ça va vite.</p>
    </div>
  );
}
