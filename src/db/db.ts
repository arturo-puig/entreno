import Dexie, { type Table } from 'dexie';
import type { AssistantLogEntry, BodyMetric, DayPlan, DayState, Exercise, MetaEntry, Routine, RoutineItem, Session, UserMedia } from './types';
import { EXERCISES } from '../data/exercises';
import { MORNING_ROUTINES, ROUTINES, WEEK_PLAN } from '../data/routines';
import { HISTORY } from '../data/history';
import { withNewVersion } from '../domain/edit';

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
export const SEED_REVISION = 6;

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
      await refreshSeedTexts(database, EXERCISES);
      await addMissing(database.routines, ROUTINES);
      await applyRequestedChanges(database, current);
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

/**
 * Textos de la carga inicial que se corrigieron después (con datos tuyos). Se guarda la versión anterior:
 * si el ejercicio todavía la tiene tal cual, pasa a la nueva; si la editaste, no se toca.
 */
const PREVIOUS_SEED_TEXT: Record<string, Pick<Exercise, 'instructions' | 'instructionsNote' | 'commonErrors'>> = {
  'manguito-rotador-banda': {
    instructions: [
      'Pisá la banda con el pie derecho.',
      'Con la mano derecha, levantá la banda manteniendo el codo alineado con el hombro.',
      'Hacé las repeticiones y cambiá de lado.',
    ],
    instructionsNote: 'Pasos 1 y 2: según tu descripción. El paso 3 (cambiar de lado) es una suposición: corregilo si no corresponde.',
    commonErrors: [
      'Subir el hombro hacia la oreja.',
      'Usar una banda tan dura que pierdas la posición del codo.',
      'Hacerlo rápido: es un ejercicio de control.',
    ],
  },
};

/** Martes: el dead bug (m5) pasa a ser rueda abdominal, con las mismas series y repeticiones. */
function wheelForDeadBug(items: RoutineItem[]): boolean {
  const item = items.find((i) => i.id === 'm5');
  if (!item || item.exerciseId !== 'dead-bug' || item.notation !== '2 × 8–10 por lado') return false;
  item.exerciseId = 'rueda-abdominal';
  item.notation = '2 × 8–10';
  delete item.perSide;
  item.note = 'Reemplaza al dead bug, a tu pedido. Si no llegás a 8 con buena técnica, acortá el recorrido.';
  return true;
}

/** Lo que define el plan de una rutina (sin notas ni respaldos, que no cambian lo que hacés). */
function sameStructure(a: RoutineItem[], b: RoutineItem[]): boolean {
  const key = (items: RoutineItem[]) =>
    JSON.stringify(
      items.map((i) => ({
        id: i.id,
        exerciseId: i.exerciseId,
        variant: i.variant,
        notation: i.notation,
        sets: i.sets,
        restSec: i.restSec,
        optional: i.optional,
        perSide: i.perSide,
        loadPattern: i.loadPattern,
        short: i.short,
        group: i.group,
      })),
    );
  return key(a) === key(b);
}

/**
 * Cambios en las rutinas que pediste vos. Cada uno se considera una sola vez (queda anotado en `meta`) y se
 * aplica solo si esa rutina seguía como venía en la app: si la editaste, no se toca. La rutina sube de
 * versión y «Volver a la versión original» los deshace (y no se vuelven a aplicar).
 */
const REQUESTED_CHANGES: { id: string; since: number; apply: (database: EntrenoDB) => Promise<void> }[] = [
  {
    // Noviembre de 2026: el dead bug del martes no te exige → rueda abdominal.
    id: 'rueda-abdominal',
    since: 5,
    apply: async (database) => {
      const r = await database.routines.get('tren-superior');
      if (r && wheelForDeadBug(r.items)) await database.routines.put(withNewVersion(r));
    },
  },
  {
    // Noviembre de 2026: mañanas de martes y jueves en ~40 min con la entrada en calor (ver MORNING_ROUTINES).
    id: 'mananas-40-min',
    since: 6,
    apply: async (database) => {
      for (const [id, next] of Object.entries(MORNING_ROUTINES)) {
        const r = await database.routines.get(id);
        const seed = ROUTINES.find((x) => x.id === id);
        if (!r || !seed) continue;
        const withWheel = structuredClone(seed.items);
        const before = wheelForDeadBug(withWheel) ? [seed.items, withWheel] : [seed.items];
        if (!before.some((items) => sameStructure(r.items, items))) continue;
        // Los respaldos («si la máquina está ocupada») son tuyos: se conservan.
        const backups = new Map(r.items.filter((i) => i.backupExerciseId).map((i) => [i.id, i.backupExerciseId]));
        const items = structuredClone(next.items).map((i) => (backups.has(i.id) ? { ...i, backupExerciseId: backups.get(i.id) } : i));
        await database.routines.put(withNewVersion({ ...r, notes: next.notes, items }));
      }
    },
  },
];

async function applyRequestedChanges(database: EntrenoDB, previousRevision: number | undefined) {
  const done = new Set(((await database.meta.get('requestedChanges'))?.value as string[] | undefined) ?? []);
  for (const change of REQUESTED_CHANGES) {
    if (done.has(change.id)) continue;
    // Un celular que ya pasó por esa versión ya lo consideró (aunque todavía no estuviera anotado).
    if (previousRevision === undefined || previousRevision < change.since) await change.apply(database);
    done.add(change.id);
  }
  await database.meta.put({ key: 'requestedChanges', value: [...done] });
}

async function refreshSeedTexts(database: EntrenoDB, seed: Exercise[]) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const [id, prev] of Object.entries(PREVIOUS_SEED_TEXT)) {
    const current = await database.exercises.get(id);
    const next = seed.find((e) => e.id === id);
    if (!current || !next) continue;
    const untouched =
      same(current.instructions, prev.instructions) && same(current.instructionsNote, prev.instructionsNote) && same(current.commonErrors, prev.commonErrors);
    if (untouched)
      await database.exercises.update(id, { instructions: next.instructions, instructionsNote: next.instructionsNote, commonErrors: next.commonErrors });
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
