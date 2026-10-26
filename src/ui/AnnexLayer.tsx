// Au-dessus de la Break room : le prénom de chacun, et sa bulle quand il te parle.
// Les bulles suivent les personnages à chaque image (placeAnnexBubbles), sans repasser par React.
import { useCallback, useSyncExternalStore } from 'react';
import { annex } from '../engine/instance.ts';
import { W } from '../engine/layout.ts';

const els = new Map<string, HTMLElement>();

export function placeAnnexBubbles(scale: number) {
  const stageW = W * scale;
  for (const [id, el] of els) {
    const p = annex.pals.find((x) => x.id === id);
    if (!p) continue;
    const x = Math.round(p.x * scale);
    const y = Math.round((p.y - (p.seated ? 19 : 22) - p.hop) * scale);
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    // une bulle au bord de la pièce rentre dans le cadre (sa pointe reste sur le personnage)
    const b = el.firstElementChild as HTMLElement | null;
    let dx = 0;
    if (b) {
      const half = b.offsetWidth / 2;
      if (x - half < 4) dx = 4 - (x - half);
      else if (x + half > stageW - 4) dx = stageW - 4 - (x + half);
    }
    el.style.setProperty('--dx', `${Math.round(dx)}px`);
  }
}

function Tag({ id }: { id: string }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) els.set(id, el);
    else els.delete(id);
  }, [id]);
  const p = annex.pals.find((x) => x.id === id)!;
  return (
    <div className={`bubble-anchor ${p === annex.rore ? 'is-chef' : ''}`} ref={ref} style={{ ['--c' as string]: p.info.accent }}>
      {p.line ? (
        <div className="bubble">
          <span className="bubble-name">{p.name}</span>
          <span className="bubble-text">{p.line}</span>
        </div>
      ) : <div className="tag">{p.name}</div>}
    </div>
  );
}

export function AnnexBubbles() {
  useSyncExternalStore((cb) => annex.onChange(cb), () => annex.version);
  return <>{annex.pals.map((p) => <Tag key={p.id} id={p.id} />)}</>;
}
