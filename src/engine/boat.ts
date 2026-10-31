// La barque de Roré, en pixel art, la même en mer et dans la pêche : une coque peinte en bleu avec une bande blanche et
// le « 43 » à la proue, un plat-bord en bois verni, l'étrave qui se relève, le tableau arrière plat ; dedans, le bordé,
// les membrures, le plancher et deux bancs ; des tolets en laiton, une lanterne à l'arrière. Elle est dessinée en deux
// morceaux cernés de sombre : le fond (l'intérieur, la lanterne) et le devant (le bordé qui cache les jambes de Roré,
// assis entre les deux).
import { pixelText } from './font.ts';
import { g2d, makeCanvas, outline } from './pixels.ts';

const C = {
  rim: '#c8955e', rimHi: '#ecc48c', rimDark: '#8a5f3e',
  paint: '#2f6f9a', paintHi: '#4a90c2', paintDark: '#1f5276', seam: '#1d4866', stripe: '#f2ede0',
  inside: '#8a5a34', insideDark: '#6e4628', rib: '#5a3820', floor: '#a8743f', bench: '#d8a870', benchHi: '#f0c890',
  brass: '#d8b060', post: '#3e2818', ink: '#1a1018',
};

export interface Boat {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  /** où est le milieu de la ligne d'eau dans les deux canevas */
  ox: number; oy: number;
  /** le plat-bord de devant, celui du fond, la quille, à la colonne `i` (de −hl à hl), dans les canevas */
  gy: (i: number) => number; fy: (i: number) => number; ky: (i: number) => number;
}

const cache = new Map<string, { back: HTMLCanvasElement; front: HTMLCanvasElement }>();

/** La barque, longue de 2·`hl` + 1 pixels, la proue du côté `f` (1 : à droite), penchée de `tilt` pixels aux bouts ;
 *  `depth` : combien on voit dedans (vue d'un peu au-dessus). `lamp` : la lanterne allumée. */
export function paintBoat(hl: number, f: 1 | -1, tilt: number, depth: number, lamp: boolean): Boat {
  const ox = hl + 6, oy = 30;
  const W = hl * 2 + 13, H = 40;
  const t = Math.round(tilt);
  const gy = (i: number) => {
    const u = i / hl;
    // le plat-bord : il remonte vers les bouts, surtout vers la proue, en une belle courbe
    return oy - 5 - Math.round(u * u * 3) - Math.round(Math.pow(Math.max(0, u * f - 0.45) / 0.55, 2) * 4) + Math.round(t * u);
  };
  const fy = (i: number) => gy(i) - Math.round(depth * Math.sqrt(Math.max(0, 1 - (i / hl) ** 2)));
  const ky = (i: number) => oy + 4 - Math.round(Math.pow(Math.abs(i / hl), 3) * 7) + Math.round(t * i / hl);
  const key = `${hl}|${f}|${t}|${depth}|${lamp}`;
  let pic = cache.get(key);
  if (!pic) {
    const back = makeCanvas(W, H), front = makeCanvas(W, H);
    const b = g2d(back), d = g2d(front);
    const px = (g: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const bowI = f * hl, sternI = -f * hl;
    // ── le fond : l'intérieur (le bordé, les membrures, le plancher), le plat-bord du fond, les bancs, la lanterne ──
    for (let i = -hl; i <= hl; i++) {
      const x = ox + i, top = fy(i), bot = gy(i);
      if (bot - top < 1) continue;
      px(b, x, top, C.rim); px(b, x, top - 1, C.rimHi);
      for (let y = top + 1; y < bot; y++) px(b, x, y, (y - top) % 2 ? C.inside : C.insideDark);
      if (bot - top > 3) px(b, x, bot - 2, C.floor, 1, 2);
      if ((i + 60) % 5 === 0) for (let y = top + 1; y < bot - 1; y++) px(b, x, y, C.rib);
    }
    for (const u of [0, -0.55 * f]) {
      const i0 = Math.round(u * hl) - 3;
      for (let i = i0; i < i0 + 6; i++) { const top = fy(i) + 1, bot = gy(i); if (bot <= top) continue; px(b, ox + i, top, i === i0 ? C.insideDark : C.bench, 1, bot - top); px(b, ox + i, top, C.benchHi); }
    }
    // la lanterne, sur son petit mât à l'arrière
    const li = Math.round(-f * hl * 0.8), lx = ox + li, ly = gy(li);
    px(b, lx, ly - 9, C.post, 1, 9);
    px(b, lx - 1, ly - 13, C.ink, 3, 1); px(b, lx - 1, ly - 12, C.brass, 3, 3); px(b, lx, ly - 11, lamp ? '#fff2b0' : '#e0d0a0'); px(b, lx, ly - 14, C.brass);
    outline(back, C.ink);
    // ── le devant : le plat-bord verni, la coque bleue, la bande blanche, les virures, l'étrave, le tableau, le « 43 » ──
    for (let i = -hl; i <= hl; i++) {
      const x = ox + i, top = gy(i), bot = ky(i);
      if (bot <= top) continue;
      const end = Math.abs(i / hl);
      px(d, x, top, C.rimHi); px(d, x, top + 1, C.rim); px(d, x, top + 2, C.rimDark);
      for (let y = top + 3; y < bot; y++) {
        const k = y - top - 3;
        let c = k === 0 ? C.stripe : k === 1 ? C.paintHi : (k > 2 && k % 2 === 1) ? C.seam : C.paint;
        if (end > 0.85 && c !== C.stripe) c = C.paintDark;
        px(d, x, y, c);
      }
    }
    // l'étrave, qui monte au-dessus du plat-bord, et le tableau arrière, plat
    const sx = ox + bowI;
    for (let y = gy(bowI) - 3; y < ky(bowI); y++) px(d, sx, y, y < gy(bowI) ? C.rim : C.rimDark);
    px(d, sx, gy(bowI) - 4, C.rimHi);
    for (let y = gy(sternI); y < ky(sternI); y++) px(d, ox + sternI, y, C.paintDark);
    px(d, ox + sternI, gy(sternI) - 1, C.rim);
    // les tolets en laiton, au milieu
    px(d, ox + 1, gy(1) - 2, C.brass, 2, 2);
    // le « 43 » à la proue
    const ni = Math.round(f * (hl - 11));
    pixelText(d, '43', ox + ni - 3, gy(ni) + 4, C.stripe);
    outline(front, C.ink);
    pic = { back, front };
    if (cache.size > 200) cache.clear();
    cache.set(key, pic);
  }
  return { ...pic, ox, oy, gy, fy, ky };
}
