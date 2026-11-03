import { useState } from 'react';
import { logActivity } from '../db/actions';
import { addDays, toISODate } from '../domain/dates';
import { ACTIVITIES } from '../domain/stats';
import { Field, parseNumber, Sheet } from './common';

/** Registrar pádel, bici, caminata o trote en un toque. Todo es opcional salvo el tipo. */
export function ActivitySheet({ today, initial, onClose }: { today: Date; initial?: string; onClose: () => void }) {
  const [type, setType] = useState<string>(initial ?? ACTIVITIES[0].exerciseId);
  const [when, setWhen] = useState<'hoy' | 'ayer'>('hoy');
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [effort, setEffort] = useState<number>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const activity = ACTIVITIES.find((a) => a.exerciseId === type)!;

  const save = async () => {
    setBusy(true);
    await logActivity({
      exerciseId: type,
      name: activity.label,
      date: toISODate(when === 'hoy' ? today : addDays(today, -1)),
      minutes: parseNumber(minutes),
      km: parseNumber(km),
      effort,
      note,
    });
    onClose();
  };

  return (
    <Sheet
      title="Registrar actividad"
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Guardar
          </button>
        </div>
      }
    >
      <div className="chips" role="group" aria-label="Tipo de actividad">
        {ACTIVITIES.map((a) => (
          <button key={a.exerciseId} className="chip-btn" aria-pressed={type === a.exerciseId} onClick={() => setType(a.exerciseId)}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Cuándo">
        <button className="chip-btn" aria-pressed={when === 'hoy'} onClick={() => setWhen('hoy')}>
          Hoy
        </button>
        <button className="chip-btn" aria-pressed={when === 'ayer'} onClick={() => setWhen('ayer')}>
          Ayer
        </button>
      </div>
      <div className="form-row">
        <Field label="Minutos">
          <input className="input input-num" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Kilómetros (opcional)">
          <input className="input input-num" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="—" />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Esfuerzo (opcional)</span>
        <div className="rpe-scale" role="group" aria-label="Esfuerzo del 1 al 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} className="chip-btn" aria-pressed={effort === n} onClick={() => setEffort(effort === n ? undefined : n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <Field label="Nota (opcional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: fui en bici ida y vuelta" />
      </Field>
      <p className="hint">Para la distancia y el ritmo podés mirar tu reloj: la app no lee el Redmi Watch.</p>
    </Sheet>
  );
}
