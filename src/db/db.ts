import Dexie, { type Table } from 'dexie';
import type { DayPlan, DayState, Exercise, MetaEntry, Routine, Session } from './types';
import { EXERCISES } from '../data/exercises';
import { ROUTINES, WEEK_PLAN } from '../data/routines';
import { HISTORY } from '../data/history';

export class EntrenoDB extends Dexie {
  // Las claves son strings que definimos nosotros (no autoincrementales).
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<Session, string>;
  days!: Table<DayState, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'entreno') {
    super(name);
    this.version(1).stores({
      exercises: 'id, group',
      routines: 'id',
      // Las sesiones con fecha desconocida (null) quedan fuera del índice «date».
      sessions: 'id, date, routineId, source',
      days: 'date',
      meta: 'key',
    });
  }
}

export const db = new EntrenoDB();

/** Subir este número cuando se agreguen ejercicios o rutinas nuevas a la carga inicial. */
export const SEED_REVISION = 1;

/**
 * Agrega lo que falte de la carga inicial sin pisar nada que ya exista,
 * así tus ediciones nunca se pierden al actualizar la app.
 */
export async function ensureSeed(database: EntrenoDB = db): Promise<void> {
  const current = (await database.meta.get('seedRevision'))?.value as number | undefined;
  if (current !== undefined && current >= SEED_REVISION) return;

  await database.transaction(
    'rw',
    [database.exercises, database.routines, database.sessions, database.meta],
    async () => {
      await addMissing(database.exercises, EXERCISES);
      await addMissing(database.routines, ROUTINES);
      await addMissing(database.sessions, HISTORY);
      if (!(await database.meta.get('weekPlan'))) {
        await database.meta.put({ key: 'weekPlan', value: WEEK_PLAN });
      }
      await database.meta.put({ key: 'seedRevision', value: SEED_REVISION });
    },
  );
}

async function addMissing<T extends { id: string }>(table: Table<T, string>, rows: T[]) {
  const existing = await table.bulkGet(rows.map((r) => r.id));
  const missing = rows.filter((_, i) => existing[i] === undefined);
  if (missing.length) await table.bulkAdd(missing);
}

export async function getWeekPlan(database: EntrenoDB = db): Promise<DayPlan[]> {
  const entry = await database.meta.get('weekPlan');
  return (entry?.value as DayPlan[] | undefined) ?? WEEK_PLAN;
}

export async function updateDayState(date: string, patch: Partial<Omit<DayState, 'date'>>): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const current = await db.days.get(date);
    await db.days.put({ ...current, ...patch, date });
  });
}
