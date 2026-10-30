// La mer : le quatrième espace. Comme dans le jardin (Dehors), on voit l'île de loin : le panorama de la falaise, le
// pavillon 43, le phare sur son îlot ; la barque reste au large (on ne peut pas s'approcher). ← → pour ramer autour de
// l'île : le panorama tourne. Quand Roré ne rame pas, la houle fait dériver la barque, lentement. X pour revenir.
// La position est un angle autour de l'île (0 = au sud, face au pavillon et au chemin de la barque). Le dessin : `seaDraw.ts`.

export interface Spot {
  id: string;
  /** son nom, en pixels (lettres majuscules sans accents, sauf É) */
  label: string;
  name: string;
  /** où il est, autour de l'île (radians) */
  at: number;
  /** un coin où les légendes rôdent plus souvent */
  lucky: boolean;
  /** les poissons se sont dispersés jusqu'à… (après une partie de pêche) */
  restUntil: number;
}

/** Ce qu'on voit sur l'île, selon l'endroit d'où on la regarde (des angles autour de l'île). */
export const LANDMARKS = {
  /** le pavillon 43 et le chemin de la barque : au sud (on part de là) */
  pavilion: 0,
  /** le phare, sur son îlot : au nord-ouest */
  lighthouse: 2.4,
  /** l'arche de la grotte : au nord */
  cave: Math.PI,
};

export const SPOTS: Spot[] = [
  { id: 'baie', label: 'LA BAIE', name: 'La baie, au pied du pavillon', at: 0.55, lucky: false, restUntil: 0 },
  { id: 'phare', label: 'LES ROCHERS DU PHARE', name: 'Les rochers du phare', at: 2.2, lucky: false, restUntil: 0 },
  { id: 'grotte', label: 'LA GROTTE', name: 'La grotte, côté nord', at: Math.PI + 0.25, lucky: false, restUntil: 0 },
  { id: 'large', label: 'LE GRAND LARGE', name: 'Le grand large', at: 4.6, lucky: true, restUntil: 0 },
];

const TAU = Math.PI * 2;
/** L'écart entre deux angles, entre -π et π. */
export const angleDiff = (a: number, b: number) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export class Sea {
  time = 0;
  /** où est la barque, autour de l'île (radians), et sa vitesse (radians par seconde) */
  at = 0;
  speed = 0;
  /** le sens de la marche (1 : vers la droite de l'écran, -1 : vers la gauche), pour tourner la barque */
  facing = 1;
  /** le coup de rame (pour l'animation des avirons) */
  stroke = 0;
  rowing = false;
  driving = false;
  /** un léger va-et-vient de la barque à l'écran, avec la houle */
  sway = 0;
  /** où se trouve la barque à l'écran (posé par le dessin, pour l'étiquette « E · … ») */
  screen = { x: 176, y: 200 };
  get rore() { return { x: this.screen.x, y: this.screen.y, seated: false }; }
  private steerX = 0;

  /** La houle : elle pousse d'un côté puis de l'autre, lentement. */
  swell(t = this.time) { return Math.sin(t * 0.07) * 0.7 + Math.sin(t * 0.19 + 1) * 0.3; }

  /** On prend la barque au pied du chemin, face au pavillon. */
  enter() { this.at = 0; this.speed = 0; this.driving = true; }

  drive(on: boolean) { this.driving = on; if (!on) this.steerX = 0; }
  /** ← → seulement : on ne peut pas s'approcher de l'île (↑ ↓ ne font rien). */
  steer(dx: number, _dy = 0) { this.steerX = dx; }

  update(dtReal: number) {
    const dt = Math.min(0.1, dtReal);
    this.time += dt;
    const push = this.driving ? this.steerX : 0;
    this.rowing = push !== 0;
    // ← → : Roré rame autour de l'île ; sans rame, la houle fait dériver la barque doucement
    const target = push ? push * 0.32 : this.swell() * 0.035;
    this.speed += (target - this.speed) * Math.min(1, dt * (push ? 1.4 : 0.35));
    this.at = (this.at + this.speed * dt + TAU) % TAU;
    if (push) this.facing = push;
    if (this.rowing) this.stroke += dt * 1.5;
    this.sway += ((this.rowing ? 0 : this.swell() * 14) - this.sway) * Math.min(1, dt * 0.5);
  }

  /** Le coin de pêche où l'on est (là où les oiseaux tournent), s'il y en a un. */
  near(): { kind: 'spot'; spot: Spot } | null {
    for (const s of SPOTS) if (this.time >= s.restUntil && Math.abs(angleDiff(this.at, s.at)) < 0.12) return { kind: 'spot', spot: s };
    return null;
  }

  /** Après une partie de pêche, les poissons du coin se dispersent un moment. */
  rest(spot: Spot) { spot.restUntil = this.time + 50; }
}
