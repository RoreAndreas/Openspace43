// Le dessin de la mer, en 3D (three.js), rendu en toute petite résolution (352 × 256) puis agrandi sans flou : du
// pixel art en volume, comme dans « A Short Hike ». La barque est un modèle en bois (coque, bancs, avirons qui rament) ;
// Roré y est assis, c'est son sprite pixel art habituel. Autour : l'île et ses falaises en strates, le plateau
// d'herbe avec le pavillon 43 et les pins, l'escalier jusqu'au ponton, l'îlot du phare (son faisceau tourne la nuit),
// les coins de pêche (des oiseaux tournent au-dessus, l'eau frémit), la houle à facettes, le sillage, les nuages.
// Ce module n'est chargé qu'au moment de prendre la mer (import dynamique) : three.js ne pèse rien avant.
import * as THREE from 'three';
import { pixelText, textWidth } from './font.ts';
import { H, W } from './layout.ts';
import { robotSprite, type Pose } from './robots.ts';
import type { TimeOfDay } from './room.ts';
import { DOCK, ISLAND, ISLET, LIMIT, SPOTS, islandRadius, type Sea } from './sea.ts';

interface Palette {
  skyTop: string; skyHorizon: string; fog: string; sun: string; sunI: number;
  hemiSky: string; hemiGround: string; hemiI: number; seaDeep: string; seaShallow: string; stars: number; night: boolean;
}
const PAL: Record<TimeOfDay, Palette> = {
  day: { skyTop: '#4f9fe8', skyHorizon: '#d4ecf8', fog: '#cfe6f4', sun: '#fff4dc', sunI: 1.5, hemiSky: '#d8ecff', hemiGround: '#4a6a4a', hemiI: 1.0, seaDeep: '#1d63a0', seaShallow: '#48c2c4', stars: 0, night: false },
  evening: { skyTop: '#2c2a5e', skyHorizon: '#ff9f6e', fog: '#d88a72', sun: '#ffb070', sunI: 1.2, hemiSky: '#ffc0a0', hemiGround: '#3a2a40', hemiI: 0.75, seaDeep: '#36306a', seaShallow: '#8a6a98', stars: 0.25, night: false },
  night: { skyTop: '#060a22', skyHorizon: '#24346a', fog: '#1c2a58', sun: '#b8c8ff', sunI: 0.9, hemiSky: '#4a5aa0', hemiGround: '#141a34', hemiI: 0.85, seaDeep: '#14285a', seaShallow: '#2a5a80', stars: 1, night: true },
};

/** La houle (la même pour l'eau et pour la barque qui flotte dessus). */
export const waveY = (x: number, z: number, t: number) =>
  0.32 * Math.sin(x * 0.14 + t * 1.1) + 0.22 * Math.sin(z * 0.19 - t * 0.9) + 0.12 * Math.sin((x + z) * 0.37 + t * 1.8);

/** Un petit hasard qui ne change pas d'une fois à l'autre. */
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const col = (c: string) => new THREE.Color(c);

/** Le relief du plateau : un léger dôme d'herbe au-dessus des falaises. */
function groundY(x: number, z: number) {
  const a = Math.atan2(z - ISLAND.z, x - ISLAND.x);
  const rho = Math.hypot(x - ISLAND.x, z - ISLAND.z) / islandRadius(a);
  return ISLAND.top + 1.8 * Math.max(0, 1 - rho * rho);
}

// ── L'île ──
function buildIsland(): THREE.Group {
  const g = new THREE.Group();
  const N = 56, L = 6;
  const pos: number[] = [], colors: number[] = [];
  const strata = ['#7a7062', '#a99d88', '#c2b6a0', '#948a78', '#b8ab94', '#8f8472', '#cdbfa6'].map(col);
  const ring = (k: number, i: number) => {
    const a = (i / N) * Math.PI * 2;
    const h = -4 + ((ISLAND.top + 4) * k) / L;
    const shrink = 1 - 0.06 * (k / L) + 0.04 * Math.sin(k * 1.7 + i);
    const r = islandRadius(a) * shrink + (hash(i * 13 + k * 7) - 0.5) * 1.6;
    return { x: Math.cos(a) * r, y: h + (k > 0 && k < L ? (hash(i + k * 31) - 0.5) * 1.2 : 0), z: Math.sin(a) * r, k, i };
  };
  const push = (p: { x: number; y: number; z: number; k: number; i: number }) => {
    pos.push(p.x, p.y, p.z);
    const c = strata[(p.k + Math.floor(hash(p.i * 3) * 2)) % strata.length].clone();
    if (p.k === 0) c.lerp(col('#4a5a4a'), 0.5); // les rochers mouillés, au pied
    c.multiplyScalar(0.88 + hash(p.i * 17 + p.k) * 0.2);
    colors.push(c.r, c.g, c.b);
  };
  for (let k = 0; k < L; k++) for (let i = 0; i < N; i++) {
    const a = ring(k, i), b = ring(k, (i + 1) % N), c = ring(k + 1, i), d = ring(k + 1, (i + 1) % N);
    push(a); push(c); push(b);
    push(b); push(c); push(d);
  }
  const cliff = new THREE.BufferGeometry();
  cliff.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cliff.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  cliff.computeVertexNormals();
  g.add(new THREE.Mesh(cliff, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));

  // le plateau d'herbe : un disque bombé, qui rejoint le haut des falaises
  const tp: number[] = [], tc: number[] = [];
  const greens = ['#6aa850', '#5b9a47', '#78b85a', '#62a04c', '#86c062'].map(col);
  const R = 7;
  const at = (j: number, i: number) => {
    const a = (i / N) * Math.PI * 2;
    const top = ring(L, i);
    const rr = j / R;
    const x = top.x * rr, z = top.z * rr;
    return { x, y: j === R ? top.y : groundY(x, z) + (hash(i * 5 + j * 11) - 0.5) * 0.4, z, c: greens[Math.floor(hash(i * 7 + j * 3) * greens.length)], a };
  };
  for (let j = 0; j < R; j++) for (let i = 0; i < N; i++) {
    const a = at(j, i), b = at(j, (i + 1) % N), c = at(j + 1, i), d = at(j + 1, (i + 1) % N);
    for (const p of j === 0 ? [a, c, d] : [a, c, b, b, c, d]) { tp.push(p.x, p.y, p.z); tc.push(p.c.r, p.c.g, p.c.b); }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  top.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  top.computeVertexNormals();
  g.add(new THREE.Mesh(top, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // des rochers au pied des falaises
  const rockMat = new THREE.MeshLambertMaterial({ color: '#6f6658', flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = hash(i * 9) * Math.PI * 2;
    const r = islandRadius(a) + 1 + hash(i * 4) * 3;
    const s = 0.8 + hash(i * 2) * 1.8;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    m.position.set(Math.cos(a) * r, -0.3 + hash(i) * 0.4, Math.sin(a) * r);
    m.rotation.set(hash(i * 3) * 3, hash(i * 5) * 3, 0);
    m.scale.y = 0.6;
    g.add(m);
  }
  return g;
}

/** Le logo 43 sur la façade (une petite toile, en pixels nets). */
function logoTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 24;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe9de'; g.fillRect(0, 0, 32, 24);
  g.fillStyle = '#56506a';
  for (let k = 0; k <= 16; k++) g.fillRect(16 + Math.round((9 * k) / 16), 2 + k, 1, 1);
  for (let k = 0; k <= 7; k++) g.fillRect(16 - Math.round((9 * k) / 16), 2 + k, 1, 1);
  g.fillRect(24, 18, 3, 1);
  pixelText(g, '43', 8, 13, '#15121d');
  pixelText(g, '43', 9, 13, '#15121d');
  g.fillStyle = '#15121d'; g.fillRect(17, 16, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Le pavillon 43, au bord du plateau, face au ponton (au sud). Ses vitres s'allument le soir. */
function buildPavilion(): { group: THREE.Group; lit: THREE.MeshLambertMaterial[] } {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, emissive?: string) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ? col(emissive) : undefined, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return m;
  };
  box(7, 3.2, 4.4, '#efe9de', 0, 1.6, 0);
  box(2.2, 3.2, 4.5, '#a8743f', -2.45, 1.6, 0);
  const glassR = box(2.0, 2.6, 0.1, '#9fd4f2', 2.4, 1.6, 2.25, '#ffcf8a');
  const glassL = box(0.7, 2.0, 0.1, '#9fd4f2', -2.45, 1.7, 2.3, '#ffcf8a');
  const door = box(1.2, 1.8, 0.1, '#ffd9a0', 0.3, 0.9, 2.25, '#ffd9a0');
  box(7.6, 0.35, 5, '#8a8a92', 0, 3.38, 0);
  box(7.6, 0.12, 5, '#a9b2bf', 0, 3.6, 0);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshLambertMaterial({ map: logoTexture() }));
  logo.position.set(0.3, 2.5, 2.26);
  g.add(logo);
  return { group: g, lit: [glassR, glassL, door] };
}

/** Un pin parasol (tronc penché, couronne plate) ou un arbre rond. */
function buildTree(pine: boolean, seed: number): { group: THREE.Group; crown: THREE.Object3D } {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4528', flatShading: true });
  if (pine) {
    const h = 4.5 + hash(seed) * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 5), trunkMat);
    trunk.position.y = h / 2;
    trunk.rotation.z = 0.25 + hash(seed * 3) * 0.15;
    g.add(trunk);
    const crown = new THREE.Group();
    const greens = ['#24492c', '#2f5e36', '#3f7a42'];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(2.3 - i * 0.5, 7, 4), new THREE.MeshLambertMaterial({ color: greens[i], flatShading: true }));
      m.scale.y = 0.32;
      m.position.y = i * 0.45;
      crown.add(m);
    }
    crown.position.set(-Math.sin(trunk.rotation.z) * h, h, 0);
    g.add(crown);
    return { group: g, crown };
  }
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 5), trunkMat);
  trunk.position.y = 1;
  g.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 0), new THREE.MeshLambertMaterial({ color: ['#348050', '#2f8266', '#6a9a36'][Math.floor(hash(seed) * 3)], flatShading: true }));
  crown.position.y = 2.8;
  g.add(crown);
  return { group: g, crown };
}

/** Le phare sur son îlot : tour blanche à bandes rouges, lanterne, et un faisceau qui tourne (le soir et la nuit). */
function buildLighthouse(): { group: THREE.Group; beam: THREE.Mesh; lamp: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(ISLET.r, 1), new THREE.MeshLambertMaterial({ color: '#7a7062', flatShading: true }));
  rock.scale.set(1, 0.45, 1);
  g.add(rock);
  const white = new THREE.MeshLambertMaterial({ color: '#f4f1ea', flatShading: true });
  const red = new THREE.MeshLambertMaterial({ color: '#d24a40', flatShading: true });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 9, 10), white);
  tower.position.y = 3.5 + 4.5;
  g.add(tower);
  for (const y of [5.5, 8.6]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.25 - (y - 5.5) * 0.04, 1.3 - (y - 5.5) * 0.04, 1.1, 10), red); b.position.y = y; g.add(b); }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 10), new THREE.MeshLambertMaterial({ color: '#2e2e3c' }));
  gallery.position.y = 12.6;
  g.add(gallery);
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff2b0' });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 8), lamp);
  lantern.position.y = 13.4;
  g.add(lantern);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 8), red);
  roof.position.y = 14.6;
  g.add(roof);
  const beamGeo = new THREE.ConeGeometry(7, 60, 14, 1, true);
  beamGeo.translate(0, -30, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 13.4;
  g.add(beam);
  g.position.set(ISLET.x, 0, ISLET.z);
  return { group: g, beam, lamp };
}

/** La barque : une coque en bois (bande rouge sous le plat-bord), deux bancs, deux avirons. L'avant est vers -z. */
function buildBoat(): { group: THREE.Group; oars: THREE.Group[] } {
  const g = new THREE.Group();
  const S = 9;
  const prof: [number, number][] = [[1, 0.55], [0.96, 0.32], [0.8, 0.05], [0.45, -0.2], [0, -0.28]];
  const pos: number[] = [], colors: number[] = [];
  const wood = col('#9a6a3e'), dark = col('#6b4528'), stripe = col('#d24a40'), rim = col('#d8b07a');
  const pt = (s: number, p: number, side: number) => {
    const u = s / (S - 1);
    const z = -2.3 + u * 4.5;
    const w = 0.92 * Math.pow(Math.sin(Math.PI * (0.06 + 0.86 * u)), 0.55) + (u > 0.85 ? 0 : 0);
    const lift = 0.32 * Math.pow(1 - u, 2.2);
    const [fx, fy] = prof[p];
    return [side * fx * w, fy + (p === 0 ? lift : lift * (1 - p / 4)), z];
  };
  const colorOf = (p: number) => (p === 0 ? rim : p === 1 ? stripe : p === 4 ? dark : wood);
  for (const side of [-1, 1]) for (let s = 0; s < S - 1; s++) for (let p = 0; p < prof.length - 1; p++) {
    const a = pt(s, p, side), b = pt(s + 1, p, side), c = pt(s, p + 1, side), d = pt(s + 1, p + 1, side);
    for (const [v, pp] of [[a, p], [c, p + 1], [b, p], [b, p], [c, p + 1], [d, p + 1]] as [number[], number][]) {
      pos.push(...v);
      const cc = colorOf(pp).clone().multiplyScalar(side < 0 ? 0.92 : 1);
      colors.push(cc.r, cc.g, cc.b);
    }
  }
  // le tableau arrière
  for (let p = 0; p < prof.length - 1; p++) {
    const a = pt(S - 1, p, -1), b = pt(S - 1, p, 1), c = pt(S - 1, p + 1, -1), d = pt(S - 1, p + 1, 1);
    for (const v of [a, c, b, b, c, d]) { pos.push(...v); colors.push(wood.r * 0.85, wood.g * 0.85, wood.b * 0.85); }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hull.computeVertexNormals();
  g.add(new THREE.Mesh(hull, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  const plank = new THREE.MeshLambertMaterial({ color: '#c08a57', flatShading: true });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 3.4), new THREE.MeshLambertMaterial({ color: '#7a5236' }));
  floor.position.set(0, -0.12, 0.2);
  g.add(floor);
  for (const z of [-0.2, 1.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 0.4), plank); b.position.set(0, 0.32, z); g.add(b); }
  const oars: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const o = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), plank);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = side * 1.2;
    o.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.3), plank);
    blade.position.x = side * 2.65;
    o.add(blade);
    o.position.set(side * 0.85, 0.5, 0.3);
    g.add(o);
    oars.push(o);
  }
  return { group: g, oars };
}

/** Les oiseaux qui tournent au-dessus d'un coin de pêche (deux ailes qui battent). */
function buildBird(color = '#f6f6fa'): { group: THREE.Group; wings: THREE.Mesh[] } {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, side * 0.9, 0, 0.1, 0, 0, 0.25], 3));
    const w = new THREE.Mesh(geo, mat);
    g.add(w);
    wings.push(w);
  }
  return { group: g, wings };
}

interface Wake { mesh: THREE.Mesh; life: number; vx: number; vz: number }
interface SpotFx { birds: { group: THREE.Group; wings: THREE.Mesh[] }[]; ripples: THREE.Mesh[] }

export class SeaView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, W / H, 0.5, 1200);
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private sunDisc: THREE.Mesh;
  private sun = new THREE.DirectionalLight('#ffffff', 1.5);
  private hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  private water: THREE.Mesh;
  private waterBase: Float32Array;
  private foam: THREE.Mesh[] = [];
  private boat: THREE.Group;
  private oars: THREE.Group[];
  private rore: THREE.Sprite;
  private roreTex = new Map<string, THREE.CanvasTexture>();
  private trees: { crown: THREE.Object3D; seed: number }[] = [];
  private lit: THREE.MeshLambertMaterial[] = [];
  private beam: THREE.Mesh;
  private lamp: THREE.MeshBasicMaterial;
  private lampLight = new THREE.PointLight('#ffe6a0', 0, 60);
  private spotFx = new Map<string, SpotFx>();
  private gulls: { group: THREE.Group; wings: THREE.Mesh[] }[] = [];
  private clouds: THREE.Group[] = [];
  private wakes: Wake[] = [];
  private wakeAt = 0;
  private tod: TimeOfDay | null = null;
  private sunDir = new THREE.Vector3(0, 1, 0);
  private first = true;

  constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.scene.fog = new THREE.Fog('#cfe6f4', 80, 380);
    this.scene.add(this.sun, this.hemi, this.lampLight);
    this.sun.position.set(-60, 90, -40);

    // le ciel : une grande sphère, dégradée du zénith à l'horizon ; les étoiles, la nuit ; le soleil ou la lune
    const skyGeo = new THREE.SphereGeometry(700, 24, 12);
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    const starPos: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = hash(i) * Math.PI * 2, e = 0.08 + hash(i * 3) * 1.3;
      starPos.push(Math.cos(a) * Math.cos(e) * 650, Math.sin(e) * 650, Math.sin(a) * Math.cos(e) * 650);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 16), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false, depthWrite: false }));
    this.sunDisc.renderOrder = -1;
    this.scene.add(this.sunDisc);

    // la mer : une grande nappe à facettes ; plus claire (turquoise) près des côtes
    const wg = new THREE.PlaneGeometry(460, 460, 92, 92);
    wg.rotateX(-Math.PI / 2);
    wg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(wg.attributes.position.count * 3), 3));
    this.waterBase = Float32Array.from(wg.attributes.position.array as Float32Array);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.scene.add(this.water);
    // l'écume au pied des falaises et de l'îlot
    const foamRing = (cx: number, cz: number, radius: (a: number) => number) => {
      const p: number[] = [];
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        const r0 = radius(a0), r1 = radius(a1);
        const o0 = r0 + 1.6 + hash(i) * 1.2, o1 = r1 + 1.6 + hash(i + 1) * 1.2;
        const v = (a: number, r: number) => [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r];
        p.push(...v(a0, r0), ...v(a0, o0), ...v(a1, r1), ...v(a1, r1), ...v(a0, o0), ...v(a1, o1));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = 0.35;
      this.scene.add(m);
      this.foam.push(m);
    };
    foamRing(ISLAND.x, ISLAND.z, (a) => islandRadius(a) + 0.8);
    foamRing(ISLET.x, ISLET.z, () => ISLET.r * 0.95);

    // l'île, son plateau, le pavillon, les arbres
    this.scene.add(buildIsland());
    const pav = buildPavilion();
    pav.group.position.set(4, groundY(4, 26), 26);
    this.scene.add(pav.group);
    this.lit = pav.lit;
    const treeSpots: [number, number, boolean][] = [[-14, 26, true], [-22, 14, false], [-30, -6, true], [-16, -24, true], [6, -30, false], [22, -20, true], [30, 4, false], [24, 20, true], [-6, 8, false], [12, -8, true], [-34, 18, false], [34, -14, true]];
    treeSpots.forEach(([x, z, pine], i) => {
      const t = buildTree(pine, i + 1);
      t.group.position.set(x, groundY(x, z) - 0.2, z);
      t.group.rotation.y = hash(i * 7) * Math.PI * 2;
      this.scene.add(t.group);
      this.trees.push({ crown: t.crown, seed: i });
    });
    // l'escalier taillé dans la falaise, du plateau jusqu'au ponton ; le ponton et ses pieux
    const stone = new THREE.MeshLambertMaterial({ color: '#b8ab94', flatShading: true });
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const u = i / (steps - 1);
      const a = Math.PI / 2 + 0.22 - u * 0.2;
      const r = islandRadius(a) + 0.6;
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.4), stone);
      s.position.set(Math.cos(a) * r, ISLAND.top - u * (ISLAND.top - 0.8), Math.sin(a) * r);
      s.rotation.y = -a;
      this.scene.add(s);
    }
    const wood = new THREE.MeshLambertMaterial({ color: '#8a5f3e', flatShading: true });
    const dockStart = islandRadius(Math.PI / 2) - 0.5;
    const dockLen = DOCK.z - dockStart + 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, dockLen), wood);
    deck.position.set(DOCK.x, 0.95, dockStart + dockLen / 2);
    this.scene.add(deck);
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 5), wood);
      p.position.set(DOCK.x + side * 1.25, 0.2, dockStart + 1 + (i * (dockLen - 2)) / 4);
      this.scene.add(p);
    }

    // le phare
    const lh = buildLighthouse();
    this.scene.add(lh.group);
    this.beam = lh.beam;
    this.lamp = lh.lamp;
    this.lampLight.position.set(ISLET.x, 13.4, ISLET.z);

    // des îles au loin, dans la brume
    const farMat = new THREE.MeshLambertMaterial({ color: '#6a8a7a', flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + hash(i) * 0.6;
      const m = new THREE.Mesh(new THREE.ConeGeometry(30 + hash(i * 3) * 40, 14 + hash(i * 5) * 26, 6), farMat);
      m.position.set(Math.cos(a) * 360, 0, Math.sin(a) * 360);
      m.scale.z = 0.6;
      this.scene.add(m);
    }

    // les nuages : des grappes de boules aplaties qui dérivent
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: col('#ffffff'), emissiveIntensity: 0.35 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + hash(i * 9 + k) * 6, 0), cloudMat);
        m.position.set(k * 7 - 10, hash(i + k) * 3, hash(k * 3 + i) * 6 - 3);
        m.scale.y = 0.45;
        c.add(m);
      }
      c.position.set((hash(i * 11) - 0.5) * 500, 70 + hash(i * 13) * 40, (hash(i * 17) - 0.5) * 500);
      this.scene.add(c);
      this.clouds.push(c);
    }

    // la barque et Roré
    const b = buildBoat();
    this.boat = b.group;
    this.oars = b.oars;
    this.rore = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.5 }));
    this.rore.scale.set(1.35, 1.62, 1);
    this.rore.position.set(0, 1.12, 0.45);
    this.boat.add(this.rore);
    this.scene.add(this.boat);

    // les coins de pêche : des oiseaux qui tournent, des ronds dans l'eau
    for (const s of SPOTS) {
      const birds = Array.from({ length: 3 }, () => buildBird(s.lucky ? '#ffe9a0' : '#f6f6fa'));
      const ripples = Array.from({ length: 3 }, () => {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 20), new THREE.MeshBasicMaterial({ color: s.lucky ? '#ffd166' : '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        this.scene.add(m);
        return m;
      });
      for (const bd of birds) this.scene.add(bd.group);
      this.spotFx.set(s.id, { birds, ripples });
    }
    // des mouettes qui font le tour de l'île
    for (let i = 0; i < 4; i++) { const gl = buildBird(); this.scene.add(gl.group); this.gulls.push(gl); }

    // le sillage : des petites plaques d'écume, recyclées
    const wakeGeo = new THREE.PlaneGeometry(1, 1);
    wakeGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      this.scene.add(m);
      this.wakes.push({ mesh: m, life: 0, vx: 0, vz: 0 });
    }
  }

  /** Les couleurs du ciel, de l'eau et des lumières, selon l'heure. */
  private applyTod(tod: TimeOfDay) {
    const p = PAL[tod];
    (this.scene.fog as THREE.Fog).color.set(p.fog);
    const sc = this.sky.geometry.attributes.color as THREE.BufferAttribute;
    const sp = this.sky.geometry.attributes.position as THREE.BufferAttribute;
    const top = col(p.skyTop), hor = col(p.skyHorizon);
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i) / 700;
      const c = hor.clone().lerp(top, Math.pow(Math.max(0, y), 0.55));
      if (y < 0) c.copy(col(p.fog));
      sc.setXYZ(i, c.r, c.g, c.b);
    }
    sc.needsUpdate = true;
    (this.stars.material as THREE.PointsMaterial).opacity = p.stars;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    // le soleil haut le jour, couchant le soir, la lune la nuit
    const sunDir = tod === 'evening' ? new THREE.Vector3(0.75, 0.08, 0.6) : tod === 'night' ? new THREE.Vector3(-0.4, 0.5, 0.75) : new THREE.Vector3(0.45, 0.6, 0.65);
    sunDir.normalize();
    this.sun.position.copy(sunDir).multiplyScalar(100);
    this.sunDir.copy(sunDir);
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.set(tod === 'night' ? '#eef2ff' : tod === 'evening' ? '#ffcf8a' : '#fffbe8');
    this.sunDisc.scale.setScalar(tod === 'night' ? 0.55 : tod === 'evening' ? 1.6 : 1);
    // l'eau : turquoise près des côtes, profonde au large
    const wc = this.water.geometry.attributes.color as THREE.BufferAttribute;
    const deep = col(p.seaDeep), shallow = col(p.seaShallow);
    for (let i = 0; i < wc.count; i++) {
      const x = this.waterBase[i * 3], z = this.waterBase[i * 3 + 2];
      const a = Math.atan2(z - ISLAND.z, x - ISLAND.x);
      const d1 = Math.hypot(x - ISLAND.x, z - ISLAND.z) - islandRadius(a);
      const d2 = Math.hypot(x - ISLET.x, z - ISLET.z) - ISLET.r;
      const k = Math.max(0, 1 - Math.min(d1, d2) / 26);
      const c = deep.clone().lerp(shallow, k * k).multiplyScalar(0.94 + hash(i) * 0.1);
      wc.setXYZ(i, c.r, c.g, c.b);
    }
    wc.needsUpdate = true;
    for (const m of this.lit) m.emissiveIntensity = p.night ? 0.9 : tod === 'evening' ? 0.5 : 0;
    this.lampLight.intensity = p.night ? 60 : tod === 'evening' ? 25 : 0;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = p.night ? 0.3 : tod === 'evening' ? 0.14 : 0;
    this.beam.visible = tod !== 'day';
  }

  private roreTexture(key: string, pose: Pose, frame: number): THREE.CanvasTexture {
    const k = `${key}|${pose}|${frame}`;
    let t = this.roreTex.get(k);
    if (!t) {
      t = new THREE.CanvasTexture(robotSprite(key, pose, 'up', frame, 'open'));
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      this.roreTex.set(k, t);
    }
    return t;
  }

  /** Une image : la scène en 3D, puis par-dessus la mini-carte et le nom des coins de pêche. */
  draw(g: CanvasRenderingContext2D, sea: Sea, tod: TimeOfDay, roreKey: string) {
    if (tod !== this.tod) { this.applyTod(tod); this.tod = tod; }
    const t = sea.time;
    // la houle
    const wp = this.water.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) {
      const x = this.waterBase[i * 3], z = this.waterBase[i * 3 + 2];
      wp.setY(i, waveY(x, z, t));
    }
    wp.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
    this.foam.forEach((f, i) => { (f.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 1.2 + i * 1.7); f.position.y = 0.3 + Math.sin(t * 1.1 + i) * 0.12; });

    // la barque flotte : elle suit la houle, penche dans les virages, pique un peu quand elle avance
    const by = waveY(sea.x, sea.z, t) + 0.28;
    this.boat.position.set(sea.x, by, sea.z);
    this.boat.rotation.set(0, 0, 0);
    this.boat.rotation.order = 'YXZ';
    this.boat.rotation.y = -sea.heading;
    this.boat.rotation.x = (waveY(sea.x, sea.z - 1.5, t) - waveY(sea.x, sea.z + 1.5, t)) * 0.18 + sea.speed * 0.006;
    this.boat.rotation.z = (waveY(sea.x - 1, sea.z, t) - waveY(sea.x + 1, sea.z, t)) * 0.2 - sea.turn * 0.12;
    // les avirons : ils plongent et reviennent au rythme des coups de rame
    const rowing = Math.abs(sea.speed) > 0.3;
    const ph = sea.stroke * Math.PI * 2;
    this.oars.forEach((o, i) => {
      const side = i === 0 ? -1 : 1;
      o.rotation.y = rowing ? side * Math.sin(ph) * 0.5 : side * 0.15;
      o.rotation.z = rowing ? side * (-0.15 + Math.max(0, Math.cos(ph)) * 0.35) : side * -0.2;
    });
    const frame = rowing ? (Math.sin(ph) > 0 ? 1 : 0) : 0;
    (this.rore.material as THREE.SpriteMaterial).map = this.roreTexture(roreKey, rowing ? 'type' : 'sit', frame);

    // le sillage
    const fwdX = Math.sin(sea.heading), fwdZ = -Math.cos(sea.heading);
    if (Math.abs(sea.speed) > 1 && t > this.wakeAt) {
      this.wakeAt = t + 0.07;
      for (const side of [-1, 1]) {
        const w = this.wakes.find((x) => x.life <= 0);
        if (!w) break;
        w.life = 1.6;
        w.mesh.position.set(sea.x - fwdX * 2.2 + side * -fwdZ * 0.6, by - 0.15, sea.z - fwdZ * 2.2 + side * fwdX * 0.6);
        w.vx = side * -fwdZ * 1.2;
        w.vz = side * fwdX * 1.2;
      }
    }
    for (const w of this.wakes) {
      if (w.life <= 0) { (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0; continue; }
      w.life -= 1 / 24;
      w.mesh.position.x += w.vx / 24;
      w.mesh.position.z += w.vz / 24;
      w.mesh.position.y = waveY(w.mesh.position.x, w.mesh.position.z, t) + 0.12;
      const k = 1 - w.life / 1.6;
      w.mesh.scale.setScalar(0.5 + k * 1.8);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }

    // le vent dans les arbres, les nuages qui dérivent, le phare qui tourne
    const gust = (Math.sin(t * 0.55) + Math.sin(t * 1.37 + 1.3)) * 0.5;
    for (const tr of this.trees) { tr.crown.rotation.z = Math.sin(t * 1.4 + tr.seed) * 0.03 + gust * 0.04; tr.crown.rotation.x = Math.sin(t * 1.1 + tr.seed * 2) * 0.02; }
    for (const c of this.clouds) { c.position.x += 0.6 / 24; if (c.position.x > 280) c.position.x = -280; }
    this.beam.rotation.y = t * 0.9;
    this.lamp.color.set(this.tod === 'day' ? '#fff2b0' : Math.sin(t * 0.9 * 2) > 0.6 ? '#ffffff' : '#ffe08a');

    // les coins de pêche : des oiseaux qui tournent, des ronds qui s'élargissent ; plus rien quand les poissons se sont dispersés
    for (const s of SPOTS) {
      const fx = this.spotFx.get(s.id)!;
      const active = t >= s.restUntil;
      fx.birds.forEach((b, i) => {
        b.group.visible = active;
        const a = t * (0.8 + i * 0.15) + i * 2.1;
        const r = 3 + i * 1.2;
        b.group.position.set(s.x + Math.cos(a) * r, 6 + i * 1.3 + Math.sin(t * 2 + i) * 0.4, s.z + Math.sin(a) * r);
        b.group.rotation.y = -a;
        b.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(t * 9 + i) * 0.5; });
      });
      fx.ripples.forEach((m, i) => {
        m.visible = active;
        const k = (t * 0.6 + i / 3) % 1;
        m.position.set(s.x + Math.sin(i * 2.4) * 1.5, waveY(s.x, s.z, t) + 0.2, s.z + Math.cos(i * 2.4) * 1.5);
        m.scale.setScalar(1 + k * 4);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      });
    }
    this.gulls.forEach((gl, i) => {
      const a = t * 0.18 + i * 1.6;
      const r = 58 + i * 9;
      gl.group.position.set(Math.cos(a) * r, 24 + i * 3 + Math.sin(t + i) * 2, Math.sin(a) * r);
      gl.group.rotation.y = -a - Math.PI / 2;
      gl.group.scale.setScalar(1.6);
      gl.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(t * 5 + i) * 0.45; });
    });

    // la caméra : derrière la barque, un peu au-dessus ; elle suit en douceur (et tremble au choc)
    const want = new THREE.Vector3(sea.x - fwdX * 12.5, by + 5.6, sea.z - fwdZ * 12.5);
    const look = new THREE.Vector3(sea.x + fwdX * 7, by + 1.8, sea.z + fwdZ * 7);
    if (this.first) { this.camPos.copy(want); this.camLook.copy(look); this.first = false; }
    this.camPos.lerp(want, 0.12);
    this.camLook.lerp(look, 0.18);
    this.camera.position.copy(this.camPos);
    if (sea.bump > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sea.bump, (Math.random() - 0.5) * sea.bump, 0));
    this.camera.lookAt(this.camLook);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.sunDisc.position.copy(this.sunDir).multiplyScalar(600).add(this.camera.position);
    this.sunDisc.lookAt(this.camera.position);

    this.renderer.render(this.scene, this.camera);
    g.drawImage(this.renderer.domElement, 0, 0);

    // où est la barque à l'écran (pour l'étiquette « E · … »)
    const sp = new THREE.Vector3(sea.x, by + 2.2, sea.z).project(this.camera);
    sea.screen = { x: ((sp.x + 1) / 2) * W, y: ((1 - sp.y) / 2) * H + 33 };

    this.labels(g, sea, t);
    this.minimap(g, sea);
  }

  /** Le nom des coins de pêche (et du ponton), quand on en approche. */
  private labels(g: CanvasRenderingContext2D, sea: Sea, t: number) {
    const tag = (label: string, x: number, y: number, z: number, color: string) => {
      const d = Math.hypot(x - sea.x, z - sea.z);
      if (d > 85) return;
      const p = new THREE.Vector3(x, y, z).project(this.camera);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) return;
      const sx = Math.round(((p.x + 1) / 2) * W), sy = Math.round(((1 - p.y) / 2) * H);
      const w = textWidth(label);
      // pas sous la mini-carte
      if (sx + w / 2 > W - 60 && sy < 60) return;
      g.fillStyle = 'rgba(10,8,18,0.72)';
      g.fillRect(sx - w / 2 - 3, sy - 3, w + 6, 9);
      g.fillStyle = color;
      g.fillRect(sx - 1, sy + 6, 2, 3);
      pixelText(g, label, Math.round(sx - w / 2), sy - 1, color);
    };
    for (const s of SPOTS) {
      if (t < s.restUntil) continue;
      tag(s.label, s.x, 11, s.z, s.lucky ? '#ffd166' : '#ffffff');
    }
    tag('PONTON', DOCK.x, 4, DOCK.z, '#ffb27a');
  }

  /** La mini-carte : l'île, le phare, le ponton, les coins de pêche, et la barque (une flèche orange). */
  private minimap(g: CanvasRenderingContext2D, sea: Sea) {
    const cx = W - 30, cy = 30, R = 24, k = R / LIMIT;
    g.fillStyle = 'rgba(10,14,30,0.6)';
    g.beginPath(); g.arc(cx, cy, R + 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(80,150,200,0.35)';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fb86a';
    g.beginPath();
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; const r = islandRadius(a) * k; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.fill();
    g.fillStyle = '#c2b6a0'; g.fillRect(Math.round(cx + ISLET.x * k) - 1, Math.round(cy + ISLET.z * k) - 1, 2, 2);
    g.fillStyle = '#ffb27a'; g.fillRect(Math.round(cx + DOCK.x * k), Math.round(cy + DOCK.z * k), 1, 2);
    for (const s of SPOTS) {
      g.fillStyle = sea.time < s.restUntil ? '#5a6478' : s.lucky ? '#ffd166' : '#ffffff';
      g.fillRect(Math.round(cx + s.x * k) - 1, Math.round(cy + s.z * k) - 1, 2, 2);
    }
    // la barque
    const bx = cx + sea.x * k, by = cy + sea.z * k;
    const fx = Math.sin(sea.heading), fz = -Math.cos(sea.heading);
    g.fillStyle = '#ff8a3d';
    for (let i = -1; i <= 3; i++) g.fillRect(Math.round(bx + fx * i * 0.8) , Math.round(by + fz * i * 0.8), 1, 1);
    g.fillRect(Math.round(bx + fx * 2.5 - fz), Math.round(by + fz * 2.5 + fx), 1, 1);
    g.fillRect(Math.round(bx + fx * 2.5 + fz), Math.round(by + fz * 2.5 - fx), 1, 1);
    pixelText(g, 'N', cx - 1, cy - R - 1, '#ffffff');
  }
}
