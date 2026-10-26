// La galerie des personnages : qui ils sont, leur caractère, comment ils bougent. On y choisit aussi
// le personnage d'un agent (depuis sa fiche) et celui de Roré. Pour en ajouter un : une entrée dans
// src/characters/catalog.json, puis « python scripts/characters.py » (voir le README).
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ROLES } from '../../shared/activity.ts';
import type { Role } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import {
  CATALOG, CHARACTERS, characterAnims, characterFrame, characterPalette, getLooksVersion, loadCharacter, lookChosen, lookFor, onLooks, setLook,
  type CharacterInfo, type FrameArgs,
} from '../engine/characters.ts';
import { world } from '../engine/instance.ts';
import { useOffice } from '../state/store.ts';
import { Avatar } from './Panel.tsx';
import { Shell } from './Rooms.tsx';

const ANIM_LABEL: Record<string, string> = { walk: 'Marche', work: 'Travail', interact: 'Geste', special: 'Signature' };
const IDLE_LABEL: Record<string, string> = {
  breathe: 'il respire', bounce: 'trépigne', shimmer: 'ses runes scintillent', blink: 'son écran cligne',
  check: 'consulte sa tablette', pose: 'prend la pose', scan: 'regarde autour de lui', supervise: 'surveille l’équipe',
};

/** La petite démo de l'aperçu : il attend (sa personnalité), marche vers toi, de profil, de dos, puis fait la fête. */
const REEL: { s: number; args: Pick<FrameArgs, 'pose' | 'dir' | 'moving'> }[] = [
  { s: 4, args: { pose: 'stand', dir: 'down', moving: false } },
  { s: 2, args: { pose: 'walk', dir: 'down', moving: true } },
  { s: 2, args: { pose: 'walk', dir: 'right', moving: true } },
  { s: 1.6, args: { pose: 'walk', dir: 'up', moving: true } },
  { s: 2, args: { pose: 'walk', dir: 'left', moving: true } },
  { s: 1.2, args: { pose: 'cheer', dir: 'down', moving: false } },
];
const REEL_S = REEL.reduce((n, r) => n + r.s, 0);

function Stage({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const t0 = performance.now() / 1000 - Math.random() * 3;
    let raf = 0;
    void loadCharacter(id);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const t = performance.now() / 1000 - t0;
      // où en est la démo, et depuis combien de temps dans ce passage
      let k = t % REEL_S;
      const step = REEL.find((r) => { if (k < r.s) return true; k -= r.s; return false; }) ?? REEL[0];
      const f = characterFrame(id, { ...step.args, seated: false, animT: k, t });
      g.clearRect(0, 0, 32, 32);
      if (f) g.drawImage(f.c, 16 + f.x, 30 + f.y);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return <div className="char-stage"><canvas ref={ref} width={32} height={32} /></div>;
}

function Card({ c, chosen, onPick }: { c: CharacterInfo; chosen: boolean; onPick?: () => void }) {
  const anims = characterAnims(c.id);
  const wearers = [...world.actors.values()].filter((a) => a.character === c.id).map((a) => a.name);
  return (
    <div className={`char-card ${chosen ? 'on' : ''}`} style={{ ['--c' as string]: c.accent }}>
      <div className="char-top">
        <Stage id={c.id} />
        <div>
          <b>{c.name}</b>
          <span>{c.archetype}</span>
          <span>{c.roles.map((r) => ROLES[r].label).join(' · ')}</span>
        </div>
      </div>
      <p>{c.pitch}</p>
      <p className="muted">{c.temperament}</p>
      <p className="muted">{c.accessories.join(' · ')}</p>
      <div className="swatches" aria-label="Sa palette">{characterPalette(c).map((col) => <i key={col} style={{ background: col }} title={col} />)}</div>
      <div className="char-anims">
        {anims.map((k) => <span key={k}>{ANIM_LABEL[k] ?? k}</span>)}
        <span title="Joué avec ses huit rotations, sans image en plus">En attendant : {IDLE_LABEL[c.idle] ?? c.idle}</span>
      </div>
      {wearers.length > 0 && <p className="muted">Dans le bureau : {wearers.join(', ')}</p>}
      {onPick && <button className={`btn small ${chosen ? '' : 'primary'}`} onClick={onPick}>{chosen ? '✓ Son personnage' : 'Choisir'}</button>}
    </div>
  );
}

export function CharactersRoom({ pick }: { pick?: { role: Role; name: string; agent?: string } }) {
  useSyncExternalStore(onLooks, getLooksVersion);
  const later = CATALOG.length - CHARACTERS.length;
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
    <Shell wide title="Les personnages" sub={`${CHARACTERS.length} personnages${later ? `, ${later} en préparation` : ''} · générés avec PixelLab`}>
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
