import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Session } from '../db/types';
import { capitalize, dayAndMonth, parseISODate, weekdayName } from '../domain/dates';
import { formatLoggedSet, summarizeSets } from '../domain/format';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, Loading, NotFound, PendingNote, ScreenHeader } from '../ui/common';
import { ExerciseMedia } from '../ui/ExerciseMedia';
import { BodyMap } from '../ui/BodyMap';
import { LineChart, SERIES_ACCENT } from '../ui/charts';
import { exerciseProgress } from '../domain/stats';

export function ExerciseDetail({ id }: { id: string }) {
  const data = useLiveQuery(async () => {
    const [exercise, exercises, routines, sessions] = await Promise.all([
      db.exercises.get(id),
      db.exercises.toArray(),
      db.routines.toArray(),
      db.sessions.toArray(),
    ]);
    return { exercise, exercises, routines, sessions };
  }, [id]);

  if (!data) return <Loading />;
  const { exercise: ex, exercises, routines, sessions } = data;
  if (!ex) return <NotFound what="este ejercicio" back="/ejercicios" />;

  const nameOf = new Map(exercises.map((e) => [e.id, e.name]));
  const history = historyFor(sessions, id);
  const usedIn = routines.flatMap((r) => r.items.filter((i) => i.exerciseId === id).map((item) => ({ r, item })));
  const otherNames = [...(ex.aliases ?? []), ex.nameEn].filter(Boolean).join(' · ');

  return (
    <>
      <ScreenHeader title={ex.name} back="/ejercicios" />
      {otherNames && <p className="muted alt-names">{otherNames}</p>}
      <div className="header-actions">
        <button className="btn btn-sm" onClick={() => navigate(`/ejercicios/${ex.id}/editar`)}>
          <Icon name="edit" size={18} /> Editar ejercicio
        </button>
      </div>

      <ExerciseMedia exercise={ex} />

      <div className="chips">
        {[...new Set<string>([ex.group, ...ex.equipment, ex.movement])].map((c) => (
          <span className="chip" key={c}>
            {c}
          </span>
        ))}
      </div>

      {ex.pending && <PendingNote>{ex.pending}</PendingNote>}

      <section className="section">
        <h2 className="section-title">Músculos</h2>
        <div className="card prose">
          <BodyMap primary={ex.primaryMuscles} secondary={ex.secondaryMuscles} />
          <p>
            <span className="label">Principales</span> {ex.primaryMuscles.join(', ')}
          </p>
          {ex.secondaryMuscles.length > 0 && (
            <p>
              <span className="label">Secundarios</span> {ex.secondaryMuscles.join(', ')}
            </p>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Cómo se hace</h2>
        {ex.instructions.length > 0 ? (
          <ol className="steps">
            {ex.instructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">Todavía no hay instrucciones para este ejercicio.</p>
        )}
        {ex.instructionsNote && <p className="hint">{ex.instructionsNote}</p>}
      </section>

      {ex.commonErrors.length > 0 && (
        <section className="section">
          <h2 className="section-title">Errores frecuentes</h2>
          <ul className="bullets">
            {ex.commonErrors.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {ex.variants && ex.variants.length > 0 && (
        <section className="section">
          <h2 className="section-title">Variantes</h2>
          <div className="chips">
            {ex.variants.map((v) => (
              <span className="chip" key={v}>
                {v}
              </span>
            ))}
          </div>
        </section>
      )}

      {ex.substitutions && ex.substitutions.length > 0 && (
        <section className="section">
          <h2 className="section-title">Sustituciones</h2>
          <ul className="list">
            {ex.substitutions.map((sid) => (
              <li key={sid}>
                <button className="row" onClick={() => navigate(`/ejercicios/${sid}`)}>
                  <span className="row-main">
                    <span className="row-title">{nameOf.get(sid) ?? sid}</span>
                  </span>
                  <Icon name="chevron" className="row-chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Tu historial</h2>
        {(() => {
          const { points } = exerciseProgress(sessions, ex);
          if (points.length < 2) return null;
          return (
            <div className="card chart-card">
              <p className="chart-title">Mejor serie de cada sesión</p>
              <LineChart
                ariaLabel={`${ex.name}: mejor serie de cada sesión`}
                height={150}
                formatX={(v) => `${new Date(v).getDate()}/${new Date(v).getMonth() + 1}`}
                series={[{ name: ex.name, style: 'line', color: SERIES_ACCENT, points: points.map((p) => ({ x: parseISODate(p.date).getTime(), y: p.value, label: p.label })) }]}
              />
            </div>
          );
        })()}
        {history.length === 0 ? (
          <p className="muted">Todavía no hay registros de este ejercicio.</p>
        ) : (
          <div className="stack-sm">
            {history.map((h) => (
              <div className="card history-entry" key={`${h.session.id}-${h.itemId}`}>
                <div className="history-head">
                  <span className="history-date">{h.session.date ? formatDate(h.session.date) : 'Fecha desconocida'}</span>
                  {h.session.source === 'historico' && <Badge>Registro histórico</Badge>}
                </div>
                <p className="row-sub">{h.session.name}</p>
                <div className="set-chips">
                  {h.sets.map((s, i) => (
                    <span className="set-chip" key={i}>
                      {formatLoggedSet(s)}
                    </span>
                  ))}
                </div>
                {h.note && <p className="hint">{h.note}</p>}
              </div>
            ))}
            <p className="hint">Los registros históricos son una referencia, no tu carga actual.</p>
          </div>
        )}
      </section>

      {usedIn.length > 0 && (
        <section className="section">
          <h2 className="section-title">En tus rutinas</h2>
          <ul className="list">
            {usedIn.map(({ r, item }) => (
              <li key={`${r.id}-${item.id}`}>
                <button className="row" onClick={() => navigate(`/rutinas/${r.id}`)}>
                  <span className="row-main">
                    <span className="row-title">{r.name}</span>
                    <span className="row-sub">
                      {summarizeSets(item)}
                      {item.variant && ` · ${item.variant}`}
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
          </ul>
        </section>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  const d = parseISODate(iso);
  return `${capitalize(weekdayName(d))} ${dayAndMonth(d)} de ${d.getFullYear()}`;
}

/** Registros de un ejercicio: primero los fechados (más reciente arriba), después los sin fecha. */
function historyFor(sessions: Session[], exerciseId: string) {
  return sessions
    .filter((s) => s.status !== 'en-curso')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .flatMap((session) =>
      session.items
        .filter((i) => i.exerciseId === exerciseId && i.sets.some((s) => s.done))
        .map((i) => ({ session, itemId: i.id, sets: i.sets.filter((s) => s.done), note: i.note })),
    );
}
