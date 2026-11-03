import type { Exercise, LoggedSet, PlannedSet, Readiness, Routine, Session, SessionItem } from '../db/types';
import { uid } from './edit';
import { itemsForMode, setsForMode, type Mode } from './plan';

/** Crea la sesión del día a partir de la rutina. Copia el plan: lo ejecutado se guarda aparte. */
export function createSession(params: { routine: Routine; mode: Mode; readiness?: Readiness; date: string; now: Date }): Session {
  const { routine, mode, readiness, date, now } = params;
  return {
    id: `s-${uid()}`,
    source: 'registro',
    date,
    name: routine.name,
    routineId: routine.id,
    routineVersion: routine.version,
    mode,
    readiness,
    status: 'en-curso',
    startedAt: now.toISOString(),
    currentIndex: 0,
    items: itemsForMode(routine, mode).map((item) => ({
      id: uid(),
      exerciseId: item.exerciseId,
      routineItemId: item.id,
      variant: item.variant,
      plan: structuredClone(item),
      optional: item.optional,
      sets: setsForMode(item, mode).map((planned) => ({ done: false, planned: { ...planned } })),
    })),
  };
}

// ——— La vez anterior ———

export interface PreviousRecord {
  session: Session;
  sets: LoggedSet[];
  /** Viene de tus notas previas (sin fecha), no de una sesión registrada en la app. */
  isHistoric: boolean;
}

/**
 * Última vez que hiciste el ejercicio: primero sesiones registradas (la más reciente),
 * y si no hay, tus registros históricos como referencia.
 */
export function previousRecord(sessions: Session[], exerciseId: string, excludeSessionId?: string): PreviousRecord | undefined {
  const withExercise = (s: Session) =>
    s.id !== excludeSessionId &&
    s.status !== 'en-curso' &&
    s.items.some((i) => i.exerciseId === exerciseId && !i.skipped && i.sets.some((x) => x.done));
  const pick = (s: Session, isHistoric: boolean): PreviousRecord => {
    const item = s.items.find((i) => i.exerciseId === exerciseId && !i.skipped && i.sets.some((x) => x.done))!;
    return { session: s, sets: item.sets.filter((x) => x.done), isHistoric };
  };
  const logged = sessions
    .filter((s) => s.source === 'registro' && s.date && withExercise(s))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  if (logged[0]) return pick(logged[0], false);
  const historic = sessions.find((s) => s.source === 'historico' && withExercise(s));
  return historic ? pick(historic, true) : undefined;
}

// ——— Valores sugeridos de cada serie ———

export interface SetHints {
  weightKg?: number;
  reps?: number;
  /** Texto del objetivo de repeticiones: «12» o «8–12». */
  repsLabel?: string;
  durationSec?: number;
  distanceKm?: number;
}

/**
 * Lo que se muestra en gris en cada campo: carga de la vez anterior, repeticiones del plan.
 * Al marcar la serie como hecha sin escribir nada, se guarda exactamente esto (lo que ves es lo que se registra).
 */
export function setHints(item: SessionItem, index: number, previous?: PreviousRecord): SetHints {
  const planned: PlannedSet = item.sets[index]?.planned ?? {};
  const prev = previous?.sets[index] ?? previous?.sets[previous.sets.length - 1];
  const earlierWeight = [...item.sets.slice(0, index)].reverse().find((s) => s.done && s.weightKg !== undefined)?.weightKg;
  const weightKg = prev?.weightKg ?? earlierWeight ?? (index === 0 ? item.plan?.referenceLoadKg : undefined);
  const range = planned.repsMin !== undefined && planned.repsMax !== undefined ? `${planned.repsMin}–${planned.repsMax}` : undefined;
  return {
    weightKg,
    reps: planned.reps ?? (range ? undefined : prev?.reps),
    repsLabel: planned.reps !== undefined ? String(planned.reps) : (range ?? (prev?.reps !== undefined ? String(prev.reps) : undefined)),
    durationSec: planned.durationSec ?? prev?.durationSec,
    distanceKm: prev?.distanceKm,
  };
}

/** Marca la serie como hecha; los campos vacíos toman el valor sugerido visible. */
export function completeSet(set: LoggedSet, hints: SetHints, now = new Date()): LoggedSet {
  return {
    ...set,
    weightKg: set.weightKg ?? hints.weightKg,
    reps: set.reps ?? hints.reps,
    durationSec: set.durationSec ?? hints.durationSec,
    done: true,
    completedAt: now.toISOString(),
  };
}

// ——— Qué campos se registran según el ejercicio ———

export type FieldKind = 'weightKg' | 'reps' | 'durationSec' | 'durationMin' | 'distanceKm';

export function fieldsFor(exercise: Exercise | undefined, item: SessionItem): FieldKind[] {
  const planned = item.sets[0]?.planned;
  if (exercise?.movement === 'Cardio') return ['durationMin', 'distanceKm'];
  if (planned?.durationSec) return ['durationSec'];
  const bodyweightOnly = exercise && exercise.equipment.every((e) => e === 'Peso corporal' || e === 'Banda elástica');
  return bodyweightOnly ? ['reps'] : ['weightKg', 'reps'];
}

// ——— Estado y resumen ———

/** Completa: no omitiste ejercicios obligatorios y hiciste todas sus series obligatorias. */
export function sessionStatus(session: Session): 'completa' | 'incompleta' {
  const required = session.items.filter((i) => !i.optional);
  const ok = required.every((i) => !i.skipped && i.sets.every((s) => s.done || s.planned?.optional || !s.planned));
  return ok ? 'completa' : 'incompleta';
}

export interface SessionSummary {
  setsDone: number;
  setsPlanned: number;
  exercisesDone: number;
  exercisesTotal: number;
  skipped: number;
  minutes?: number;
}

export function summarize(session: Session, now = new Date()): SessionSummary {
  const planned = session.items.flatMap((i) => i.sets.filter((s) => s.planned && !s.planned.optional));
  const end = session.finishedAt ? new Date(session.finishedAt) : now;
  return {
    setsDone: session.items.reduce((n, i) => n + i.sets.filter((s) => s.done).length, 0),
    setsPlanned: planned.length,
    exercisesDone: session.items.filter((i) => !i.skipped && i.sets.some((s) => s.done)).length,
    exercisesTotal: session.items.length,
    skipped: session.items.filter((i) => i.skipped).length,
    minutes: session.startedAt ? Math.max(0, Math.round((end.getTime() - new Date(session.startedAt).getTime()) / 60000)) : undefined,
  };
}

/**
 * Sesiones que quedaron abiertas de un día anterior: se cierran como incompletas
 * (si registraste algo) o se descartan (si estaban vacías). Nada se arrastra como deuda.
 */
export function staleSessions(sessions: Session[], today: string): { close: Session[]; discard: Session[] } {
  const stale = sessions.filter((s) => s.source === 'registro' && s.status === 'en-curso' && s.date !== null && s.date < today);
  const hasData = (s: Session) => s.items.some((i) => i.sets.some((x) => x.done));
  return { close: stale.filter(hasData), discard: stale.filter((s) => !hasData(s)) };
}

// ——— Sugerencia de progresión (prudente) ———

/**
 * Solo para ejercicios con rango de repeticiones (p. ej. 8–12): si la vez anterior llegaste
 * al máximo en todas las series obligatorias, sugiere subir lo mínimo. Nunca cambia nada solo.
 * En pirámides y notaciones de tu profe no sugiere nada.
 */
export function progressionHint(item: SessionItem, previous?: PreviousRecord): string | undefined {
  if (!previous || previous.isHistoric || item.plan?.loadPattern || item.plan?.pending) return undefined;
  const targets = item.sets.map((s) => s.planned).filter((p): p is PlannedSet => !!p && !p.optional);
  if (!targets.length || targets.some((t) => t.repsMax === undefined || t.repsMin === undefined)) return undefined;
  if (previous.sets.length < targets.length) return undefined;
  const reachedTop = targets.every((t, i) => (previous.sets[i]?.reps ?? 0) >= t.repsMax!);
  if (!reachedTop) return undefined;
  return `La vez anterior llegaste a ${targets[0].repsMax} repeticiones en todas las series. Si la técnica fue buena, podés probar con el aumento más chico disponible (por ejemplo, 2,5 kg en máquina o 1–2 kg por mancuerna). Es solo una sugerencia.`;
}

// ——— Descanso ———

export function remainingMs(restEndsAt: string | undefined, now: number): number {
  return restEndsAt ? Math.max(0, new Date(restEndsAt).getTime() - now) : 0;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
