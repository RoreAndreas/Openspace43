// La bibliothèque de la Pause : une étagère en bois pleine de livres (dessinés en pixel art). Deux ouvrages se lisent :
// le bestiaire (dos bleu, un poisson doré) et le livre des cafés (dos brun, une tasse). Un clic sur l'un d'eux l'ouvre ;
// « Ranger le livre » le remet sur l'étagère.
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { rng } from '../engine/pixels.ts';
import { useOffice } from '../state/store.ts';
import { CoffeeBook, DRINK_LIST } from './games/Coffee.tsx';
import { Bestiary } from './games/Fishing.tsx';
import { loadScores } from './games/common.ts';
import { Shell } from './Rooms.tsx';

const W = 240, H = 146, TOP = 10;
type Book = 'fish' | 'cafes';
/** Les deux ouvrages, sur l'étagère du milieu : leur place (en pixels de l'étagère), leurs couleurs */
const BOOKS: Record<Book, { x: number; y: number; w: number; h: number; col: string; dark: string; title: string }> = {
  fish: { x: 104, y: 55, w: 14, h: 29, col: '#2a78b2', dark: '#1a4c76', title: 'Le bestiaire' },
  cafes: { x: 120, y: 57, w: 14, h: 27, col: '#8a5a34', dark: '#5a3418', title: 'Les cafés' },
};

/** L'étagère : le cadre en bois, trois planches, des livres de toutes les tailles (certains penchés, une pile couchée),
 *  une plante et une tasse dessus ; au milieu, les deux ouvrages qu'on peut lire. */
function paintShelf(g: CanvasRenderingContext2D) {
  const r = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const rand = rng(43);
  r(0, 0, W, H, '#2a2636');
  // (tout descend un peu : la plante, sur le meuble, a de la place)
  g.save(); g.translate(0, TOP);
  // (le meuble garde sa hauteur : 136 pixels)
  const SH = 136;
  // le meuble
  r(14, 10, W - 28, SH - 12, '#1a1018'); r(15, 11, W - 30, SH - 14, '#8a5530'); r(15, 11, W - 30, 2, '#b07848');
  r(20, 16, W - 40, SH - 24, '#3e2618');
  for (let x = 24; x < W - 24; x += 9) r(x, 16, 1, SH - 24, '#352014');
  const shelves = [48, 86, 124];
  for (const sy of shelves) { r(18, sy, W - 36, 4, '#1a1018'); r(19, sy, W - 38, 3, '#a8703f'); r(19, sy, W - 38, 1, '#c88a58'); }
  // les livres, planche par planche
  const cols = ['#b8443a', '#3d7a52', '#c8a040', '#5a4a8a', '#2f6f9a', '#a85a7a', '#d8d0c0', '#6a4a30', '#3a8a8a', '#e07a40'];
  const book = (x: number, base: number, w: number, h: number, c: string) => {
    const top = base - h;
    r(x - 1, top - 1, w + 2, h + 1, '#1a1018');
    r(x, top, w, h, c);
    r(x, top, 1, h, 'rgba(255,255,255,0.25)');
    r(x + w - 1, top, 1, h, 'rgba(0,0,0,0.25)');
    // des filets dorés sur le dos
    if (w >= 5) { r(x, top + 3, w, 1, '#e8c060'); r(x, base - 5, w, 1, '#e8c060'); }
  };
  shelves.forEach((sy, si) => {
    let x = 22;
    while (x < W - 30) {
      // au milieu de l'étagère du milieu, la place des deux ouvrages
      if (si === 1 && x > 96 && x < 140) { x = 140; continue; }
      if (rand() < 0.08 && si !== 1 && x < W - 64) {
        // une pile couchée
        for (let k = 0; k < 3; k++) { const w = 18 - k * 2, c = cols[Math.floor(rand() * cols.length)]; r(x - 1 + k, sy - 5 - k * 4, w + 2, 5, '#1a1018'); r(x + k, sy - 4 - k * 4, w, 3, c); r(x + k, sy - 4 - k * 4, w, 1, 'rgba(255,255,255,0.2)'); }
        x += 20;
        continue;
      }
      const w = 4 + Math.floor(rand() * 5), h = 18 + Math.floor(rand() * 12), c = cols[Math.floor(rand() * cols.length)];
      book(x, sy, w, Math.min(h, 30), c);
      x += w + 1;
    }
  });
  // dessus : une plante et une tasse
  r(30, 2, 12, 9, '#1a1018'); r(31, 3, 10, 7, '#b8643f');
  for (const [dx, dy] of [[-4, -6], [0, -9], [4, -7], [-2, -3], [6, -3]]) { r(36 + dx - 1, 3 + dy - 1, 5, 4, '#1a1018'); r(36 + dx, 3 + dy, 3, 2, '#348050'); }
  r(W - 44, 4, 9, 7, '#1a1018'); r(W - 43, 5, 7, 5, '#f1eef6'); r(W - 43, 6, 7, 1, '#ff8a3d'); r(W - 36, 6, 2, 3, '#1a1018');
  // les deux ouvrages : plus grands, avec leur emblème sur le dos
  for (const k of ['fish', 'cafes'] as Book[]) {
    const b = BOOKS[k];
    r(b.x - 1, b.y - 1, b.w + 2, b.h + 1, '#1a1018');
    r(b.x, b.y, b.w, b.h, b.col); r(b.x, b.y, 1, b.h, 'rgba(255,255,255,0.3)'); r(b.x + b.w - 2, b.y, 2, b.h, b.dark);
    r(b.x, b.y + 3, b.w, 1, '#e8c060'); r(b.x, b.y + b.h - 4, b.w, 1, '#e8c060');
    if (k === 'fish') {
      // un petit poisson doré
      const fx = b.x + 3, fy = b.y + 12;
      r(fx + 1, fy, 6, 3, '#e8c060'); r(fx, fy + 1, 1, 1, '#e8c060'); r(fx + 7, fy - 1, 2, 5, '#e8c060'); r(fx + 2, fy + 1, 1, 1, '#1a1018');
    } else {
      // une tasse fumante
      const cx = b.x + 3, cy = b.y + 13;
      r(cx, cy, 6, 5, '#e8c060'); r(cx + 6, cy + 1, 2, 3, '#e8c060'); r(cx + 7, cy + 2, 1, 1, b.col);
      r(cx + 1, cy - 3, 1, 2, '#e8c060'); r(cx + 4, cy - 4, 1, 2, '#e8c060');
    }
  }
  g.restore();
}

export function LibraryRoom() {
  const [open, setOpen] = useState<Book | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const journal = loadScores().fish.journal;
  const counts: Record<Book, string> = { fish: `${Object.keys(journal).length} espèces`, cafes: `${Object.keys(loadScores().cafes).length} sur ${DRINK_LIST.length} cafés` };
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    paintShelf(g);
  }, [open]);
  const pick = (b: Book) => { sfx('open'); setOpen(b); };
  return (
    <Shell wide title="📚 La bibliothèque" sub={open ? BOOKS[open].title : 'Les ouvrages de la Pause : choisis un livre'} onClose={() => useOffice.setState({ modal: null })}>
      {!open ? (
        <div className="library">
          <div className="library-shelf">
            <canvas ref={ref} width={W} height={H} />
            {(['fish', 'cafes'] as Book[]).map((k) => {
              const b = BOOKS[k];
              return (
                <button key={k} className={`library-spine ${k}`} title={`${b.title} (${counts[k]})`} aria-label={b.title} onClick={() => pick(k)}
                  style={{ left: `${(b.x / W) * 100}%`, top: `${((b.y + TOP) / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` }} />
              );
            })}
          </div>
          <p className="small muted">Deux ouvrages se lisent : <b>{BOOKS.fish.title}</b> ({counts.fish}) et <b>{BOOKS.cafes.title}</b> ({counts.cafes}). Clique sur leur dos.</p>
        </div>
      ) : (
        <div className={`library-open ${open}`}>
          <div className="library-cover">
            <b>{BOOKS[open].title}</b>
            <span>{counts[open]}</span>
            <button className="btn small" onClick={() => { sfx('click'); setOpen(null); }}>Ranger le livre</button>
          </div>
          {open === 'fish' ? <Bestiary journal={journal} /> : <CoffeeBook />}
        </div>
      )}
    </Shell>
  );
}
