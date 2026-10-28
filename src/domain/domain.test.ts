import { describe, expect, it } from 'vitest';
import { ROUTINES, WEEK_PLAN } from '../data/routines';
import type { Session } from '../db/types';
import { addDays, dayAndMonth, startOfWeek, toISODate, weekdayName } from './dates';
import { estimateRoutineMinutes } from './estimate';
import { summarizeSets, formatKg, formatLoggedSet } from './format';
import { setsForMode, itemsForMode, pendingQuestions } from './plan';
import { missedProfessorRoutine, planFor, weekOverview } from './schedule';

const routine = (id: string) => ROUTINES.find((r) => r.id === id)!;
const item = (routineId: string, itemId: string) => routine(routineId).items.find((i) => i.id === itemId)!;
// 26/10/2026 es lunes.
const MON = new Date(2026, 9, 26);

function session(date: string, routineId: string, done = true): Session {
  return {
    id: `${date}-${routineId}`,
    source: 'registro',
    date,
    name: routineId,
    routineId,
    status: 'completa',
    items: [{ id: 'i', exerciseId: 'x', sets: [{ done }] }],
  };
}

describe('fechas', () => {
  it('usa la fecha local y semanas de lunes a domingo', () => {
    expect(toISODate(MON)).toBe('2026-10-26');
    expect(toISODate(startOfWeek(addDays(MON, 6)))).toBe('2026-10-26'); // domingo → lunes anterior
    expect(weekdayName(addDays(MON, 2))).toBe('miércoles');
    expect(dayAndMonth(addDays(MON, 2))).toBe('28 de octubre');
  });
});

describe('planificación semanal', () => {
  it('asigna cada día según tu semana', () => {
    const ids = Array.from({ length: 7 }, (_, i) => planFor(WEEK_PLAN, addDays(MON, i)));
    expect(ids.map((p) => p.routineId ?? p.type)).toEqual([
      'rutina-a', 'tren-superior', 'cardio-movilidad', 'complementaria-jueves', 'actividad', 'rutina-b', 'descanso',
    ]);
  });

  it('marca como hecho un día con al menos una serie completada', () => {
    const w = weekOverview(WEEK_PLAN, [session('2026-10-26', 'rutina-a')], addDays(MON, 1));
    expect(w[0].done).toBe(true);
    expect(w[1].isToday).toBe(true);
    expect(w[0].isPast).toBe(true);
  });

  it('una sesión sin series completadas no cuenta como hecha', () => {
    const w = weekOverview(WEEK_PLAN, [session('2026-10-26', 'rutina-a', false)], addDays(MON, 1));
    expect(w[0].done).toBe(false);
  });
});

describe('sugerencia de recuperar A o B', () => {
  const base = { weekPlan: WEEK_PLAN, routines: ROUTINES };

  it('sugiere la A el martes si el lunes no se hizo', () => {
    expect(missedProfessorRoutine({ ...base, sessions: [], today: addDays(MON, 1) })?.id).toBe('rutina-a');
  });

  it('no sugiere nada si la A se hizo', () => {
    const sessions = [session('2026-10-26', 'rutina-a')];
    expect(missedProfessorRoutine({ ...base, sessions, today: addDays(MON, 1) })).toBeUndefined();
  });

  it('no sugiere el lunes ni el sábado (ya toca una rutina del profe)', () => {
    expect(missedProfessorRoutine({ ...base, sessions: [], today: MON })).toBeUndefined();
    expect(missedProfessorRoutine({ ...base, sessions: [], today: addDays(MON, 5) })).toBeUndefined();
  });

  it('el domingo sugiere la B si no se hizo (y la A ya estaba hecha)', () => {
    const sessions = [session('2026-10-26', 'rutina-a')];
    expect(missedProfessorRoutine({ ...base, sessions, today: addDays(MON, 6) })?.id).toBe('rutina-b');
  });

  it('no arrastra nada a la semana siguiente', () => {
    // Lunes siguiente: nada de la semana anterior.
    expect(missedProfessorRoutine({ ...base, sessions: [], today: addDays(MON, 7) })).toBeUndefined();
    // Martes siguiente: solo la A de esa semana.
    expect(missedProfessorRoutine({ ...base, sessions: [], today: addDays(MON, 8) })?.id).toBe('rutina-a');
  });

  it('respeta si ya elegiste otra rutina o descartaste la sugerencia', () => {
    const today = addDays(MON, 1);
    expect(missedProfessorRoutine({ ...base, sessions: [], today, day: { date: '', routineId: 'tren-superior' } })).toBeUndefined();
    expect(missedProfessorRoutine({ ...base, sessions: [], today, day: { date: '', dismissedSuggestion: true } })).toBeUndefined();
  });

  it('no sugiere si hoy ya entrenaste', () => {
    const sessions = [session('2026-10-27', 'tren-superior')];
    expect(missedProfessorRoutine({ ...base, sessions, today: addDays(MON, 1) })).toBeUndefined();
  });
});

describe('versión corta', () => {
  it('no modifica la rutina original', () => {
    const a = routine('rutina-a');
    const before = JSON.stringify(a);
    itemsForMode(a, 'corta');
    setsForMode(item('rutina-a', 'a4'), 'corta');
    expect(JSON.stringify(a)).toBe(before);
  });

  it('toma las primeras series de la pirámide', () => {
    expect(setsForMode(item('rutina-a', 'a4'), 'corta').map((s) => s.reps)).toEqual([12, 10, 8]);
  });

  it('el cardio corto dura 20 minutos', () => {
    expect(setsForMode(item('cardio-movilidad', 'x1'), 'corta')).toEqual([{ durationSec: 1200 }]);
  });

  it('cada día con fuerza queda en 20–25 minutos', () => {
    for (const id of ['rutina-a', 'tren-superior', 'complementaria-jueves', 'rutina-b', 'cardio-movilidad']) {
      const m = estimateRoutineMinutes(routine(id), 'corta');
      expect(m, id).toBeGreaterThanOrEqual(20);
      expect(m, id).toBeLessThanOrEqual(25);
    }
  });
});

describe('estimación de duración', () => {
  it('las rutinas del profe rondan los 75 minutos disponibles', () => {
    expect(estimateRoutineMinutes(routine('rutina-a'), 'completa')).toBeGreaterThanOrEqual(65);
    expect(estimateRoutineMinutes(routine('rutina-a'), 'completa')).toBeLessThanOrEqual(80);
    expect(estimateRoutineMinutes(routine('rutina-b'), 'completa')).toBeLessThanOrEqual(85);
  });

  it('las complementarias entran en 45 minutos', () => {
    expect(estimateRoutineMinutes(routine('tren-superior'), 'completa')).toBeLessThanOrEqual(45);
    expect(estimateRoutineMinutes(routine('complementaria-jueves'), 'completa')).toBeLessThanOrEqual(45);
  });
});

describe('formato', () => {
  it('resume las series planificadas', () => {
    expect(summarizeSets(item('rutina-a', 'a4'))).toBe('12 · 10 · 8 · 6');
    expect(summarizeSets(item('tren-superior', 'm1'))).toBe('3 × 8–12');
    expect(summarizeSets(item('rutina-a', 'a8'))).toBe('3 × 1 min');
    expect(summarizeSets(item('rutina-a', 'a3'))).toBe('3 × 10 por lado');
    expect(summarizeSets(item('complementaria-jueves', 'j2'))).toBe('2–3 × 8–12');
    expect(summarizeSets(item('rutina-a', 'a7'))).toBe('4 series · repeticiones a confirmar');
    expect(summarizeSets(item('cardio-movilidad', 'x1'))).toBe('30–35 min');
    expect(summarizeSets(item('cardio-movilidad', 'x1'), 'corta')).toBe('20 min');
  });

  it('usa coma decimal', () => {
    expect(formatKg(12.5)).toBe('12,5 kg');
    expect(formatLoggedSet({ weightKg: 45, reps: 12, done: true })).toBe('45 kg × 12');
    expect(formatLoggedSet({ durationSec: 60, done: true })).toBe('1 min');
  });

  it('lista las preguntas pendientes sin repetir', () => {
    expect(pendingQuestions(routine('rutina-b')).length).toBe(4);
    expect(pendingQuestions(routine('rutina-a')).length).toBe(1);
  });
});

describe('búsqueda de ejercicios', async () => {
  const { EXERCISES } = await import('../data/exercises');
  const { filterExercises, NO_FILTERS } = await import('./search');
  const names = (f: Partial<typeof NO_FILTERS>) => filterExercises(EXERCISES, { ...NO_FILTERS, ...f }).map((e) => e.id);

  it('busca sin importar tildes ni mayúsculas, y por nombre alternativo', () => {
    expect(names({ q: 'biceps' })).toEqual(expect.arrayContaining(['curl-biceps-inclinado', 'curl-biceps-mancuernas']));
    expect(names({ q: 'REMO ALTO' })).toContain('remo-al-menton');
    expect(names({ q: 'lat pulldown' })).toEqual(['jalon-al-pecho']);
  });

  it('busca por músculo y combina filtros', () => {
    expect(names({ q: 'isquiotibiales' })).toEqual(expect.arrayContaining(['curl-femoral-sentado', 'peso-muerto-unilateral']));
    const pecho = names({ group: 'Pecho', equipment: 'Máquina' });
    expect(pecho).toEqual(['press-pecho-maquina']);
    expect(names({ movement: 'Cardio', q: 'cinta' })).toEqual(expect.arrayContaining(['caminata-cinta', 'trote-cinta']));
  });
});
