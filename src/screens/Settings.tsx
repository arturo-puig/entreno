import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteAllData, downloadExport, replaceAllData, validateBackup, type BackupCheck } from '../db/backup';
import { DEFAULT_PREFS, setPrefs } from '../db/actions';
import type { Prefs } from '../db/types';
import { applyUpdate, promptInstall, usePwa } from '../pwa';
import { switchTab } from '../router';
import { APP_VERSION } from '../version';
import { Icon } from '../ui/Icon';
import { ConfirmSheet, ScreenHeader, Sheet, Switch } from '../ui/common';

interface StorageInfo {
  supported: boolean;
  persisted?: boolean;
  usageMb?: number;
}

async function readStorage(): Promise<StorageInfo> {
  if (!navigator.storage?.persisted) return { supported: false };
  const [persisted, estimate] = await Promise.all([navigator.storage.persisted(), navigator.storage.estimate?.()]);
  return {
    supported: true,
    persisted,
    usageMb: estimate?.usage !== undefined ? estimate.usage / (1024 * 1024) : undefined,
  };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Settings() {
  const pwa = usePwa();
  const [storage, setStorage] = useState<StorageInfo>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [toImport, setToImport] = useState<BackupCheck | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastExport = useLiveQuery(() => db.meta.get('lastExportAt'));
  const assistantLog = useLiveQuery(() => db.assistantLog.orderBy('at').reverse().toArray());
  const prefs = useLiveQuery(async () => ({ ...DEFAULT_PREFS, ...((await db.meta.get('prefs'))?.value as Partial<Prefs> | undefined) }));

  useEffect(() => {
    readStorage().then(setStorage, () => setStorage({ supported: false }));
  }, []);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file?: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(undefined);
    setNotice(undefined);
    try {
      const check = validateBackup(JSON.parse(await file.text()));
      if (check.ok) setToImport(check);
      else setError(check.error);
    } catch {
      setError('El archivo no es una copia de Entreno (no se pudo leer).');
    }
  };

  const requestPersist = async () => {
    await navigator.storage.persist();
    setStorage(await readStorage());
  };

  const last = lastExport?.value as string | undefined;

  return (
    <>
      <ScreenHeader title="Ajustes" />

      {pwa.updateReady && (
        <div className="notice notice-accent">
          <Icon name="download" size={20} />
          <div>
            <p>Hay una versión nueva de la app.</p>
            <div className="notice-actions">
              <button className="btn btn-sm btn-primary" onClick={applyUpdate}>
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="section">
        <h2 className="section-title">App en el celular</h2>
        <div className="card stack-sm">
          {pwa.installed ? (
            <p>
              <Icon name="check" size={18} /> Está instalada como app.
            </p>
          ) : pwa.canInstall ? (
            <>
              <p>Instalala para abrirla desde la pantalla de inicio, a pantalla completa.</p>
              <button className="btn btn-primary btn-block" onClick={() => promptInstall()}>
                Instalar la app
              </button>
            </>
          ) : (
            <p className="muted">
              Para instalarla: en Chrome, menú <strong>⋮</strong> → <strong>Instalar app</strong> (o «Agregar a la pantalla principal»).
            </p>
          )}
          <p className="muted">
            {pwa.offlineReady
              ? 'Sin conexión: lista. La app abre aunque no tengas señal en el gimnasio.'
              : 'Sin conexión: se prepara la primera vez que la abrís con internet.'}
          </p>
          <p className="hint">Necesitan internet solo: actualizarse, «Buscar en YouTube» y los enlaces de licencias.</p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Durante el entrenamiento</h2>
        <div className="card stack-sm">
          {prefs && (
            <>
              <Switch
                checked={prefs.vibrate}
                onChange={(v) => setPrefs({ vibrate: v })}
                label="Vibrar al terminar el descanso"
                description="También al terminar un ejercicio por tiempo."
              />
              <Switch checked={prefs.sound} onChange={(v) => setPrefs({ sound: v })} label="Sonido al terminar el descanso" description="Dos pitidos cortos." />
              <Switch
                checked={prefs.rpe}
                onChange={(v) => setPrefs({ rpe: v })}
                label="Registrar esfuerzo por serie (RPE)"
                description="Opcional: del 1 al 10, qué tan dura fue cada serie."
              />
            </>
          )}
          <p className="hint">
            Mientras entrenás, la pantalla queda encendida para que el temporizador funcione. Si la bloqueás, el aviso
            puede no llegar: el navegador no deja vibrar con la pantalla apagada.
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Asistente</h2>
        <div className="card stack-sm">
          {!assistantLog?.length ? (
            <p className="muted">Todavía no le pediste nada al asistente.</p>
          ) : (
            <>
              <p>
                {assistantLog.length} pedidos · {assistantLog.filter((q) => q.intent === 'no-entendi').length} no entendidos ·{' '}
                {assistantLog.filter((q) => q.feedback === 'no-util').length} marcados como no útiles.
              </p>
              {assistantLog.some((q) => q.intent === 'no-entendi' || q.feedback === 'no-util') && (
                <details className="table-view">
                  <summary>Ver pedidos para revisar</summary>
                  <ul className="bullets">
                    {assistantLog
                      .filter((q) => q.intent === 'no-entendi' || q.feedback === 'no-util')
                      .slice(0, 30)
                      .map((q) => (
                        <li key={q.id}>
                          «{q.text}» <span className="hint">({q.intent === 'no-entendi' ? 'no entendido' : 'no útil'})</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </>
          )}
          <p className="hint">Los pedidos quedan solo en el celular. Sirven para mejorar el asistente con frases reales: revisalos de vez en cuando.</p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Copia de seguridad</h2>
        <div className="card stack-sm">
          <p>Descargá un archivo con tus rutinas, ejercicios e historial. Guardalo en Drive o mandátelo por mail.</p>
          <button className="btn btn-primary btn-block" onClick={() => run(downloadExport)} disabled={busy}>
            <Icon name="download" size={20} /> Exportar datos (JSON)
          </button>
          <p className="hint">
            {last ? `Última copia: ${new Date(last).toLocaleString('es-AR')}` : 'Todavía no hiciste ninguna copia.'}
          </p>
          <button className="btn btn-block" onClick={() => fileRef.current?.click()} disabled={busy}>
            Importar una copia
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Elegir copia para importar" onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="hint">Los videos y fotos que agregás a los ejercicios no entran en la copia (pesan mucho): quedan solo en el celular.</p>
          {error && <p className="error-text">{error}</p>}
          {notice && <p className="done-line">{notice}</p>}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Almacenamiento</h2>
        <div className="card stack-sm">
          {!storage ? (
            <p className="muted">Consultando…</p>
          ) : !storage.supported ? (
            <p className="muted">Este navegador no informa el estado del almacenamiento.</p>
          ) : (
            <>
              <p>
                {storage.persisted
                  ? 'Protegido: el navegador no va a borrar tus datos para liberar espacio.'
                  : 'Sin protección: si el celular se queda sin espacio, el navegador podría borrar los datos. Instalar la app suele activar la protección.'}
              </p>
              {!storage.persisted && (
                <button className="btn btn-block" onClick={requestPersist}>
                  Pedir protección
                </button>
              )}
              {storage.usageMb !== undefined && <p className="hint">Espacio usado: {storage.usageMb.toFixed(1)} MB</p>}
            </>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Cómo se guardan tus datos</h2>
        <div className="card prose">
          <ul className="bullets">
            <li>Todo se guarda solo en este celular, dentro del navegador. No hay cuentas ni servidores.</li>
            <li>Cada cambio se guarda en el momento.</li>
            <li>
              Si borrás los datos del navegador o del sitio, o cambiás de celular, los datos se pierden salvo que tengas
              una copia exportada.
            </li>
            <li>Para pasar a otro celular: exportá acá, abrí la app en el nuevo e importá el archivo.</li>
          </ul>
        </div>
      </section>

      <div className="danger-zone">
        <button className="btn btn-ghost link-danger" onClick={() => setDeleting(true)}>
          Borrar todos los datos
        </button>
      </div>

      <p className="hint center">Entreno · versión {APP_VERSION}</p>

      {toImport && (
        <ConfirmSheet
          title="¿Reemplazar tus datos con esta copia?"
          message={
            <>
              <p>
                Copia del {new Date(toImport.data.exportedAt).toLocaleString('es-AR')}: {toImport.counts.routines} rutinas,{' '}
                {toImport.counts.exercises} ejercicios y {toImport.counts.sessions} registros.
              </p>
              <p>Antes de reemplazar se descarga una copia de lo que tenés ahora, por las dudas. Tus videos y fotos no se tocan.</p>
            </>
          }
          confirmLabel="Reemplazar"
          danger
          onCancel={() => setToImport(null)}
          onConfirm={() =>
            run(async () => {
              await downloadExport(); // red de seguridad
              await replaceAllData(toImport.data);
              setToImport(null);
              setNotice('Copia importada.');
            })
          }
        />
      )}

      {deleting && <DeleteAllSheet onCancel={() => setDeleting(false)} />}
    </>
  );
}

function DeleteAllSheet({ onCancel }: { onCancel: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmed = text.trim().toLowerCase() === 'borrar';
  return (
    <Sheet
      title="¿Borrar todos los datos?"
      onClose={onCancel}
      footer={
        <div className="sheet-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            disabled={!confirmed || busy}
            onClick={async () => {
              setBusy(true);
              await deleteAllData();
              switchTab('/hoy');
              window.location.reload();
            }}
          >
            Borrar todo
          </button>
        </div>
      }
    >
      <p className="muted">
        Se borran tus sesiones, las rutinas y ejercicios que editaste, y tus videos y fotos. La app vuelve a como vino. No
        se puede deshacer.
      </p>
      <button className="btn btn-block" onClick={() => downloadExport()}>
        <Icon name="download" size={20} /> Descargar una copia antes
      </button>
      <label className="field">
        <span className="field-label">Escribí «borrar» para confirmar</span>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
    </Sheet>
  );
}
