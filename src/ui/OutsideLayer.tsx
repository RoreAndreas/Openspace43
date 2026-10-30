// Au-dessus de Dehors : le prénom de chacun (Roré, et les collègues sortis prendre l'air), qui suit à chaque image.
import { useCallback, useSyncExternalStore } from 'react';
import { outside } from '../engine/instance.ts';

const els = new Map<string, HTMLElement>();

export function placeOutsideTag(scale: number) {
  for (const w of outside.walkers) {
    const el = els.get(w.id);
    if (!el) continue;
    const x = Math.round(w.x * scale);
    const y = Math.round((w.y - (w.seated ? 19 : 22) - w.hop) * scale);
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
}

function Tag({ id }: { id: string }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) els.set(id, el);
    else els.delete(id);
  }, [id]);
  const w = outside.walkers.find((x) => x.id === id);
  if (!w) return null;
  return (
    <div className={`bubble-anchor ${w === outside.rore ? 'is-chef' : ''}`} ref={ref} style={{ ['--c' as string]: w.info.accent }}>
      <div className="tag">{w.name}</div>
    </div>
  );
}

export function OutsideTag() {
  useSyncExternalStore((cb) => outside.onChange(cb), () => outside.version);
  return <>{outside.walkers.map((w) => <Tag key={w.id} id={w.id} />)}</>;
}
