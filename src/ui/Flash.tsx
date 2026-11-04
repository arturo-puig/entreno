import { useEffect, useState } from 'react';
import { FLASH_EVENT } from './device';

/**
 * Destello de pantalla al terminar el descanso, para verlo aunque no escuches ni sientas la vibración.
 * Tres pulsos lentos (2 por segundo como máximo: por debajo del umbral de riesgo de fotosensibilidad).
 */
export function FlashOverlay() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const on = () => setKey((k) => k + 1);
    window.addEventListener(FLASH_EVENT, on);
    return () => window.removeEventListener(FLASH_EVENT, on);
  }, []);
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => setKey(0), 1700);
    return () => window.clearTimeout(t);
  }, [key]);
  if (!key) return null;
  return <div key={key} className="flash" aria-hidden="true" />;
}
