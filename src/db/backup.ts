import { db } from './db';

export const EXPORT_FORMAT_VERSION = 1;

export async function buildExport() {
  const [exercises, routines, sessions, days, meta] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.sessions.toArray(),
    db.days.toArray(),
    db.meta.toArray(),
  ]);
  return {
    app: 'entreno',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { exercises, routines, sessions, days, meta },
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
