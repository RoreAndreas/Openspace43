// Nessie corail, en pixel art, le même en mer, depuis la falaise et dans la pêche : dessiné à l'échelle 1 (puis posé ×1 ou ×2).
import { mix, rect, type G } from './pixels.ts';

/** Rose corail, le ventre crème, des branchies en plumeau ; la nuit, les couleurs s'assombrissent (sauf l'œil). */
const NESSIE = { body: '#e88a8a', dark: '#c0606a', hi: '#ffb0a8', belly: '#fff0dc', spot: '#ffc8b8', gill: '#ff6a9a', gillHi: '#ffb0d0', eye: '#141a28', blush: '#ff6a8a' };
type Palette = typeof NESSIE;
const NESSIE_NIGHT: Palette = Object.fromEntries(Object.entries(NESSIE).map(([k, c]) => [k, k === 'eye' ? c : mix(c, '#0b1230', 0.32)])) as Palette;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Nessie, à l'échelle 1, sa ligne d'eau en (x, wl) : deux bosses qui ondulent et le bout de la queue qui frétille,
 *  derrière ; la nageoire qui pagaie ; le long cou en S, qui se tend vers la barque quand il est curieux ; la tête ronde,
 *  le museau, la mâchoire crème, l'œil doux, les branchies en plumeau. `sub` : combien il est encore sous l'eau (0 : sorti).
 *  Il reste toujours dans l'eau. */
export function paintNessie(g: G, x: number, wl: number, look: number, t: number, o: { night: boolean; sub: number; flap: number; curious?: number }) {
  const c = o.night ? NESSIE_NIGHT : NESSIE;
  // il remonte : tout est décalé vers le bas, et ce qui est sous la ligne d'eau ne se dessine pas
  const sink = Math.round(clamp(o.sub, 0, 1) * 34);
  const fill = (x0: number, y0: number, w: number, hh: number, col: string) => {
    const ya = Math.round(y0 + sink), yb = Math.min(Math.round(y0 + sink + hh), wl + 1);
    if (yb > ya && w > 0) rect(g, x0, ya, w, yb - ya, col);
  };
  const dot = (x0: number, y0: number, col: string) => fill(x0, y0, 1, 1, col);
  const breath = Math.round(Math.sin(t * 1.1) * 0.6);
  const base = wl + breath;
  const curious = o.curious ?? 0;
  // un dôme (une bosse) : le dessus plus clair, des taches
  const dome = (cx: number, r: number, h: number) => {
    for (let k = -r; k <= r; k++) {
      const hh = Math.round(h * Math.sqrt(Math.max(0, 1 - (k / (r + 0.5)) ** 2)));
      if (hh <= 0) continue;
      fill(cx + k, base - hh + 1, 1, hh, k * look > 0 ? c.body : c.dark);
      dot(cx + k, base - hh + 1, c.hi);
      if ((k + 40) % 4 === 1 && hh > 3) dot(cx + k, base - hh + 3, c.spot);
    }
  };
  // deux bosses qui ondulent l'une après l'autre, et le bout de la queue qui frétille
  dome(x - look * 10, 7, 6 + Math.round(Math.sin(t * 1.6) * 1.5));
  dome(x - look * 23, 6, 5 + Math.round(Math.sin(t * 1.6 - 1.3) * 1.5));
  const tw = Math.round(Math.sin(t * 3) * 1.5);
  for (let i = 0; i < 5; i++) fill(x - look * (32 + i), base - i - 1 + (i > 2 ? tw : 0), 2, 1, i < 3 ? c.dark : c.body);
  // le cou : épais à la base, il monte en S ; il se tend vers la barque quand Nessie est curieux
  const nx0 = x + look * 3, ny0 = base;
  const N = 28, lean = 3 + curious * 5;
  let hx = nx0, hy = ny0;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const nx = nx0 + look * (Math.sin(u * Math.PI * 0.85) * 3 + u * u * lean) + Math.round(Math.sin(t * 1.1 + u * 2.4) * 0.8 * u);
    const ny = ny0 - i + Math.round(u * u * curious * 3);
    const w = Math.round(5.5 * (1 - u * 0.45));
    fill(nx - w / 2, ny, w, 1, c.body);
    fill(look > 0 ? nx + w * 0.05 : nx - w * 0.45, ny, Math.max(1, Math.round(w * 0.4)), 1, c.belly);
    dot(look > 0 ? nx - w / 2 : nx + w / 2 - 1, ny, c.dark);
    hx = nx; hy = ny;
  }
  // la nageoire de devant, qui pagaie à la surface
  {
    const rx = x + look * 3, ry = base, len = 7, ang = -0.2 + 0.15 * o.flap;
    const tx = rx - look * len * 0.55 * Math.cos(ang), ty = ry - len * Math.sin(ang) + 2;
    for (let k = 0; k <= len; k++) {
      const q = k / len, w = Math.max(1, Math.round(2.5 * Math.sin(q * Math.PI)));
      fill(rx + (tx - rx) * q, ry + (ty - ry) * q - w / 2, w, w, k < 2 ? c.dark : c.body);
    }
  }
  // la tête : ronde, le museau vers la barque, la mâchoire crème, l'œil doux, les branchies ; elle se penche
  const tilt = Math.round(Math.sin(t * 0.5) * 0.8 + curious);
  const cx = hx + look * 2, cy = hy - 2 + tilt;
  for (let dy = -3; dy <= 3; dy++) { const w = Math.round(4.5 * Math.sqrt(Math.max(0, 1 - (dy / 3.3) ** 2))); fill(cx - w, cy + dy, w * 2 + 1, 1, c.body); }
  const sn = cx + look * 3;
  for (let dy = -2; dy <= 1; dy++) { const w = Math.round(2.8 * Math.sqrt(Math.max(0, 1 - (dy / 2.2) ** 2))); fill(look > 0 ? sn : sn - w, cy + dy + 1, w, 1, dy > 0 ? c.belly : c.body); }
  fill(look > 0 ? cx - 1 : cx - 4, cy + 2, 6, 1, c.belly);
  dot(look > 0 ? sn + 2 : sn - 3, cy + 1, c.dark);
  dot(cx - look, cy + 1, c.blush);
  // les branchies en plumeau, derrière la tête : trois de chaque côté, qui ondulent (celles d'en face, plus sombres)
  for (const [far, dx0] of [[true, 1], [false, 0]] as [boolean, number][]) {
    [[-3, 0], [-1, 1], [1, 2]].forEach(([gy, ph]) => {
      const wig = Math.round(Math.sin(t * 3 + ph) * 0.6);
      for (let k = 0; k < 3; k++) dot(cx - look * (4 + k + dx0), cy + gy - Math.round(k * 0.6) + (far ? -1 : 0) + (k === 2 ? wig : 0), far ? c.dark : c.gill);
      dot(cx - look * (7 + dx0), cy + gy - 2 + (far ? -1 : 0) + wig, far ? c.gill : c.gillHi);
    });
  }
  const ex = Math.round(cx + look * 1.5), ey = Math.round(cy - 1);
  if ((t % 4.6) < 0.14) fill(ex - 1, ey, 2, 1, c.eye);
  else { fill(ex - 1, ey - 1, 2, 2, c.eye); dot(ex - 1, ey - 1, '#ffffff'); }
  return { x: ex, y: ey + sink };
}

