import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatLoggedSet } from '../domain/format';
import { navigate } from '../router';
import { EmptyState, Loading, ScreenHeader } from '../ui/common';

export function Progress() {
  const data = useLiveQuery(async () => {
    const [sessions, exercises] = await Promise.all([db.sessions.toArray(), db.exercises.toArray()]);
    return { sessions, exercises };
  });
  if (!data) return <Loading />;
  const nameOf = new Map(data.exercises.map((e) => [e.id, e.name]));
  const logged = data.sessions.filter((s) => s.source === 'registro');
  const historic = data.sessions.filter((s) => s.source === 'historico');

  return (
    <>
      <ScreenHeader title="Progreso" />
      {logged.length === 0 && (
        <EmptyState icon="progress" title="Todavía no registraste sesiones">
          Cuando completes la primera, vas a ver acá tu constancia semanal y la evolución de tus cargas.
        </EmptyState>
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
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
