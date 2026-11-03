import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { EntrenoDB, ensureSeed } from './db';
import { backupReminder, replaceAllData, validateBackup } from './backup';

async function exportOf(db: EntrenoDB) {
  const [exercises, routines, sessions, days, meta] = await Promise.all([
    db.exercises.toArray(), db.routines.toArray(), db.sessions.toArray(), db.days.toArray(), db.meta.toArray(),
  ]);
  return { app: 'entreno', formatVersion: 1, exportedAt: '2026-11-03T12:00:00.000Z', tables: { exercises, routines, sessions, days, meta } };
}

describe('validar copias', () => {
  it('acepta una copia de la app y cuenta lo que trae', async () => {
    const db = new EntrenoDB(`b-${Math.random()}`);
    await ensureSeed(db);
    const r = validateBackup(JSON.parse(JSON.stringify(await exportOf(db))));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.counts).toMatchObject({ routines: 5, sessions: 2 });
    db.close();
  });

  it('rechaza archivos ajenos, dañados o de una versión más nueva', () => {
    expect(validateBackup({ hola: 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/no es una copia/) });
    expect(validateBackup({ app: 'entreno', formatVersion: 99, tables: {} })).toMatchObject({ ok: false, error: expect.stringMatching(/más nueva/) });
    expect(
      validateBackup({ app: 'entreno', formatVersion: 1, tables: { exercises: [{ nombre: 'x' }], routines: [], sessions: [], days: [], meta: [] } }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/dañada/) });
  });
});

describe('importar', () => {
  it('reemplaza todo por la copia y no toca los videos propios', async () => {
    const source = new EntrenoDB(`src-${Math.random()}`);
    await ensureSeed(source);
    await source.routines.update('rutina-a', { name: 'Rutina A del backup' });
    const backup = await exportOf(source);

    const target = new EntrenoDB(`dst-${Math.random()}`);
    await ensureSeed(target);
    await target.routines.delete('rutina-b');
    await target.userMedia.add({ id: 'm1', exerciseId: 'dead-bug', kind: 'imagen', mime: 'image/png', blob: new Blob(['x']), size: 1, createdAt: '' });

    await replaceAllData(backup as never, target);
    expect((await target.routines.get('rutina-a'))?.name).toBe('Rutina A del backup');
    expect(await target.routines.get('rutina-b')).toBeDefined();
    expect(await target.userMedia.count()).toBe(1);
    source.close();
    target.close();
  });
});

describe('recordatorio de copia', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it('recuerda si hay sesiones y nunca exportaste o pasó una semana', () => {
    expect(backupReminder({ hasSessions: true, now })).toBe(Infinity);
    expect(backupReminder({ hasSessions: true, lastExportAt: '2026-11-01T12:00:00Z', now })).toBe(9);
    expect(backupReminder({ hasSessions: true, lastExportAt: '2026-11-05T12:00:00Z', now })).toBeNull();
    expect(backupReminder({ hasSessions: false, now })).toBeNull();
    expect(backupReminder({ hasSessions: true, snoozedUntil: '2026-11-12T00:00:00Z', now })).toBeNull();
  });
});
