import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/exercises';
import { HISTORY } from '../data/history';
import { ROUTINES } from '../data/routines';
import type { Session } from '../db/types';
import { cardioLine, celebrate, coachLine, greeting, todayLine, workElapsedMs } from './coach';
import { createSession, previousRecord } from './session';

const nameOf = (id: string) => EXERCISES.find((e) => e.id === id)?.name ?? id;
const NOW = new Date(2026, 10, 3, 8, 0);
const tren = () => createSession({ routine: ROUTINES.find((r) => r.id === 'tren-superior')!, mode: 'completa', date: '2026-11-03', now: NOW });
const rutinaA = () => createSession({ routine: ROUTINES.find((r) => r.id === 'rutina-a')!, mode: 'completa', date: '2026-11-02', now: NOW });

describe('saludo', () => {
  it('según la hora', () => {
    expect(greeting(new Date(2026, 10, 3, 8))).toBe('Buen día');
    expect(greeting(new Date(2026, 10, 3, 15))).toBe('Buenas tardes');
    expect(greeting(new Date(2026, 10, 3, 21))).toBe('Buenas noches');
  });
});

describe('línea del coach', () => {
  const base = { nameOf, restLeftMs: 0, firstTime: false };

  it('marca la fase de la sesión', () => {
    const a = rutinaA();
    expect(coachLine({ ...base, session: a, index: 0 })).toBe('Entrada en calor: sin apuro, prepará el cuerpo.');
    expect(coachLine({ ...base, session: a, index: 4 })).toBe('Vas por la mitad: ejercicio 5 de 9.');
    expect(coachLine({ ...base, session: a, index: 6 })).toBe('Tramo final: quedan 3 ejercicios.');
    expect(coachLine({ ...base, session: a, index: 8 })).toBe('Último ejercicio: ¡ya casi!');
    const t = tren();
    expect(coachLine({ ...base, session: t, index: 0 })).toBe('Arrancamos: 5 ejercicios. Primero, Jalón al pecho.');
  });

  it('primera vez: invita a mirar cómo se hace', () => {
    expect(coachLine({ ...base, session: tren(), index: 1, firstTime: true })).toMatch(/Primera vez con Press inclinado/);
  });

  it('después de una serie: compara solo si mejoraste o igualaste, y dice qué sigue', () => {
    const t = tren();
    const prev = previousRecord(HISTORY, 'jalon-al-pecho'); // 45 × 12 en la primera serie
    t.items[0].sets[0] = { ...t.items[0].sets[0], done: true, weightKg: 47.5, reps: 10 };
    expect(coachLine({ ...base, session: t, index: 0, previous: prev, restLeftMs: 60_000 })).toBe(
      'Más carga que la vez anterior (45 kg). Descansá. Después: serie 2 de 3.',
    );
    t.items[0].sets[0].weightKg = 40; // bajó: no se comenta
    expect(coachLine({ ...base, session: t, index: 0, previous: prev })).toBe('Vamos con la serie 2 de 3.');
  });

  it('al terminar las series, anuncia el siguiente; al final, Terminar', () => {
    const t = tren();
    t.items[0].sets.forEach((s) => (s.done = true));
    expect(coachLine({ ...base, session: t, index: 0 })).toBe('¡Listo Jalón al pecho! Sigue: Press inclinado con mancuernas.');
    t.items[4].sets.forEach((s) => (s.done = true));
    expect(coachLine({ ...base, session: t, index: 4 })).toBe('¡Último ejercicio hecho! Tocá Terminar.');
    t.items[2].skipped = true;
    expect(coachLine({ ...base, session: t, index: 2 })).toMatch(/Lo salteamos/);
  });
});

describe('cardio', () => {
  it('acompaña el cronómetro con la meta', () => {
    expect(cardioLine(20, 1800, 2100)).toMatch(/Arrancá suave/);
    expect(cardioLine(600, 1800)).toBe('Buen ritmo: mantenelo parejo.');
    expect(cardioLine(900, 1800)).toBe('¡Mitad del camino! Quedan 15 min. Mantené el ritmo.');
    expect(cardioLine(1560, 1800)).toBe('Últimos 4 minutos. ¡Ya casi!');
    expect(cardioLine(1800, 1800, 2100)).toBe('¡Llegaste a 30 min! Podés seguir hasta 35 o terminar.');
  });

  it('el tiempo descuenta las pausas', () => {
    const start = new Date('2026-11-04T08:00:00Z').getTime();
    const w = { itemId: 'i', setIndex: 0, startedAt: new Date(start).toISOString(), durationSec: 1800, mode: 'cronometro' as const, pausedMs: 60_000 };
    expect(workElapsedMs(w, start + 600_000)).toBe(540_000);
    expect(workElapsedMs({ ...w, pausedAt: new Date(start + 500_000).toISOString() }, start + 600_000)).toBe(440_000); // 600 − 60 de antes − 100 en pausa
  });
});

describe('festejo', () => {
  it('resume y destaca dónde subiste carga respecto de tu registro anterior', () => {
    const t = tren();
    t.startedAt = '2026-11-03T11:00:00.000Z';
    t.finishedAt = '2026-11-03T11:35:00.000Z';
    t.items[0].sets = [{ done: true, weightKg: 62.5, reps: 6 }]; // el histórico llegó a 60 kg
    t.items[2].sets = [{ done: true, weightKg: 40, reps: 12 }];
    const c = celebrate(t, [...HISTORY, t], nameOf, { done: 2, planned: 5 });
    expect(c.title).toBe('¡Bien hecho!');
    expect(c.subtitle).toBe('Hiciste 2 de 5 ejercicios. Igual suma.');
    expect(c.highlights).toEqual(['2 series · 35 min', 'Subiste carga en: Jalón al pecho.', 'Esta semana: 2 de 5 sesiones.']);
  });

  it('completa: lo dice', () => {
    const t = tren();
    t.items.forEach((i) => i.sets.forEach((s) => (s.done = true)));
    expect(celebrate(t, [t], nameOf).subtitle).toBe('Completaste Tren superior.');
  });
});

describe('Hoy', () => {
  it('saluda con lo que toca, lo que está en curso o lo que ya hiciste', () => {
    expect(todayLine({ now: NOW, planType: 'rutina', planLabel: 'x', routineName: 'Tren superior', exerciseCount: 5, minutes: 30, activitiesToday: [] }).text).toBe(
      'Buen día. Hoy toca Tren superior: 5 ejercicios, ≈ 30 min.',
    );
    const s: Session = { ...tren(), currentIndex: 2 };
    expect(todayLine({ now: NOW, planType: 'rutina', planLabel: 'x', routineName: 'Tren superior', session: s, activitiesToday: [] }).text).toMatch(/vas por el ejercicio 3 de 5/);
    expect(todayLine({ now: NOW, planType: 'rutina', planLabel: 'x', session: { ...s, status: 'completa' }, activitiesToday: [] }).text).toMatch(/completa!/);
    expect(todayLine({ now: NOW, planType: 'descanso', planLabel: 'Descanso', activitiesToday: [] }).text).toMatch(/descanso/);
    expect(todayLine({ now: NOW, planType: 'actividad', planLabel: 'Pádel', activitiesToday: ['Pádel'] }).text).toMatch(/anotaste pádel/);
  });
});
