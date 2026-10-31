// L'eau de la mer : une vraie surface, pas des traits. Le plan d'eau a sa perspective (`toScreen`, `toWater`) : la
// barque, le ponton et les remous y sont posés, en mètres. La houle est une somme de vagues qui avancent vers nous
// (`heightAt`) ; chaque pixel prend la teinte de la pente qu'il montre (vers le ciel : plus clair ; vers nous : plus
// sombre), tramée en quelques tons pour rester en pixel art. Le soleil (ou la lune) y fait scintiller une colonne, les
// crêtes les plus hautes se coiffent d'écume, et la falaise s'y reflète, cassée par les vagues.
import { H, WIDE } from './layout.ts';
import { g2d, makeCanvas, mix } from './pixels.ts';
import type { TimeOfDay } from './room.ts';

const W = WIDE, CX = W / 2;
export const HORIZON = 112;
/** La ligne d'eau de la barque. */
export const BOAT_Y = 208;
/** La perspective : un point à `f` mètres devant la barque tombe à HORIZON + C / (f + E) ; de côté, un mètre y fait
 *  (y − HORIZON) × Q pixels. À la barque : 17 pixels par mètre de côté, environ 13 en profondeur. */
const E = 7, C = (BOAT_Y - 2 - HORIZON) * E, Q = 17 / (BOAT_Y - 2 - HORIZON);
/** De combien de mètres l'eau défile de côté quand la barque tourne d'un radian autour de l'île. */
export const RW = 30;

/** Le plan d'eau vu de la barque : où elle en est du tour (`at`), à combien de mètres est le pied de la falaise (`dw`). */
export interface Plane { at: number; dw: number }
export const planeOf = (at: number, base: number): Plane => ({ at, dw: Math.min(400, C / Math.max(1.5, base - HORIZON) - E) });

/** Un point de l'eau (u : de côté, w : sa distance au pied de la falaise, en mètres) à l'écran ; `s` : pixels par mètre
 *  de côté (et en hauteur), `k` : pixels par mètre en profondeur. Null s'il est derrière nous. */
export function toScreen(pl: Plane, u: number, w: number) {
  const d = pl.dw - w + E;
  if (d < 3) return null;
  const r = C / d;
  return { x: CX + (u - pl.at * RW) * r * Q, y: HORIZON + r, s: r * Q, k: (r * r) / C };
}
/** La ligne d'eau d'un point à `f` mètres devant la barque, et sa taille par rapport au pied de la falaise. */
export function rowAt(pl: Plane, f: number) {
  if (f + E < 3) return null;
  return { y: HORIZON + C / (f + E), scale: (pl.dw + E) / (f + E) };
}
/** Le point de l'eau sous un pixel de l'écran. */
export function toWater(pl: Plane, x: number, y: number) {
  const r = Math.max(0.5, y - HORIZON);
  return { u: (x - CX) / (r * Q) + pl.at * RW, w: pl.dw - (C / r - E) };
}

/** La houle : une longue vague qui vient du large, deux plus courtes en biais, et des rides. */
const WAVES = [
  { ku: 0.06, kw: 0.52, a: 0.3, om: 1.3, ph: 0 },
  { ku: -0.34, kw: 0.62, a: 0.13, om: 1.65, ph: 1.3 },
  { ku: 0.85, kw: 0.42, a: 0.07, om: 2.1, ph: 2.7 },
  { ku: 0.3, kw: 1.55, a: 0.035, om: 3, ph: 4.1 },
  { ku: -1.4, kw: 1.1, a: 0.02, om: 3.6, ph: 0.6 },
];

/** La hauteur de l'eau (en mètres) en un point, à un instant. */
export function heightAt(u: number, w: number, t: number) {
  let h = 0;
  for (const v of WAVES) h += v.a * Math.sin(v.ku * u + v.kw * w - v.om * t + v.ph);
  return h;
}

export const SEA: Record<TimeOfDay, [string, string]> = { day: ['#a6d2ea', '#2a78b2'], evening: ['#f0a88a', '#3e3470'], night: ['#28335e', '#0d1734'] };
const SKY_REFL: Record<TimeOfDay, string> = { day: '#dcedf7', evening: '#ffb77a', night: '#3a4a7a' };
const GLINT: Record<TimeOfDay, string> = { day: '#ffffff', evening: '#ffe0b0', night: '#dfe6ff' };
const REFL: Record<TimeOfDay, string> = { day: '#7c7466', evening: '#4a3446', night: '#141a30' };
/** Une trame 4 × 4 : les tons se mélangent par petits points, sans traits. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => b / 16 - 0.47);

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const pack = (c: number[]) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
const blend = (a: number, b: number[], k: number) => {
  const r = a & 255, g = (a >> 8) & 255, bl = (a >> 16) & 255;
  return (255 << 24) | (Math.round(bl + (b[2] - bl) * k) << 16) | (Math.round(g + (b[1] - g) * k) << 8) | Math.round(r + (b[0] - r) * k);
};

export class WaterShader {
  private rows = H - HORIZON - 1;
  private canvas = makeCanvas(W, this.rows);
  private g = g2d(this.canvas);
  private img = this.g.createImageData(W, this.rows);
  private buf = new Uint32Array(this.img.data.buffer);
  /** les tons de chaque rang (du plus sombre au plus clair), l'écume, le reflet du soleil */
  private pal: Uint32Array[] = [];
  private palTod: TimeOfDay | null = null;
  private foam = 0;
  private glint = 0;
  private refl = [0, 0, 0];

  private palette(tod: TimeOfDay) {
    const [far, near] = SEA[tod];
    const deep = mix(near, '#000018', 0.4), sky = SKY_REFL[tod];
    this.pal = [];
    for (let r = 1; r <= this.rows; r++) {
      const base = mix(far, near, Math.pow(r / (H - HORIZON), 0.55));
      this.pal.push(new Uint32Array([mix(base, deep, 0.32), mix(base, deep, 0.15), base, mix(base, sky, 0.2), mix(base, sky, 0.42)].map((c) => pack(rgb(c)))));
    }
    this.foam = pack(rgb(tod === 'night' ? '#b8c4e8' : '#ffffff'));
    this.glint = pack(rgb(GLINT[tod]));
    this.refl = rgb(REFL[tod]);
    this.palTod = tod;
  }

  /** L'eau de cette image. `tops` : le haut de la falaise par colonne (0 hors de l'île), `base` : son pied. */
  render(pl: Plane, t: number, tod: TimeOfDay, sunX: number, tops: Int16Array, base: number) {
    if (this.palTod !== tod) this.palette(tod);
    const buf = this.buf, n = WAVES.length;
    const cw = new Float64Array(n), cu = new Float64Array(n), ca = new Float64Array(n);
    const s = new Float64Array(n), c = new Float64Array(n), sb = new Float64Array(n), cb = new Float64Array(n);
    const sunGlow = tod === 'night' ? 0.7 : 1;
    for (let r = 1; r <= this.rows; r++) {
      const y = HORIZON + r, row = (r - 1) * W, tones = this.pal[r - 1];
      const d = C / r, w = pl.dw - (d - E);
      const du = 1 / (r * Q), dw = C / (r * r);
      const u0 = -CX * du + pl.at * RW;
      // les vagues trop fines pour ce rang (au loin) s'effacent, sinon elles feraient du bruit
      for (let i = 0; i < n; i++) {
        const v = WAVES[i];
        const att = Math.exp(-0.5 * ((v.kw * dw) ** 2 + (v.ku * du) ** 2));
        cw[i] = v.a * att * v.kw; cu[i] = v.a * att * v.ku; ca[i] = v.a * att;
        const p0 = v.ku * u0 + v.kw * w - v.om * t + v.ph, st = v.ku * du;
        s[i] = Math.sin(p0); c[i] = Math.cos(p0); sb[i] = Math.sin(st); cb[i] = Math.cos(st);
      }
      const near = r / this.rows;
      const glintW = 3 + r * 0.25;
      const under = y > base;
      for (let x = 0; x < W; x++) {
        let slope = 0, side = 0, h = 0;
        for (let i = 0; i < n; i++) {
          slope += cw[i] * c[i]; side += cu[i] * c[i]; h += ca[i] * s[i];
          const ns = s[i] * cb[i] + c[i] * sb[i];
          c[i] = c[i] * cb[i] - s[i] * sb[i]; s[i] = ns;
        }
        if (!under && tops[x]) { buf[row + x] = 0; continue; }
        const dith = BAYER[(y & 3) * 4 + (x & 3)];
        const T = (slope + side * 0.25) / 0.1 + dith;
        let col = tones[T < -1.5 ? 0 : T < -0.5 ? 1 : T < 0.5 ? 2 : T < 1.5 ? 3 : 4];
        // la colonne du soleil (ou de la lune) scintille sur les pentes qui le regardent
        const gx = (x - sunX) / glintW;
        if (gx * gx < 4 && dith > 0.1 && T * Math.exp(-gx * gx) * sunGlow > 1.9) col = this.glint;
        // un peu d'écume, en points, sur les plus hautes crêtes, près de nous
        else if (near > 0.45 && h > 0.42 && T > 1.4 && dith > 0.25) col = this.foam;
        // le reflet de la falaise, cassé par les vagues
        if (under) {
          const xr = Math.round(x + side * 30);
          const top = xr >= 0 && xr < W ? tops[xr] : 0;
          if (top) {
            const rh = (base - top) * 0.55, k = y - base;
            if (k < rh) col = blend(col, this.refl, 0.55 * (1 - k / rh));
          }
        }
        buf[row + x] = col;
      }
    }
    this.g.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}
