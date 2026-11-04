import { useState } from 'react';
import { startSession } from '../db/actions';
import type { DayPlan, Routine } from '../db/types';
import { addDays, parseISODate, toISODate } from '../domain/dates';
import { orderRoutines } from '../domain/order';
import { hasShortVersion, type Mode } from '../domain/plan';
import { planFor } from '../domain/schedule';
import { navigate } from '../router';
import { Field, Sheet } from './common';

/**
 * Cargar una sesión que hiciste en papel (o sin el celular): elegís el día y la rutina,
 * y la completás como siempre pero sin temporizadores. Nunca a futuro.
 */
export function BackfillSheet(props: { routines: Routine[]; weekPlan: DayPlan[]; now: Date; onClose: () => void }) {
  const today = toISODate(props.now);
  const [date, setDate] = useState(toISODate(addDays(props.now, -1)));
  const planned = date ? planFor(props.weekPlan, parseISODate(date)).routineId : undefined;
  const [routineId, setRoutineId] = useState<string | undefined>(planned);
  const [mode, setMode] = useState<Mode>('completa');
  const [busy, setBusy] = useState(false);
  const routine = props.routines.find((r) => r.id === routineId);
  const valid = !!routine && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;

  const pickDate = (d: string) => {
    setDate(d);
    // Si todavía no elegiste a mano, propone la rutina planificada para ese día.
    const p = d ? planFor(props.weekPlan, parseISODate(d)).routineId : undefined;
    if (!routineId || routineId === planned) setRoutineId(p ?? routineId);
  };

  const start = async () => {
    if (!routine) return;
    setBusy(true);
    const id = await startSession({ routine, mode: hasShortVersion(routine) ? mode : 'completa', date, backfill: true });
    navigate(`/sesion/${id}`);
  };

  return (
    <Sheet
      title="Cargar sesión hecha en papel"
      onClose={props.onClose}
      footer={
        <div className="sheet-actions">
          <button className="btn" onClick={props.onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={start} disabled={!valid || busy}>
            Cargar series
          </button>
        </div>
      }
    >
      <p className="muted small">
        Se abre la sesión para que anotes series, pesos y repeticiones, sin temporizadores. Cuenta para la semana de ese día.
      </p>
      <div className="chips" role="group" aria-label="Atajos de fecha">
        {[0, 1, 2].map((n) => {
          const iso = toISODate(addDays(props.now, -n));
          return (
            <button key={n} className="chip-btn" aria-pressed={date === iso} onClick={() => pickDate(iso)}>
              {n === 0 ? 'Hoy' : n === 1 ? 'Ayer' : 'Anteayer'}
            </button>
          );
        })}
      </div>
      <Field label="Fecha">
        <input className="input" type="date" value={date} max={today} onChange={(e) => pickDate(e.target.value)} />
      </Field>
      <Field label="Rutina">
        <select className="input" value={routineId ?? ''} onChange={(e) => setRoutineId(e.target.value || undefined)}>
          <option value="">Elegí una rutina</option>
          {orderRoutines(props.routines, props.weekPlan).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.id === planned ? ' (la de ese día)' : ''}
            </option>
          ))}
        </select>
      </Field>
      {routine && hasShortVersion(routine) && (
        <div className="chips" role="group" aria-label="Versión">
          <button className="chip-btn" aria-pressed={mode === 'completa'} onClick={() => setMode('completa')}>
            Completa
          </button>
          <button className="chip-btn" aria-pressed={mode === 'corta'} onClick={() => setMode('corta')}>
            Versión corta
          </button>
        </div>
      )}
    </Sheet>
  );
}
