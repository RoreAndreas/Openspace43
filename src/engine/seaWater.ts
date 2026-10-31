// L'eau de la mer. Le plan d'eau a sa perspective (`toScreen`, `toWater`) : la barque, le ponton, les remous et les
// rangs de vagues y sont posés, en mètres. La houle arrive en rangs de crêtes qui avancent vers nous (`Swell`) ; chaque
// crête est une chaîne de ressorts (comme l'eau 2D des jeux en pixel art) : un coup de rame, la barque qui retombe, un
// poisson ou le monstre y lancent une onde qui court le long de la vague, rebondit sur ses voisines et s'amortit.
import { WIDE } from './layout.ts';
import type { TimeOfDay } from './room.ts';

const CX = WIDE / 2;
export const HORIZON = 112;
/** La ligne d'eau de la barque. */
export const BOAT_Y = 208;
/** La perspective : un point à `f` mètres devant la barque tombe à HORIZON + C / (f + E) ; de côté, un mètre y fait
 *  (y − HORIZON) × Q pixels. À la barque : 17 pixels par mètre de côté, environ 13 en profondeur. */
export const E = 7, C = (BOAT_Y - 2 - HORIZON) * E, Q = 17 / (BOAT_Y - 2 - HORIZON);
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

/** La houle : l'écart entre deux crêtes, leur vitesse vers nous, leur hauteur ; les crêtes ondulent un peu. */
export const LAMBDA = 3.4;
const SPEED = 1.25, AMP = 0.2, WOB = 0.35;
/** Comment ondule la crête `k`, le long de la vague. */
export const wobble = (u: number, k: number, t: number) => Math.sin(0.55 * u + 0.5 * t + k * 2.1) * 0.7 + Math.sin(1.4 * u - 0.35 * t + k * 0.7) * 0.3;
/** Où passe la crête `k` (sa distance au pied de la falaise), sans ses remous. */
export const crestW = (k: number, u: number, t: number) => (k - (WOB * wobble(u, k, t)) / (Math.PI * 2)) * LAMBDA + t * SPEED;
/** La crête la plus proche d'un point. */
export const crestAt = (w: number, t: number) => Math.round((w - t * SPEED) / LAMBDA);
/** Les rangs visibles, du plus loin au plus près, pour un plan d'eau. */
export function crestRange(pl: Plane, t: number) {
  return { from: Math.ceil((pl.dw - 300 - t * SPEED) / LAMBDA), to: Math.floor((pl.dw + E - 3.5 - t * SPEED) / LAMBDA) };
}

/** Une chaîne de ressorts le long d'une crête : un nœud tous les DU mètres (en anneau). */
const DU = 0.5, N = 512;
interface Chain { h: Float32Array; v: Float32Array; calm: number }
const idx = (u: number) => ((Math.floor(u / DU) % N) + N) % N;

export class Swell {
  private chains = new Map<number, Chain>();
  private acc = 0;
  private delta = new Float32Array(N);

  /** La hauteur de l'eau (en mètres) en un point : la houle, et les remous de la crête la plus proche. */
  heightAt(u: number, w: number, t: number) {
    const x = (w - t * SPEED) / LAMBDA, k = Math.round(x);
    const ph = (x - k) * Math.PI * 2 + WOB * wobble(u, k, t);
    return AMP * Math.cos(ph) + this.ripple(k, u) * (0.5 + 0.5 * Math.cos(ph));
  }

  /** Les remous d'une crête, à cet endroit (en mètres). */
  ripple(k: number, u: number) {
    const c = this.chains.get(k);
    if (!c) return 0;
    const f = u / DU - Math.floor(u / DU), i = idx(u);
    return c.h[i] * (1 - f) + c.h[(i + 1) % N] * f;
  }

  /** Lance une onde : `dv` (mètres par pas, négatif vers le bas) autour de (u, w), sur la crête la plus proche et un
   *  peu sur ses voisines. */
  disturb(u: number, w: number, t: number, dv: number, radius = 0.8) {
    const k0 = crestAt(w, t);
    for (const [dk, wt] of [[0, 1], [-1, 0.35], [1, 0.35]] as [number, number][]) {
      let c = this.chains.get(k0 + dk);
      if (!c) { c = { h: new Float32Array(N), v: new Float32Array(N), calm: 0 }; this.chains.set(k0 + dk, c); }
      c.calm = 0;
      const n = Math.ceil(radius / DU);
      for (let j = -n; j <= n; j++) {
        const q = (j * DU) / radius;
        c.v[idx(u + j * DU)] += dv * wt * Math.exp(-q * q * 2);
      }
    }
  }

  /** Fait vivre les ressorts (à 60 pas par seconde) ; oublie les crêtes calmées ou sorties de la vue. */
  step(dt: number, pl: Plane, t: number) {
    const { from, to } = crestRange(pl, t);
    for (const k of this.chains.keys()) if (k < from - 2 || k > to + 2) this.chains.delete(k);
    this.acc = Math.min(this.acc + dt, 4 / 60);
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      for (const [k, c] of this.chains) {
        const { h, v } = c;
        let energy = 0;
        // chaque nœud est un ressort qui revient au repos, en perdant un peu d'élan
        for (let i = 0; i < N; i++) { v[i] += -0.03 * h[i] - 0.035 * v[i]; h[i] += v[i]; energy += Math.abs(h[i]) + Math.abs(v[i]); }
        // et il tire ses voisins : l'onde court le long de la crête
        const d = this.delta;
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 0; i < N; i++) d[i] = 0.06 * (h[(i + N - 1) % N] - h[i]) + 0.06 * (h[(i + 1) % N] - h[i]);
          for (let i = 0; i < N; i++) { v[i] += d[i]; h[i] += d[i] * 0.5; }
        }
        if (energy < 0.002) { if (++c.calm > 30) this.chains.delete(k); } else c.calm = 0;
      }
    }
  }
}

export const SEA: Record<TimeOfDay, [string, string]> = { day: ['#a6d2ea', '#2a78b2'], evening: ['#f0a88a', '#3e3470'], night: ['#28335e', '#0d1734'] };
