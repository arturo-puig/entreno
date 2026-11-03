import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { downloadExport } from '../db/backup';
import { APP_VERSION } from '../version';
import { Icon } from '../ui/Icon';
import { ScreenHeader } from '../ui/common';

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

export function Settings() {
  const [storage, setStorage] = useState<StorageInfo>();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const lastExport = useLiveQuery(() => db.meta.get('lastExportAt'));

  useEffect(() => {
    readStorage().then(setStorage, () => setStorage({ supported: false }));
  }, []);

  const exportNow = async () => {
    setExporting(true);
    setError(undefined);
    try {
      await downloadExport();
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
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

      <section className="section">
        <h2 className="section-title">Copia de seguridad</h2>
        <div className="card stack-sm">
          <p>Descargá un archivo con tus rutinas, ejercicios e historial. Guardalo en Drive o mandátelo por mail.</p>
          <button className="btn btn-primary btn-block" onClick={exportNow} disabled={exporting}>
            <Icon name="download" size={20} /> {exporting ? 'Exportando…' : 'Exportar datos (JSON)'}
          </button>
          {error && <p className="error-text">{error}</p>}
          <p className="hint">
            {last ? `Última copia: ${new Date(last).toLocaleString('es-AR')}` : 'Todavía no hiciste ninguna copia.'}
          </p>
          <p className="hint">Los videos y fotos que agregás a los ejercicios no entran en esta copia (pesan mucho): quedan solo en el celular.</p>
          <p className="hint">Importar una copia y borrar datos se agregan en la etapa 5.</p>
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
                  : 'Sin protección: si el celular se queda sin espacio, el navegador podría borrar los datos.'}
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
            <li>Antes de cambiar de celular o borrar datos, exportá una copia.</li>
          </ul>
        </div>
      </section>

      <p className="hint center">Entreno · versión {APP_VERSION}</p>
    </>
  );
}
