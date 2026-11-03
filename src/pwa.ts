import { useSyncExternalStore } from 'react';

// Instalación y funcionamiento sin conexión (service worker en pwa/sw.template.js).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** Hay una versión nueva descargada, lista para aplicar. */
  updateReady: boolean;
  /** Chrome ofrece instalar la app. */
  canInstall: boolean;
  /** La app está abierta como app instalada. */
  installed: boolean;
  /** La app quedó guardada para abrir sin señal. */
  offlineReady: boolean;
}

let state: PwaState = { updateReady: false, canInstall: false, installed: false, offlineReady: false };
let waiting: ServiceWorker | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
let updateRequested = false;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function setupPwa() {
  set({ installed: window.matchMedia?.('(display-mode: standalone)').matches ?? false });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    set({ canInstall: false, installed: true });
  });

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  // Solo se recarga cuando vos pediste actualizar (no en la primera instalación).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) window.location.reload();
  });

  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const watch = (sw: ServiceWorker | null) => {
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            set({ updateReady: true });
          }
          if (sw.state === 'activated') set({ offlineReady: true });
        });
      };
      if (reg.active) set({ offlineReady: true });
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        set({ updateReady: true });
      }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Al volver a la app, se fija si hay una versión nueva.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {
      // Sin service worker la app funciona igual, pero necesita conexión para abrir.
    });
}

export function applyUpdate() {
  if (!waiting) return window.location.reload();
  updateRequested = true;
  waiting.postMessage('skip-waiting');
}

export async function promptInstall(): Promise<void> {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  set({ canInstall: false });
}
