import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { downloadExport, type BackupCheck } from '../db/backup';
import {
  authorizeFromTap, downloadBackup, forgetToken, getDriveSettings, isClientId, restoreFromDrive, setDriveSettings, uploadBackup, type DriveSettings,
} from '../db/drive';
import { ConfirmSheet, Field, Switch } from './common';
import { Icon } from './Icon';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : undefined);

/** Copia en Google Drive: configuración (una sola vez), subir, restaurar y copia automática. */
export function DriveBackup() {
  const settings = useLiveQuery(async () => {
    await db.meta.get('drive'); // se vuelve a leer cuando cambia
    return getDriveSettings();
  });
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [toRestore, setToRestore] = useState<BackupCheck | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!settings) return null;

  // El permiso se pide en el mismo toque (si no, el navegador bloquea la ventana de Google).
  const withDrive = (task: (token: string, s: DriveSettings) => Promise<void>) => {
    if (!settings.clientId) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const auth = authorizeFromTap(settings.clientId);
    void (async () => {
      try {
        await task(await auth, settings);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (!settings.clientId) {
    const valid = isClientId(clientId);
    return (
      <div className="stack-sm">
        <p>Guardá la copia en tu Google Drive, también en forma automática al terminar cada sesión. Es gratis, pero hay que configurarlo una vez.</p>
        <details className="table-view">
          <summary>Cómo configurarlo (unos 10 minutos, desde una computadora)</summary>
          <ol className="steps small">
            <li>
              Entrá a <strong>console.cloud.google.com</strong> con tu cuenta de Google y creá un proyecto (por ejemplo, «Entreno»). No pide tarjeta.
            </li>
            <li>
              En <strong>APIs y servicios → Biblioteca</strong>, buscá <strong>Google Drive API</strong> y tocá <strong>Habilitar</strong>.
            </li>
            <li>
              Configurá la <strong>pantalla de consentimiento de OAuth</strong> (puede figurar como «Google Auth Platform»): tipo <strong>Externo</strong>,
              nombre «Entreno», tu mail como contacto y, en <strong>Usuarios de prueba</strong> (o «Público»), agregá tu propio mail. Dejala «en prueba»: no
              hace falta publicarla.
            </li>
            <li>
              En <strong>Credenciales</strong> (o «Clientes») → <strong>Crear credenciales → ID de cliente de OAuth</strong> → tipo{' '}
              <strong>Aplicación web</strong>. En <strong>Orígenes autorizados de JavaScript</strong> agregá{' '}
              <strong>{window.location.origin}</strong>. No hace falta URI de redireccionamiento.
            </li>
            <li>Copiá el <strong>ID de cliente</strong> (termina en «.apps.googleusercontent.com») y pegalo acá abajo.</li>
          </ol>
          <p className="hint">
            La primera vez Google avisa que la app «no está verificada»: es tu propia app, tocá «Continuar». La app solo puede ver el archivo de copia que ella
            misma crea, nada más de tu Drive.
          </p>
        </details>
        <Field label="ID de cliente de Google">
          <input
            className="input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="1234…apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {clientId && !valid && <p className="error-text">Ese texto no parece un ID de cliente (tiene que terminar en .apps.googleusercontent.com).</p>}
        <button className="btn btn-block" disabled={!valid} onClick={() => setDriveSettings({ clientId: clientId.trim(), auto: true })}>
          Conectar con Google Drive
        </button>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <p>
        {settings.lastBackupAt ? (
          <>
            <Icon name="check" size={18} /> Última copia en Drive: {when(settings.lastBackupAt)}
          </>
        ) : (
          'Conectado. Todavía no hay ninguna copia en Drive.'
        )}
      </p>
      {settings.pending && settings.lastError && <p className="error-text">La última copia automática no se pudo hacer: {settings.lastError}</p>}
      <button
        className="btn btn-primary btn-block"
        disabled={busy}
        onClick={() =>
          withDrive(async (token) => {
            const at = await uploadBackup(token);
            setNotice(`Copia guardada en Drive (${when(at)}).`);
          })
        }
      >
        <Icon name="download" size={20} /> Guardar copia en Drive ahora
      </button>
      <Switch
        checked={settings.auto}
        onChange={(v) => setDriveSettings({ auto: v })}
        label="Copia automática al terminar cada sesión"
        description="Necesita internet. Si no hay señal, queda pendiente y te lo recuerdo en Hoy."
      />
      <button
        className="btn btn-block"
        disabled={busy}
        onClick={() =>
          withDrive(async (token) => {
            const check = await downloadBackup(token);
            if (check.ok) setToRestore(check);
            else setError(check.error);
          })
        }
      >
        Restaurar desde Drive
      </button>
      {busy && <p className="hint">Conectando con Google…</p>}
      {error && <p className="error-text">{error}</p>}
      {notice && <p className="done-line">{notice}</p>}
      <button className="btn btn-ghost btn-sm link-danger" onClick={() => setDisconnecting(true)}>
        Desconectar Google Drive
      </button>

      {toRestore && (
        <ConfirmSheet
          title="¿Reemplazar tus datos con la copia de Drive?"
          message={
            <>
              <p>
                Copia del {when(toRestore.data.exportedAt)}: {toRestore.counts.routines} rutinas, {toRestore.counts.exercises} ejercicios y{' '}
                {toRestore.counts.sessions} registros.
              </p>
              <p>Antes de reemplazar se descarga una copia de lo que tenés ahora, por las dudas. Tus videos y fotos no se tocan.</p>
            </>
          }
          confirmLabel="Reemplazar"
          danger
          onCancel={() => setToRestore(null)}
          onConfirm={async () => {
            const data = toRestore.data;
            setToRestore(null);
            try {
              await downloadExport(); // red de seguridad
              await restoreFromDrive(data);
              setNotice('Copia de Drive restaurada.');
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
      )}
      {disconnecting && (
        <ConfirmSheet
          title="¿Desconectar Google Drive?"
          message="La app deja de guardar copias en Drive. El archivo que ya está en tu Drive no se borra."
          confirmLabel="Desconectar"
          onCancel={() => setDisconnecting(false)}
          onConfirm={async () => {
            forgetToken();
            await db.meta.delete('drive');
            setDisconnecting(false);
          }}
        />
      )}
    </div>
  );
}

/** Botón «Guardar en Drive» para usar fuera de Ajustes (recordatorio o copia pendiente). */
export function DriveUploadButton({ clientId, label = 'Guardar en Drive', onDone }: { clientId: string; label?: string; onDone?: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string>();
  if (state === 'done') return <span className="done-line">Copia guardada en Drive.</span>;
  return (
    <>
      <button
        className="btn btn-sm btn-primary"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          setError(undefined);
          const auth = authorizeFromTap(clientId);
          void (async () => {
            try {
              await uploadBackup(await auth);
              setState('done');
              onDone?.();
            } catch (e) {
              await setDriveSettings({ pending: true, lastError: errorText(e) });
              setError(errorText(e));
              setState('idle');
            }
          })();
        }}
      >
        {state === 'busy' ? 'Guardando…' : label}
      </button>
      {error && <span className="error-text">{error}</span>}
    </>
  );
}
