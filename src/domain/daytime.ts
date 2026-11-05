import type { DayPlan, DayState, Routine } from '../db/types';
import { estimateRoutineSeconds } from './estimate';
import { hasShortVersion, itemsForMode, type Mode } from './plan';

/**
 * El tiempo que tenés cada día (pedido tuyo, noviembre de 2026): martes a viernes por la mañana, 45 min
 * antes de ir a trabajar, con tu entrada en calor de 8 min de trote suave en cinta; lunes y sábados, sin límite.
 */

/** Tu entrada en calor de las mañanas (8 min en cinta) más el paso a la primera máquina. */
export const MORNING_WARMUP_SEC = 8 * 60 + 60;

/** ¿La rutina (en ese modo) ya trae una entrada en calor por tiempo (cinta, bici)? */
export function includesWarmup(routine: Routine, mode: Mode): boolean {
  return itemsForMode(routine, mode).some(
    (i) => !!i.group && /calor/i.test(i.group.label) && i.sets.length === 1 && i.sets[0].durationSec !== undefined,
  );
}

/** Minutos que lleva la rutina; en un día con tiempo limitado se suma tu entrada en calor si la rutina no la trae. */
export function minutesNeeded(routine: Routine, mode: Mode, factor = 1, limitedDay = false): number {
  const extra = limitedDay && !includesWarmup(routine, mode) ? MORNING_WARMUP_SEC : 0;
  return (estimateRoutineSeconds(routine, mode, factor) + extra) / 60;
}

export interface DayChoice {
  mode: Mode;
  /** La versión corta la puso la app porque la completa no entra en el tiempo de ese día. */
  auto: boolean;
  /** Minutos que tenés ese día (sin límite: no hay). */
  budget?: number;
  /** Lo que lleva en el modo elegido (con tu entrada en calor si el día tiene límite), en minutos. */
  needed: number;
  /** Lo que llevaría la completa. */
  fullNeeded: number;
}

/**
 * Completa o corta para ese día. Manda lo que elegiste en «Tengo poco tiempo»; si no elegiste nada y la
 * completa no entra en el tiempo que tenés ese día, va la corta (si la rutina tiene versión corta).
 */
export function modeForDay(p: { routine: Routine; plan?: DayPlan; day?: Pick<DayState, 'short'>; factor?: number }): DayChoice {
  const budget = p.plan?.minutes;
  const limited = budget !== undefined;
  const canShorten = hasShortVersion(p.routine);
  const need = (mode: Mode) => minutesNeeded(p.routine, mode, p.factor ?? 1, limited);
  const fullNeeded = need('completa');
  const pick = (mode: Mode, auto = false): DayChoice => ({ mode, auto, budget, needed: mode === 'completa' ? fullNeeded : need(mode), fullNeeded });
  if (p.day?.short === true && canShorten) return pick('corta');
  if (p.day?.short === false || !limited || !canShorten) return pick('completa');
  return fullNeeded > budget ? pick('corta', true) : pick('completa');
}

/** Minutos para mostrar: múltiplos de 5. */
export const roundMinutes = (m: number) => Math.max(5, Math.round(m / 5) * 5);
