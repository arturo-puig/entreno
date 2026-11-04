import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { logActivity } from '../db/actions';
import type { DayPlan, DayState, Routine } from '../db/types';
import { cardioRoutineOn } from '../domain/schedule';
import { addDays, toISODate } from '../domain/dates';
import { ACTIVITIES, CARDIO_LIKE } from '../domain/stats';
import { Field, parseNumber, Sheet, Switch } from './common';

/** Registrar pádel, bici, caminata o trote en un toque. Todo es opcional salvo el tipo. */
export function ActivitySheet(props: {
  today: Date;
  initial?: string;
  onClose: () => void;
  /** Para saber si ese día tocaba una rutina de cardio: la actividad puede contar como esa sesión. */
  weekPlan?: DayPlan[];
  routines?: Routine[];
  /** Lo que elegiste para hoy (si cambiaste la rutina del día). */
  todayState?: DayState;
  onSaved?: (summary: string) => void;
}) {
  const { today, initial, onClose } = props;
  const todayIso = toISODate(today);
  const [type, setType] = useState<string>(initial ?? ACTIVITIES[0].exerciseId);
  const [when, setWhen] = useState<'hoy' | 'ayer' | 'otro'>('hoy');
  const [other, setOther] = useState(toISODate(addDays(today, -2)));
  const date = when === 'hoy' ? todayIso : when === 'ayer' ? toISODate(addDays(today, -1)) : other;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayIso;
  const sameDay = useLiveQuery(() => (validDate ? db.sessions.where('date').equals(date).toArray() : []), [date, validDate]);
  const cardioRoutine =
    validDate && sameDay && props.weekPlan && props.routines
      ? cardioRoutineOn({ date, weekPlan: props.weekPlan, routines: props.routines, sessions: sameDay, day: date === todayIso ? props.todayState : undefined })
      : undefined;
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [effort, setEffort] = useState<number>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [countAs, setCountAs] = useState(true);
  const activity = ACTIVITIES.find((a) => a.exerciseId === type)!;
  const canCount = !!cardioRoutine && CARDIO_LIKE.includes(type);

  const save = async () => {
    setBusy(true);
    const m = parseNumber(minutes);
    const k = parseNumber(km);
    await logActivity({
      exerciseId: type,
      name: activity.label,
      date,
      minutes: m,
      km: k,
      effort,
      note,
      countAs: canCount && countAs ? cardioRoutine : undefined,
    });
    const detail = [m !== undefined ? `${m} min` : '', k !== undefined ? `${String(k).replace('.', ',')} km` : ''].filter(Boolean).join(' · ');
    props.onSaved?.(`${activity.label.toLowerCase()}${detail ? ` · ${detail}` : ''}${canCount && countAs ? ` como ${cardioRoutine!.name}` : ''}`);
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
          <button className="btn btn-primary" onClick={save} disabled={busy || !validDate}>
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
        <button className="chip-btn" aria-pressed={when === 'otro'} onClick={() => setWhen('otro')}>
          Otro día
        </button>
      </div>
      {when === 'otro' && (
        <Field label="Fecha">
          <input className="input" type="date" value={other} max={todayIso} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
      {canCount && (
        <Switch
          checked={countAs}
          onChange={setCountAs}
          label={`Cuenta como ${cardioRoutine!.name} de ${when === 'hoy' ? 'hoy' : when === 'ayer' ? 'ayer' : 'ese día'}`}
          description="Suma como la sesión planificada del día, no como actividad aparte."
        />
      )}
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
