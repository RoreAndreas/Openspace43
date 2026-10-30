// La mer : le quatrième espace. Comme dans le jardin (Dehors), on voit l'île depuis la barque : le panorama de la
// falaise, le pavillon 43, le phare sur son îlot, la grotte au nord. ← → pour ramer autour de l'île (le panorama
// tourne), ↑ ↓ pour s'en approcher ou s'en éloigner (l'île grandit). On se cogne aux rochers, sauf au pied de l'échelle :
// là, on accoste au ponton et on remonte au jardin. Quand Roré ne rame pas, la houle fait dériver la barque. X pour revenir.
// Dans la grotte vit un serpent de mer : il sort la tête quand on approche, puis replonge. Le dessin : `seaDraw.ts`.

export interface Spot {
  id: string;
  /** son nom, en pixels (lettres majuscules sans accents, sauf É) */
  label: string;
  name: string;
  /** où il est, autour de l'île (radians) */
  at: number;
  /** un coin où les légendes rôdent plus souvent (il faut être au large) */
  lucky: boolean;
  /** les poissons se sont dispersés jusqu'à… (après une partie de pêche) */
  restUntil: number;
}

/** Ce qu'on voit sur l'île, selon l'endroit d'où on la regarde (des angles autour de l'île). */
export const LANDMARKS = {
  /** le pavillon 43, l'échelle et le ponton : au sud (on part de là) */
  pavilion: 0,
  /** le phare, sur son îlot : au nord-ouest */
  lighthouse: 2.4,
  /** la grotte du serpent, au pied de la falaise : au nord */
  cave: Math.PI,
};

export const SPOTS: Spot[] = [
  { id: 'baie', label: 'LA BAIE', name: 'La baie, au pied du pavillon', at: 0.55, lucky: false, restUntil: 0 },
  { id: 'phare', label: 'LES ROCHERS DU PHARE', name: 'Les rochers du phare', at: 2.2, lucky: false, restUntil: 0 },
  { id: 'grotte', label: 'LA GROTTE', name: 'La grotte, côté nord', at: Math.PI + 0.35, lucky: false, restUntil: 0 },
  { id: 'large', label: 'LE GRAND LARGE', name: 'Le grand large', at: 4.6, lucky: true, restUntil: 0 },
];

const TAU = Math.PI * 2;
/** L'écart entre deux angles, entre -π et π. */
export const angleDiff = (a: number, b: number) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/** La distance à l'île : 0, au ras des rochers ; 1, au large. */
const ROCKS = 0.1, DOCK = 0.02;
/** Le grand large commence ici (pour le coin des légendes). */
export const OFFSHORE = 0.55;

export type SeaNear = { kind: 'spot'; spot: Spot } | { kind: 'dock' };

export class Sea {
  time = 0;
  /** où est la barque, autour de l'île (radians), et sa vitesse (radians par seconde) */
  at = 0;
  speed = 0;
  /** à quelle distance de l'île (0 : contre la falaise, 1 : au large), et sa vitesse */
  dist = 0.7;
  vdist = 0;
  /** le sens de la marche (1 : vers la droite de l'écran, -1 : vers la gauche), pour tourner la barque */
  facing = 1;
  /** où regarde Roré quand il rame vers l'île ou vers le large (-1 : vers l'île, 1 : vers nous, 0 : de côté) */
  heading = 0;
  /** le coup de rame (pour l'animation des avirons) */
  stroke = 0;
  rowing = false;
  driving = false;
  /** un léger va-et-vient de la barque à l'écran, avec la houle */
  sway = 0;
  /** la barque vient de cogner les rochers (1, puis ça s'efface) */
  bump = 0;
  /** le serpent de mer : au fond de sa grotte, la tête dehors, ou qui replonge */
  serpent: { phase: 'lair' | 'peek' | 'dive'; t: number; calm: number } = { phase: 'lair', t: 0, calm: 0 };
  /** où se trouve la barque à l'écran (posé par le dessin, pour l'étiquette « E · … ») */
  screen = { x: 216, y: 200 };
  get rore() { return { x: this.screen.x, y: this.screen.y, seated: false }; }
  private steerX = 0;
  private steerY = 0;

  /** La houle : elle pousse d'un côté puis de l'autre, lentement. */
  swell(t = this.time) { return Math.sin(t * 0.07) * 0.7 + Math.sin(t * 0.19 + 1) * 0.3; }

  /** On prend la barque au ponton, au pied de l'échelle, face au pavillon. */
  enter() { this.at = 0; this.speed = 0; this.dist = 0.16; this.vdist = 0; this.driving = true; }

  drive(on: boolean) { this.driving = on; if (!on) { this.steerX = 0; this.steerY = 0; } }
  /** ← → : autour de l'île ; ↑ : vers l'île ; ↓ : vers le large. */
  steer(dx: number, dy = 0) { this.steerX = dx; this.steerY = dy; }

  /** Au pied de l'échelle : là où l'on peut accoster. */
  atDock() { return Math.abs(angleDiff(this.at, LANDMARKS.pavilion)) < 0.07; }

  update(dtReal: number) {
    const dt = Math.min(0.1, dtReal);
    this.time += dt;
    const px = this.driving ? this.steerX : 0, py = this.driving ? this.steerY : 0;
    this.rowing = px !== 0 || py !== 0;
    // ← → : Roré rame autour de l'île (on tourne moins vite de près, le tour est plus court) ; sans rame, la houle
    // fait dériver la barque doucement
    const target = px ? px * (0.18 + 0.16 * this.dist) : this.swell() * 0.03;
    this.speed += (target - this.speed) * Math.min(1, dt * (px ? 1.4 : 0.35));
    this.at = (this.at + this.speed * dt + TAU) % TAU;
    // ↑ ↓ : vers l'île ou vers le large ; la houle, elle, éloigne un peu la barque
    const vt = py ? py * 0.24 : this.swell(this.time + 20) * 0.006;
    this.vdist += (vt - this.vdist) * Math.min(1, dt * (py ? 1.6 : 0.4));
    this.dist += this.vdist * dt;
    const floor = this.atDock() ? DOCK : ROCKS;
    if (this.dist < floor) {
      // les rochers : la barque cogne et repart un peu en arrière (au ponton, elle se pose doucement)
      if (floor === ROCKS && this.vdist < -0.08) { this.bump = 1; this.vdist = 0.12; } else this.vdist = Math.max(0, this.vdist);
      this.dist = floor;
    }
    if (this.dist > 1) { this.dist = 1; this.vdist = Math.min(0, this.vdist); }
    this.bump = Math.max(0, this.bump - dt * 1.6);
    if (px) this.facing = px;
    this.heading = py && !px ? py : 0;
    if (this.rowing) this.stroke += dt * 1.5;
    this.sway += ((this.rowing ? 0 : this.swell() * 14) - this.sway) * Math.min(1, dt * 0.5);
    this.updateSerpent(dt);
  }

  /** Le serpent sort la tête quand la barque approche de sa grotte, regarde un moment, puis replonge. */
  private updateSerpent(dt: number) {
    const s = this.serpent;
    s.t += dt;
    const close = Math.abs(angleDiff(this.at, LANDMARKS.cave)) < 0.3 && this.dist < 0.6;
    if (s.phase === 'lair' && close && this.time >= s.calm) { s.phase = 'peek'; s.t = 0; }
    else if (s.phase === 'peek' && (s.t > 6 || (!close && s.t > 1.5))) { s.phase = 'dive'; s.t = 0; }
    else if (s.phase === 'dive' && s.t > 1.4) { s.phase = 'lair'; s.t = 0; s.calm = this.time + 22; }
  }

  /** Ce qu'on peut faire ici : accoster au ponton, ou pêcher là où les oiseaux tournent. */
  near(): SeaNear | null {
    if (this.atDock() && this.dist < 0.14) return { kind: 'dock' };
    for (const s of SPOTS) {
      if (this.time < s.restUntil || (s.lucky && this.dist < OFFSHORE)) continue;
      if (Math.abs(angleDiff(this.at, s.at)) < 0.12) return { kind: 'spot', spot: s };
    }
    return null;
  }

  /** Après une partie de pêche, les poissons du coin se dispersent un moment. */
  rest(spot: Spot) { spot.restUntil = this.time + 50; }
}
