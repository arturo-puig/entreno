import type { PlannedSet, Routine, RoutineItem } from '../db/types';

export type Mode = 'completa' | 'corta';

/** Ejercicios que entran en cada modo. La rutina original no se modifica. */
export function itemsForMode(routine: Routine, mode: Mode): RoutineItem[] {
  return mode === 'corta' ? routine.items.filter((i) => i.short) : routine.items;
}

/** Series que corresponden a un ejercicio según el modo. */
export function setsForMode(item: RoutineItem, mode: Mode): PlannedSet[] {
  if (mode === 'completa' || !item.short) return item.sets;
  if (item.short.durationSec) return [{ durationSec: item.short.durationSec }];
  return item.sets.filter((s) => !s.optional).slice(0, item.short.sets ?? item.sets.length);
}

export function hasShortVersion(routine: Routine): boolean {
  return routine.items.some((i) => i.short);
}

/** Preguntas pendientes sin repetir (dos ítems pueden compartir la misma). */
export function pendingQuestions(routine: Routine): { item: RoutineItem; question: string }[] {
  const seen = new Set<string>();
  const out: { item: RoutineItem; question: string }[] = [];
  for (const item of routine.items) {
    if (item.pending && !seen.has(item.pending)) {
      seen.add(item.pending);
      out.push({ item, question: item.pending });
    }
  }
  return out;
}
