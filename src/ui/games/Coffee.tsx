// La machine à café de la Pause : « Le café parfait ». Roré choisit son café sur le tableau (espresso, cappuccino, latte,
// chocolat…), puis le prépare, couche après couche : tenir Espace (ou le clic) fait couler, lâcher pile au trait. La
// machine a ses hoquets, quelques gouttes tombent encore après qu'on a lâché. Chaque boisson réussie entre dans le livre des
// cafés (la bibliothèque de la Pause), avec ses étoiles. Un café parfait : Roré a le plein d'énergie au bureau.
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx.ts';
import { pixelText, textWidth } from '../../engine/font.ts';
import { world } from '../../engine/instance.ts';
import { loadScores, saveScores, useKeys, useLoop } from './common.ts';

const W = 256, H = 144;
const COUNTER = 98;

type Liquid = 'cafe' | 'lait' | 'mousse' | 'choco';
export type Drink = 'espresso' | 'ristretto' | 'noisette' | 'allonge' | 'cappuccino' | 'latte' | 'mocha' | 'chocolat';
type Glass = 'petit' | 'tasse' | 'mug' | 'grand';
interface Layer { what: Liquid; to: number }
/** Les cafés du tableau : le verre, les couches (jusqu'où chacune monte, de 0 à 1), ce qu'on en dit */
export const DRINKS: Record<Drink, { name: string; glass: Glass; layers: Layer[]; desc: string; fact: string }> = {
  espresso: { name: 'Espresso', glass: 'petit', layers: [{ what: 'cafe', to: 0.55 }], desc: 'Court et serré, une crema dorée dessus.', fact: 'En Italie, on le boit debout au comptoir, en trois gorgées.' },
  ristretto: { name: 'Ristretto', glass: 'petit', layers: [{ what: 'cafe', to: 0.32 }], desc: 'Encore plus court : l’essence du café.', fact: 'Ristretto veut dire « restreint » : moins d’eau, plus de goût.' },
  noisette: { name: 'Noisette', glass: 'petit', layers: [{ what: 'cafe', to: 0.45 }, { what: 'lait', to: 0.62 }], desc: 'Un espresso et une goutte de lait : couleur noisette.', fact: 'Le nom vient de sa couleur, pas d’un goût de noisette.' },
  allonge: { name: 'Allongé', glass: 'tasse', layers: [{ what: 'cafe', to: 0.8 }], desc: 'Un espresso qu’on laisse couler plus longtemps.', fact: 'Plus long qu’un espresso, mais pas autant qu’un café filtre.' },
  cappuccino: { name: 'Cappuccino', glass: 'tasse', layers: [{ what: 'cafe', to: 0.33 }, { what: 'lait', to: 0.62 }, { what: 'mousse', to: 0.9 }], desc: 'Un tiers de café, un tiers de lait, un tiers de mousse.', fact: 'Son nom vient de la couleur de la robe des moines capucins.' },
  latte: { name: 'Latte', glass: 'grand', layers: [{ what: 'cafe', to: 0.2 }, { what: 'lait', to: 0.78 }, { what: 'mousse', to: 0.9 }], desc: 'Beaucoup de lait, une fine couche de mousse.', fact: 'Latte veut juste dire « lait » en italien : en Italie, demande un caffè latte.' },
  mocha: { name: 'Mocha', glass: 'grand', layers: [{ what: 'choco', to: 0.22 }, { what: 'cafe', to: 0.48 }, { what: 'lait', to: 0.85 }], desc: 'Chocolat, café et lait : le dessert des matins difficiles.', fact: 'Il tient son nom du port de Moka, au Yémen, d’où partait le café.' },
  chocolat: { name: 'Chocolat chaud', glass: 'mug', layers: [{ what: 'choco', to: 0.82 }], desc: 'Épais et doux, le préféré de Boulon.', fact: 'Les Aztèques le buvaient froid, épicé et sans sucre.' },
};
export const DRINK_LIST = Object.keys(DRINKS) as Drink[];
const LIQ: Record<Liquid, { col: string; top: string; name: string }> = {
  cafe: { col: '#4a2614', top: '#c88a50', name: 'LE CAFE' },
  lait: { col: '#efe2cc', top: '#fff8ea', name: 'LE LAIT' },
  mousse: { col: '#fffaf0', top: '#ffffff', name: 'LA MOUSSE' },
  choco: { col: '#6b3a1e', top: '#8a5030', name: 'LE CHOCOLAT' },
};
/** La forme de chaque verre : largeur, hauteur, une anse */
const GLASS: Record<Glass, { w: number; h: number; handle: boolean }> = {
  petit: { w: 14, h: 15, handle: false }, tasse: { w: 20, h: 18, handle: true }, mug: { w: 20, h: 24, handle: true }, grand: { w: 16, h: 30, handle: false },
};

/** Un verre (on voit les couches à travers), posé par son pied en (x, y) : `fills` = où en est chaque couche (0 à 1). */
export function drawGlass(g: CanvasRenderingContext2D, drink: Drink, x: number, y: number, fills: number[], marks = false, current = -1, t = 0) {
  const d = DRINKS[drink], gl = GLASS[d.glass];
  const r = (xx: number, yy: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(xx), Math.round(yy), Math.round(w), Math.round(h)); };
  const x0 = Math.round(x - gl.w / 2), y0 = y - gl.h, inner = gl.h - 3;
  // le fond du verre, la vitre, puis les couches
  r(x0 - 1, y0 - 1, gl.w + 2, gl.h + 2, '#1a1822');
  r(x0, y0, gl.w, gl.h, 'rgba(200,226,240,0.28)');
  let prev = 0;
  d.layers.forEach((L, i) => {
    const lv = Math.min(1, fills[i] ?? 0);
    if (lv <= prev) return;
    const a = Math.round(prev * inner), b = Math.round(lv * inner);
    if (b > a) {
      r(x0 + 1, y + -2 - b, gl.w - 2, b - a, LIQ[L.what].col);
      if (L.what === 'mousse') for (let k = 0; k < (gl.w - 2) * (b - a) / 6; k++) r(x0 + 1 + ((k * 7) % (gl.w - 2)), y - 2 - a - 1 - ((k * 3) % Math.max(1, b - a)), 1, 1, '#e8dcc6');
      r(x0 + 1, y - 2 - b, gl.w - 2, 1, LIQ[L.what].top);
    }
    prev = lv;
  });
  // les reflets de la vitre, le bord, le pied
  r(x0 + 1, y0 + 1, 1, gl.h - 3, 'rgba(255,255,255,0.55)');
  r(x0 + 3, y0 + 1, 1, Math.round(gl.h * 0.35), 'rgba(255,255,255,0.3)');
  r(x0 - 1, y0 - 1, gl.w + 2, 1, '#d8eef8');
  r(x0, y - 2, gl.w, 2, 'rgba(220,236,246,0.6)');
  if (gl.handle) { r(x0 + gl.w + 1, y0 + 3, 4, gl.h - 8, '#1a1822'); r(x0 + gl.w + 1, y0 + 5, 2, gl.h - 12, 'rgba(200,226,240,0.4)'); }
  // les traits à atteindre (le prochain clignote ; ceux qui sont faits, en vert)
  if (marks) d.layers.forEach((L, i) => {
    const ly = Math.round(y - 2 - L.to * inner);
    const col = i < current ? '#3ddc97' : i === current ? (Math.floor(t * 6) % 2 ? '#ff5a4a' : '#ffffff') : '#a85a5a';
    r(x0 - 4, ly, 3, 1, col); r(x0 + gl.w + (gl.handle ? 6 : 1), ly, 3, 1, col);
  });
}

export function Coffee() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useKeys();
  const pointer = useRef(false);
  const s = useRef({
    phase: 'menu' as 'menu' | 'wait' | 'pour' | 'layer' | 'done',
    t: 0, pt: 0,
    drink: 'espresso' as Drink, li: 0, fills: [] as number[], grades: [] as number[], drip: 0,
    /** la machine a des hoquets : elle s'arrête, puis repart d'un coup */
    hiccup: 0, nextHiccup: 2,
    mark: '', markAt: -9, spill: false,
    drops: [] as { x: number; y: number; vy: number; col: string }[],
    steam: [] as { x: number; y: number; t0: number }[],
  });
  const [hud, setHud] = useState({ phase: 'menu', drink: 'espresso' as Drink, stars: 0, boost: false, book: loadScores().cafes });
  if (import.meta.env.DEV) (window as unknown as { __coffee?: unknown }).__coffee = s.current;

  /** on choisit son café au tableau */
  const choose = (d: Drink) => {
    const st = s.current;
    Object.assign(st, { drink: d, li: 0, fills: DRINKS[d].layers.map(() => 0), grades: [], phase: 'wait', pt: 0, mark: '', spill: false, drip: 0 });
    setHud((h) => ({ ...h, phase: 'play', drink: d }));
    sfx('open');
  };
  const menu = () => { s.current.phase = 'menu'; setHud((h) => ({ ...h, phase: 'menu' })); };

  /** on a lâché (ou ça déborde) : la couche est jugée ; à la dernière, la tasse */
  const judgeLayer = () => {
    const st = s.current, d = DRINKS[st.drink], L = d.layers[st.li];
    const lv = st.fills[st.li], diff = Math.abs(lv - L.to);
    const grade = st.spill ? 0 : diff <= 0.025 ? 3 : diff <= 0.06 ? 2 : 1;
    st.grades.push(grade);
    st.mark = st.spill ? 'CA DEBORDE !' : grade === 3 ? 'PARFAIT !' : grade === 2 ? 'BIEN' : lv < L.to ? 'PAS ASSEZ...' : 'TROP !';
    st.markAt = st.t;
    sfx(grade === 3 ? 'check' : grade === 2 ? 'tick' : 'no', grade === 3 ? 1.25 : 1);
    if (st.spill || st.li + 1 >= d.layers.length) { st.phase = 'layer'; st.pt = -0.6; st.li = d.layers.length; return; }
    st.li++;
    // la couche suivante part de là où s'est arrêtée la précédente
    st.fills[st.li] = lv;
    st.phase = 'layer'; st.pt = 0;
  };
  const finishCup = () => {
    const st = s.current;
    st.phase = 'done';
    const stars = st.spill ? 0 : Math.round(st.grades.reduce((a, b) => a + b, 0) / st.grades.length);
    const sc = loadScores();
    if (stars > 0) sc.cafes = { ...sc.cafes, [st.drink]: Math.max(sc.cafes[st.drink] ?? 0, stars) };
    saveScores(sc);
    // un café parfait : Roré a le plein d'énergie au bureau pendant dix minutes
    const boost = stars === 3;
    if (boost) world.coffeeUntil = world.time + 600;
    setHud((h) => ({ ...h, phase: 'done', stars, boost, book: sc.cafes }));
    sfx(stars === 3 ? 'done' : stars > 0 ? 'check' : 'no');
  };

  const step = (dt: number) => {
    const st = s.current;
    keys.take();
    st.t += dt; st.pt += dt;
    const t = st.t;
    const holding = keys.held(' ', 'enter') || pointer.current;
    const d = DRINKS[st.drink];
    if (st.phase === 'wait' && st.pt > 0.4 && holding) { st.phase = 'pour'; st.pt = 0; st.drip = 0; sfx('pour'); }
    else if (st.phase === 'pour') {
      const L = d.layers[st.li];
      if (holding) {
        // ça coule, plus ou moins vite ; parfois la machine hoquette, puis repart d'un coup ; le lait et la mousse, plus doux
        if (t > st.nextHiccup && st.hiccup <= 0) { st.hiccup = 0.22 + Math.random() * 0.2; st.nextHiccup = t + 1.4 + Math.random() * 2.4; }
        const base = L.what === 'cafe' ? 0.26 : L.what === 'choco' ? 0.3 : 0.22;
        const rate = st.hiccup > 0 ? 0 : base * (1 + 0.35 * Math.sin(t * 6.5)) * (GLASS[d.glass].h > 22 ? 0.85 : 1.1);
        st.hiccup = Math.max(0, st.hiccup - dt);
        st.fills[st.li] = Math.min(1, st.fills[st.li] + rate * dt + (st.hiccup > 0 && st.hiccup < 0.04 ? 0.025 : 0));
        if (Math.random() < dt * 22) st.drops.push({ x: SPOUT.x + (Math.random() < 0.5 ? -1 : 1), y: SPOUT.y + 3, vy: 40, col: LIQ[L.what].col });
        if (st.fills[st.li] >= 1) { st.spill = true; judgeLayer(); }
      } else {
        // on a lâché : encore quelques gouttes
        st.drip += dt;
        st.fills[st.li] = Math.min(1, st.fills[st.li] + dt * 0.05);
        if (st.drip > 0.25) judgeLayer();
      }
    } else if (st.phase === 'layer' && st.pt > 0.9) {
      if (st.li >= d.layers.length) finishCup(); else { st.phase = 'wait'; st.pt = 0.2; }
    }
    for (const p of st.drops) { p.y += p.vy * dt; p.vy += 260 * dt; }
    st.drops = st.drops.filter((p) => p.y < COUNTER - 6);
    if (st.phase !== 'menu' && Math.random() < dt * (st.phase === 'done' ? 5 : 2)) st.steam.push({ x: SPOUT.x - 4 + Math.random() * 8, y: COUNTER - 30, t0: t });
    st.steam = st.steam.filter((p) => t - p.t0 < 1.6);
  };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    drawScene(g, s.current);
  };

  useLoop(step, draw, []);

  const d = DRINKS[hud.drink];
  return (
    <div className="game">
      <div className="game-screen"
        onPointerDown={(e) => { e.preventDefault(); pointer.current = true; }}
        onPointerUp={() => { pointer.current = false; }}
        onPointerLeave={() => { pointer.current = false; }}>
        <canvas ref={canvas} width={W} height={H} />
        {hud.phase === 'menu' && (
          <div className="game-over coffee-menu" onPointerDown={(e) => e.stopPropagation()}>
            <b>Quel café ?</b>
            <div className="coffee-cards">
              {DRINK_LIST.map((k) => (
                <button key={k} className="coffee-card" onClick={() => choose(k)}>
                  <GlassPic drink={k} />
                  <span>{DRINKS[k].name}</span>
                  <i className="stars">{'★'.repeat(hud.book[k] ?? 0)}<em>{'★'.repeat(3 - (hud.book[k] ?? 0))}</em></i>
                </button>
              ))}
            </div>
          </div>
        )}
        {hud.phase === 'done' && (
          <div className="game-over" onPointerDown={(e) => e.stopPropagation()}>
            <b>{hud.stars === 3 ? `${d.name} parfait !` : hud.stars > 0 ? d.name : 'Oups, ça déborde…'}</b>
            <span className="coffee-stars">{'★'.repeat(hud.stars)}<em>{'★'.repeat(3 - hud.stars)}</em></span>
            {hud.stars > 0 && <span className="muted">Rangé dans le livre des cafés, à la bibliothèque de la Pause.</span>}
            {hud.boost && <span>☕ Un café parfait : la tasse fumante attend Roré sur son bureau, et il file plus vite pendant dix minutes.</span>}
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); menu(); }}>Un autre café</button>
          </div>
        )}
      </div>
      <p className="small muted">Choisis ton café. Tiens Espace (ou le clic) pour faire couler, lâche au trait, couche après couche. Lâche un peu avant : quelques gouttes tombent encore.</p>
    </div>
  );
}

/** Le dessin d'un café, pour le tableau et le livre des cafés (plein, ou en silhouette s'il n'a jamais été fait). */
export function GlassPic({ drink, unknown = false }: { drink: Drink; unknown?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    drawGlass(g, drink, 18, 36, DRINKS[drink].layers.map((L) => L.to));
    if (unknown) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#2c2a3a'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
  }, [drink, unknown]);
  return <canvas ref={ref} width={40} height={40} />;
}

/** Le bec de la machine (le café tombe de là) */
const SPOUT = { x: 104, y: 60 };

/** La cuisine de la Pause, de près, dans ses couleurs : la crédence carrelée, les placards verts, le tableau du menu, le
 *  plan de travail ; la machine à café (sombre, comme dans la Pause), la tasse sous le bec, les mugs, la petite plante. */
function drawScene(g: CanvasRenderingContext2D, st: { phase: string; t: number; drink: Drink; li: number; fills: number[]; drops: { x: number; y: number; col: string }[]; steam: { x: number; y: number; t0: number }[]; mark: string; markAt: number; hiccup: number }) {
  const t = st.t;
  const r = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // la crédence : carreaux blancs et joints lilas
  r(0, 0, W, COUNTER, '#e9e5ef');
  for (let x = 0; x < W; x += 12) r(x, 0, 1, COUNTER, '#d6d1de');
  for (let y = 0; y < COUNTER; y += 12) r(0, y, W, 1, '#d6d1de');
  // les placards du haut (verts, comme dans la Pause)
  r(0, 0, 156, 24, '#5f8f7a'); r(0, 23, 156, 2, '#466e5d'); r(0, 0, 156, 1, '#7fb39c');
  for (let x = 0; x < 156; x += 39) { r(x + 38, 1, 1, 22, '#466e5d'); r(x + 16, 17, 7, 2, '#c9cfd8'); }
  // le tableau du menu, à droite
  r(166, 6, 82, 70, '#8a5530'); r(168, 8, 78, 66, '#2b3a32');
  pixelText(g, 'MENU', 194, 12, '#f6f2e9');
  ['ESPRESSO', 'CAPPUCCINO', 'LATTE', 'MOCHA', 'CHOCOLAT'].forEach((w, i) => { pixelText(g, w, 174, 24 + i * 9, '#a8c7b5'); r(174 + textWidth(w) + 3, 28 + i * 9, 60 - textWidth(w), 1, '#466e5d'); });
  // le plan de travail (bois), les placards du bas
  r(0, COUNTER, W, 4, '#c08a57'); r(0, COUNTER, W, 1, '#d9a46c'); r(0, COUNTER + 4, W, 1, '#8a5530');
  r(0, COUNTER + 5, W, H - COUNTER - 5, '#e3e0ea');
  for (let x = 0; x < W; x += 32) { r(x + 31, COUNTER + 5, 1, H, '#bdb9cb'); r(x + 13, COUNTER + 14, 6, 1, '#9f9ab0'); }
  // la petite plante et le bocal à sucre
  // (les tiges d'abord, puis les feuilles en goutte, qui bougent un peu ; le pot en terre cuite par-dessus)
  const leaf = (cx: number, cy: number, ang: number, len: number) => {
    for (let k = 0; k <= len; k++) {
      const u = k / len, wd = Math.max(1, Math.round(Math.sin(u * Math.PI) * 2.6));
      const px = cx + Math.cos(ang) * k, py = cy + Math.sin(ang) * k;
      r(px - wd / 2 - 1, py - wd / 2 - 1, wd + 2, wd + 2, '#1a1822');
    }
    for (let k = 0; k <= len; k++) {
      const u = k / len, wd = Math.max(1, Math.round(Math.sin(u * Math.PI) * 2.6));
      const px = cx + Math.cos(ang) * k, py = cy + Math.sin(ang) * k;
      r(px - wd / 2, py - wd / 2, wd, wd, u < 0.5 ? '#2c6e44' : '#348050');
      if (u > 0.3 && u < 0.6) r(px - 0.5, py - 0.5, 1, 1, '#5aa070');
    }
  };
  const sway = Math.sin(t * 1.3) * 0.06;
  for (const [ang, len, ox] of [[-2.2, 11, 22], [-1.6, 13, 24], [-1.0, 11, 26], [-2.7, 8, 21], [-0.45, 8, 27]] as [number, number, number][]) {
    r(ox, COUNTER - 16, 1, 6, '#2c6e44');
    leaf(ox, COUNTER - 14, ang + sway, len);
  }
  r(17, COUNTER - 11, 14, 11, '#1a1822'); r(18, COUNTER - 10, 12, 10, '#b8643f'); r(18, COUNTER - 10, 12, 2, '#d47a52'); r(19, COUNTER - 7, 1, 6, '#d47a52');
  r(38, COUNTER - 14, 12, 14, '#1a1822'); r(39, COUNTER - 13, 10, 12, 'rgba(220,236,246,0.6)'); r(40, COUNTER - 7, 8, 5, '#ffffff'); r(38, COUNTER - 16, 12, 3, '#9aa3b5');
  // la machine à café : le corps sombre, le dessus, le panneau et ses voyants, le manomètre, le groupe et le porte-filtre,
  // la buse vapeur, l'égouttoir
  const mx = 62, my = 28, mw = 86, mh = COUNTER - my;
  r(mx - 1, my - 1, mw + 2, mh + 1, '#1a1822');
  r(mx, my, mw, mh, '#2b2836'); r(mx, my, mw, 3, '#45405a'); r(mx + mw - 4, my + 3, 4, mh - 3, '#211e2b');
  r(mx + 4, my - 6, mw - 8, 6, '#1a1822'); r(mx + 5, my - 5, mw - 10, 4, '#3a3646');
  for (let i = 0; i < 4; i++) { r(mx + 10 + i * 18, my - 10, 10, 5, '#1a1822'); r(mx + 11 + i * 18, my - 9, 8, 4, '#f1eef6'); r(mx + 11 + i * 18, my - 8, 8, 1, i % 2 ? '#4fb3ff' : '#ff8a3d'); }
  r(mx + 6, my + 7, 40, 12, '#1a1822');
  const ready = st.phase === 'wait' || st.phase === 'menu';
  r(mx + 9, my + 11, 4, 4, ready ? '#3ddc97' : '#1f6b45'); r(mx + 16, my + 11, 4, 4, st.phase === 'pour' ? '#ffb02e' : '#6b4a1a');
  pixelText(g, '43', mx + 27, my + 10, '#f1eef6');
  // le manomètre : l'aiguille tremble quand ça coule
  const gx = mx + 62, gy = my + 13;
  r(gx - 7, gy - 7, 15, 15, '#1a1822'); r(gx - 6, gy - 6, 13, 13, '#f1eef6');
  const ga = Math.PI * (0.85 + (st.phase === 'pour' ? 0.9 + Math.sin(t * 30) * 0.05 : 0.2));
  for (let k = 0; k < 5; k++) r(gx + Math.cos(ga) * k, gy + Math.sin(ga) * k, 1, 1, '#e5484d');
  // le groupe, le porte-filtre (son manche en bois, vers la gauche)
  r(SPOUT.x - 12, my + 24, 24, 6, '#1a1822'); r(SPOUT.x - 11, my + 25, 22, 4, '#9aa3b5'); r(SPOUT.x - 11, my + 25, 22, 1, '#c9cfd8');
  r(SPOUT.x - 9, my + 30, 18, 4, '#1a1822'); r(SPOUT.x - 8, my + 31, 16, 2, '#6a7088');
  r(SPOUT.x - 30, my + 30, 22, 4, '#1a1822'); r(SPOUT.x - 29, my + 31, 20, 2, '#8a5530');
  r(SPOUT.x - 2, SPOUT.y - 2, 4, 3, '#1a1822');
  // la buse vapeur, à droite
  r(mx + mw - 14, my + 26, 3, 30, '#1a1822'); r(mx + mw - 13, my + 26, 1, 30, '#c9cfd8');
  // l'égouttoir
  r(mx + 8, COUNTER - 6, mw - 16, 6, '#1a1822'); r(mx + 9, COUNTER - 5, mw - 18, 4, '#45405a');
  for (let x = mx + 11; x < mx + mw - 10; x += 3) r(x, COUNTER - 4, 1, 2, '#2b2836');
  // la tasse sous le bec, et ce qui coule
  if (st.phase !== 'menu') {
    const d = DRINKS[st.drink], L = d.layers[Math.min(st.li, d.layers.length - 1)];
    const gl = GLASS[d.glass];
    // le filet qui coule du bec jusqu'au liquide
    if (st.phase === 'pour') r(SPOUT.x - 1, SPOUT.y + 1, 2, (COUNTER - 7 - Math.round((st.fills[st.li] ?? 0) * (gl.h - 3))) - SPOUT.y - 1, LIQ[L.what].col);
    drawGlass(g, st.drink, SPOUT.x, COUNTER - 5, st.fills, st.phase !== 'done', st.li, t);
  }
  for (const p of st.drops) r(p.x, p.y, 1, 2, p.col);
  for (const p of st.steam) { const k = (t - p.t0) / 1.6; g.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; g.fillRect(Math.round(p.x + Math.sin(k * 5 + p.x) * 2), Math.round(p.y - k * 20), 2, 2); }
  // les mugs qui attendent, à droite de la machine
  for (const [x, col] of [[156, '#ff8a3d'], [140 + 34, '#4fb3ff']] as [number, string][]) {
    r(x - 1, COUNTER - 13, 12, 13, '#1a1822'); r(x, COUNTER - 12, 10, 12, '#f1eef6'); r(x, COUNTER - 9, 10, 2, col); r(x + 10, COUNTER - 10, 3, 6, '#1a1822'); r(x + 10, COUNTER - 9, 1, 4, '#f1eef6');
  }
  // ce que l'on verse, le mot de la couche
  if (st.phase !== 'menu' && st.phase !== 'done') {
    const d = DRINKS[st.drink], L = d.layers[Math.min(st.li, d.layers.length - 1)];
    const lbl = st.phase === 'wait' ? `TIENS ESPACE : ${LIQ[L.what].name}` : LIQ[L.what].name;
    r(4, H - 15, textWidth(lbl) + 8, 11, '#1a1822'); pixelText(g, lbl, 8, H - 12, '#ffffff');
    const name = d.name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    pixelText(g, name, 6, 30, '#2b2836');
    for (let i = 0; i < d.layers.length; i++) r(6 + i * 7, 39, 5, 3, i < st.li ? '#3ddc97' : i === st.li ? '#ffb02e' : '#bdb9cb');
  }
  if (t - st.markAt < 1 && st.mark) {
    const col = st.mark === 'PARFAIT !' ? '#ffd166' : st.mark === 'BIEN' ? '#3ddc97' : '#e5484d';
    const w = textWidth(st.mark) * 2, x = Math.round(W / 2 - w / 2 - 20), y = 44 - Math.round((t - st.markAt) * 8);
    g.fillStyle = 'rgba(26,24,34,0.75)'; g.fillRect(x - 4, y - 3, w + 8, 16);
    g.save(); g.scale(2, 2); pixelText(g, st.mark, Math.round(x / 2), Math.round(y / 2), col); g.restore();
  }
}

/** Le livre des cafés (à la bibliothèque de la Pause) : chaque café du tableau, son dessin, ce qu'on en dit, tes étoiles. */
export function CoffeeBook() {
  const book = loadScores().cafes;
  const [pick, setPick] = useState<Drink>(() => DRINK_LIST.find((k) => book[k]) ?? 'espresso');
  const d = DRINKS[pick], known = !!book[pick];
  return (
    <div className="bestiary coffee-book">
      <div className="bestiary-sheet">
        <GlassPicBig drink={pick} unknown={!known} />
        <div>
          <b>{known ? d.name : '???'}</b>
          <span className="bestiary-stars">{'★'.repeat(book[pick] ?? 0)}<i className="dim">{'★'.repeat(3 - (book[pick] ?? 0))}</i></span>
          {known ? <p className="small">{d.desc} <span className="bestiary-fact">{d.fact}</span></p> : <p className="small muted">Pas encore fait. Choisis-le au tableau, à la machine à café de la Pause.</p>}
          {known && <p className="small muted">{d.layers.map((L) => ({ cafe: 'café', lait: 'lait', mousse: 'mousse', choco: 'chocolat' }[L.what])).join(', puis ')}.</p>}
        </div>
      </div>
      <div className="bestiary-grid">
        {DRINK_LIST.map((k) => (
          <button key={k} className={`bestiary-tile ${book[k] ? '' : 'unknown'} ${k === pick ? 'on' : ''}`} onClick={() => setPick(k)}>
            <GlassPic drink={k} unknown={!book[k]} />
            <span>{book[k] ? DRINKS[k].name : '???'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GlassPicBig({ drink, unknown }: { drink: Drink; unknown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    // (×2, au pixel près)
    g.save(); g.scale(2, 2); drawGlass(g, drink, 24, 26, DRINKS[drink].layers.map((L) => L.to)); g.restore();
    if (unknown) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#2c2a3a'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
  }, [drink, unknown]);
  return <canvas ref={ref} width={96} height={56} />;
}
