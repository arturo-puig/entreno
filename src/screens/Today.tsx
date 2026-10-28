import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getWeekPlan, updateDayState } from '../db/db';
import type { Readiness, Routine, Session } from '../db/types';
import { addDays, capitalize, dayAndMonth, startOfWeek, toISODate, weekdayLetter, weekdayName, parseISODate } from '../domain/dates';
import { estimateRoutineMinutes } from '../domain/estimate';
import { summarizeSets } from '../domain/format';
import { hasShortVersion, itemsForMode, type Mode } from '../domain/plan';
import { readinessAdvice, READINESS_OPTIONS } from '../domain/readiness';
import { effectiveRoutineId, missedProfessorRoutine, planFor, weekOverview, type WeekDay } from '../domain/schedule';
import { orderRoutines } from '../domain/order';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, Loading, Sheet, Switch, originLabel } from '../ui/common';
import { useNow } from '../ui/useNow';

const LIGHT_ROUTINE_ID = 'cardio-movilidad';

export function Today() {
  const now = useNow();
  const iso = toISODate(now);
  const [picking, setPicking] = useState(false);

  const data = useLiveQuery(async () => {
    const monday = startOfWeek(now);
    const [weekPlan, routines, day, sessions, exercises] = await Promise.all([
      getWeekPlan(),
      db.routines.toArray(),
      db.days.get(iso),
      db.sessions.where('date').between(toISODate(monday), toISODate(addDays(monday, 6)), true, true).toArray(),
      db.exercises.toArray(),
    ]);
    return { weekPlan, routines, day, sessions, exercises };
  }, [iso]);

  if (!data) return <Loading />;
  const { weekPlan, routines, day, sessions, exercises } = data;

  const plan = planFor(weekPlan, now);
  const routine = routines.find((r) => r.id === effectiveRoutineId(plan, day));
  const isOverride = !!day?.routineId && day.routineId !== plan.routineId;
  const suggestion = missedProfessorRoutine({ weekPlan, routines, sessions, today: now, day });
  const week = weekOverview(weekPlan, sessions, now);
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));

  const choose = async (r: Routine) => {
    await updateDayState(iso, { routineId: r.id === plan.routineId ? undefined : r.id, short: false });
    setPicking(false);
  };

  return (
    <>
      <header className="today-header">
        <p className="eyebrow">Hoy</p>
        <h1>{capitalize(weekdayName(now))}</h1>
        <p className="today-date">{dayAndMonth(now)}</p>
      </header>

      {suggestion && (
        <div className="notice notice-accent">
          <Icon name="swap" size={20} />
          <div>
            <p>
              Esta semana todavía no hiciste la <strong>{suggestion.name}</strong>. Si querés, podés hacerla hoy en
              lugar de lo planificado.
            </p>
            <div className="notice-actions">
              <button className="btn btn-sm btn-primary" onClick={() => updateDayState(iso, { routineId: suggestion.id, short: false })}>
                Hacer {suggestion.name} hoy
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => updateDayState(iso, { dismissedSuggestion: true })}>
                Seguir con lo de hoy
              </button>
            </div>
          </div>
        </div>
      )}

      {routine ? (
        <RoutineDay
          iso={iso}
          routine={routine}
          when={isOverride ? undefined : plan.when}
          isOverride={isOverride}
          short={!!day?.short}
          readiness={day?.readiness}
          hasLightOption={routines.some((r) => r.id === LIGHT_ROUTINE_ID) && routine.id !== LIGHT_ROUTINE_ID}
          doneExercises={countDoneExercises(sessions, iso, routine.id)}
          exerciseName={exerciseName}
        />
      ) : (
        <section className="card hero">
          {plan.when && <span className="eyebrow">{plan.when}</span>}
          <div className="hero-rest">
            <Icon name={plan.type === 'actividad' ? 'padel' : 'moon'} size={26} />
            <h2 className="hero-title">{plan.label}</h2>
          </div>
          {plan.detail && <p className="muted">{plan.detail}</p>}
        </section>
      )}

      <div className="stack">
        <button className="btn btn-block" onClick={() => setPicking(true)}>
          <Icon name="swap" size={20} />
          {!routine && plan.optionalGym ? 'Elegir rutina para la mañana (opcional)' : 'Hacer otra rutina hoy'}
        </button>
        {isOverride && (
          <button className="btn btn-ghost btn-block" onClick={() => updateDayState(iso, { routineId: undefined, short: false })}>
            Volver a lo planificado: {plan.label}
          </button>
        )}
      </div>

      <WeekStrip week={week} />

      {picking && (
        <Sheet title="¿Qué querés hacer hoy?" onClose={() => setPicking(false)}>
          <p className="muted small">Solo cambia el día de hoy. Tu semana planificada sigue igual.</p>
          <ul className="list">
            {orderRoutines(routines, weekPlan).map((r) => (
              <li key={r.id}>
                <button className="row" onClick={() => choose(r)}>
                  <span className="row-main">
                    <span className="row-title">{r.name}</span>
                    <span className="row-sub">
                      {originLabel(r)} · ≈ {estimateRoutineMinutes(r, 'completa')} min
                    </span>
                  </span>
                  {r.id === routine?.id && <Icon name="check" className="row-check" />}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

function countDoneExercises(sessions: Session[], iso: string, routineId: string) {
  const s = sessions.find((x) => x.source === 'registro' && x.date === iso && x.routineId === routineId);
  return s ? s.items.filter((i) => i.sets.some((set) => set.done)).length : 0;
}

function RoutineDay(props: {
  iso: string;
  routine: Routine;
  when?: string;
  isOverride: boolean;
  short: boolean;
  readiness?: Readiness;
  hasLightOption: boolean;
  doneExercises: number;
  exerciseName: Map<string, string>;
}) {
  const { iso, routine, when, isOverride, readiness, hasLightOption, doneExercises, exerciseName } = props;
  const canShorten = hasShortVersion(routine);
  const mode: Mode = props.short && canShorten ? 'corta' : 'completa';
  const items = itemsForMode(routine, mode);
  const optionalCount = items.filter((i) => i.optional).length;
  const minutes = estimateRoutineMinutes(routine, mode);
  const advice = readiness ? readinessAdvice(readiness) : undefined;
  const pct = items.length ? Math.round((Math.min(doneExercises, items.length) / items.length) * 100) : 0;

  return (
    <>
      <section className="card hero">
        <div className="hero-top">
          <span className="eyebrow">{[when, originLabel(routine)].filter(Boolean).join(' · ')}</span>
          {isOverride && <Badge tone="accent">Elegida para hoy</Badge>}
        </div>
        <h2 className="hero-title">{routine.name}</h2>
        <div className="hero-meta">
          <span>
            <Icon name="clock" size={18} /> ≈ {minutes} min
          </span>
          <span>
            <Icon name="list" size={18} /> {items.length} {items.length === 1 ? 'ejercicio' : 'ejercicios'}
            {optionalCount > 0 && ` (${optionalCount} opcional)`}
          </span>
        </div>
        <div className="progress" aria-label={`Progreso: ${doneExercises} de ${items.length} ejercicios`}>
          <div className="progress-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-label">{doneExercises === 0 ? 'Sin empezar' : `${doneExercises} de ${items.length}`}</span>
        </div>
        <button className="btn btn-primary btn-xl" disabled aria-describedby="start-hint">
          Comenzar
        </button>
        <p id="start-hint" className="hint">
          El registro de series se habilita en la etapa 4.
        </p>
        <div className="divider" />
        <Switch
          checked={mode === 'corta'}
          disabled={!canShorten}
          onChange={(v) => updateDayState(iso, { short: v })}
          label="Tengo poco tiempo"
          description={
            canShorten
              ? `Versión de ≈ ${estimateRoutineMinutes(routine, 'corta')} min. No cambia la rutina original.`
              : 'Esta rutina no tiene versión corta.'
          }
        />
      </section>

      <section className="section">
        <h2 className="section-title">¿Cómo llegás hoy?</h2>
        <div className="segmented" role="group" aria-label="Estado antes de entrenar">
          {READINESS_OPTIONS.map((o) => (
            <button
              key={o.id}
              className="seg"
              aria-pressed={readiness === o.id}
              onClick={() => updateDayState(iso, { readiness: readiness === o.id ? undefined : o.id })}
            >
              {o.label}
            </button>
          ))}
        </div>
        {advice && (
          <div className="advice">
            <p>{advice.text}</p>
            {((advice.offerShort && mode !== 'corta' && canShorten) || (advice.offerLight && hasLightOption)) && (
              <div className="notice-actions">
                {advice.offerShort && mode !== 'corta' && canShorten && (
                  <button className="btn btn-sm" onClick={() => updateDayState(iso, { short: true })}>
                    Usar versión corta
                  </button>
                )}
                {advice.offerLight && hasLightOption && (
                  <button className="btn btn-sm" onClick={() => updateDayState(iso, { routineId: LIGHT_ROUTINE_ID, short: true })}>
                    Sesión liviana
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{mode === 'corta' ? 'Versión corta' : 'Ejercicios de hoy'}</h2>
          <button className="link" onClick={() => navigate(`/rutinas/${routine.id}`)}>
            Ver rutina
          </button>
        </div>
        <ol className="list">
          {items.map((item, idx) => (
            <li key={item.id}>
              <button className="row" onClick={() => navigate(`/ejercicios/${item.exerciseId}`)}>
                <span className="row-index">{idx + 1}</span>
                <span className="row-main">
                  <span className="row-title">
                    {exerciseName.get(item.exerciseId) ?? 'Ejercicio no encontrado'}
                    {item.variant && <span className="row-variant"> · {item.variant}</span>}
                  </span>
                  <span className="row-sub">
                    {summarizeSets(item, mode)}
                    {item.optional && ' · opcional'}
                  </span>
                  {item.pending && (
                    <span className="row-badge">
                      <Badge tone="warn">Pendiente de confirmar</Badge>
                    </span>
                  )}
                </span>
                <Icon name="chevron" className="row-chevron" size={18} />
              </button>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function WeekStrip({ week }: { week: WeekDay[] }) {
  const planned = week.filter((d) => d.plan.type === 'rutina').length;
  const done = week.filter((d) => d.done).length;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Esta semana</h2>
        <span className="muted small">
          {done} de {planned} sesiones
        </span>
      </div>
      <div className="week">
        {week.map((d) => {
          const date = parseISODate(d.date);
          const state = d.done ? 'done' : d.plan.type === 'rutina' ? 'planned' : d.plan.type === 'actividad' ? 'activity' : 'rest';
          const stateLabel = d.done ? 'hecho' : d.plan.type === 'descanso' ? 'descanso' : 'planificado';
          return (
            <div
              key={d.date}
              className={`wd${d.isToday ? ' is-today' : ''}`}
              aria-label={`${weekdayName(date)}: ${d.plan.label}, ${stateLabel}`}
              role="img"
            >
              <span className="wd-letter">{weekdayLetter(date)}</span>
              <span className={`wd-dot ${state}`} />
            </div>
          );
        })}
      </div>
      <p className="hint">Si un día no entrenás, no se acumula: la app sigue con lo que toca.</p>
    </section>
  );
}
