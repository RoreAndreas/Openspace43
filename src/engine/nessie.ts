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
/** `open` : la gueule ouverte (0 à 1) ; `happy` : les yeux fermés de plaisir ; `shut` : les yeux fermés (il somnole) ; `up` : il
 *  lève les yeux ; `gulp` : la bouchée qui descend le long du cou (de 0, la tête, à 1, la base) ; `nod` : la tête qui suit le
 *  cou avec un peu de retard (en pixels) ; `size` : sa taille, dessinée au pixel près (1 en mer, plus grand dans la pêche).
 *  Renvoie l'œil et la bouche, dans le canevas. */
export function paintNessie(g: G, x: number, wl: number, look: number, t: number, o: { night: boolean; sub: number; flap: number; curious?: number; open?: number; happy?: boolean; shut?: boolean; up?: boolean; gulp?: number; nod?: number; size?: number }) {
  const c = o.night ? NESSIE_NIGHT : NESSIE;
  const K = o.size ?? 1, R = (v: number) => Math.round(v * K);
  // il remonte : tout est décalé vers le bas, et ce qui est sous la ligne d'eau ne se dessine pas
  const sink = Math.round(clamp(o.sub, 0, 1.25) * 36 * K);
  const fill = (x0: number, y0: number, w: number, hh: number, col: string) => {
    const ya = Math.round(y0 + sink), yb = Math.min(Math.round(y0 + sink + hh), wl + 1);
    if (yb > ya && w > 0) rect(g, Math.round(x0), ya, Math.round(w), yb - ya, col);
  };
  const dot = (x0: number, y0: number, col: string) => fill(x0, y0, 1, 1, col);
  const breath = Math.round(Math.sin(t * 1.1) * 0.6 * K);
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
  dome(x - look * R(10), R(7), Math.round((6 + Math.sin(t * 1.6) * 1.5) * K));
  dome(x - look * R(23), R(6), Math.round((5 + Math.sin(t * 1.6 - 1.3) * 1.5) * K));
  const tw = Math.round(Math.sin(t * 3) * 1.5 * K);
  for (let i = 0; i < R(5); i++) fill(x - look * (R(32) + i), base - Math.round(i / K) - 1 + (i > R(2) ? tw : 0), R(2), 1, i < R(3) ? c.dark : c.body);
  // le cou : épais à la base, il monte en S ; il se tend vers la barque quand Nessie est curieux ; il ondule doucement,
  // en deux mouvements qui ne se répètent pas pareil (il respire, il se balance)
  const nx0 = x + look * R(3), ny0 = base;
  const N = R(28), lean = (3 + curious * 5) * K;
  let hx = nx0, hy = ny0;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const sway = (Math.sin(t * 1.1 + u * 2.4) * 0.8 + Math.sin(t * 0.63 + u * 1.3 + 1) * 0.6) * K * u;
    const nx = nx0 + look * (Math.sin(u * Math.PI * 0.85) * 3 * K + u * u * lean) + Math.round(sway);
    const ny = ny0 - i + Math.round(u * u * curious * 3 * K);
    // (la bouchée qu'il avale gonfle le cou en descendant)
    const lump = o.gulp !== undefined && o.gulp >= 0 && o.gulp <= 1 && Math.abs(u - (1 - o.gulp)) < 0.07 ? R(2) : 0;
    const w = Math.round(5.5 * K * (1 - u * 0.45)) + lump;
    fill(nx - w / 2, ny, w, 1, c.body);
    fill(look > 0 ? nx + w * 0.05 : nx - w * 0.45, ny, Math.max(1, Math.round(w * 0.4)), 1, c.belly);
    dot(look > 0 ? nx - w / 2 : nx + w / 2 - 1, ny, c.dark);
    hx = nx; hy = ny;
  }
  // la nageoire de devant, qui pagaie à la surface
  {
    const rx = x + look * R(3), ry = base, len = R(7), ang = -0.2 + 0.15 * o.flap;
    const tx = rx - look * len * 0.55 * Math.cos(ang), ty = ry - len * Math.sin(ang) + 2;
    for (let k = 0; k <= len; k++) {
      const q = k / len, w = Math.max(1, Math.round(2.5 * K * Math.sin(q * Math.PI)));
      fill(rx + (tx - rx) * q, ry + (ty - ry) * q - w / 2, w, w, k < 2 ? c.dark : c.body);
    }
  }
  // la tête : ronde, le museau vers la barque, la mâchoire crème, l'œil doux, les branchies ; elle se penche, et suit le
  // cou avec un peu de retard
  const tilt = Math.round(Math.sin(t * 0.5) * 0.8 * K + curious * K + (o.nod ?? 0));
  const cx = hx + look * R(2), cy = hy - R(2) + tilt;
  const hr = 3 * K;
  for (let dy = -Math.round(hr); dy <= Math.round(hr); dy++) { const w = Math.round(4.5 * K * Math.sqrt(Math.max(0, 1 - (dy / (hr + 0.3)) ** 2))); fill(cx - w, cy + dy, w * 2 + 1, 1, c.body); }
  const sn = cx + look * R(3);
  for (let dy = -R(2); dy <= R(1); dy++) { const w = Math.round(2.8 * K * Math.sqrt(Math.max(0, 1 - (dy / (2.2 * K)) ** 2))); fill(look > 0 ? sn : sn - w, cy + dy + 1, w, 1, dy > 0 ? c.belly : c.body); }
  // la gueule : fermée, un trait ; ouverte, la mâchoire crème descend et on voit dedans (rose sombre, la langue)
  const gape = Math.round(Math.max(0, Math.min(1, o.open ?? 0)) * 3 * K);
  const jx = look > 0 ? cx - 1 : cx - R(4);
  if (gape > 0) {
    const mx = look > 0 ? sn - 1 : sn - R(3);
    fill(mx, cy + 1, R(4), gape, '#5a1a2a');
    dot(look > 0 ? mx + 1 : mx + R(2), cy + gape, '#e86a8a');
    fill(jx, cy + R(2) + gape, R(7), 1, c.belly);
    fill(jx, cy + R(2) + gape + 1, R(6), 1, c.dark);
  } else {
    fill(jx, cy + R(2), R(6), 1, c.belly);
    dot(look > 0 ? sn + R(2) : sn - R(3), cy + 1, c.dark);
  }
  dot(cx - look * K, cy + K, c.blush);
  // les branchies en plumeau, derrière la tête : trois de chaque côté, qui ondulent (celles d'en face, plus sombres)
  for (const [far, dx0] of [[true, 1], [false, 0]] as [boolean, number][]) {
    [[-3, 0], [-1, 1], [1, 2]].forEach(([gy, ph]) => {
      const wig = Math.round(Math.sin(t * 3 + ph) * 0.6 * K);
      for (let k = 0; k < R(3); k++) dot(cx - look * (R(4) + k + dx0), cy + R(gy) - Math.round(k * 0.6) + (far ? -1 : 0) + (k === R(3) - 1 ? wig : 0), far ? c.dark : c.gill);
      dot(cx - look * (R(7) + dx0), cy + R(gy) - R(2) + (far ? -1 : 0) + wig, far ? c.gill : c.gillHi);
    });
  }
  // l'œil : doux, avec un reflet ; il cligne ; fermé de plaisir (^), fermé (il somnole), levé vers le ciel
  const ex = Math.round(cx + look * 1.5 * K), ey = Math.round(cy - K), es = K >= 1.5 ? 3 : 2;
  if (o.happy) { dot(ex - 1, ey, c.eye); dot(ex, ey - 1, c.eye); dot(ex + 1, ey, c.eye); dot(cx - look * 2 * K, cy + 1, c.blush); }
  else if (o.shut || (t % 4.6) < 0.14) fill(ex - 1, ey, es, 1, c.eye);
  else { const ue = o.up ? 1 : 0; fill(ex - 1, ey - 1 - ue, es, es, c.eye); dot(ex - 1 + (look < 0 ? 0 : es - 1), ey - 1 - ue, '#ffffff'); }
  return { x: ex, y: ey + sink, mx: look > 0 ? sn + R(3) : sn - R(3), my: cy + 1 + sink };
}
