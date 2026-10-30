// Au-dessus de Dehors : le prénom de Roré, qui le suit à chaque image (sans repasser par React).
import { useCallback } from 'react';
import { outside } from '../engine/instance.ts';

let el: HTMLElement | null = null;

export function placeOutsideTag(scale: number) {
  if (!el) return;
  const x = Math.round(outside.x * scale);
  const y = Math.round((outside.y - (outside.seated ? 19 : 22) - outside.hop) * scale);
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

export function OutsideTag() {
  const ref = useCallback((node: HTMLDivElement | null) => { el = node; }, []);
  return (
    <div className="bubble-anchor is-chef" ref={ref} style={{ ['--c' as string]: outside.info.accent }}>
      <div className="tag">{outside.info.name}</div>
    </div>
  );
}
