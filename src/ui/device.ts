import { useEffect } from 'react';
import type { Prefs } from '../db/types';

/** Mantiene la pantalla encendida mientras `active` (se libera sola si cambiás de app; se vuelve a pedir al volver). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Batería baja o ahorro de energía: el navegador puede negarlo.
      }
    };
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

let audio: AudioContext | undefined;

/** Prepara el audio con un toque del usuario (los navegadores no dejan sonar sin interacción previa). */
export function primeAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    // Sin audio disponible.
  }
}

function beep() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const start of [0, 0.25]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t + start);
    gain.gain.exponentialRampToValueAtTime(0.25, t + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + start);
    osc.stop(t + start + 0.2);
  }
}

/** Aviso de fin de descanso o de tiempo, según tus preferencias. */
export function alertDone(prefs: Prefs) {
  if (prefs.vibrate) navigator.vibrate?.([220, 120, 220]);
  if (prefs.sound) beep();
}
