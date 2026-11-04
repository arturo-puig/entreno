import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, ensureSeed } from './db';
import { DRIVE_FILE_NAME, downloadBackup, getDriveSettings, isClientId, restoreFromDrive, setDriveSettings, uploadBackup } from './drive';

/** Drive falso en memoria: lo mínimo que usa la app (buscar, crear, reemplazar, bajar). */
function fakeDrive() {
  const files = new Map<string, { name: string; body: string }>();
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    if ((init.headers as Record<string, string>)?.Authorization !== 'Bearer tok') return new Response('', { status: 401 });
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const name = /name='([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1];
      return Response.json({ files: [...files].filter(([, f]) => f.name === name).map(([id]) => ({ id })) });
    }
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const body = String(init.body);
      const meta = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n--')[0]);
      const content = body.split('\r\n\r\n')[2].split('\r\n--')[0];
      const id = `f${files.size + 1}`;
      files.set(id, { name: meta.name, body: content });
      return Response.json({ id });
    }
    const m = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (m && files.has(m[2])) {
      if (method === 'PATCH') {
        files.get(m[2])!.body = String(init.body);
        return Response.json({ id: m[2] });
      }
      if (url.searchParams.get('alt') === 'media') return new Response(files.get(m[2])!.body);
      return Response.json({ id: m[2], trashed: false });
    }
    return new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { files, calls };
}

beforeAll(async () => {
  await ensureSeed(db);
});
afterEach(() => vi.unstubAllGlobals());

describe('copia en Google Drive', () => {
  it('reconoce un ID de cliente de Google', () => {
    expect(isClientId(' 123-abc.apps.googleusercontent.com ')).toBe(true);
    expect(isClientId('mi-clave')).toBe(false);
  });

  it('la primera vez crea el archivo; después lo reemplaza (no duplica)', async () => {
    const drive = fakeDrive();
    await uploadBackup('tok');
    expect(drive.files.size).toBe(1);
    expect([...drive.files.values()][0].name).toBe(DRIVE_FILE_NAME);
    const first = await getDriveSettings();
    expect(first.fileId).toBe('f1');
    expect(first.lastBackupAt).toBeDefined();

    await db.sessions.add({ id: 's-nueva', source: 'registro', date: '2026-11-04', name: 'Rutina A', status: 'completa', items: [] });
    await uploadBackup('tok');
    expect(drive.files.size).toBe(1);
    expect(drive.calls.some((c) => c === 'PATCH /upload/drive/v3/files/f1')).toBe(true);
    expect(JSON.parse(drive.files.get('f1')!.body).tables.sessions.some((s: { id: string }) => s.id === 's-nueva')).toBe(true);
  });

  it('restaura la copia validada y conserva la conexión con Drive de este celular', async () => {
    fakeDrive();
    await setDriveSettings({ clientId: 'x.apps.googleusercontent.com', auto: true });
    await uploadBackup('tok');
    await db.sessions.delete('s-nueva');
    const check = await downloadBackup('tok');
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    await restoreFromDrive(check.data);
    expect(await db.sessions.get('s-nueva')).toBeDefined();
    expect((await getDriveSettings()).clientId).toBe('x.apps.googleusercontent.com');
  });

  it('errores claros: permiso vencido o sin conexión', async () => {
    fakeDrive();
    await expect(uploadBackup('otro')).rejects.toThrow(/venció/);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(uploadBackup('tok')).rejects.toThrow(/Sin conexión/);
  });

  it('si no hay copia en Drive, lo dice', async () => {
    const drive = fakeDrive();
    drive.files.clear();
    await setDriveSettings({ fileId: undefined });
    expect(await downloadBackup('tok')).toMatchObject({ ok: false, error: expect.stringMatching(/Todavía no hay/) });
  });
});
