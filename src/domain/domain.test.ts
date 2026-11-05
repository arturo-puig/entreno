import { describe, expect, it } from 'vitest';
import { MORNING_ROUTINES, ROUTINES, WEEK_PLAN } from '../data/routines';
import type { Session } from '../db/types';
import { addDays, dayAndMonth, startOfWeek, toISODate, weekdayName } from './dates';
import { estimateRemainingSeconds, estimateRoutineMinutes, estimateRoutineSeconds, personalPace } from './estimate';
import { createSession } from './session';
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
  it('las rutinas del profe: estimación base realista (más que la suma de series y descansos)', () => {
    expect(estimateRoutineMinutes(routine('rutina-a'), 'completa')).toBeGreaterThanOrEqual(75);
    expect(estimateRoutineMinutes(routine('rutina-a'), 'completa')).toBeLessThanOrEqual(100);
    expect(estimateRoutineMinutes(routine('rutina-b'), 'completa')).toBeLessThanOrEqual(110);
  });

  const morning = (id: keyof typeof MORNING_ROUTINES) => ({ ...routine(id), ...MORNING_ROUTINES[id] });

  it('mañanas de martes y jueves: ~40 min con la entrada en calor, aunque vayas un 15 % más lento', () => {
    for (const id of ['tren-superior', 'complementaria-jueves'] as const) {
      const r = morning(id);
      expect(r.items[0], id).toMatchObject({ exerciseId: 'trote-cinta', sets: [{ durationSec: 480, distanceKm: 1 }] });
      expect(estimateRoutineSeconds(r, 'completa') / 60, id).toBeLessThanOrEqual(36);
      expect(estimateRoutineMinutes(r, 'completa', 1.15), id).toBeLessThanOrEqual(40);
      // Lo opcional queda al final.
      const firstOptional = r.items.findIndex((i) => i.optional);
      expect(r.items.slice(firstOptional).every((i) => i.optional), id).toBe(true);
    }
  });

  it('misma carga en las mañanas (salvo el cardio y lo que no lleva peso)', () => {
    const tue = morning('tren-superior');
    expect(tue.items.filter((i) => i.loadPattern === 'fija').map((i) => i.exerciseId)).toEqual([
      'jalon-al-pecho', 'press-inclinado-mancuernas', 'remo-sentado-polea', 'elevaciones-laterales',
    ]);
  });

  it('tu ritmo no estira el cardio: la entrada en calor dura 8 min a cualquier ritmo', () => {
    const r = morning('complementaria-jueves');
    const base = estimateRoutineSeconds(r, 'completa');
    const slow = estimateRoutineSeconds(r, 'completa', 1.5);
    expect(slow - base).toBeCloseTo((base - 480) * 0.5, 5);
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

describe('tu ritmo real', () => {
  const start = new Date('2026-11-05T07:00:00-03:00');
  /** Sesión del jueves con las series hechas cada `gapSec` segundos después de la entrada en calor. */
  function timed(gapSec: number, date = '2026-11-05'): Session {
    const r = { ...ROUTINES.find((x) => x.id === 'complementaria-jueves')!, ...MORNING_ROUTINES['complementaria-jueves'] };
    const s = createSession({ routine: r, mode: 'completa', date, now: start });
    let t = start.getTime() + 8 * 60_000; // la entrada en calor
    s.items[0].sets[0] = { ...s.items[0].sets[0], done: true, durationSec: 480, completedAt: new Date(t).toISOString() };
    for (const it of s.items.slice(1, 4)) {
      for (const set of it.sets) {
        t += gapSec * 1000;
        Object.assign(set, { done: true, reps: 10, weightKg: 20, completedAt: new Date(t).toISOString() });
      }
    }
    return { ...s, status: 'incompleta' };
  }

  it('sin sesiones registradas no hay ajuste', () => {
    expect(personalPace([])).toBeUndefined();
  });

  it('si tardás más que el cálculo base, el factor lo refleja (y no cuenta el cardio)', () => {
    const slow = personalPace([timed(260)]);
    const fast = personalPace([timed(140)]);
    expect(slow!.factor).toBeGreaterThan(1.1);
    expect(fast!.factor).toBeLessThan(slow!.factor);
    expect(slow!.sessions).toBe(1);
  });

  it('ignora sesiones en curso, cargadas en papel y valores absurdos', () => {
    expect(personalPace([{ ...timed(260), status: 'en-curso' }])).toBeUndefined();
    expect(personalPace([{ ...timed(260), backfill: true }])).toBeUndefined();
    expect(personalPace([timed(2000)])).toBeUndefined(); // sesión olvidada abierta
  });

  it('lo que falta de una sesión: lo obligatorio y lo opcional por separado', () => {
    const r = { ...ROUTINES.find((x) => x.id === 'complementaria-jueves')!, ...MORNING_ROUTINES['complementaria-jueves'] };
    const s = createSession({ routine: r, mode: 'completa', date: '2026-11-05', now: start });
    const all = estimateRemainingSeconds(s);
    expect(all.required).toBeCloseTo(estimateRoutineSeconds(r, 'completa'), 5);
    expect(all.optional).toBeGreaterThan(0);
    // Hecha la entrada en calor, faltan ~8 minutos menos.
    s.items[0].sets[0].done = true;
    expect(all.required - estimateRemainingSeconds(s).required).toBeCloseTo(480 + 150, 5);
    // Más lento: falta más.
    expect(estimateRemainingSeconds(s, 1.3).required).toBeGreaterThan(estimateRemainingSeconds(s).required);
  });
});

describe('tiempo de cada día', async () => {
  const { modeForDay, minutesNeeded } = await import('./daytime');
  const tuesday = WEEK_PLAN.find((d) => d.weekday === 2)!;
  const monday = WEEK_PLAN.find((d) => d.weekday === 1)!;
  const rutinaA = routine('rutina-a');

  it('martes a viernes tenés 45 min; lunes y sábado, sin límite', () => {
    expect(WEEK_PLAN.filter((d) => d.minutes === 45).map((d) => d.weekday)).toEqual([2, 3, 4, 5]);
    expect(WEEK_PLAN.find((d) => d.weekday === 6)!.minutes).toBeUndefined();
  });

  it('recuperar la Rutina A un martes: va la versión corta sola (la completa no entra)', () => {
    const c = modeForDay({ routine: rutinaA, plan: tuesday });
    expect(c).toMatchObject({ mode: 'corta', auto: true, budget: 45 });
    expect(c.fullNeeded).toBeGreaterThan(45);
    expect(c.needed).toBeLessThanOrEqual(45);
    // Se suma tu entrada en calor (la Rutina A corta no la trae).
    expect(c.needed).toBeCloseTo(minutesNeeded(rutinaA, 'corta') + 9, 5);
  });

  it('lo que elegiste manda: «Tengo poco tiempo» apagado = completa aunque no entre', () => {
    expect(modeForDay({ routine: rutinaA, plan: tuesday, day: { short: false } })).toMatchObject({ mode: 'completa', auto: false });
    expect(modeForDay({ routine: rutinaA, plan: monday, day: { short: true } })).toMatchObject({ mode: 'corta', auto: false });
  });

  it('el lunes (sin límite) la Rutina A va completa', () => {
    expect(modeForDay({ routine: rutinaA, plan: monday })).toMatchObject({ mode: 'completa', auto: false, budget: undefined });
  });

  it('las mañanas nuevas entran completas (ya traen la entrada en calor)', () => {
    const r = { ...routine('tren-superior'), ...MORNING_ROUTINES['tren-superior'] };
    const c = modeForDay({ routine: r, plan: tuesday });
    expect(c.mode).toBe('completa');
    expect(c.needed).toBeCloseTo(minutesNeeded(r, 'completa'), 5);
  });
});
