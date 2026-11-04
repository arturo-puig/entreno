import type { LoggedSet, Session, WorkTimer } from '../db/types';
import { formatKg } from './format';
import { previousRecord, sessionStatus, summarize, type PreviousRecord } from './session';

// El «coach»: qué decir en cada momento. Solo describe lo que pasa con datos reales;
// no inventa números ni compara para mal (si bajaste, no lo marca).

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function workElapsedMs(w: WorkTimer, now: number): number {
  const paused = w.pausedMs + (w.pausedAt ? now - new Date(w.pausedAt).getTime() : 0);
  return Math.max(0, now - new Date(w.startedAt).getTime() - paused);
}

const mins = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/** Mensaje mientras corre el cardio (cronómetro con meta). */
export function cardioLine(elapsedSec: number, targetSec: number, maxSec?: number): string {
  const left = targetSec - elapsedSec;
  if (left <= 0) {
    return maxSec && elapsedSec < maxSec
      ? `¡Llegaste a ${mins(targetSec)} min! Podés seguir hasta ${mins(maxSec)} o terminar.`
      : `¡Llegaste a ${mins(targetSec)} min! Cuando quieras, terminá.`;
  }
  if (left <= 300) return `Últimos ${mins(left)} minutos. ¡Ya casi!`;
  if (elapsedSec >= targetSec / 2) return `¡Mitad del camino! Quedan ${mins(left)} min. Mantené el ritmo.`;
  if (elapsedSec < 60) return 'Arrancá suave y subí hasta un ritmo que te deje hablar en frases completas.';
  return 'Buen ritmo: mantenelo parejo.';
}

function compare(cur: LoggedSet | undefined, prev: LoggedSet | undefined): string | undefined {
  if (!cur || !prev) return undefined;
  if (cur.weightKg !== undefined && prev.weightKg !== undefined) {
    if (cur.weightKg > prev.weightKg) return `Más carga que la vez anterior (${formatKg(prev.weightKg)}).`;
    if (cur.weightKg === prev.weightKg && (cur.reps ?? 0) > (prev.reps ?? 0)) return 'Misma carga y más repeticiones que la vez anterior.';
    if (cur.weightKg === prev.weightKg) return 'Igual que la vez anterior.';
    return undefined;
  }
  if (cur.reps !== undefined && prev.reps !== undefined && cur.reps > prev.reps) return 'Más repeticiones que la vez anterior.';
  return undefined;
}

export interface CoachInput {
  session: Session;
  index: number;
  nameOf: (exerciseId: string) => string;
  previous?: PreviousRecord;
  restLeftMs: number;
  firstTime: boolean;
  /** Cardio con cronómetro: segundos transcurridos y meta. */
  cardio?: { elapsedSec?: number; targetSec: number; maxSec?: number };
}

/** La línea del coach en la sesión: en qué parte estás y qué sigue. */
export function coachLine(p: CoachInput): string {
  const { session, index } = p;
  const items = session.items;
  const n = items.length;
  const item = items[index];
  const name = p.nameOf(item.exerciseId);
  const next = index < n - 1 ? p.nameOf(items[index + 1].exerciseId) : undefined;
  const total = item.sets.length;
  const done = item.sets.filter((s) => s.done).length;

  if (item.skipped) return next ? `Lo salteamos, sin problema. Sigue: ${next}.` : 'Lo salteamos, sin problema. Cuando quieras, terminá la sesión.';

  if (p.cardio) {
    if (done) return next ? `¡Cardio listo! Sigue: ${next}.` : '¡Cardio listo! Tocá Terminar.';
    if (p.cardio.elapsedSec === undefined) return 'Ritmo cómodo: tenés que poder hablar en frases completas. Tocá Empezar cuando arranques.';
    return cardioLine(p.cardio.elapsedSec, p.cardio.targetSec, p.cardio.maxSec);
  }

  if (total > 0 && done === total) return next ? `¡Listo ${name}! Sigue: ${next}.` : '¡Último ejercicio hecho! Tocá Terminar.';

  if (done > 0) {
    const lastDoneIndex = item.sets.map((s) => s.done).lastIndexOf(true);
    const cmp = compare(item.sets[lastDoneIndex], p.previous?.sets[lastDoneIndex]);
    const what = p.restLeftMs > 0 ? `Descansá. Después: serie ${done + 1} de ${total}.` : `Vamos con la serie ${done + 1} de ${total}.`;
    return cmp ? `${cmp} ${what}` : what;
  }

  if (p.firstTime) return `Primera vez con ${name}: mirá cómo se hace antes de arrancar.`;
  if (item.plan?.group && /calor/i.test(item.plan.group.label)) return 'Entrada en calor: sin apuro, prepará el cuerpo.';
  if (index === 0) return `Arrancamos: ${n} ejercicios. Primero, ${name}.`;
  if (index === n - 1) return 'Último ejercicio: ¡ya casi!';
  const ratio = index / (n - 1);
  if (ratio < 0.4) return `Ejercicio ${index + 1} de ${n}. Vas bien.`;
  if (ratio <= 0.6) return `Vas por la mitad: ejercicio ${index + 1} de ${n}.`;
  return `Tramo final: quedan ${n - index} ejercicios.`;
}

// ——— Festejo ———

export interface CelebrationData {
  title: string;
  subtitle: string;
  highlights: string[];
}

/** Resumen para festejar al terminar: lo que hiciste y en qué subiste respecto de tu registro anterior. */
export function celebrate(session: Session, all: Session[], nameOf: (id: string) => string, week?: { done: number; planned: number }): CelebrationData {
  const sum = summarize(session);
  const complete = sessionStatus(session) === 'completa';
  const improved = session.items
    .filter((i) => !i.skipped && i.sets.some((s) => s.done && s.weightKg !== undefined))
    .filter((i) => {
      const prev = previousRecord(all, i.exerciseId, session.id);
      const prevBest = Math.max(-1, ...(prev?.sets ?? []).map((s) => s.weightKg ?? -1));
      const best = Math.max(...i.sets.filter((s) => s.done).map((s) => s.weightKg ?? -1));
      return prevBest >= 0 && best > prevBest;
    })
    .map((i) => nameOf(i.exerciseId));
  const highlights = [
    `${sum.setsDone} ${sum.setsDone === 1 ? 'serie' : 'series'}${sum.minutes ? ` · ${sum.minutes} min` : ''}`,
    ...(improved.length ? [`Subiste carga en: ${improved.slice(0, 3).join(', ')}${improved.length > 3 ? '…' : ''}.`] : []),
    ...(week ? [`Esta semana: ${week.done} de ${week.planned} sesiones.`] : []),
  ];
  return {
    title: '¡Bien hecho!',
    subtitle: complete ? `Completaste ${session.name}.` : `Hiciste ${sum.exercisesDone} de ${sum.exercisesTotal} ejercicios. Igual suma.`,
    highlights,
  };
}

// ——— Hoy ———

export interface TodayInput {
  now: Date;
  planType: 'rutina' | 'actividad' | 'descanso';
  planLabel: string;
  routineName?: string;
  exerciseCount?: number;
  minutes?: number;
  session?: Session;
  activitiesToday: string[];
}

/** Lo que dice el asistente al abrir la app. */
export function todayLine(p: TodayInput): { text: string; sub?: string } {
  const g = greeting(p.now);
  const s = p.session;
  if (s?.status === 'en-curso') {
    const idx = Math.min(s.currentIndex ?? 0, s.items.length - 1);
    return { text: `${g}. Tenés ${s.name} en curso: vas por el ejercicio ${idx + 1} de ${s.items.length}.`, sub: 'Tocá Continuar y seguimos.' };
  }
  if (s) {
    return s.status === 'completa'
      ? { text: `${g}. ¡Hoy ya entrenaste: ${s.name} completa!`, sub: 'Buen trabajo. Mañana seguimos con lo que toque.' }
      : { text: `${g}. ¡Hoy ya entrenaste! Registraste ${s.name}.`, sub: 'Aunque haya quedado incompleta, suma para tu semana.' };
  }
  if (p.routineName) {
    return {
      text: `${g}. Hoy toca ${p.routineName}${p.exerciseCount ? `: ${p.exerciseCount} ${p.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}` : ''}${p.minutes ? `, ≈ ${p.minutes} min` : ''}.`,
      sub: 'Cuando quieras, tocá Comenzar: te voy acompañando.',
    };
  }
  if (p.activitiesToday.length) return { text: `${g}. ¡Hoy ya anotaste ${p.activitiesToday.join(' y ').toLowerCase()}!`, sub: 'Bien ahí: todo movimiento suma.' };
  if (p.planType === 'actividad') return { text: `${g}. Hoy toca ${p.planLabel.toLowerCase()}.`, sub: 'Cuando termines, anotalo en un toque.' };
  return { text: `${g}. Hoy es descanso: recuperarse también es parte del plan.`, sub: 'Si salís a caminar, lo anotás en un toque.' };
}
