/**
 * Copia de seguridad en tu Google Drive, gratis y sin servidor propio.
 *
 * - Inicio de sesión con Google Identity Services (solo cuando tocás un botón; necesita internet).
 * - Permiso «drive.file»: la app solo ve el archivo que ella misma creó, nada más de tu Drive.
 * - Un solo archivo, «entreno-copia.json», que se reemplaza en cada copia (Drive guarda versiones anteriores).
 * - El permiso de acceso dura ~1 hora y queda solo en memoria (nunca se guarda).
 * - Necesita un «ID de cliente» de Google Cloud (gratuito) que pegás una vez en Ajustes.
 */
import { db } from './db';
import { buildExport, replaceAllData, validateBackup, type BackupCheck } from './backup';

export const DRIVE_FILE_NAME = 'entreno-copia.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com';

export interface DriveSettings {
  clientId?: string;
  /** Subir una copia al terminar cada sesión. */
  auto: boolean;
  fileId?: string;
  lastBackupAt?: string;
  /** La última copia automática no se pudo hacer (sin conexión o sin permiso): se ofrece en Hoy. */
  pending?: boolean;
  lastError?: string;
}

const KEY = 'drive';

export async function getDriveSettings(): Promise<DriveSettings> {
  return { auto: false, ...((await db.meta.get(KEY))?.value as Partial<DriveSettings> | undefined) };
}

export async function setDriveSettings(patch: Partial<DriveSettings>): Promise<DriveSettings> {
  const next = { ...(await getDriveSettings()), ...patch };
  await db.meta.put({ key: KEY, value: next });
  return next;
}

/** Un ID de cliente de Google tiene esta forma: 1234-abc.apps.googleusercontent.com */
export const isClientId = (s: string) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(s.trim());

// ——— Permiso de acceso (token) ———

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string; message?: string }) => void;
      }) => TokenClient;
      revoke?: (token: string, done?: () => void) => void;
    };
  };
}
declare global {
  interface Window {
    google?: Gis;
  }
}

let token: { value: string; expiresAt: number } | undefined;
let gisLoading: Promise<Gis> | undefined;

/** Carga el script de Google solo cuando hace falta. */
export function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('No se pudo cargar el inicio de sesión de Google.')));
    s.onerror = () => {
      gisLoading = undefined;
      reject(new Error('No se pudo conectar con Google. ¿Tenés internet?'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export const hasValidToken = () => !!token && token.expiresAt > Date.now() + 60_000;

/**
 * Pide permiso a Google (abre una ventanita la primera vez; después suele cerrarse sola).
 * Tiene que llamarse directamente desde un toque: si no, el navegador bloquea la ventana.
 */
export function requestToken(clientId: string, gis: Gis): Promise<string> {
  if (hasValidToken()) return Promise.resolve(token!.value);
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error === 'access_denied' ? 'No diste permiso en Google.' : `Google no dio permiso (${r.error_description ?? r.error ?? 'sin detalle'}).`));
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(new Error(e.type === 'popup_closed' ? 'Cerraste la ventana de Google antes de terminar.' : e.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google.' : 'No se pudo iniciar sesión en Google.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Prepara el permiso desde un toque (sin esperar nada antes): si ya hay permiso vigente, no abre nada. */
export function authorizeFromTap(clientId: string): Promise<string> {
  if (hasValidToken()) return Promise.resolve(token!.value);
  // Si el script ya está cargado, la ventana se abre en el mismo toque (no la bloquea el navegador).
  if (window.google?.accounts?.oauth2) return requestToken(clientId, window.google);
  return loadGis().then((gis) => requestToken(clientId, gis));
}

export function forgetToken() {
  const t = token?.value;
  token = undefined;
  if (t) window.google?.accounts.oauth2.revoke?.(t);
}

// ——— Drive ———

async function api(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new Error('Sin conexión con Google Drive. ¿Tenés internet?');
  }
  if (res.status === 401) {
    token = undefined;
    throw new Error('El permiso de Google venció. Tocá de nuevo para renovarlo.');
  }
  if (!res.ok) throw new Error(`Google Drive respondió con un error (${res.status}).`);
  return res;
}

interface DriveFile {
  id: string;
  modifiedTime?: string;
}

/** Busca la copia que creó la app (con «drive.file» no puede ver ningún otro archivo). */
async function findFile(accessToken: string, known?: string): Promise<DriveFile | undefined> {
  if (known) {
    try {
      const res = await api(`/drive/v3/files/${encodeURIComponent(known)}?fields=id,modifiedTime,trashed`, accessToken);
      const f = (await res.json()) as DriveFile & { trashed?: boolean };
      if (!f.trashed) return f;
    } catch (e) {
      if (e instanceof Error && e.message.includes('venció')) throw e;
    }
  }
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const res = await api(`/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`, accessToken);
  const { files } = (await res.json()) as { files?: DriveFile[] };
  return files?.[0];
}

/** Sube la copia: reemplaza el archivo si existe, o lo crea. Devuelve la hora de la copia. */
export async function uploadBackup(accessToken: string): Promise<string> {
  const settings = await getDriveSettings();
  const data = await buildExport();
  const body = JSON.stringify(data);
  const existing = await findFile(accessToken, settings.fileId);
  let file: DriveFile;
  if (existing) {
    const res = await api(`/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,modifiedTime`, accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    file = (await res.json()) as DriveFile;
  } else {
    const boundary = `entreno${Date.now()}`;
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: 'application/json' }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await api('/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    file = (await res.json()) as DriveFile;
  }
  await setDriveSettings({ fileId: file.id, lastBackupAt: data.exportedAt, pending: false, lastError: undefined });
  return data.exportedAt;
}

/** Baja la copia de Drive y la revisa antes de tocar nada. */
export async function downloadBackup(accessToken: string): Promise<BackupCheck | { ok: false; error: string }> {
  const settings = await getDriveSettings();
  const file = await findFile(accessToken, settings.fileId);
  if (!file) return { ok: false, error: 'Todavía no hay ninguna copia de Entreno en tu Drive.' };
  const res = await api(`/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, accessToken);
  try {
    return validateBackup(await res.json());
  } catch {
    return { ok: false, error: 'La copia de Drive no se pudo leer.' };
  }
}

/** Restaura sin perder la configuración de Drive de este celular. */
export async function restoreFromDrive(data: BackupCheck['data']): Promise<void> {
  const keep = await getDriveSettings();
  await replaceAllData(data);
  await setDriveSettings(keep);
}

/**
 * Copia automática al terminar una sesión. Se llama desde el toque de «Terminar» (antes de cualquier espera),
 * así, si hace falta renovar el permiso, el navegador deja abrir la ventana de Google.
 * Nunca frena el cierre de la sesión: si falla, queda pendiente y se ofrece en Hoy.
 */
export function autoBackupFromTap(settings: DriveSettings | undefined, afterSave: Promise<unknown>): void {
  if (!settings?.auto || !settings.clientId) return;
  const auth = authorizeFromTap(settings.clientId);
  void (async () => {
    try {
      const t = await auth;
      await afterSave;
      await uploadBackup(t);
    } catch (e) {
      await setDriveSettings({ pending: true, lastError: e instanceof Error ? e.message : String(e) });
    }
  })();
}
