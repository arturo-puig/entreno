import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/exercises';
import { HISTORY } from '../data/history';
import { ROUTINES } from '../data/routines';
import type { Session } from '../db/types';
import {
  completeSet, createSession, fieldsFor, formatClock, previousRecord, progressionHint, remainingMs, sessionStatus, setHints, staleSessions, summarize,
} from './session';

const routine = (id: string) => ROUTINES.find((r) => r.id === id)!;
const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;
const NOW = new Date('2026-11-03T08:00:00-03:00');

function doneSession(date: string, routineId: string, exerciseId: string, sets: { weightKg?: number; reps?: number }[]): Session {
  return {
    id: `s-${date}-${exerciseId}`,
    source: 'registro',
    date,
    name: routineId,
    routineId,
    status: 'completa',
    startedAt: `${date}T08:00:00.000Z`,
    items: [{ id: 'i', exerciseId, sets: sets.map((s) => ({ ...s, done: true })) }],
  };
}

describe('crear sesión', () => {
  it('copia el plan y arranca con todas las series pendientes', () => {
    const s = createSession({ routine: routine('rutina-a'), mode: 'completa', readiness: 'bien', date: '2026-11-02', now: NOW });
    expect(s.status).toBe('en-curso');
    expect(s.items).toHaveLength(9);
    expect(s.items[3].sets.map((x) => x.planned?.reps)).toEqual([12, 10, 8, 6]);
    expect(s.items.every((i) => i.sets.every((x) => !x.done && x.weightKg === undefined))).toBe(true);
    expect(s.items[3].plan?.loadPattern).toBe('ascendente');
  });

  it('la versión corta usa solo los ejercicios y series aprobados', () => {
    const s = createSession({ routine: routine('rutina-a'), mode: 'corta', date: '2026-11-02', now: NOW });
    expect(s.items.map((i) => i.exerciseId)).toEqual(['sentadilla-smith', 'hip-thrust-maquina', 'press-banca-barra']);
    expect(s.items[0].sets.map((x) => x.planned?.reps)).toEqual([12, 10, 8]);
  });
});

describe('la vez anterior', () => {
  const sessions = [
    ...HISTORY,
    doneSession('2026-10-27', 'tren-superior', 'jalon-al-pecho', [{ weightKg: 50, reps: 10 }]),
    doneSession('2026-10-29', 'complementaria-jueves', 'jalon-al-pecho', [{ weightKg: 52.5, reps: 11 }]),
  ];

  it('toma la sesión registrada más reciente', () => {
    const p = previousRecord(sessions, 'jalon-al-pecho')!;
    expect(p.isHistoric).toBe(false);
    expect(p.sets[0].weightKg).toBe(52.5);
  });

  it('si no hay sesiones, usa el registro histórico como referencia', () => {
    const p = previousRecord(HISTORY, 'jalon-al-pecho')!;
    expect(p.isHistoric).toBe(true);
    expect(p.sets.map((x) => x.weightKg)).toEqual([45, 50, 55, 60]);
  });

  it('ignora la sesión actual y las que están en curso', () => {
    const open: Session = { ...doneSession('2026-11-03', 'x', 'jalon-al-pecho', [{ weightKg: 99, reps: 1 }]), status: 'en-curso' };
    expect(previousRecord([...sessions, open], 'jalon-al-pecho')!.sets[0].weightKg).toBe(52.5);
    expect(previousRecord(sessions, 'jalon-al-pecho', 's-2026-10-29-jalon-al-pecho')!.sets[0].weightKg).toBe(50);
  });

  it('no hay anterior para un ejercicio nunca hecho', () => {
    expect(previousRecord(sessions, 'curl-biceps-inclinado')).toBeUndefined();
  });
});

describe('valores sugeridos y completar series', () => {
  const s = createSession({ routine: routine('tren-superior'), mode: 'completa', date: '2026-11-03', now: NOW });
  const jalon = s.items[0];
  const prev = previousRecord(HISTORY, 'jalon-al-pecho');

  it('sugiere la carga anterior y muestra el rango del plan sin inventar repeticiones', () => {
    const h = setHints(jalon, 0, prev);
    expect(h.weightKg).toBe(45);
    expect(h.repsLabel).toBe('8–12');
    expect(h.reps).toBeUndefined();
  });

  it('con repeticiones exactas, el plan es la sugerencia', () => {
    const a = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-11-02', now: NOW });
    expect(setHints(a.items[3], 1).reps).toBe(10);
    expect(setHints(a.items[3], 1).weightKg).toBeUndefined();
  });

  it('usa la carga de referencia del profe solo en la primera serie', () => {
    const b = createSession({ routine: routine('rutina-b'), mode: 'completa', date: '2026-11-07', now: NOW });
    const pm = b.items.find((i) => i.exerciseId === 'peso-muerto-unilateral')!;
    expect(setHints(pm, 0).weightKg).toBe(25);
  });

  it('al completar sin escribir, guarda lo que se ve; lo escrito tiene prioridad', () => {
    const done = completeSet(jalon.sets[0], setHints(jalon, 0, prev), NOW);
    expect(done).toMatchObject({ done: true, weightKg: 45 });
    expect(done.reps).toBeUndefined();
    const typed = completeSet({ ...jalon.sets[0], weightKg: 47.5, reps: 11 }, setHints(jalon, 0, prev), NOW);
    expect(typed).toMatchObject({ weightKg: 47.5, reps: 11, done: true });
  });

  it('elige los campos según el ejercicio', () => {
    const a = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-11-02', now: NOW });
    expect(fieldsFor(ex('sentadilla-smith'), a.items[3])).toEqual(['weightKg', 'reps']);
    expect(fieldsFor(ex('sentadilla-isometrica'), a.items[7])).toEqual(['durationSec']);
    expect(fieldsFor(ex('plancha-lateral-rotacion'), a.items[2])).toEqual(['reps']);
    const c = createSession({ routine: routine('cardio-movilidad'), mode: 'completa', date: '2026-11-04', now: NOW });
    expect(fieldsFor(ex('caminata-cinta'), c.items[0])).toEqual(['durationMin', 'distanceKm']);
  });
});

describe('estado, resumen y sesiones abiertas', () => {
  it('incompleta si falta una serie obligatoria u omitiste un ejercicio; las opcionales no cuentan', () => {
    const s = createSession({ routine: routine('complementaria-jueves'), mode: 'completa', date: '2026-11-05', now: NOW });
    expect(sessionStatus(s)).toBe('incompleta');
    for (const i of s.items) if (!i.optional) for (const x of i.sets) if (!x.planned?.optional) x.done = true;
    expect(sessionStatus(s)).toBe('completa'); // la 3.ª serie del press y el jalón son opcionales
    s.items[0].skipped = true;
    expect(sessionStatus(s)).toBe('incompleta');
  });

  it('resume series y duración', () => {
    const s = createSession({ routine: routine('tren-superior'), mode: 'completa', date: '2026-11-03', now: NOW });
    s.items[0].sets[0].done = true;
    s.items[4].skipped = true;
    const sum = summarize(s, new Date(NOW.getTime() + 25 * 60000));
    expect(sum).toMatchObject({ setsDone: 1, setsPlanned: 13, exercisesDone: 1, exercisesTotal: 5, skipped: 1, minutes: 25 });
  });

  it('cierra o descarta sesiones abiertas de días anteriores, sin tocar las de hoy', () => {
    const a = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-11-02', now: NOW });
    const b = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-11-02', now: NOW });
    b.items[0].sets[0].done = true;
    const c = createSession({ routine: routine('tren-superior'), mode: 'completa', date: '2026-11-03', now: NOW });
    const r = staleSessions([a, b, c], '2026-11-03');
    expect(r.discard.map((s) => s.id)).toEqual([a.id]);
    expect(r.close.map((s) => s.id)).toEqual([b.id]);
  });
});

describe('sugerencia de progresión', () => {
  const s = createSession({ routine: routine('tren-superior'), mode: 'completa', date: '2026-11-10', now: NOW });
  const jalon = s.items[0];

  it('sugiere subir solo si llegaste al máximo del rango en todas las series', () => {
    const top = previousRecord([doneSession('2026-11-03', 'tren-superior', 'jalon-al-pecho', [{ weightKg: 50, reps: 12 }, { weightKg: 50, reps: 12 }, { weightKg: 50, reps: 12 }])], 'jalon-al-pecho');
    expect(progressionHint(jalon, top)).toMatch(/aumento más chico/);
    const notYet = previousRecord([doneSession('2026-11-03', 'tren-superior', 'jalon-al-pecho', [{ weightKg: 50, reps: 12 }, { weightKg: 50, reps: 11 }, { weightKg: 50, reps: 12 }])], 'jalon-al-pecho');
    expect(progressionHint(jalon, notYet)).toBeUndefined();
  });

  it('nunca sugiere en pirámides, pendientes ni a partir del histórico', () => {
    const a = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-11-09', now: NOW });
    const smith = previousRecord([doneSession('2026-11-02', 'rutina-a', 'sentadilla-smith', [{ reps: 12 }, { reps: 10 }, { reps: 8 }, { reps: 6 }])], 'sentadilla-smith');
    expect(progressionHint(a.items[3], smith)).toBeUndefined();
    expect(progressionHint(jalon, previousRecord(HISTORY, 'jalon-al-pecho'))).toBeUndefined();
  });
});

describe('temporizador', () => {
  it('calcula el tiempo restante desde la hora de fin (no se desfasa)', () => {
    const end = new Date(NOW.getTime() + 90_000).toISOString();
    expect(remainingMs(end, NOW.getTime())).toBe(90_000);
    expect(remainingMs(end, NOW.getTime() + 200_000)).toBe(0);
    expect(formatClock(90_000)).toBe('1:30');
    expect(formatClock(4_200)).toBe('0:05');
  });
});
