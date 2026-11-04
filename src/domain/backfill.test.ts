import { describe, expect, it } from 'vitest';
import { ROUTINES, WEEK_PLAN } from '../data/routines';
import type { Session } from '../db/types';
import { cardioRoutineOn } from './schedule';
import { backupFor, createSession, previousRecord, staleSessions, substituteItem, summarize } from './session';
import { countActivityAs, createActivity, isActivity, isQuickActivity } from './stats';

const routine = (id: string) => ROUTINES.find((r) => r.id === id)!;
const NOW = new Date('2026-11-04T10:00:00-03:00');

function done(date: string, exerciseId: string, weightKg: number): Session {
  return {
    id: `s-${date}`,
    source: 'registro',
    date,
    name: 'x',
    status: 'completa',
    startedAt: `${date}T11:00:00.000Z`,
    items: [{ id: 'i', exerciseId, sets: [{ done: true, weightKg, reps: 10 }] }],
  };
}

describe('máquina ocupada', () => {
  const s = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-11-02', now: NOW });
  const item = { ...s.items[0], plan: { ...s.items[0].plan!, backupExerciseId: 'sentadilla-bulgara' } };

  it('el respaldo mantiene las series planificadas y recuerda el original', () => {
    const logged = { ...item, sets: item.sets.map((x, i) => (i === 0 ? { ...x, done: true, weightKg: 40 } : x)) };
    const swapped = substituteItem(logged, 'sentadilla-bulgara');
    expect(swapped.exerciseId).toBe('sentadilla-bulgara');
    expect(swapped.substitutedFrom).toBe(item.exerciseId);
    expect(swapped.sets).toHaveLength(item.sets.length);
    expect(swapped.sets.every((x) => !x.done && x.weightKg === undefined)).toBe(true);
    expect(swapped.sets.map((x) => x.planned)).toEqual(item.sets.map((x) => x.planned));
  });

  it('volver al original deja todo como en el plan', () => {
    const back = substituteItem(substituteItem(item, 'sentadilla-bulgara'), item.exerciseId);
    expect(back.exerciseId).toBe(item.exerciseId);
    expect(back.substitutedFrom).toBeUndefined();
    expect(back.variant).toBe(item.plan.variant);
  });

  it('cambiar de un respaldo a otro sigue recordando el original', () => {
    const twice = substituteItem(substituteItem(item, 'sentadilla-bulgara'), 'extension-cuadriceps');
    expect(twice.substitutedFrom).toBe(item.exerciseId);
  });

  it('ofrece el respaldo solo si hay uno y no lo estás usando', () => {
    expect(backupFor(item)).toBe('sentadilla-bulgara');
    expect(backupFor(substituteItem(item, 'sentadilla-bulgara'))).toBeUndefined();
    expect(backupFor(s.items[0])).toBeUndefined();
  });
});

describe('sesión hecha en papel', () => {
  const s = createSession({ routine: routine('rutina-a'), mode: 'completa', date: '2026-10-26', now: NOW, backfill: true });

  it('queda marcada y sin minutos', () => {
    expect(s.backfill).toBe(true);
    expect(s.date).toBe('2026-10-26');
    expect(summarize({ ...s, status: 'completa', finishedAt: NOW.toISOString() }, NOW).minutes).toBeUndefined();
  });

  it('no se cierra sola el mismo día que la cargás, aunque su fecha sea vieja', () => {
    expect(staleSessions([s], '2026-11-04')).toEqual({ close: [], discard: [] });
    expect(staleSessions([s], '2026-11-05').discard).toHaveLength(1);
  });

  it('«la vez anterior» se mira hasta la fecha de la sesión cargada', () => {
    const sessions = [done('2026-10-20', 'jalon-al-pecho', 45), done('2026-10-30', 'jalon-al-pecho', 50)];
    expect(previousRecord(sessions, 'jalon-al-pecho')!.sets[0].weightKg).toBe(50);
    expect(previousRecord(sessions, 'jalon-al-pecho', undefined, '2026-10-26')!.sets[0].weightKg).toBe(45);
  });
});

describe('actividad que cuenta como la sesión de cardio', () => {
  const wednesday = '2026-11-04';
  const cardio = WEEK_PLAN.find((p) => p.weekday === 3)!;

  it('el miércoles toca cardio: la caminata puede contar', () => {
    expect(cardio.routineId).toBe('cardio-movilidad');
    expect(cardioRoutineOn({ date: wednesday, weekPlan: WEEK_PLAN, routines: ROUTINES, sessions: [] })?.routineId).toBe('cardio-movilidad');
  });

  it('no si ese día no toca cardio o ya registraste la rutina', () => {
    expect(cardioRoutineOn({ date: '2026-11-02', weekPlan: WEEK_PLAN, routines: ROUTINES, sessions: [] })).toBeUndefined();
    const already = createSession({ routine: routine('cardio-movilidad'), mode: 'completa', date: wednesday, now: NOW });
    expect(cardioRoutineOn({ date: wednesday, weekPlan: WEEK_PLAN, routines: ROUTINES, sessions: [already] })).toBeUndefined();
    expect(cardioRoutineOn({ date: wednesday, weekPlan: WEEK_PLAN, routines: ROUTINES, sessions: [already], excludeId: already.id })).toBeDefined();
  });

  it('se convierte y se puede deshacer sin perder lo registrado', () => {
    const a = createActivity({ exerciseId: 'caminata', name: 'Caminata', date: wednesday, minutes: 40, now: NOW });
    expect(isActivity(a) && isQuickActivity(a)).toBe(true);
    const asCardio = countActivityAs(a, { routineId: 'cardio-movilidad', name: 'Cardio' });
    expect(isActivity(asCardio)).toBe(false);
    expect(asCardio.routineId).toBe('cardio-movilidad');
    expect(asCardio.items).toEqual(a.items);
    const back = countActivityAs(asCardio, undefined);
    expect(isActivity(back)).toBe(true);
    expect(back.name).toBe('Caminata');
    expect(back.routineId).toBeUndefined();
  });
});
