// La galerie des personnages : qui ils sont, leur caractère, comment ils bougent. On y choisit aussi
// le personnage d'un agent (depuis sa fiche) et celui de Roré. Pour en ajouter un : une entrée dans
// src/characters/catalog.json, avec sa tenue (voir le README).
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ROLES } from '../../shared/activity.ts';
import type { Role } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { CHARACTERS, getLooksVersion, idleEffect, lookChosen, lookFor, onLooks, setLook, type CharacterInfo } from '../engine/characters.ts';
import { world } from '../engine/instance.ts';
import { robotSprite, type Dir, type Pose } from '../engine/robots.ts';
import { useOffice } from '../state/store.ts';
import { Avatar } from './Panel.tsx';
import { Shell } from './Rooms.tsx';

const IDLE_LABEL: Record<string, string> = {
  breathe: 'il attend', bounce: 'trépigne', shimmer: 'son bâton scintille', blink: 'son écran cligne',
  check: 'consulte sa tablette', pose: 'prend la pose', scan: 'regarde autour de lui', supervise: 'surveille l’équipe',
};

/** La petite démo de l'aperçu : il attend (sa personnalité), marche dans les quatre directions, travaille, fait la fête, salue. */
const REEL: { s: number; pose: Pose; dir: Dir; fps: number; n: number }[] = [
  { s: 4, pose: 'stand', dir: 'down', fps: 0, n: 1 },
  { s: 1.5, pose: 'walk', dir: 'down', fps: 8, n: 4 },
  { s: 1.5, pose: 'walk', dir: 'right', fps: 8, n: 4 },
  { s: 1.2, pose: 'walk', dir: 'up', fps: 8, n: 4 },
  { s: 1.5, pose: 'walk', dir: 'left', fps: 8, n: 4 },
  { s: 1.6, pose: 'type', dir: 'down', fps: 7, n: 2 },
  { s: 1.2, pose: 'cheer', dir: 'down', fps: 6, n: 2 },
  { s: 1.2, pose: 'wave', dir: 'down', fps: 6, n: 2 },
];
const REEL_S = REEL.reduce((n, r) => n + r.s, 0);

function Stage({ c }: { c: CharacterInfo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const t0 = performance.now() / 1000 - Math.random() * 3;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const t = performance.now() / 1000 - t0;
      // où en est la démo, et depuis combien de temps dans ce passage
      let k = t % REEL_S;
      const step = REEL.find((r) => { if (k < r.s) return true; k -= r.s; return false; }) ?? REEL[0];
      let frame = step.fps ? Math.floor(k * step.fps) % step.n : 0;
      let eyes: Parameters<typeof robotSprite>[4] = step.pose === 'cheer' ? 'happy' : step.pose === 'type' ? 'down' : 'open';
      let hop = 0;
      if (step.pose === 'stand') {
        const fx = idleEffect(c.idle, t, true);
        hop = fx.hop;
        eyes = fx.eyes ?? (Math.floor(t * 1.7) % 9 === 0 ? 'blink' : 'open');
        frame = fx.frame ?? 0;
      }
      g.clearRect(0, 0, 20, 24);
      g.drawImage(robotSprite(c.id, step.pose, step.dir, frame, eyes), 0, -hop);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [c]);
  return <div className="char-stage"><canvas ref={ref} width={20} height={24} /></div>;
}

function Card({ c, chosen, onPick }: { c: CharacterInfo; chosen: boolean; onPick?: () => void }) {
  const wearers = [...world.actors.values()].filter((a) => a.character === c.id).map((a) => a.name);
  return (
    <div className={`char-card ${chosen ? 'on' : ''}`} style={{ ['--c' as string]: c.accent }}>
      <div className="char-top">
        <Stage c={c} />
        <div>
          <b>{c.name}</b>
          <span>{c.archetype}</span>
          <span>{c.roles.map((r) => ROLES[r].label).join(' · ')}</span>
        </div>
      </div>
      <p>{c.pitch}</p>
      <p className="muted">{c.temperament}</p>
      <p className="muted">{c.accessories.join(' · ')}</p>
      <div className="swatches" aria-label="Sa palette">{c.palette.map((col) => <i key={col} style={{ background: col }} title={col} />)}</div>
      <div className="char-anims">
        <span>Marche · 4 directions</span>
        <span>Travail</span>
        <span>Fête · Salut</span>
        <span>En attendant : {IDLE_LABEL[c.idle] ?? c.idle}</span>
      </div>
      {wearers.length > 0 && <p className="muted">Dans le bureau : {wearers.join(', ')}</p>}
      {onPick && <button className={`btn small ${chosen ? '' : 'primary'}`} onClick={onPick}>{chosen ? '✓ Son personnage' : 'Choisir'}</button>}
    </div>
  );
}

export function CharactersRoom({ pick }: { pick?: { role: Role; name: string; agent?: string } }) {
  useSyncExternalStore(onLooks, getLooksVersion);
  const back = () => useOffice.setState({ modal: pick?.agent ? { kind: 'agent', id: pick.agent } : { kind: 'characters' } });
  const choose = (id: string | null | undefined) => {
    if (!pick) return;
    sfx('click');
    setLook(pick.role, pick.name, id);
    back();
  };
  const here = pick ? [...world.actors.values()].find((a) => a.role === pick.role && a.name === pick.name) : null;
  const current = pick ? (here ? here.character : lookFor(pick.role, pick.name)) : null;
  const forChef = pick?.role === 'chef';

  if (pick) {
    // les personnages de son métier d'abord ; celui du chef reste à Roré
    const sorted = CHARACTERS.filter((c) => forChef || !c.roles.includes('chef'))
      .sort((a, b) => Number(b.roles.includes(pick.role)) - Number(a.roles.includes(pick.role)));
    return (
      <Shell wide title={`Le personnage de ${pick.name}`} sub={forChef ? 'Le chef de l’open space' : `${ROLES[pick.role].label} · il le garde d’une mission à l’autre`} onClose={back}>
        <div className="row">
          {lookChosen(pick.role, pick.name) && <button className="btn small" onClick={() => choose(undefined)}>↺ Celui de son métier</button>}
          {!forChef && <button className={`btn small ${current === null ? 'primary' : ''}`} onClick={() => choose(null)}><Avatar role={pick.role} look={null} size={18} /> Le robot du métier</button>}
        </div>
        <div className="chars">
          {sorted.map((c) => <Card key={c.id} c={c} chosen={current === c.id} onPick={() => choose(c.id)} />)}
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide title="Les personnages" sub={`${CHARACTERS.length} personnages · les robots du bureau, chacun avec sa tenue`}>
      <p className="small muted">Chaque agent reçoit un personnage de son métier, toujours le même pour un même prénom. Pour en changer, ouvre sa fiche (clique sur lui dans le bureau).</p>
      <div className="row">
        <button className="btn small" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'characters', pick: { role: 'chef', name: 'Roré' } } }); }}><Avatar role="chef" size={18} /> Changer le personnage de Roré</button>
      </div>
      <div className="chars">
        {CHARACTERS.map((c) => <Card key={c.id} c={c} chosen={false} />)}
      </div>
    </Shell>
  );
}
