import { useSyncExternalStore } from 'react';

// Rutas con «#» (#/rutinas/rutina-a): funcionan en cualquier hosting estático sin configuración.

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = () => window.location.hash;

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, getHash);
  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
}

let depth = 0;

/** Abre una pantalla de detalle (se puede volver con «atrás»). */
export function navigate(path: string) {
  depth++;
  window.location.hash = path;
}

/** Cambia de sección sin acumular historial. */
export function switchTab(path: string) {
  depth = 0;
  window.location.replace(`#${path}`);
}

/** Vuelve atrás dentro de la app; si se abrió directo un detalle, va a la sección. */
export function goBack(fallback: string) {
  if (depth > 0) {
    depth--;
    window.history.back();
  } else {
    switchTab(fallback);
  }
}
