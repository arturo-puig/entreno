import type { LoggedSet, Session } from '../db/types';

// Registros reales que ya tenías, sin fecha conocida. Son referencia, no obligación:
// no cuentan para la constancia semanal y la app no los toma como «carga actual».

const done = (n: number, set: Omit<LoggedSet, 'done'>): LoggedSet[] =>
  Array.from({ length: n }, () => ({ ...set, done: true }));

export const HISTORY: Session[] = [
  {
    id: 'hist-piernas-abdomen',
    source: 'historico',
    date: null,
    name: 'Piernas y abdomen',
    status: 'completa',
    note: 'Sesión de una mañana. Registro histórico: se puede duplicar y convertir en rutina alternativa.',
    items: [
      { id: 'h1', exerciseId: 'trote-cinta', sets: [{ distanceKm: 1, done: true }], note: 'Trote suave' },
      { id: 'h2', exerciseId: 'plancha-frontal', sets: done(3, { durationSec: 60 }) },
      { id: 'h3', exerciseId: 'flexiones', sets: done(3, { reps: 10 }) },
      { id: 'h4', exerciseId: 'abdominales-banco-inclinado', sets: done(4, { reps: 10 }) },
      { id: 'h5', exerciseId: 'extension-cuadriceps', sets: done(3, { weightKg: 50, reps: 10 }) },
      { id: 'h6', exerciseId: 'sentadilla-maquina-guiada', sets: done(3, { weightKg: 40, reps: 10 }) },
      { id: 'h7', exerciseId: 'elevacion-talones-maquina', sets: done(3, { weightKg: 40, reps: 10 }) },
    ],
  },
  {
    id: 'hist-otros-registros',
    source: 'historico',
    date: null,
    name: 'Otros registros',
    status: 'completa',
    note: 'Registros sueltos. No se sabe si fueron en una misma sesión.',
    items: [
      {
        id: 'o1',
        exerciseId: 'jalon-al-pecho',
        sets: [
          { weightKg: 45, reps: 12, done: true },
          { weightKg: 50, reps: 10, done: true },
          { weightKg: 55, reps: 8, done: true },
          { weightKg: 60, reps: 6, done: true },
        ],
      },
      {
        id: 'o2',
        exerciseId: 'remo-sentado-polea',
        sets: [
          { weightKg: 45, reps: 12, done: true },
          { weightKg: 50, reps: 10, done: true },
          { weightKg: 55, reps: 8, done: true },
          { weightKg: 60, reps: 6, done: true },
        ],
      },
      { id: 'o3', exerciseId: 'curl-biceps-mancuernas', sets: done(3, { weightKg: 12.5, reps: 12 }), note: '12,5 kg por brazo' },
      { id: 'o4', exerciseId: 'flexiones', sets: done(3, { reps: 10 }) },
      { id: 'o5', exerciseId: 'plancha-frontal', sets: done(3, { durationSec: 60 }) },
    ],
  },
];
