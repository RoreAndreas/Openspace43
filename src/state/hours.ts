// Les heures de travail de l'équipe (réglables dans les Réglages). Sans dépendance : le store et la journée
// (engine/day.ts) les lisent tous les deux.

/** Les heures de travail : en dehors, les amateurs de grand air sortent prendre l'air. */
export interface WorkHours {
  /** heure de début et de fin (0 à 24) ; une fin avant le début = on travaille la nuit */
  start: number;
  end: number;
  /** les jours travaillés (0 = dimanche, 1 = lundi…) */
  days: number[];
}

export const DEFAULT_HOURS: WorkHours = { start: 9, end: 18, days: [1, 2, 3, 4, 5] };

/** Est-ce l'heure du travail ? */
export function isWorkTime(h: WorkHours, d = new Date()): boolean {
  if (!h.days.includes(d.getDay())) return false;
  const x = d.getHours() + d.getMinutes() / 60;
  if (h.start === h.end) return true;
  return h.start < h.end ? x >= h.start && x < h.end : x >= h.start || x < h.end;
}
