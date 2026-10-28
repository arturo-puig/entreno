import { useLiveQuery } from 'dexie-react-hooks';
import { db, getWeekPlan } from '../db/db';
import { capitalize, weekdayNameOf } from '../domain/dates';
import { estimateRoutineMinutes } from '../domain/estimate';
import { WEEKDAYS_FROM_MONDAY } from '../domain/order';
import { pendingQuestions } from '../domain/plan';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, Loading, ScreenHeader, originLabel } from '../ui/common';

export function Routines() {
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
        <h2 className="section-title">Tu semana</h2>
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
                      ? `${[plan?.when, originLabel(routine)].filter(Boolean).join(' · ')} · ≈ ${estimateRoutineMinutes(routine, 'completa')} min`
                      : (plan?.detail ?? 'Sin entrenamiento')}
                  </span>
                </span>
                {routine && pendingQuestions(routine).length > 0 && (
                  <Badge tone="warn">{pendingQuestions(routine).length} pend.</Badge>
                )}
                {routine && <Icon name="chevron" className="row-chevron" size={18} />}
              </>
            );
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

      {others.length > 0 && (
        <section className="section">
          <h2 className="section-title">Otras rutinas</h2>
          <ul className="list">
            {others.map((r) => (
              <li key={r.id}>
                <button className="row" onClick={() => navigate(`/rutinas/${r.id}`)}>
                  <span className="row-main">
                    <span className="row-title">{r.name}</span>
                    <span className="row-sub">
                      {originLabel(r)} · ≈ {estimateRoutineMinutes(r, 'completa')} min
                    </span>
                  </span>
                  <Icon name="chevron" className="row-chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
    </>
  );
}
