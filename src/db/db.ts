import Dexie, { type Table } from 'dexie';
import type { AssistantLogEntry, BodyMetric, DayPlan, DayState, Exercise, MetaEntry, Routine, Session, UserMedia } from './types';
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
  userMedia!: Table<UserMedia, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  assistantLog!: Table<AssistantLogEntry, string>;

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
    // v2: videos y fotos propios por ejercicio.
    this.version(2).stores({ userMedia: 'id, exerciseId' });
    // v3: peso corporal y registro del asistente.
    this.version(3).stores({ bodyMetrics: 'id, date', assistantLog: 'id, at' });
  }
}

export const db = new EntrenoDB();

/** Subir este número cuando se agreguen ejercicios, rutinas o variantes a la carga inicial. */
export const SEED_REVISION = 3;

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
      await mergeVariants(database, EXERCISES);
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

/** Suma variantes nuevas de la carga inicial sin quitar las que ya existen. */
async function mergeVariants(database: EntrenoDB, seed: Exercise[]) {
  for (const e of seed) {
    if (!e.variants?.length) continue;
    const current = await database.exercises.get(e.id);
    if (!current) continue;
    const merged = [...new Set([...(current.variants ?? []), ...e.variants])];
    if (merged.length !== (current.variants ?? []).length) await database.exercises.update(e.id, { variants: merged });
  }
}

export async function getWeekPlan(database: EntrenoDB = db): Promise<DayPlan[]> {
  const entry = await database.meta.get('weekPlan');
  return (entry?.value as DayPlan[] | undefined) ?? WEEK_PLAN;
}

export async function setWeekPlan(plan: DayPlan[]): Promise<void> {
  await db.meta.put({ key: 'weekPlan', value: plan });
}

export async function updateDayState(date: string, patch: Partial<Omit<DayState, 'date'>>): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const current = await db.days.get(date);
    await db.days.put({ ...current, ...patch, date });
  });
}
