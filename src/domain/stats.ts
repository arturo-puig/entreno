import type { BodyMetric, DayPlan, Exercise, LoggedSet, Session } from '../db/types';
import { addDays, parseISODate, startOfWeek, toISODate } from './dates';
import { formatDuration, formatKg } from './format';
import { countsAsDone } from './schedule';
import { uid } from './edit';

// ——— Constancia ———

export interface WeekStat {
  /** Lunes de la semana (AAAA-MM-DD). */
  weekStart: string;
  /** Sesiones de gimnasio registradas (completas o incompletas: todo suma). */
  gym: number;
  activities: number;
  /** Días de rutina en tu semana planificada. */
  planned: number;
}

export const isActivity = (s: Session) => s.kind === 'actividad';

export function weekStats(sessions: Session[], weekPlan: DayPlan[], today: Date, weeks = 8): WeekStat[] {
  const planned = weekPlan.filter((d) => d.type === 'rutina').length;
  const thisMonday = startOfWeek(today);
  return Array.from({ length: weeks }, (_, k) => {
    const monday = addDays(thisMonday, -7 * (weeks - 1 - k));
    const from = toISODate(monday);
    const to = toISODate(addDays(monday, 6));
    const inWeek = sessions.filter((s) => s.date !== null && s.date >= from && s.date <= to && countsAsDone(s));
    return { weekStart: from, gym: inWeek.filter((s) => !isActivity(s)).length, activities: inWeek.filter(isActivity).length, planned };
  });
}

/**
 * Cumplimiento del plan: sesiones hechas sobre las planificadas, semana por semana.
 * Una semana con más sesiones que las planificadas no compensa otra (no hay deuda ni crédito).
 */
export function compliance(stats: WeekStat[]): { done: number; planned: number; pct: number } {
  const done = stats.reduce((n, w) => n + Math.min(w.gym, w.planned), 0);
  const planned = stats.reduce((n, w) => n + w.planned, 0);
  return { done, planned, pct: planned ? Math.round((done / planned) * 100) : 0 };
}

// ——— Peso corporal ———

export interface WeeklyAverage {
  weekStart: string;
  avg: number;
  count: number;
}

export function weeklyAverages(metrics: BodyMetric[], field: 'weightKg' | 'waistCm'): WeeklyAverage[] {
  const byWeek = new Map<string, number[]>();
  for (const m of metrics) {
    const v = m[field];
    if (v === undefined) continue;
    const wk = toISODate(startOfWeek(parseISODate(m.date)));
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), v]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, vals]) => ({ weekStart, avg: round1(vals.reduce((a, b) => a + b, 0) / vals.length), count: vals.length }));
}

/** Cambio del promedio semanal entre la última semana con datos y ~4 semanas antes (o la primera disponible). */
export function trend(avgs: WeeklyAverage[]): { delta: number; weeks: number } | undefined {
  if (avgs.length < 2) return undefined;
  const last = avgs[avgs.length - 1];
  const target = toISODate(addDays(parseISODate(last.weekStart), -28));
  const base = [...avgs].reverse().find((a) => a.weekStart <= target) ?? avgs[0];
  if (base === last) return undefined;
  const weeks = Math.round((parseISODate(last.weekStart).getTime() - parseISODate(base.weekStart).getTime()) / (7 * 86_400_000));
  return { delta: round1(last.avg - base.avg), weeks };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ——— Evolución por ejercicio ———

export type MetricKind = 'kg' | 'reps' | 'tiempo' | 'minutos' | 'km';

export interface ProgressPoint {
  date: string;
  sessionId: string;
  value: number;
  /** Mejor serie del día, legible: «45 kg × 12». */
  label: string;
  sets: LoggedSet[];
}

/** Qué se grafica según lo que registraste: carga si hay kg; si no, repeticiones, tiempo o distancia. */
export function metricFor(exercise: Exercise | undefined, sets: LoggedSet[]): MetricKind {
  if (sets.some((s) => s.weightKg !== undefined)) return 'kg';
  if (exercise?.movement === 'Cardio') return sets.some((s) => s.distanceKm !== undefined) ? 'km' : 'minutos';
  if (sets.some((s) => s.durationSec !== undefined) && !sets.some((s) => s.reps !== undefined)) return 'tiempo';
  return 'reps';
}

function bestSet(sets: LoggedSet[], metric: MetricKind): LoggedSet | undefined {
  const score = (s: LoggedSet) =>
    metric === 'kg'
      ? (s.weightKg ?? -1) * 1000 + (s.reps ?? 0)
      : metric === 'reps'
        ? (s.reps ?? -1)
        : metric === 'km'
          ? (s.distanceKm ?? -1)
          : (s.durationSec ?? -1);
  return [...sets].sort((a, b) => score(b) - score(a))[0];
}

function valueOf(s: LoggedSet, metric: MetricKind): number | undefined {
  if (metric === 'kg') return s.weightKg;
  if (metric === 'reps') return s.reps;
  if (metric === 'km') return s.distanceKm;
  if (metric === 'minutos') return s.durationSec !== undefined ? s.durationSec / 60 : undefined;
  return s.durationSec;
}

export function labelOf(s: LoggedSet, metric: MetricKind): string {
  if (metric === 'kg') return s.reps !== undefined ? `${formatKg(s.weightKg!)} × ${s.reps}` : formatKg(s.weightKg!);
  if (metric === 'reps') return `${s.reps} reps`;
  if (metric === 'km') return `${String(s.distanceKm).replace('.', ',')} km`;
  return formatDuration(s.durationSec ?? 0);
}

/** Mejor serie de cada sesión con fecha (el histórico sin fecha no se puede ubicar en el tiempo). */
export function exerciseProgress(sessions: Session[], exercise: Exercise): { metric: MetricKind; points: ProgressPoint[] } {
  const entries = sessions
    .filter((s) => s.date !== null && s.status !== 'en-curso')
    .flatMap((s) =>
      s.items
        .filter((i) => i.exerciseId === exercise.id && !i.skipped)
        .map((i) => ({ s, sets: i.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length > 0),
    )
    .sort((a, b) => a.s.date!.localeCompare(b.s.date!) || (a.s.startedAt ?? '').localeCompare(b.s.startedAt ?? ''));
  const metric = metricFor(exercise, entries.flatMap((e) => e.sets));
  const points = entries.flatMap(({ s, sets }) => {
    const best = bestSet(sets, metric);
    const value = best ? valueOf(best, metric) : undefined;
    return best && value !== undefined ? [{ date: s.date!, sessionId: s.id, value, label: labelOf(best, metric), sets }] : [];
  });
  return { metric, points };
}

// ——— Actividades ———

export const ACTIVITIES = [
  { exerciseId: 'padel', label: 'Pádel' },
  { exerciseId: 'bicicleta-exterior', label: 'Bici' },
  { exerciseId: 'caminata', label: 'Caminata' },
  { exerciseId: 'trote', label: 'Trote' },
] as const;

/** Actividades que pueden contar como la sesión de cardio del día. */
export const CARDIO_LIKE: readonly string[] = ['caminata', 'bicicleta-exterior', 'trote'];

/** Actividad que se registró en un toque (aunque ahora cuente como sesión de cardio). */
export const isQuickActivity = (s: Session) => s.id.startsWith('a-');

/**
 * Pasa una actividad a contar como la sesión de cardio del día, o la vuelve a dejar como actividad aparte.
 * Lo registrado (minutos, km, esfuerzo) no cambia.
 */
export function countActivityAs(s: Session, countAs: { routineId: string; name: string } | undefined): Session {
  const label = ACTIVITIES.find((a) => a.exerciseId === s.items[0]?.exerciseId)?.label ?? s.name;
  return countAs
    ? { ...s, kind: 'entrenamiento', routineId: countAs.routineId, name: countAs.name }
    : { ...s, kind: 'actividad', routineId: undefined, name: label };
}

export function createActivity(params: {
  exerciseId: string;
  name: string;
  date: string;
  minutes?: number;
  km?: number;
  effort?: number;
  note?: string;
  now?: Date;
  /** Si el día tocaba una rutina de cardio, puede contar como esa sesión. */
  countAs?: { routineId: string; name: string };
}): Session {
  const now = (params.now ?? new Date()).toISOString();
  return {
    id: `a-${uid()}`,
    kind: params.countAs ? 'entrenamiento' : 'actividad',
    routineId: params.countAs?.routineId,
    source: 'registro',
    date: params.date,
    name: params.countAs?.name ?? params.name,
    status: 'completa',
    startedAt: now,
    finishedAt: now,
    sessionRpe: params.effort,
    note: params.note?.trim() || undefined,
    items: [
      {
        id: uid(),
        exerciseId: params.exerciseId,
        sets: [
          {
            done: true,
            durationSec: params.minutes !== undefined ? Math.round(params.minutes * 60) : undefined,
            distanceKm: params.km,
          },
        ],
      },
    ],
  };
}

// ——— Ejes ———

/** Marcas «redondas» para un eje (0, 20, 40…). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(6)));
  if (out[out.length - 1] < max) out.push(Number((out[out.length - 1] + step).toFixed(6)));
  return out;
}
