import type { DayPlan, Routine } from '../db/types';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Rutinas en el orden de la semana (lunes primero); las que no están en la semana, al final. */
export function orderRoutines(routines: Routine[], weekPlan: DayPlan[]): Routine[] {
  const position = (r: Routine) => {
    const day = weekPlan.find((p) => p.routineId === r.id);
    return day ? WEEK_ORDER.indexOf(day.weekday) : 99;
  };
  return [...routines].sort((a, b) => position(a) - position(b) || a.name.localeCompare(b.name, 'es'));
}

export const WEEKDAYS_FROM_MONDAY = WEEK_ORDER;
