import { db } from './db';

export const EXPORT_FORMAT_VERSION = 1;

export async function buildExport() {
  const [exercises, routines, sessions, days, meta, bodyMetrics] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.sessions.toArray(),
    db.days.toArray(),
    db.meta.toArray(),
    db.bodyMetrics.toArray(),
  ]);
  return {
    app: 'entreno',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { exercises, routines, sessions, days, meta, bodyMetrics },
  };
}

/** Descarga un .json con todos los datos y registra la fecha de la copia. */
export async function downloadExport(): Promise<void> {
  const data = await buildExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `entreno-copia-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await db.meta.put({ key: 'lastExportAt', value: data.exportedAt });
}

/** ¿Se puede compartir un archivo (menú de Android: Drive, WhatsApp, mail…)? */
export function canShareFiles(): boolean {
  try {
    const f = new File(['{}'], 'x.json', { type: 'application/json' });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

/** Comparte la copia con otra app del celular (por ejemplo, «Guardar en Drive»). Devuelve false si cancelaste. */
export async function shareExport(): Promise<boolean> {
  const data = await buildExport();
  const file = new File([JSON.stringify(data, null, 2)], `entreno-copia-${data.exportedAt.slice(0, 10)}.json`, { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'Copia de Entreno' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw new Error('No se pudo compartir la copia.');
  }
  await db.meta.put({ key: 'lastExportAt', value: data.exportedAt });
  return true;
}

// ——— Importar una copia ———

type Tables = Awaited<ReturnType<typeof buildExport>>['tables'];
export type BackupData = Awaited<ReturnType<typeof buildExport>>;

export interface BackupCheck {
  ok: true;
  data: BackupData;
  counts: { routines: number; exercises: number; sessions: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const allHave = (rows: unknown, keys: string[]) => Array.isArray(rows) && rows.every((r) => isObj(r) && keys.every((k) => k in r));

/** Revisa que el archivo sea una copia de esta app antes de tocar nada. */
export function validateBackup(raw: unknown): BackupCheck | { ok: false; error: string } {
  if (!isObj(raw) || raw.app !== 'entreno') return { ok: false, error: 'El archivo no es una copia de Entreno.' };
  if (typeof raw.formatVersion !== 'number' || raw.formatVersion > EXPORT_FORMAT_VERSION) {
    return { ok: false, error: 'La copia es de una versión más nueva de la app. Actualizá la app y probá de nuevo.' };
  }
  const t = raw.tables;
  if (!isObj(t)) return { ok: false, error: 'La copia está incompleta.' };
  const ok =
    allHave(t.exercises, ['id', 'name']) &&
    allHave(t.routines, ['id', 'name', 'items']) &&
    allHave(t.sessions, ['id', 'items', 'status']) &&
    allHave(t.days, ['date']) &&
    allHave(t.meta, ['key']);
  if (!ok) return { ok: false, error: 'La copia está dañada o incompleta: no se importó nada.' };
  const data = raw as unknown as BackupData;
  return {
    ok: true,
    data,
    counts: { routines: data.tables.routines.length, exercises: data.tables.exercises.length, sessions: data.tables.sessions.length },
  };
}

/** Reemplaza todos los datos por los de la copia. Tus videos y fotos no se tocan. */
export async function replaceAllData(data: BackupData, database = db): Promise<void> {
  const t: Tables = data.tables;
  const tables = [database.exercises, database.routines, database.sessions, database.days, database.meta, database.bodyMetrics];
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((tb) => tb.clear()));
    await database.exercises.bulkPut(t.exercises);
    await database.routines.bulkPut(t.routines);
    await database.sessions.bulkPut(t.sessions);
    await database.days.bulkPut(t.days);
    await database.meta.bulkPut(t.meta);
    // Las copias de antes del registro de peso no traen esta tabla.
    await database.bodyMetrics.bulkPut(t.bodyMetrics ?? []);
  });
}

/** Borra la base entera (incluidos videos y fotos). Al recargar, la app vuelve a como vino. */
export async function deleteAllData(): Promise<void> {
  await db.delete();
}

// ——— Recordatorio de copia ———

const DAY = 86_400_000;

/**
 * Recordar la copia si ya registraste sesiones y nunca exportaste o pasó más de una semana.
 * Devuelve los días desde la última copia (Infinity si nunca), o null si no hace falta recordar.
 */
export function backupReminder(params: { hasSessions: boolean; lastExportAt?: string; snoozedUntil?: string; now: Date }): number | null {
  const { hasSessions, lastExportAt, snoozedUntil, now } = params;
  if (!hasSessions) return null;
  if (snoozedUntil && new Date(snoozedUntil) > now) return null;
  const days = lastExportAt ? Math.floor((now.getTime() - new Date(lastExportAt).getTime()) / DAY) : Infinity;
  return days >= 7 ? days : null;
}

export async function snoozeBackupReminder(days = 3): Promise<void> {
  await db.meta.put({ key: 'backupSnoozedUntil', value: new Date(Date.now() + days * DAY).toISOString() });
}
