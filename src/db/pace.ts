import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { personalPace, type Pace } from '../domain/estimate';

/** Tu ritmo real, a partir de tus sesiones registradas (se recalcula cuando cambian). */
export function usePace(): Pace | undefined {
  return useLiveQuery(async () => personalPace(await db.sessions.where('source').equals('registro').toArray()) ?? null, []) ?? undefined;
}
