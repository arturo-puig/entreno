import type { PlannedSet, Routine, RoutineItem, Session } from '../db/types';
import { itemsForMode, setsForMode, type Mode } from './plan';

// Supuestos base (aproximados, no una medición). Con sesiones registradas se corrigen con tu ritmo real
// (`personalPace`): en el gimnasio se tarda más que la suma de series y descansos.
const SEC_PER_REP = 4; // ejecución controlada
const SET_SETUP_SEC = 15; // tomar la carga, acomodarse y anotar
const TRANSITION_SEC = 150; // ir a la máquina, ajustarla, buscar las mancuernas
const LOAD_CHANGE_SEC = 30; // pirámide: cambiar discos o mancuernas entre series
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

/** Cardio o entrada en calor: una sola serie por tiempo. Dura lo que dura, a cualquier ritmo. */
function isFixedTime(item: RoutineItem): boolean {
  return item.sets.length === 1 && item.sets[0].durationSec !== undefined;
}

/**
 * Tiempo de unas series de un ejercicio, en dos partes: lo de duración fija (cardio) y lo que depende
 * de tu ritmo (series, descansos, cambios de carga y el traslado hasta la máquina).
 * «separado»: todas las series de un lado y después las del otro, sin descanso al cambiar de lado.
 */
function setsParts(item: RoutineItem, sets: PlannedSet[], withTransition: boolean): { fixed: number; paced: number } {
  if (sets.length === 0) return { fixed: 0, paced: 0 };
  const transition = withTransition ? TRANSITION_SEC : 0;
  if (isFixedTime(item)) return { fixed: setSeconds(sets[0], false), paced: transition };
  const sides = item.perSide === 'separado' ? 2 : 1;
  const work = sets.reduce((acc, s) => acc + setSeconds(s, item.perSide === 'alternado'), 0) * sides;
  const between = Math.max(sets.length - 1, 0) * sides;
  const loads = item.loadPattern === 'ascendente' ? LOAD_CHANGE_SEC * between : 0;
  return { fixed: 0, paced: work + item.restSec * between + loads + transition };
}

export function estimateSetsSeconds(item: RoutineItem, sets: PlannedSet[], withTransition = true, factor = 1): number {
  const { fixed, paced } = setsParts(item, sets, withTransition);
  return fixed + paced * factor;
}

/** Lo opcional («si te sobra tiempo») no cuenta, salvo que se pida. */
export function estimateItemSeconds(item: RoutineItem, mode: Mode, includeOptional = false, factor = 1): number {
  if (item.optional && !includeOptional) return 0;
  const sets = setsForMode(item, mode).filter((s) => includeOptional || !s.optional);
  return estimateSetsSeconds(item, sets, true, factor);
}

/** `factor`: tu ritmo real (ver `personalPace`); 1 = supuestos base. No cambia la duración del cardio. */
export function estimateRoutineSeconds(routine: Routine, mode: Mode, factor = 1, includeOptional = false): number {
  return itemsForMode(routine, mode).reduce((acc, item) => acc + estimateItemSeconds(item, mode, includeOptional, factor), 0);
}

/** Minutos redondeados a múltiplos de 5 (mínimo 5). */
export function estimateRoutineMinutes(routine: Routine, mode: Mode, factor = 1): number {
  const minutes = estimateRoutineSeconds(routine, mode, factor) / 60;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

// ——— Tu ritmo real ———

export interface Pace {
  /** Cuánto más (o menos) tardás que la estimación base: 1,2 = un 20 % más. */
  factor: number;
  /** Sesiones en las que se basa. */
  sessions: number;
}

/**
 * En una sesión registrada: lo que tardaste en lo que hiciste ÷ la estimación base de eso mismo,
 * sin contar el cardio (dura lo que dura).
 */
function sessionRatio(s: Session): number | undefined {
  if (!s.startedAt) return undefined;
  const times = s.items.flatMap((i) => i.sets.filter((x) => x.done && x.completedAt).map((x) => new Date(x.completedAt!).getTime()));
  if (times.length < 4) return undefined;
  let fixed = 0;
  let paced = 0;
  for (const it of s.items) {
    if (it.skipped || !it.plan) continue;
    const done = it.sets.filter((x) => x.done);
    if (!done.length) continue;
    const sets: PlannedSet[] = done.map((x) =>
      x.durationSec !== undefined ? { durationSec: x.durationSec } : x.reps !== undefined ? { reps: x.reps } : (x.planned ?? {}),
    );
    const parts = setsParts(it.plan, sets, true);
    fixed += parts.fixed;
    paced += parts.paced;
  }
  const actual = (Math.max(...times) - new Date(s.startedAt).getTime()) / 1000 - fixed;
  if (paced < 8 * 60 || actual <= 0) return undefined;
  const ratio = actual / paced;
  // Fuera de rango = algo raro (te olvidaste la sesión abierta, cargaste todo al final): no se usa.
  return ratio > 0.5 && ratio < 3 ? ratio : undefined;
}

/**
 * Tu ritmo real, a partir de tus últimas sesiones registradas con la app (con la hora de cada serie).
 * Mediana de esas sesiones, acotada entre 0,75 y 2. Sin sesiones útiles, no hay ajuste.
 */
export function personalPace(sessions: Session[], max = 6): Pace | undefined {
  const ratios = sessions
    .filter((s) => s.source === 'registro' && s.kind !== 'actividad' && !s.backfill && s.status !== 'en-curso')
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
    .map(sessionRatio)
    .filter((r): r is number => r !== undefined)
    .slice(0, max);
  if (!ratios.length) return undefined;
  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { factor: Math.min(2, Math.max(0.75, median)), sessions: ratios.length };
}

/**
 * Lo que falta de una sesión en curso, con tu ritmo: lo obligatorio y, aparte, lo opcional.
 * Un ejercicio empezado no suma traslado, pero sí el descanso antes de su próxima serie.
 */
export function estimateRemainingSeconds(session: Session, factor = 1): { required: number; optional: number } {
  let required = 0;
  let optional = 0;
  for (const it of session.items) {
    if (it.skipped || !it.plan) continue;
    const left = it.sets.filter((x) => !x.done).map((x) => x.planned ?? {});
    if (!left.length) continue;
    const started = it.sets.some((x) => x.done);
    const plan = it.plan;
    const cost = (sets: PlannedSet[], first: boolean) =>
      sets.length ? estimateSetsSeconds(plan, sets, !started && first, factor) + (started || !first ? plan.restSec * factor : 0) : 0;
    if (it.optional) {
      optional += cost(left, true);
      continue;
    }
    const req = left.filter((p) => !p.optional);
    const opt = left.filter((p) => p.optional);
    required += cost(req, true);
    optional += cost(opt, req.length === 0);
  }
  return { required, optional };
}
