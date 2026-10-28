import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureSeed } from './db/db';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

ensureSeed()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    // Chrome decide sin preguntar; con la app instalada suele concederlo.
    navigator.storage?.persist?.().catch(() => {});
  })
  .catch((error: unknown) => {
    root.render(
      <div className="app">
        <main className="screen">
          <div className="empty">
            <p className="empty-title">No se pudo abrir la base de datos local.</p>
            <p className="empty-text">
              Puede pasar en modo incógnito o si el navegador bloquea el almacenamiento del sitio. Tus datos guardados no
              se modificaron.
            </p>
            <p className="hint">{error instanceof Error ? error.message : String(error)}</p>
          </div>
        </main>
      </div>,
    );
  });
