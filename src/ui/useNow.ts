import { useEffect, useState } from 'react';
import { toISODate } from '../domain/dates';

/** Fecha actual. Solo cambia cuando cambia el día (p. ej. si la app queda abierta pasada la medianoche). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = new Date();
        return toISODate(next) === toISODate(prev) ? prev : next;
      });
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}
