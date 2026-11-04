import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/exercises';
import { WEEK_PLAN } from '../data/routines';
import { HISTORY } from '../data/history';
import type { BodyMetric, Session } from '../db/types';
import { compliance, createActivity, exerciseProgress, niceTicks, trend, weeklyAverages, weekStats } from './stats';

const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;
const gym = (date: string, exerciseId = 'jalon-al-pecho', sets: Session['items'][0]['sets'] = [{ done: true, weightKg: 50, reps: 10 }]): Session => ({
  id: `s-${date}-${Math.random()}`,
  source: 'registro',
  date,
  name: 'x',
  status: 'completa',
  startedAt: `${date}T10:00:00Z`,
  items: [{ id: 'i', exerciseId, sets }],
});
const TODAY = new Date(2026, 10, 4); // miércoles 4/11/2026

describe('constancia', () => {
  const sessions = [
    gym('2026-10-26'), gym('2026-10-27'), gym('2026-10-29'), gym('2026-10-31'),
    gym('2026-11-02'), gym('2026-11-03'),
    createActivity({ exerciseId: 'padel', name: 'Pádel', date: '2026-10-30', minutes: 90 }),
    { ...gym('2026-11-04'), status: 'en-curso' as const },
    ...HISTORY,
  ];

  it('cuenta sesiones de gimnasio y actividades por semana (lunes a domingo)', () => {
    const w = weekStats(sessions, WEEK_PLAN, TODAY, 2);
    expect(w).toEqual([
      { weekStart: '2026-10-26', gym: 4, activities: 1, planned: 5 },
      { weekStart: '2026-11-02', gym: 2, activities: 0, planned: 5 }, // la sesión en curso no cuenta todavía
    ]);
  });

  it('el cumplimiento no arrastra deuda ni crédito entre semanas', () => {
    expect(compliance([{ weekStart: 'a', gym: 7, activities: 0, planned: 5 }, { weekStart: 'b', gym: 2, activities: 0, planned: 5 }])).toEqual({
      done: 7,
      planned: 10,
      pct: 70,
    });
  });
});

describe('peso corporal', () => {
  const m = (date: string, weightKg?: number, waistCm?: number): BodyMetric => ({ id: date, date, weightKg, waistCm, createdAt: '' });
  const metrics = [m('2026-10-05', 84), m('2026-10-07', 83.6), m('2026-10-12', 83.4), m('2026-10-26', 83), m('2026-11-02', 82.6), m('2026-11-04', 82.2, 95)];

  it('promedia por semana', () => {
    const avgs = weeklyAverages(metrics, 'weightKg');
    expect(avgs.map((a) => [a.weekStart, a.avg])).toEqual([
      ['2026-10-05', 83.8], ['2026-10-12', 83.4], ['2026-10-26', 83], ['2026-11-02', 82.4],
    ]);
    expect(weeklyAverages(metrics, 'waistCm')).toEqual([{ weekStart: '2026-11-02', avg: 95, count: 1 }]);
  });

  it('calcula la tendencia contra ~4 semanas antes', () => {
    expect(trend(weeklyAverages(metrics, 'weightKg'))).toEqual({ delta: -1.4, weeks: 4 });
    expect(trend([{ weekStart: '2026-11-02', avg: 80, count: 1 }])).toBeUndefined();
  });
});

describe('evolución por ejercicio', () => {
  it('toma la mejor serie de cada sesión con fecha, en orden', () => {
    const sessions = [
      gym('2026-11-03', 'jalon-al-pecho', [{ done: true, weightKg: 50, reps: 10 }, { done: true, weightKg: 55, reps: 8 }, { done: false, weightKg: 60 }]),
      gym('2026-10-27', 'jalon-al-pecho', [{ done: true, weightKg: 47.5, reps: 12 }]),
      ...HISTORY,
    ];
    const { metric, points } = exerciseProgress(sessions, ex('jalon-al-pecho'));
    expect(metric).toBe('kg');
    expect(points.map((p) => [p.date, p.value, p.label])).toEqual([
      ['2026-10-27', 47.5, '47,5 kg × 12'],
      ['2026-11-03', 55, '55 kg × 8'],
    ]);
  });

  it('sin carga grafica repeticiones; las actividades, minutos o km', () => {
    expect(exerciseProgress([gym('2026-11-03', 'flexiones', [{ done: true, reps: 12 }])], ex('flexiones')).metric).toBe('reps');
    const bici = createActivity({ exerciseId: 'bicicleta-exterior', name: 'Bici', date: '2026-10-30', minutes: 40, km: 14.5 });
    const p = exerciseProgress([bici], ex('bicicleta-exterior'));
    expect(p.metric).toBe('km');
    expect(p.points[0].label).toBe('14,5 km');
  });
});

describe('actividades', () => {
  it('se registran como sesión completa, aparte del gimnasio', () => {
    const a = createActivity({ exerciseId: 'padel', name: 'Pádel', date: '2026-10-30', minutes: 90, effort: 7, note: ' buen partido ' });
    expect(a).toMatchObject({ kind: 'actividad', status: 'completa', sessionRpe: 7, note: 'buen partido' });
    expect(a.items[0].sets[0]).toMatchObject({ done: true, durationSec: 5400 });
  });
});

describe('ejes', () => {
  it('usa marcas redondas', () => {
    expect(niceTicks(0, 6)).toEqual([0, 2, 4, 6]);
    expect(niceTicks(82.2, 84)).toEqual([82, 82.5, 83, 83.5, 84]);
    expect(niceTicks(45, 45)).toEqual([42, 44, 46, 48]); // un solo valor: eje alrededor de él
  });
});

describe('actividad que cuenta como la sesión del día', () => {
  it('queda como sesión de la rutina de cardio (suma al plan, no como actividad suelta)', () => {
    const a = createActivity({ exerciseId: 'caminata', name: 'Caminata', date: '2026-11-04', minutes: 32, countAs: { routineId: 'cardio-movilidad', name: 'Cardio y movilidad' } });
    expect(a).toMatchObject({ kind: 'entrenamiento', routineId: 'cardio-movilidad', name: 'Cardio y movilidad', status: 'completa' });
    const w = weekStats([a], WEEK_PLAN, TODAY, 1)[0];
    expect(w).toMatchObject({ gym: 1, activities: 0 });
  });
});
