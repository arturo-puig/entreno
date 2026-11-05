import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getWeekPlan } from '../db/db';
import { createRoutine, setDayPlan } from '../db/actions';
import type { DayPlan, Weekday } from '../db/types';
import { WEEK_PLAN } from '../data/routines';
import { capitalize, weekdayNameOf } from '../domain/dates';
import { estimateRoutineMinutes } from '../domain/estimate';
import { usePace } from '../db/pace';
import { orderRoutines, WEEKDAYS_FROM_MONDAY } from '../domain/order';
import { pendingQuestions } from '../domain/plan';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, Loading, ScreenHeader, Sheet, originLabel } from '../ui/common';

export function Routines() {
  const [editingWeek, setEditingWeek] = useState(false);
  const [pickingDay, setPickingDay] = useState<Weekday | null>(null);
  const pace = usePace();
  const data = useLiveQuery(async () => {
    const [weekPlan, routines, exercises] = await Promise.all([getWeekPlan(), db.routines.toArray(), db.exercises.toArray()]);
    return { weekPlan, routines, exercises };
  });
  if (!data) return <Loading />;
  const { weekPlan, routines, exercises } = data;
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const scheduled = new Set(weekPlan.map((p) => p.routineId).filter(Boolean));
  const others = routines.filter((r) => !scheduled.has(r.id));

  const pending = [
    ...routines.flatMap((r) =>
      pendingQuestions(r).map(({ item, question }) => ({
        key: `${r.id}/${item.id}`,
        title: exById.get(item.exerciseId)?.name ?? 'Ejercicio',
        context: r.name,
        question,
        go: () => navigate(`/rutinas/${r.id}`),
      })),
    ),
    ...exercises
      .filter((e) => e.pending)
      .map((e) => ({
        key: e.id,
        title: e.name,
        context: 'Biblioteca de ejercicios',
        question: e.pending!,
        go: () => navigate(`/ejercicios/${e.id}`),
      })),
  ];

  return (
    <>
      <ScreenHeader title="Rutinas" />

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Tu semana</h2>
          <button className="link" onClick={() => setEditingWeek(!editingWeek)}>
            {editingWeek ? 'Listo' : 'Cambiar días'}
          </button>
        </div>
        {editingWeek && <p className="hint">Tocá un día para elegir qué hacés. Los cambios se guardan al instante.</p>}
        <ul className="list">
          {WEEKDAYS_FROM_MONDAY.map((wd) => {
            const plan = weekPlan.find((p) => p.weekday === wd);
            const routine = routines.find((r) => r.id === plan?.routineId);
            const dayLabel = capitalize(weekdayNameOf(wd)).slice(0, 3);
            const inner = (
              <>
                <span className="row-day">{dayLabel}</span>
                <span className="row-main">
                  <span className="row-title">{routine?.name ?? plan?.label ?? 'Descanso'}</span>
                  <span className="row-sub">
                    {routine
                      ? `${[plan?.when, originLabel(routine)].filter(Boolean).join(' · ')} · ≈ ${estimateRoutineMinutes(routine, 'completa', pace?.factor)} min`
                      : (plan?.detail ?? 'Sin entrenamiento')}
                  </span>
                </span>
                {routine && pendingQuestions(routine).length > 0 && (
                  <Badge tone="warn">{pendingQuestions(routine).length} pend.</Badge>
                )}
                {routine && <Icon name="chevron" className="row-chevron" size={18} />}
              </>
            );
            if (editingWeek) {
              return (
                <li key={wd}>
                  <button className="row" onClick={() => setPickingDay(wd as Weekday)} aria-label={`Cambiar ${weekdayNameOf(wd)}`}>
                    <span className="row-day">{dayLabel}</span>
                    <span className="row-main">
                      <span className="row-title">{routine?.name ?? plan?.label ?? 'Descanso'}</span>
                    </span>
                    <Icon name="edit" className="row-chevron" size={18} />
                  </button>
                </li>
              );
            }
            return (
              <li key={wd}>
                {routine ? (
                  <button className="row" onClick={() => navigate(`/rutinas/${routine.id}`)}>
                    {inner}
                  </button>
                ) : (
                  <div className="row row-static">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-title">Otras rutinas</h2>
        {others.length > 0 && (
          <ul className="list">
            {others.map((r) => (
              <li key={r.id}>
                <button className="row" onClick={() => navigate(`/rutinas/${r.id}`)}>
                  <span className="row-main">
                    <span className="row-title">{r.name}</span>
                    <span className="row-sub">
                      {originLabel(r)} · ≈ {estimateRoutineMinutes(r, 'completa', pace?.factor)} min
                    </span>
                  </span>
                  <Icon name="chevron" className="row-chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn btn-block"
          onClick={async () => {
            const id = await createRoutine();
            navigate(`/rutinas/${id}/editar`);
          }}
        >
          <Icon name="plus" size={20} /> Nueva rutina
        </button>
        <p className="hint">También podés duplicar una rutina, o usar un registro histórico desde Progreso.</p>
      </section>

      {pending.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Pendientes de confirmar</h2>
            <Badge tone="warn">{pending.length}</Badge>
          </div>
          <p className="muted small">
            Notaciones y datos que la app no interpreta por su cuenta. Podés mostrarle esta lista a tu profe.
          </p>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.key}>
                <button className="row" onClick={p.go}>
                  <span className="row-main">
                    <span className="row-title">{p.title}</span>
                    <span className="row-sub">{p.question}</span>
                    <span className="row-context">{p.context}</span>
                  </span>
                  <Icon name="chevron" className="row-chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pickingDay !== null && (
        <DayPicker
          weekday={pickingDay}
          current={weekPlan.find((p) => p.weekday === pickingDay)}
          options={orderRoutines(routines, weekPlan)}
          onClose={() => setPickingDay(null)}
        />
      )}
    </>
  );
}

function DayPicker(props: {
  weekday: Weekday;
  current?: DayPlan;
  options: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { weekday, current } = props;
  // Las actividades de la semana original (p. ej. pádel) siguen disponibles para cualquier día.
  const activities = WEEK_PLAN.filter((d) => d.type === 'actividad');
  const choose = async (day: DayPlan) => {
    await setDayPlan(day);
    props.onClose();
  };
  const isCurrent = (d: Partial<DayPlan>) =>
    current?.type === d.type && (d.type !== 'rutina' || current?.routineId === d.routineId) && (d.type !== 'actividad' || current?.label === d.label);

  return (
    <Sheet title={`¿Qué hacés el ${weekdayNameOf(weekday)}?`} onClose={props.onClose}>
      <ul className="list">
        {props.options.map((r) => (
          <li key={r.id}>
            <button
              className="row"
              onClick={() => choose({ weekday, type: 'rutina', routineId: r.id, label: r.name, when: current?.when })}
            >
              <span className="row-main">
                <span className="row-title">{r.name}</span>
              </span>
              {isCurrent({ type: 'rutina', routineId: r.id }) && <Icon name="check" className="row-check" />}
            </button>
          </li>
        ))}
        {activities.map((a) => (
          <li key={a.label}>
            <button className="row" onClick={() => choose({ ...a, weekday })}>
              <span className="row-main">
                <span className="row-title">{a.label}</span>
                <span className="row-sub">Actividad</span>
              </span>
              {isCurrent({ type: 'actividad', label: a.label }) && <Icon name="check" className="row-check" />}
            </button>
          </li>
        ))}
        <li>
          <button className="row" onClick={() => choose({ weekday, type: 'descanso', label: 'Descanso', detail: 'Sin entrenamiento.' })}>
            <span className="row-main">
              <span className="row-title">Descanso</span>
            </span>
            {isCurrent({ type: 'descanso' }) && <Icon name="check" className="row-check" />}
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
