import { db, getWeekPlan, setWeekPlan } from './db';
import type { AssistantLogEntry, DayPlan, Exercise, Prefs, Readiness, Routine, Session, UserMedia } from './types';
import type { Mode } from '../domain/plan';
import { createSession, sessionStatus, staleSessions } from '../domain/session';
import { createActivity } from '../domain/stats';
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

// ——— Sesiones de entrenamiento ———

/** Registro: empieza la sesión del día y devuelve su id. */
export async function startSession(params: { routine: Routine; mode: Mode; readiness?: Readiness; date: string }): Promise<string> {
  const s = createSession({ ...params, now: new Date() });
  await db.sessions.add(s);
  return s.id;
}

/** Registro: aplica un cambio a la sesión y lo guarda en el momento (si se cierra el navegador, no se pierde). */
export async function updateSession(id: string, change: (s: Session) => void): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return;
    change(s);
    await db.sessions.put(s);
  });
}

/** Cierra la sesión: completa o incompleta según lo registrado. */
export async function finishSession(id: string, extra: { sessionRpe?: number; note?: string }): Promise<void> {
  await updateSession(id, (s) => {
    s.status = sessionStatus(s);
    s.finishedAt = new Date().toISOString();
    s.restEndsAt = undefined;
    s.sessionRpe = extra.sessionRpe;
    s.note = extra.note?.trim() || undefined;
  });
}

/** Acto: descarta una sesión (se confirma en la interfaz). */
export async function discardSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

/** Al abrir la app: cierra o descarta sesiones que quedaron abiertas de otro día. */
export async function closeStaleSessions(today: string): Promise<void> {
  const { close, discard } = staleSessions(await db.sessions.where('source').equals('registro').toArray(), today);
  if (!close.length && !discard.length) return;
  await db.transaction('rw', db.sessions, async () => {
    for (const s of discard) await db.sessions.delete(s.id);
    for (const s of close) await db.sessions.put({ ...s, status: 'incompleta', restEndsAt: undefined, finishedAt: s.finishedAt ?? s.startedAt });
  });
}

// ——— Preferencias ———

export const DEFAULT_PREFS: Prefs = { vibrate: true, sound: false, rpe: false };

export async function getPrefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...((await db.meta.get('prefs'))?.value as Partial<Prefs> | undefined) };
}

export async function setPrefs(patch: Partial<Prefs>): Promise<void> {
  await db.meta.put({ key: 'prefs', value: { ...(await getPrefs()), ...patch } });
}

// ——— Actividades y peso corporal ———

/** Registro: pádel, bici, caminata o trote en un toque. */
export async function logActivity(params: Parameters<typeof createActivity>[0]): Promise<string> {
  const s = createActivity(params);
  await db.sessions.add(s);
  return s.id;
}

/** Registro: peso y/o cintura del día. Si ya anotaste ese día, se actualiza (no se duplica). */
export async function saveBodyMetric(params: { date: string; weightKg?: number; waistCm?: number }): Promise<void> {
  await db.transaction('rw', db.bodyMetrics, async () => {
    const existing = await db.bodyMetrics.where('date').equals(params.date).first();
    if (existing) {
      await db.bodyMetrics.update(existing.id, {
        ...(params.weightKg !== undefined ? { weightKg: params.weightKg } : {}),
        ...(params.waistCm !== undefined ? { waistCm: params.waistCm } : {}),
      });
    } else {
      await db.bodyMetrics.add({ id: `b-${uid()}`, ...params, createdAt: new Date().toISOString() });
    }
  });
}

/** Acto: borra un registro de peso (se confirma en la interfaz). */
export async function deleteBodyMetric(id: string): Promise<void> {
  await db.bodyMetrics.delete(id);
}

// ——— Asistente ———

/** Registro: guarda lo que pediste y cómo se interpretó (solo en el celular). */
export async function logAssistant(entry: Omit<AssistantLogEntry, 'id' | 'at'>): Promise<string> {
  const id = `q-${uid()}`;
  await db.assistantLog.add({ id, at: new Date().toISOString(), ...entry });
  return id;
}

export async function setAssistantFeedback(id: string, feedback: AssistantLogEntry['feedback']): Promise<void> {
  await db.assistantLog.update(id, { feedback });
}

/** Acto (con tu toque): agrega un nombre alternativo a un ejercicio, para que el asistente y la búsqueda lo reconozcan. */
export async function addExerciseAlias(exerciseId: string, alias: string): Promise<void> {
  const e = await db.exercises.get(exerciseId);
  if (!e) return;
  const aliases = [...new Set([...(e.aliases ?? []), alias])];
  await db.exercises.update(exerciseId, { aliases });
}
