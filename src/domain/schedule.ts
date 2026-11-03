import type { DayPlan, DayState, Routine, Session } from '../db/types';
import { addDays, startOfWeek, toISODate } from './dates';

const REST_DAY: Omit<DayPlan, 'weekday'> = { type: 'descanso', label: 'Descanso' };

export function planFor(weekPlan: DayPlan[], date: Date): DayPlan {
  const weekday = date.getDay() as DayPlan['weekday'];
  return weekPlan.find((p) => p.weekday === weekday) ?? { ...REST_DAY, weekday };
}

/** Rutina que corresponde hoy: la elegida para hoy o, si no, la planificada. */
export function effectiveRoutineId(plan: DayPlan, day: DayState | undefined): string | undefined {
  return day?.routineId ?? plan.routineId;
}

/** Una sesión cuenta como hecha aunque esté incompleta: hacer algo siempre suma. */
export function countsAsDone(s: Session): boolean {
  return s.source === 'registro' && s.status !== 'en-curso' && s.items.some((i) => i.sets.some((set) => set.done));
}

export interface WeekDay {
  date: string;
  plan: DayPlan;
  /** Hiciste algo ese día (gimnasio o actividad). */
  done: boolean;
  gym: boolean;
  activity: boolean;
  isToday: boolean;
  isPast: boolean;
}

export function weekOverview(weekPlan: DayPlan[], sessions: Session[], today: Date): WeekDay[] {
  const monday = startOfWeek(today);
  const todayIso = toISODate(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const iso = toISODate(d);
    const day = sessions.filter((s) => s.date === iso && countsAsDone(s));
    const gym = day.some((s) => s.kind !== 'actividad');
    const activity = day.some((s) => s.kind === 'actividad');
    return {
      date: iso,
      plan: planFor(weekPlan, d),
      done: gym || activity,
      gym,
      activity,
      isToday: iso === todayIso,
      isPast: iso < todayIso,
    };
  });
}

/**
 * Si esta semana se pasó un día de rutina de tu profe (A o B) sin hacerla,
 * sugiere hacerla hoy. Nunca arrastra nada a la semana siguiente (sin «deudas»)
 * y no sugiere nada si hoy ya toca una rutina de tu profe o si ya elegiste algo.
 */
export function missedProfessorRoutine(params: {
  weekPlan: DayPlan[];
  routines: Routine[];
  sessions: Session[];
  today: Date;
  day?: DayState;
}): Routine | undefined {
  const { weekPlan, routines, sessions, today, day } = params;
  if (day?.routineId || day?.dismissedSuggestion) return undefined;

  const byId = new Map(routines.map((r) => [r.id, r]));
  const isProfessor = (id?: string) => (id ? byId.get(id)?.origin === 'profesor' : false);

  if (isProfessor(planFor(weekPlan, today).routineId)) return undefined;

  const todayIso = toISODate(today);
  const weekStart = toISODate(startOfWeek(today));
  const thisWeek = sessions.filter((s) => s.date !== null && s.date >= weekStart && s.date <= todayIso);
  if (thisWeek.some((s) => s.date === todayIso && countsAsDone(s) && s.kind !== 'actividad')) return undefined;

  for (const d of weekOverview(weekPlan, sessions, today)) {
    if (!d.isPast) break;
    const id = d.plan.routineId;
    if (!isProfessor(id)) continue;
    const done = thisWeek.some((s) => s.routineId === id && countsAsDone(s));
    if (!done) return byId.get(id!);
  }
  return undefined;
}
