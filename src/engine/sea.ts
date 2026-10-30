// La mer : le quatrième espace. Roré prend la barque au ponton (en bas de la falaise, sous Dehors) et fait le tour de
// l'île. Ici, seulement la logique (la barque, les commandes, l'île, les coins de pêche) ; le dessin en 3D (three.js,
// rendu en basse résolution pour rester en pixel art) est dans `seaView.ts`, chargé seulement quand on prend la mer.
// Unités : des mètres. L'île est au centre ; le nord est vers -z.

export interface Spot {
  id: string;
  /** son nom, en pixels (lettres majuscules sans accents, sauf É) */
  label: string;
  name: string;
  x: number;
  z: number;
  /** un coin où les légendes rôdent plus souvent */
  lucky: boolean;
  /** les poissons se sont dispersés jusqu'à… (après une partie de pêche) */
  restUntil: number;
}

/** L'île : un plateau de falaises, presque rond (le rayon varie avec l'angle, comme une vraie côte). */
export const ISLAND = { x: 0, z: 0, r: 44, top: 15 };
export const islandRadius = (a: number) => ISLAND.r + 3.5 * Math.sin(a * 3 + 0.6) + 2 * Math.sin(a * 7 + 1.7) + 1.2 * Math.sin(a * 13);
/** L'îlot du phare, au nord-ouest. */
export const ISLET = { x: -74, z: -46, r: 8 };
/** Le ponton, au pied de la falaise côté sud : c'est là qu'on prend la barque et qu'on accoste. */
export const DOCK = { x: 6, z: ISLAND.r + 9 };
/** Au-delà, la brume : on fait demi-tour. */
export const LIMIT = 170;

export const SPOTS: Spot[] = [
  { id: 'baie', label: 'LA BAIE', name: 'La baie, au pied du pavillon', x: 44, z: 54, lucky: false, restUntil: 0 },
  { id: 'phare', label: 'LE PHARE', name: 'Les rochers du phare', x: -60, z: -30, lucky: false, restUntil: 0 },
  { id: 'grotte', label: 'LA GROTTE', name: 'La grotte, côté nord', x: 12, z: -66, lucky: false, restUntil: 0 },
  { id: 'large', label: 'LE GRAND LARGE', name: 'Le grand large', x: 108, z: -62, lucky: true, restUntil: 0 },
];

export type SeaNear = { kind: 'dock' } | { kind: 'spot'; spot: Spot };

export class Sea {
  time = 0;
  /** la barque : position, cap (radians ; 0 = vers -z), vitesse */
  x = DOCK.x;
  z = DOCK.z + 6;
  heading = Math.PI;
  speed = 0;
  turn = 0;
  /** le coup de rame (pour l'animation des avirons) */
  stroke = 0;
  driving = false;
  /** où se trouve la barque à l'écran (posé par le dessin, pour l'étiquette « E · … ») */
  screen = { x: 176, y: 160 };
  /** Roré, là où on le voit (pour l'étiquette) : il n'est jamais assis au sens des autres pièces */
  get rore() { return { x: this.screen.x, y: this.screen.y, seated: false }; }
  private steerX = 0;
  private steerY = 0;
  /** un petit choc contre les rochers (pour secouer la vue) */
  bump = 0;

  /** On prend la barque au ponton, la proue vers le large. */
  enter() {
    this.x = DOCK.x;
    this.z = DOCK.z + 5;
    this.heading = Math.PI;
    this.speed = 0;
    this.turn = 0;
    this.driving = true;
  }

  drive(on: boolean) { this.driving = on; if (!on) this.steerX = this.steerY = 0; }
  steer(dx: number, dy: number) { this.steerX = dx; this.steerY = dy; }

  update(dtReal: number) {
    const dt = Math.min(0.1, dtReal);
    this.time += dt;
    // ↑ rame en avant, ↓ recule doucement, ← → tournent (mieux quand on avance)
    const push = this.driving ? -this.steerY : 0;
    const target = push > 0 ? 9 : push < 0 ? -3.5 : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (push ? 0.9 : 0.45));
    const turnTarget = this.driving ? this.steerX * (0.55 + Math.min(1, Math.abs(this.speed) / 6) * 0.6) : 0;
    this.turn += (turnTarget - this.turn) * Math.min(1, dt * 3);
    this.heading += this.turn * dt * (this.speed < 0 ? -1 : 1);
    if (Math.abs(this.speed) > 0.3) this.stroke += dt * (1.2 + Math.abs(this.speed) * 0.25);
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z - Math.cos(this.heading) * this.speed * dt;
    // la houle pousse un peu
    nx += Math.sin(this.time * 0.3) * 0.15 * dt;
    // les rochers : l'île, l'îlot du phare ; on glisse le long et ça secoue un peu
    const push2 = (cx: number, cz: number, r: number) => {
      const dx = nx - cx, dz = nz - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
        if (Math.abs(this.speed) > 2) this.bump = 0.35;
        this.speed *= 0.6;
      }
    };
    const a = Math.atan2(nz - ISLAND.z, nx - ISLAND.x);
    push2(ISLAND.x, ISLAND.z, islandRadius(a) + 4);
    push2(ISLET.x, ISLET.z, ISLET.r + 3.5);
    // la brume, au loin : on ne va pas plus loin
    const far = Math.hypot(nx, nz);
    if (far > LIMIT) { nx *= LIMIT / far; nz *= LIMIT / far; this.speed *= 0.8; }
    this.x = nx;
    this.z = nz;
    this.bump = Math.max(0, this.bump - dt);
  }

  /** Ce qui est à portée de la barque : le ponton (pour accoster), un coin de pêche où les oiseaux tournent. */
  near(): SeaNear | null {
    if (Math.hypot(this.x - DOCK.x, this.z - DOCK.z) < 9) return { kind: 'dock' };
    for (const s of SPOTS) if (this.time >= s.restUntil && Math.hypot(this.x - s.x, this.z - s.z) < 11) return { kind: 'spot', spot: s };
    return null;
  }

  /** Après une partie de pêche, les poissons du coin se dispersent un moment. */
  rest(spot: Spot) { spot.restUntil = this.time + 50; }
}
