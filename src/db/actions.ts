import { db, getWeekPlan, setWeekPlan } from './db';
import type { DayPlan, Exercise, Routine, UserMedia } from './types';
import { ROUTINES } from '../data/routines';
import { duplicateRoutine, emptyRoutine, sessionToRoutine, uid, withNewVersion } from '../domain/edit';
import { replaceDay, slugify } from '../domain/catalog';

// Acciones que modifican datos. Cada una declara su efecto, como las «fichas de tareas»
// que va a usar el asistente: los actos que cambian el plan o borran algo se confirman en la interfaz.

/** Acto: guarda la rutina editada y sube su versión. */
export async function saveRoutine(routine: Routine): Promise<void> {
  await db.routines.put(withNewVersion(routine));
}

export function hasOriginal(routineId: string): boolean {
  return ROUTINES.some((r) => r.id === routineId);
}

/** Acto: vuelve a la versión original de la carga inicial (la que vino en la app). */
export async function restoreRoutine(routineId: string): Promise<void> {
  const original = ROUTINES.find((r) => r.id === routineId);
  const current = await db.routines.get(routineId);
  if (!original) throw new Error('Esta rutina no tiene una versión original.');
  await db.routines.put({ ...structuredClone(original), version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString() });
}

/** Acto: crea una copia personal y devuelve su id. */
export async function duplicateRoutineById(routineId: string): Promise<string> {
  const r = await db.routines.get(routineId);
  if (!r) throw new Error('No se encontró la rutina.');
  const copy = duplicateRoutine(r);
  await db.routines.add(copy);
  return copy.id;
}

export async function createRoutine(): Promise<string> {
  const r = emptyRoutine('Rutina nueva');
  await db.routines.add(r);
  return r.id;
}

/** Acto: borra la rutina; los días que la tenían planificada pasan a descanso. */
export async function deleteRoutine(routineId: string): Promise<void> {
  await db.transaction('rw', db.routines, db.meta, async () => {
    await db.routines.delete(routineId);
    const plan = await getWeekPlan();
    const next = plan.map((d) =>
      d.routineId === routineId ? { weekday: d.weekday, type: 'descanso' as const, label: 'Descanso', detail: 'Sin entrenamiento.' } : d,
    );
    await setWeekPlan(next);
  });
}

/** Acto: convierte un registro (p. ej. el histórico) en una rutina alternativa editable. */
export async function routineFromSession(sessionId: string): Promise<string> {
  const [session, exercises] = await Promise.all([db.sessions.get(sessionId), db.exercises.toArray()]);
  if (!session) throw new Error('No se encontró el registro.');
  const r = sessionToRoutine(session, exercises);
  await db.routines.add(r);
  return r.id;
}

/** Acto: cambia qué se hace un día de la semana. */
export async function setDayPlan(day: DayPlan): Promise<void> {
  await setWeekPlan(replaceDay(await getWeekPlan(), day));
}

export async function saveExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise);
}

/** Crea un ejercicio propio con un id legible y único. */
export async function createExercise(exercise: Omit<Exercise, 'id'>): Promise<string> {
  let id = slugify(exercise.name) || 'ejercicio';
  if (await db.exercises.get(id)) id = `${id}-${uid().slice(0, 4)}`;
  await db.exercises.add({ ...exercise, id, custom: true });
  return id;
}

/** Rutinas que usan un ejercicio (para no dejar referencias rotas al borrarlo). */
export async function routinesUsing(exerciseId: string): Promise<Routine[]> {
  return (await db.routines.toArray()).filter((r) => r.items.some((i) => i.exerciseId === exerciseId));
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  if ((await routinesUsing(exerciseId)).length) throw new Error('El ejercicio está en una rutina: sacalo de ahí primero.');
  await db.transaction('rw', db.exercises, db.userMedia, async () => {
    await db.exercises.delete(exerciseId);
    await db.userMedia.where('exerciseId').equals(exerciseId).delete();
  });
}

// ——— Videos y fotos propios ———

const MAX_PHOTO_SIDE = 1600;

/** Achica las fotos de la cámara (suelen pesar varios MB) antes de guardarlas. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function prepareMedia(file: File): Promise<{ blob: Blob; kind: UserMedia['kind']; mime: string }> {
  if (file.type.startsWith('video/')) return { blob: file, kind: 'video', mime: file.type };
  if (file.type.startsWith('image/')) {
    const blob = await shrinkPhoto(file);
    return { blob, kind: 'imagen', mime: blob.type || file.type };
  }
  throw new Error('Elegí un video o una foto.');
}

/** Registro: guarda un video o foto propio para un ejercicio. */
export async function addUserMedia(params: { exerciseId: string; variant?: string; blob: Blob; kind: UserMedia['kind']; mime: string }) {
  const media: UserMedia = { id: `m-${uid()}`, ...params, size: params.blob.size, createdAt: new Date().toISOString() };
  try {
    await db.userMedia.add(media);
  } catch (e) {
    if (e instanceof Error && /quota/i.test(e.name + e.message)) {
      throw new Error('No hay espacio suficiente en el celular para guardar este archivo.');
    }
    throw e;
  }
  return media.id;
}

/** Acto: borra un video o foto propio. */
export async function deleteUserMedia(id: string): Promise<void> {
  await db.userMedia.delete(id);
}
