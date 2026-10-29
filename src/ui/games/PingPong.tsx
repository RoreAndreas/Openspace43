// Le ping-pong de la Pause : tu joues Roré contre le collègue de ton choix, en 5 points.
// Chacun a son niveau : Boulon calcule les trajectoires, Zaza joue avec style mais à l'instinct…
// Les flèches (ou la souris) bougent ta raquette.
import { useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { CHARACTERS, characterInfo } from '../../engine/characters.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { annex } from '../../engine/instance.ts';
import { robotSprite } from '../../engine/robots.ts';
import { Avatar } from '../Panel.tsx';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 144;
const TOP = 22, BOTTOM = 122, LEFT = 30, RIGHT = 226;
const PAD = 20;
const WIN = 5;

/** Le niveau de chacun : vitesse de sa raquette, et son imprécision (en pixels). */
const SKILL: Record<string, { speed: number; error: number; style: string }> = {
  hacker_cyberpunk: { speed: 150, error: 9, style: 'rapide et nerveuse' },
  mage_du_code: { speed: 95, error: 14, style: 'lent mais rusé' },
  robot_ingenieur: { speed: 175, error: 3, style: 'calcule les trajectoires' },
  analyste_strategique: { speed: 128, error: 8, style: 'méthodique' },
  styliste_extravagant: { speed: 145, error: 22, style: 'du style, peu de précision' },
  explorateur_futuriste: { speed: 122, error: 12, style: 'tout-terrain' },
  hares: { speed: 160, error: 6, style: 'discipliné, redoutable' },
};
const skillOf = (id: string) => SKILL[id] ?? { speed: 125, error: 12, style: 'joueur du dimanche' };
const stars = (id: string) => { const s = skillOf(id); return Math.max(1, Math.min(5, Math.round((s.speed - 60) / 25 - s.error / 10 + 1))); };

export function PingPong({ onClose }: { onClose: () => void }) {
  const [opp, setOpp] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  return opp
    ? <Match key={`${opp}-${round}`} opp={opp} onRematch={() => setRound((n) => n + 1)} onBack={() => setOpp(null)} onClose={onClose} />
    : <Pick onPick={setOpp} />;
}

function Pick({ onPick }: { onPick: (id: string) => void }) {
  const scores = loadScores();
  const rivals = CHARACTERS.filter((c) => !c.roles.includes('chef'));
  return (
    <div className="game-pick">
      <p className="small muted">Tu joues Roré. Choisis ton adversaire : le premier à {WIN} points gagne.</p>
      <div className="game-rivals">
        {rivals.map((c) => {
          const r = scores.pong[c.id];
          return (
            <button key={c.id} className="game-rival" style={{ ['--c' as string]: c.accent }} onClick={() => { sfx('click'); onPick(c.id); }}>
              <Avatar role={c.roles[0]} look={c.id} size={40} />
              <b>{c.name}</b>
              <span className="game-stars" title="Son niveau">{'★'.repeat(stars(c.id))}{'☆'.repeat(5 - stars(c.id))}</span>
              <span className="muted">{skillOf(c.id).style}</span>
              {r && <span className="muted">Toi {r.won} – {r.lost} {c.name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Side { y: number; hitAt: number }

function Match({ opp, onRematch, onBack, onClose }: { opp: string; onRematch: () => void; onBack: () => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const info = characterInfo(opp)!;
  const skill = skillOf(opp);
  const s = useRef({
    t: 0,
    me: { y: 72, hitAt: -9 } as Side,
    it: { y: 72, hitAt: -9 } as Side,
    ball: { x: W / 2, y: 72, vx: 0, vy: 0 },
    score: [0, 0] as [number, number],
    serveAt: 1.2,
    serveTo: 1,
    aim: 0,
    mouseY: null as number | null,
    over: false,
  });
  const [hud, setHud] = useState<{ score: [number, number]; over: boolean }>({ score: [0, 0], over: false });

  const end = (won: boolean) => {
    const st = s.current;
    st.over = true;
    const sc = loadScores();
    const r = sc.pong[opp] ?? { won: 0, lost: 0 };
    if (won) r.won++; else r.lost++;
    sc.pong[opp] = r;
    saveScores(sc);
    sfx(won ? 'done' : 'no');
    // dans la Pause, ton adversaire réagit
    annex.shout(opp, won ? 'Bien joué, Roré ! Revanche ?' : `${WIN} à ${st.score[0]}. On rejoue quand tu veux 😏`);
  };

  const step = (dt: number) => {
    const st = s.current;
    if (st.over) return;
    st.t += dt;
    const b = st.ball;
    // ta raquette : les flèches, ou la souris
    let dy = 0;
    if (keys.held('arrowup', 'z', 'w')) dy -= 1;
    if (keys.held('arrowdown', 's')) dy += 1;
    if (dy) { st.me.y += dy * 165 * dt; st.mouseY = null; }
    else if (st.mouseY !== null) st.me.y += Math.max(-230 * dt, Math.min(230 * dt, st.mouseY - st.me.y));
    // la raquette d'en face suit la balle quand elle arrive, avec son imprécision
    const target = b.vx > 0 ? b.y + st.aim : 72;
    st.it.y += Math.max(-skill.speed * dt, Math.min(skill.speed * dt, target - st.it.y));
    for (const p of [st.me, st.it]) p.y = Math.max(TOP + PAD / 2, Math.min(BOTTOM - PAD / 2, p.y));
    // le service
    if (st.serveAt > 0) {
      st.serveAt -= dt;
      b.x = W / 2; b.y = 72;
      if (st.serveAt <= 0) { b.vx = 105 * st.serveTo; b.vy = (Math.random() - 0.5) * 80; st.aim = (Math.random() - 0.5) * 2 * skill.error; }
      return;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < TOP + 2) { b.y = TOP + 2; b.vy = Math.abs(b.vy); }
    if (b.y > BOTTOM - 2) { b.y = BOTTOM - 2; b.vy = -Math.abs(b.vy); }
    // une frappe : l'angle dépend de l'endroit de la raquette où la balle arrive
    const hit = (p: Side, face: number, dir: number) => {
      if ((dir > 0 ? b.x <= face : b.x >= face) && Math.abs(b.y - p.y) <= PAD / 2 + 2 && Math.sign(b.vx) === -dir) {
        const off = (b.y - p.y) / (PAD / 2);
        b.vx = Math.min(290, Math.abs(b.vx) * 1.07) * dir;
        b.vy = off * 130 + b.vy * 0.25;
        b.x = face;
        p.hitAt = st.t;
        st.aim = (Math.random() - 0.5) * 2 * skill.error;
        sfx('tick');
      }
    };
    hit(st.me, LEFT + 4, 1);
    hit(st.it, RIGHT - 4, -1);
    // un point
    const point = (who: 0 | 1) => {
      st.score[who]++;
      st.serveTo = who === 0 ? 1 : -1;
      st.serveAt = 0.9;
      b.vx = 0; b.vy = 0;
      sfx(who === 0 ? 'check' : 'click');
      setHud({ score: [...st.score] as [number, number], over: false });
      if (st.score[who] >= WIN) { end(who === 0); setHud({ score: [...st.score] as [number, number], over: true }); }
    };
    if (b.x < LEFT - 10) point(1);
    else if (b.x > RIGHT + 10) point(0);
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = s.current;
    // le sol (le tapis violet de la Pause) et la table
    g.fillStyle = '#2a2238'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { g.fillStyle = x % 16 ? '#2e2540' : '#2a2238'; g.fillRect(x, 0, 8, H); }
    g.fillStyle = 'rgba(8,6,16,0.4)'; g.fillRect(LEFT + 3, BOTTOM + 3, RIGHT - LEFT, 6);
    g.fillStyle = '#1f6b45'; g.fillRect(LEFT, BOTTOM, RIGHT - LEFT, 5);
    g.fillStyle = '#2f8f5b'; g.fillRect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP);
    g.fillStyle = '#f6f2e9';
    g.fillRect(LEFT, TOP, RIGHT - LEFT, 1); g.fillRect(LEFT, BOTTOM - 1, RIGHT - LEFT, 1);
    g.fillRect(LEFT, TOP, 1, BOTTOM - TOP); g.fillRect(RIGHT - 1, TOP, 1, BOTTOM - TOP);
    g.fillStyle = '#cfe9da'; g.fillRect(LEFT, 72, RIGHT - LEFT, 1);
    for (let y = TOP - 3; y < BOTTOM + 3; y += 2) { g.fillStyle = y % 4 ? '#e8e5f1' : '#8a8ea2'; g.fillRect(W / 2 - 1, y, 2, 1); }
    // les joueurs et leurs raquettes
    const player = (id: string, p: Side, x: number, dir: 'right' | 'left', px: number) => {
      const swing = st.t - p.hitAt < 0.25;
      g.drawImage(robotSprite(id, swing ? 'wave' : 'stand', dir, swing ? 1 : 0, st.over ? 'happy' : 'open'), x, Math.round(p.y) - 16);
      g.fillStyle = '#15121d'; g.fillRect(px - 1, Math.round(p.y - PAD / 2) - 1, 5, PAD + 2);
      g.fillStyle = '#e5484d'; g.fillRect(px, Math.round(p.y - PAD / 2), 3, PAD);
      g.fillStyle = '#ff8a7d'; g.fillRect(px, Math.round(p.y - PAD / 2), 1, PAD);
    };
    player('rore', st.me, 4, 'right', LEFT + 1);
    player(opp, st.it, W - 24, 'left', RIGHT - 4);
    // la balle, et son ombre
    const b = st.ball;
    g.fillStyle = 'rgba(8,6,16,0.45)'; g.fillRect(Math.round(b.x) - 1, Math.round(b.y) + 3, 3, 1);
    g.fillStyle = '#ffffff'; g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
    // le score
    const label = `RORÉ ${st.score[0]} - ${st.score[1]} ${info.name.toUpperCase()}`;
    g.fillStyle = '#120f19'; g.fillRect(W / 2 - textWidth(label) / 2 - 4, 4, textWidth(label) + 8, 11);
    pixelText(g, label, Math.round(W / 2 - textWidth(label) / 2), 7, '#ffd2a8');
    if (st.serveAt > 0 && !st.over) pixelText(g, 'SERVICE', W / 2 - textWidth('SERVICE') / 2, 130, '#cfd2e0');
  };

  useLoop(step, draw, [opp]);

  const toWorldY = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return ((e.clientY - r.top) / r.height) * H;
  };

  const won = hud.score[0] > hud.score[1];
  return (
    <div className="game">
      <div className="game-screen">
        <canvas ref={canvas} width={W} height={H} onPointerMove={(e) => { s.current.mouseY = toWorldY(e); }} />
        {hud.over && (
          <div className="game-over">
            <b>{won ? 'Gagné !' : 'Perdu…'}</b>
            <span>Roré {hud.score[0]} – {hud.score[1]} {info.name}</span>
            <div className="row">
              <button className="btn primary" onClick={() => { sfx('click'); onRematch(); }}>Revanche</button>
              <button className="btn" onClick={() => { sfx('click'); onBack(); }}>Changer d’adversaire</button>
              <button className="btn" onClick={onClose}>Retour à la Pause</button>
            </div>
          </div>
        )}
      </div>
      <p className="small muted">↑ ↓ (ou la souris) pour ta raquette. L’endroit où la balle touche ta raquette donne l’angle. Premier à {WIN} points.</p>
    </div>
  );
}
