import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatLoggedSet } from '../domain/format';
import { summarize } from '../domain/session';
import { capitalize, dayAndMonth, parseISODate, weekdayName } from '../domain/dates';
import { navigate } from '../router';
import { routineFromSession } from '../db/actions';
import { Badge, EmptyState, Loading, ScreenHeader } from '../ui/common';
import { Icon } from '../ui/Icon';

export function Progress() {
  const data = useLiveQuery(async () => {
    const [sessions, exercises] = await Promise.all([db.sessions.toArray(), db.exercises.toArray()]);
    return { sessions, exercises };
  });
  if (!data) return <Loading />;
  const nameOf = new Map(data.exercises.map((e) => [e.id, e.name]));
  const logged = data.sessions
    .filter((s) => s.source === 'registro')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const historic = data.sessions.filter((s) => s.source === 'historico');

  return (
    <>
      <ScreenHeader title="Progreso" />
      {logged.length === 0 && (
        <EmptyState icon="progress" title="Todavía no registraste sesiones">
          Cuando completes la primera, vas a ver acá tu constancia semanal y la evolución de tus cargas.
        </EmptyState>
      )}

      {logged.length > 0 && (
        <section className="section">
          <h2 className="section-title">Tus sesiones</h2>
          <ul className="list">
            {logged.map((s) => {
              const sum = summarize(s);
              const d = parseISODate(s.date!);
              return (
                <li key={s.id}>
                  <button className="row" onClick={() => navigate(`/sesion/${s.id}`)}>
                    <span className="row-main">
                      <span className="row-title">{s.name}</span>
                      <span className="row-sub">
                        {capitalize(weekdayName(d))} {dayAndMonth(d)} · {sum.setsDone} series
                        {sum.minutes !== undefined && s.status !== 'en-curso' && ` · ${sum.minutes} min`}
                        {s.sessionRpe !== undefined && ` · esfuerzo ${s.sessionRpe}/10`}
                      </span>
                    </span>
                    <Badge tone={s.status === 'completa' ? 'accent' : 'neutral'}>
                      {s.status === 'en-curso' ? 'En curso' : s.status === 'completa' ? 'Completa' : 'Incompleta'}
                    </Badge>
                    <Icon name="chevron" className="row-chevron" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint">Los gráficos de constancia y evolución de cargas llegan en la etapa 6.</p>
        </section>
      )}

      {historic.length > 0 && (
        <section className="section">
          <h2 className="section-title">Registros históricos</h2>
          <p className="muted small">Datos que ya tenías, sin fecha. No cuentan para la constancia semanal.</p>
          <div className="stack-sm">
            {historic.map((s) => (
              <details className="card details" key={s.id}>
                <summary>
                  <span className="row-main">
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub">
                      {s.items.length} ejercicios · fecha desconocida
                    </span>
                  </span>
                </summary>
                <ul className="history-items">
                  {s.items.map((i) => (
                    <li key={i.id}>
                      <button className="link" onClick={() => navigate(`/ejercicios/${i.exerciseId}`)}>
                        {nameOf.get(i.exerciseId) ?? i.exerciseId}
                      </button>
                      <div className="set-chips">
                        {i.sets.map((set, k) => (
                          <span className="set-chip" key={k}>
                            {formatLoggedSet(set)}
                          </span>
                        ))}
                      </div>
                      {i.note && <p className="hint">{i.note}</p>}
                    </li>
                  ))}
                </ul>
                {s.note && <p className="hint">{s.note}</p>}
                <div className="details-actions">
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      const id = await routineFromSession(s.id);
                      navigate(`/rutinas/${id}`);
                    }}
                  >
                    <Icon name="copy" size={18} /> Usar como rutina alternativa
                  </button>
                  <p className="hint">Crea una rutina editable a partir de este registro. El registro original no cambia.</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
