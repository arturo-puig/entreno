import type { PlannedSet, Routine, RoutineItem } from '../db/types';
import { itemsForMode, setsForMode, type Mode } from './plan';

// Supuestos de la estimación (aproximados, no una medición):
const SEC_PER_REP = 4; // ejecución controlada
const SET_SETUP_SEC = 5; // tomar la carga, acomodarse
const TRANSITION_SEC = 120; // cambiar de máquina, cargar discos
const DEFAULT_REPS = 10; // si la serie todavía no tiene repeticiones definidas

function repsOf(set: PlannedSet): number {
  if (set.reps !== undefined) return set.reps;
  if (set.repsMin !== undefined && set.repsMax !== undefined) return (set.repsMin + set.repsMax) / 2;
  return set.repsMin ?? set.repsMax ?? DEFAULT_REPS;
}

/** Duración de una serie. «alternado» = cada serie incluye ambos lados. */
function setSeconds(set: PlannedSet, alternating: boolean): number {
  if (set.durationSec) {
    return set.durationMaxSec ? (set.durationSec + set.durationMaxSec) / 2 : set.durationSec;
  }
  return repsOf(set) * SEC_PER_REP * (alternating ? 2 : 1) + SET_SETUP_SEC;
}

export function estimateItemSeconds(item: RoutineItem, mode: Mode): number {
  const sets = setsForMode(item, mode);
  if (sets.length === 0) return 0;
  const sides = item.perSide === 'separado' ? 2 : 1;
  const work = sets.reduce((acc, s) => acc + setSeconds(s, item.perSide === 'alternado'), 0) * sides;
  const rest = item.restSec * Math.max(sets.length * sides - 1, 0);
  return work + rest + TRANSITION_SEC;
}

export function estimateRoutineSeconds(routine: Routine, mode: Mode): number {
  return itemsForMode(routine, mode).reduce((acc, item) => acc + estimateItemSeconds(item, mode), 0);
}

/** Minutos redondeados a múltiplos de 5 (mínimo 5). */
export function estimateRoutineMinutes(routine: Routine, mode: Mode): number {
  const minutes = estimateRoutineSeconds(routine, mode) / 60;
  return Math.max(5, Math.round(minutes / 5) * 5);
}
