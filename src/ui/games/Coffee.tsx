// La machine à café de la Pause : « Le café parfait ». Roré, seul devant la machine (la vraie, celle de la Pause, vue de
// près), se sert des cafés. Un seul geste : tenir Espace (ou le clic) pour faire couler, lâcher pile au trait. La machine
// a ses hoquets, et quelques gouttes tombent encore après qu'on a lâché. Trois tasses ratées et la pause est finie.
// Trois cafés parfaits dans la pause : Roré a le plein d'énergie au bureau (une tasse fumante, il marche plus vite).
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { annexStill } from '../../engine/annexDraw.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { timeOfDay, world } from '../../engine/instance.ts';
import { robotSprite } from '../../engine/robots.ts';
import { useOffice } from '../../state/store.ts';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 144;
/** La Pause vue de près : la partie de la pièce autour de la machine à café, agrandie ×3 */
const ZOOM = 3, VX = 82, VY = 20;
/** Le bec de la machine, dans la pièce (la machine est posée sur le plan de travail, case 7, rang 3) */
const SPOUT = { x: 122, y: 45 };
const MISSES = 3;

export function Coffee() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const pointer = useRef(false);
  const tod = timeOfDay(useOffice.getState().tod);
  const s = useRef({
    phase: 'ready' as 'ready' | 'wait' | 'pour' | 'judge' | 'end',
    t: 0, pt: 0,
    /** la tasse en cours : le trait à atteindre, ce qu'il y a dedans, une tasse ou un mug */
    line: 0.6, level: 0, mug: false, drip: 0,
    /** la machine a des hoquets : elle s'arrête, puis repart d'un coup */
    hiccup: 0, nextHiccup: 2,
    points: 0, cups: 0, perfects: 0, misses: 0, streak: 0,
    mark: '', markAt: -9, spill: 0,
    drops: [] as { x: number; y: number; vy: number }[],
    steam: [] as { x: number; y: number; t0: number }[],
  });
  const [hud, setHud] = useState({ phase: 'ready', points: 0, best: loadScores().coffee ?? 0, record: false, boost: false });
  if (import.meta.env.DEV) (window as unknown as { __coffee?: unknown }).__coffee = s.current;

  const nextCup = () => {
    const st = s.current;
    st.mug = Math.random() < 0.5;
    st.line = st.mug ? 0.62 + Math.random() * 0.26 : 0.4 + Math.random() * 0.25;
    st.level = 0; st.drip = 0; st.spill = 0;
    st.phase = 'wait'; st.pt = 0;
  };
  const start = () => {
    Object.assign(s.current, { points: 0, cups: 0, perfects: 0, misses: 0, streak: 0, mark: '', markAt: -9 });
    nextCup();
    setHud((h) => ({ ...h, phase: 'play', points: 0, record: false, boost: false }));
    sfx('open');
  };

  /** on lâche : quelques gouttes tombent encore, puis on juge la tasse */
  const judge = () => {
    const st = s.current;
    const d = Math.abs(st.level - st.line);
    let pts = 0;
    if (st.level >= 1) { st.mark = 'CA DEBORDE !'; st.misses++; st.streak = 0; }
    else if (d <= 0.025) { st.mark = 'PARFAIT !'; st.perfects++; st.streak++; pts = 3 + Math.min(3, st.streak - 1); }
    else if (d <= 0.07) { st.mark = 'BIEN'; st.streak = 0; pts = 1; }
    else { st.mark = st.level < st.line ? 'PAS ASSEZ...' : 'TROP !'; st.misses++; st.streak = 0; }
    st.points += pts; st.cups++;
    st.markAt = st.t; st.phase = 'judge'; st.pt = 0;
    sfx(pts >= 3 ? 'check' : pts > 0 ? 'tick' : 'no', pts >= 3 ? 1.2 + Math.min(0.4, st.streak * 0.1) : 1);
    setHud((h) => ({ ...h, points: st.points }));
  };

  const finish = () => {
    const st = s.current;
    st.phase = 'end';
    const sc = loadScores();
    const record = st.points > (sc.coffee ?? 0);
    if (record) { sc.coffee = st.points; saveScores(sc); }
    // trois cafés parfaits dans la pause : Roré a le plein d'énergie au bureau pendant dix minutes
    const boost = st.perfects >= 3;
    if (boost) world.coffeeUntil = world.time + 600;
    setHud({ phase: 'end', points: st.points, best: Math.max(st.points, sc.coffee ?? 0), record, boost });
    sfx(record || boost ? 'done' : 'check');
  };

  const step = (dt: number) => {
    const st = s.current;
    const taken = keys.take();
    if ((taken.includes(' ') || taken.includes('enter')) && (st.phase === 'ready' || st.phase === 'end')) { start(); return; }
    st.t += dt; st.pt += dt;
    const t = st.t;
    const holding = keys.held(' ', 'enter') || pointer.current;
    if (st.phase === 'wait' && st.pt > 0.5 && holding) { st.phase = 'pour'; st.pt = 0; sfx('pour'); }
    else if (st.phase === 'pour') {
      if (holding && st.level < 1) {
        // le café coule, plus ou moins vite ; parfois la machine hoquette, puis repart d'un coup
        if (t > st.nextHiccup && st.hiccup <= 0) { st.hiccup = 0.25 + Math.random() * 0.2; st.nextHiccup = t + 1.5 + Math.random() * 2.5; }
        const rate = st.hiccup > 0 ? 0 : 0.3 * (1 + 0.35 * Math.sin(t * 6.5)) * (st.mug ? 1.15 : 0.9);
        st.hiccup = Math.max(0, st.hiccup - dt);
        st.level = Math.min(1, st.level + rate * dt + (st.hiccup > 0 && st.hiccup < 0.05 ? 0.03 : 0));
        if (Math.random() < dt * 20) st.drops.push({ x: SPOUT.x + (Math.random() < 0.5 ? -1 : 0), y: SPOUT.y + 2, vy: 30 });
        if (st.level >= 1) { st.spill = 1; judge(); }
      } else {
        // on a lâché : encore deux ou trois gouttes
        st.drip += dt;
        st.level = Math.min(1, st.level + dt * 0.06);
        if (st.drip > 0.25) judge();
      }
    } else if (st.phase === 'judge' && st.pt > 1.3) {
      if (st.misses >= MISSES) finish(); else nextCup();
    }
    for (const d of st.drops) { d.y += d.vy * dt; d.vy += 200 * dt; }
    st.drops = st.drops.filter((d) => d.y < SPOUT.y + 9);
    if ((st.phase === 'judge' || st.phase === 'wait') && st.level > 0.2 && Math.random() < dt * 6) st.steam.push({ x: SPOUT.x - 1 + Math.random() * 3, y: SPOUT.y + 3, t0: t });
    st.steam = st.steam.filter((p) => t - p.t0 < 1.4);
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current, t = st.t;
    const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    // la Pause, de près : la pièce et ses meubles, agrandis (pixel pour pixel, ×3), autour de la machine à café
    g.save();
    g.scale(ZOOM, ZOOM);
    g.translate(-VX, -VY);
    g.drawImage(annexStill(tod), 0, 0);
    // la tasse sous le bec (petite tasse ou mug), le café qui coule, les gouttes, la vapeur
    const cw = st.mug ? 5 : 4, ch = st.mug ? 5 : 3, cx = SPOUT.x - Math.floor(cw / 2), cy = SPOUT.y + 7 - ch;
    if (st.phase !== 'ready' && st.phase !== 'end') {
      r(cx - 1, cy - 1, cw + 2, ch + 1, '#1a1822'); r(cx, cy, cw, ch, st.mug ? '#ff8a3d' : '#f6f2e9'); r(cx + cw, cy + 1, 1, Math.max(1, ch - 2), '#1a1822');
      if (st.level > 0.1) r(cx, cy, cw, 1, '#5a3018');
      if (st.phase === 'pour' && keysHeld()) r(SPOUT.x, SPOUT.y + 1, 1, cy - SPOUT.y - 1, '#5a3018');
      if (st.spill > 0) r(cx - 2, cy + ch, cw + 4, 1, '#5a3018');
    }
    for (const d of st.drops) r(d.x, d.y, 1, 1, '#5a3018');
    for (const p of st.steam) { const k = (t - p.t0) / 1.4; g.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`; g.fillRect(Math.round(p.x + Math.sin(k * 5 + p.x) * 1.5), Math.round(p.y - k * 12), 1, 1); }
    // Roré, de dos, devant la machine (il appuie quand le café coule ; il lève les bras pour un café parfait)
    const pose = st.phase === 'judge' && st.mark === 'PARFAIT !' ? 'cheer' : st.phase === 'pour' ? 'type' : 'stand';
    // (à gauche du plan de travail : on voit la machine et la tasse)
    g.drawImage(robotSprite('rore', pose, 'up', Math.floor(t * 4) % 2, 'open'), SPOUT.x - 34, 50);
    g.restore();
    // la tasse vue de près, dans une bulle : le trait à atteindre et le café qui monte
    const bx = 196, by = 18, bw = 48, bh = 64;
    r(bx - 3, by - 3, bw + 6, bh + 6, '#15121d'); r(bx - 2, by - 2, bw + 4, bh + 4, '#f6f6fa'); r(bx, by, bw, bh, '#2a2636');
    const tw = st.mug ? 30 : 24, th = st.mug ? 42 : 30, tx = bx + (bw - tw) / 2, ty = by + bh - th - 6;
    r(tx - 2, ty - 1, tw + 4, th + 3, '#15121d'); r(tx, ty, tw, th, st.mug ? '#ff8a3d' : '#f6f2e9');
    r(tx + tw + 2, ty + 6, 4, th - 14, '#15121d'); r(tx + tw + 2, ty + 8, 2, th - 18, st.mug ? '#ff8a3d' : '#f6f2e9');
    r(tx + 2, ty + 2, tw - 4, th - 4, '#3a2a30');
    const lv = Math.round(st.level * (th - 4));
    if (lv > 0) { r(tx + 2, ty + th - 2 - lv, tw - 4, lv, '#5a3018'); r(tx + 2, ty + th - 2 - lv, tw - 4, 1, '#c88a50'); }
    if (st.phase !== 'ready' && st.phase !== 'end') {
      // le trait (il clignote un peu quand on s'en approche)
      const ly = ty + th - 2 - Math.round(st.line * (th - 4)), near = Math.abs(st.level - st.line) < 0.08 && st.phase === 'pour';
      r(tx - 4, ly, tw + 8, 1, near && Math.floor(t * 10) % 2 ? '#ffffff' : '#e5484d');
      r(tx - 6, ly - 1, 3, 3, '#e5484d');
    }
    if (st.phase === 'pour' && keysHeld()) r(bx + bw / 2, by, 1, ty - by + 2 + (th - 4 - lv), '#5a3018');
    // le mot de la tasse, et la série de parfaits
    if (t - st.markAt < 1.2 && st.mark) {
      const col = st.mark === 'PARFAIT !' ? '#ffd166' : st.mark === 'BIEN' ? '#3ddc97' : '#e5484d';
      g.save(); g.scale(2, 2); pixelText(g, st.mark, Math.round((196 / 2 - textWidth(st.mark)) / 2), 30 - Math.round((t - st.markAt) * 5), col); g.restore();
      if (st.mark === 'PARFAIT !' && st.streak > 1) { const lbl = `SERIE X${st.streak}`; pixelText(g, lbl, Math.round((196 - textWidth(lbl)) / 2), 98, '#ffd166'); }
    }
    // en haut à gauche : les points, et les tasses ratées qu'il reste
    if (st.phase !== 'ready' && st.phase !== 'end') {
      pixelText(g, `${st.points} PTS`, 6, 5, '#ffffff');
      for (let i = 0; i < MISSES; i++) { const on = i < MISSES - st.misses; r(6 + i * 9, 14, 6, 5, on ? '#f6f2e9' : '#4a4458'); r(12 + i * 9, 15, 1, 3, on ? '#f6f2e9' : '#4a4458'); }
      if (st.phase === 'wait') pixelText(g, 'TIENS ESPACE', Math.round((196 - textWidth('TIENS ESPACE')) / 2), H - 12, '#ffffff');
    }
  };
  const keysHeld = () => keys.held(' ', 'enter') || pointer.current;

  useLoop(step, draw, []);

  return (
    <div className="game">
      <div className="game-screen"
        onPointerDown={(e) => { e.preventDefault(); pointer.current = true; }}
        onPointerUp={() => { pointer.current = false; }}
        onPointerLeave={() => { pointer.current = false; }}>
        <canvas ref={canvas} width={W} height={H} />
        {(hud.phase === 'ready' || hud.phase === 'end') && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            {hud.phase === 'ready' ? (
              <>
                <b>Le café parfait</b>
                <span>Tiens Espace pour faire couler le café, lâche pile au trait. La machine a ses hoquets, et quelques gouttes tombent encore après.</span>
                <span className="muted">Trois tasses ratées et la pause est finie. Record : {hud.best}</span>
              </>
            ) : (
              <>
                <b>{hud.record ? 'Nouveau record !' : 'Fin de la pause'}</b>
                <span>Score : {hud.points} · Record : {hud.best}</span>
                {hud.boost && <span>☕ Trois cafés parfaits : une tasse fumante attend Roré sur son bureau, et il file plus vite pendant dix minutes.</span>}
              </>
            )}
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); start(); }}>{hud.phase === 'ready' ? 'Se faire un café' : 'Encore un'}</button>
          </div>
        )}
      </div>
      <p className="small muted">Tiens Espace (ou le clic) pour faire couler, lâche au trait. Une série de cafés parfaits rapporte de plus en plus.</p>
    </div>
  );
}
