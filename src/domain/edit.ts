import type { Exercise, PlannedSet, Routine, RoutineItem, Session } from '../db/types';

export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const out = [...list];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}

/** Descanso por defecto (aprobado): 90 s básicos, 60 s accesorios, 30 s movilidad. */
export function defaultRest(exercise?: Exercise): number {
  if (!exercise) return 60;
  if (exercise.movement === 'Movilidad') return 30;
  if (exercise.movement === 'Cardio') return 0;
  const compound = ['Sentadilla', 'Bisagra de cadera', 'Empuje', 'Tracción'];
  return compound.includes(exercise.movement) && exercise.group !== 'Hombros' ? 90 : 60;
}

export function newItem(exercise: Exercise): RoutineItem {
  const cardio = exercise.movement === 'Cardio';
  return {
    id: uid(),
    exerciseId: exercise.id,
    notation: cardio ? '20 min' : '3 × 10',
    sets: cardio ? [{ durationSec: 20 * 60 }] : Array.from({ length: 3 }, () => ({ reps: 10 })),
    restSec: defaultRest(exercise),
  };
}

// ——— Tipo de objetivo de las series ———

export type TargetKind = 'reps' | 'rango' | 'segundos' | 'minutos' | 'ninguno';

export const TARGET_KINDS: { id: TargetKind; label: string }[] = [
  { id: 'reps', label: 'Reps' },
  { id: 'rango', label: 'Rango' },
  { id: 'segundos', label: 'Segundos' },
  { id: 'minutos', label: 'Minutos' },
  { id: 'ninguno', label: 'Sin definir' },
];

export function targetKindOf(sets: PlannedSet[]): TargetKind {
  const s = sets[0];
  if (!s) return 'reps';
  if (s.durationSec) return s.durationSec >= 120 && s.durationSec % 60 === 0 ? 'minutos' : 'segundos';
  if (s.repsMin !== undefined || s.repsMax !== undefined) return 'rango';
  if (s.reps !== undefined) return 'reps';
  return 'ninguno';
}

const DEFAULTS: Record<TargetKind, PlannedSet> = {
  reps: { reps: 10 },
  rango: { repsMin: 8, repsMax: 12 },
  segundos: { durationSec: 60 },
  minutos: { durationSec: 20 * 60 },
  ninguno: {},
};

/** Cambia el tipo de objetivo conservando la cantidad de series y cuáles son opcionales. */
export function convertSets(sets: PlannedSet[], kind: TargetKind): PlannedSet[] {
  return sets.map((s) => ({ ...DEFAULTS[kind], ...(s.optional ? { optional: true } : {}) }));
}

export function addSet(sets: PlannedSet[]): PlannedSet[] {
  const last = sets[sets.length - 1];
  return [...sets, last ? { ...last, optional: undefined } : { reps: 10 }];
}

// ——— Rutinas ———

export function withNewVersion(routine: Routine, now = new Date()): Routine {
  return { ...routine, version: routine.version + 1, updatedAt: now.toISOString() };
}

export function duplicateRoutine(routine: Routine, now = new Date()): Routine {
  return {
    ...structuredClone(routine),
    id: `r-${uid()}`,
    name: `${routine.name} (copia)`,
    origin: 'personal',
    version: 1,
    updatedAt: now.toISOString(),
  };
}

export function emptyRoutine(name: string, now = new Date()): Routine {
  return { id: `r-${uid()}`, name, origin: 'personal', kind: 'fuerza', items: [], version: 1, updatedAt: now.toISOString() };
}

/**
 * Convierte un registro (por ejemplo, el histórico de piernas y abdomen) en una rutina editable.
 * Las repeticiones y tiempos registrados pasan a ser el plan; las cargas quedan como referencia.
 */
export function sessionToRoutine(session: Session, exercises: Exercise[], now = new Date()): Routine {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const items: RoutineItem[] = session.items
    .filter((i) => !i.skipped && i.sets.length > 0)
    .map((i) => {
      const sets: PlannedSet[] = i.sets.map((s) => {
        if (s.durationSec) return { durationSec: s.durationSec };
        if (s.reps !== undefined) return { reps: s.reps };
        if (s.distanceKm !== undefined) return { distanceKm: s.distanceKm };
        return {};
      });
      const weights = [...new Set(i.sets.map((s) => s.weightKg).filter((w): w is number => w !== undefined))];
      return {
        id: uid(),
        exerciseId: i.exerciseId,
        variant: i.variant,
        notation: loggedNotation(i.sets),
        sets,
        restSec: defaultRest(byId.get(i.exerciseId)),
        ...(weights.length === 1 ? { referenceLoadKg: weights[0] } : {}),
        ...(i.note ? { note: i.note } : {}),
      };
    });
  return {
    id: `r-${uid()}`,
    name: session.name,
    origin: 'personal',
    kind: items.every((i) => byId.get(i.exerciseId)?.movement === 'Cardio') ? 'cardio' : 'fuerza',
    items,
    notes: 'Creada a partir de un registro. Las cargas son de referencia.',
    version: 1,
    updatedAt: now.toISOString(),
  };
}

function loggedNotation(sets: Session['items'][number]['sets']): string {
  const n = sets.length;
  const first = sets[0];
  if (first?.distanceKm !== undefined) return `${String(first.distanceKm).replace('.', ',')} km`;
  if (first?.durationSec) return `${n} × ${first.durationSec >= 60 ? `${first.durationSec / 60} min` : `${first.durationSec} s`}`;
  const reps = sets.map((s) => s.reps);
  if (reps.every((r) => r === reps[0])) return `${n} × ${reps[0] ?? '?'}`;
  return reps.join(', ');
}
