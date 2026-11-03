import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getWeekPlan } from '../db/db';
import { deleteBodyMetric, routineFromSession, saveBodyMetric } from '../db/actions';
import type { BodyMetric, Exercise, Session } from '../db/types';
import { capitalize, dayAndMonth, parseISODate, toISODate, weekdayName } from '../domain/dates';
import { formatLoggedSet } from '../domain/format';
import { summarize } from '../domain/session';
import { compliance, exerciseProgress, isActivity, trend, weeklyAverages, weekStats, type MetricKind } from '../domain/stats';
import { navigate } from '../router';
import { Badge, ConfirmSheet, EmptyState, Loading, parseNumber, ScreenHeader } from '../ui/common';
import { ColumnChart, Legend, LineChart, SERIES_ACCENT, SERIES_MUTED, type LineSeries } from '../ui/charts';
import { Icon } from '../ui/Icon';
import { useNow } from '../ui/useNow';

const ms = (iso: string) => parseISODate(iso).getTime();
const shortDate = (v: number) => {
  const d = new Date(v);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
const kg = (v: number) => `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg`;
const signed = (v: number, unit: string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unit}`;

const METRIC_TEXT: Record<MetricKind, string> = {
  kg: 'Carga de la mejor serie de cada sesión (kg)',
  reps: 'Repeticiones de la mejor serie de cada sesión',
  tiempo: 'Tiempo de la mejor serie de cada sesión (s)',
  minutos: 'Minutos de cada sesión',
  km: 'Distancia de cada sesión (km)',
};

export function Progress() {
  const now = useNow();
  const data = useLiveQuery(async () => {
    const [sessions, exercises, weekPlan, metrics] = await Promise.all([
      db.sessions.toArray(),
      db.exercises.toArray(),
      getWeekPlan(),
      db.bodyMetrics.orderBy('date').toArray(),
    ]);
    return { sessions, exercises, weekPlan, metrics };
  });
  if (!data) return <Loading />;
  const { sessions, exercises, weekPlan, metrics } = data;
  const nameOf = new Map(exercises.map((e) => [e.id, e.name]));
  const logged = sessions
    .filter((s) => s.source === 'registro')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const historic = sessions.filter((s) => s.source === 'historico');

  return (
    <>
      <ScreenHeader title="Progreso" />
      {logged.length === 0 ? (
        <EmptyState icon="progress" title="Todavía no registraste sesiones">
          Cuando completes la primera, vas a ver acá tu constancia semanal y la evolución de tus cargas.
        </EmptyState>
      ) : (
        <Constancy sessions={sessions} weekPlan={weekPlan} now={now} />
      )}

      <BodyWeight metrics={metrics} today={toISODate(now)} />

      {logged.length > 0 && <ExerciseEvolution sessions={sessions} exercises={exercises} />}

      {logged.length > 0 && (
        <section className="section">
          <h2 className="section-title">Tus sesiones</h2>
          <ul className="list">
            {logged.map((s) => (
              <SessionRow key={s.id} s={s} nameOf={nameOf} />
            ))}
          </ul>
        </section>
      )}

      {historic.length > 0 && (
        <section className="section">
          <h2 className="section-title">Registros históricos</h2>
          <p className="muted small">Datos que ya tenías, sin fecha. No cuentan para la constancia ni para los gráficos.</p>
          <div className="stack-sm">
            {historic.map((s) => (
              <details className="card details" key={s.id}>
                <summary>
                  <span className="row-main">
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub">{s.items.length} ejercicios · fecha desconocida</span>
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

function SessionRow({ s, nameOf }: { s: Session; nameOf: Map<string, string> }) {
  const sum = summarize(s);
  const d = parseISODate(s.date!);
  const activity = isActivity(s);
  const set = s.items[0]?.sets[0];
  return (
    <li>
      <button className="row" onClick={() => navigate(`/sesion/${s.id}`)}>
        <span className="row-main">
          <span className="row-title">{activity ? (nameOf.get(s.items[0]?.exerciseId) ?? s.name) : s.name}</span>
          <span className="row-sub">
            {capitalize(weekdayName(d))} {dayAndMonth(d)} ·{' '}
            {activity
              ? set
                ? formatLoggedSet(set)
                : 'actividad'
              : `${sum.setsDone} series${sum.minutes !== undefined && s.status !== 'en-curso' ? ` · ${sum.minutes} min` : ''}`}
            {s.sessionRpe !== undefined && ` · esfuerzo ${s.sessionRpe}/10`}
          </span>
        </span>
        {activity ? (
          <Badge>Actividad</Badge>
        ) : (
          <Badge tone={s.status === 'completa' ? 'accent' : 'neutral'}>
            {s.status === 'en-curso' ? 'En curso' : s.status === 'completa' ? 'Completa' : 'Incompleta'}
          </Badge>
        )}
        <Icon name="chevron" className="row-chevron" size={18} />
      </button>
    </li>
  );
}

// ——— Constancia ———

function Constancy({ sessions, weekPlan, now }: { sessions: Session[]; weekPlan: Parameters<typeof weekStats>[1]; now: Date }) {
  const stats = weekStats(sessions, weekPlan, now, 8);
  const current = stats[stats.length - 1];
  const last4 = stats.slice(-4);
  const comp = compliance(last4);
  const acts = last4.reduce((n, w) => n + w.activities, 0);
  return (
    <section className="section">
      <h2 className="section-title">Constancia</h2>
      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Esta semana</span>
          <span className="tile-value">
            {current.gym} <small>de {current.planned}</small>
          </span>
          <span className="tile-sub">sesiones</span>
        </div>
        <div className="tile">
          <span className="tile-label">Plan (4 semanas)</span>
          <span className="tile-value">{comp.pct} %</span>
          <span className="tile-sub">
            {comp.done} de {comp.planned}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Actividades</span>
          <span className="tile-value">{acts}</span>
          <span className="tile-sub">en 4 semanas</span>
        </div>
      </div>
      <div className="card chart-card">
        <p className="chart-title">Sesiones de gimnasio por semana</p>
        <ColumnChart
          ariaLabel="Sesiones de gimnasio por semana, últimas 8 semanas"
          data={stats.map((w) => ({
            key: w.weekStart,
            label: shortDate(ms(w.weekStart)),
            value: w.gym,
            detail: `Semana del ${shortDate(ms(w.weekStart))}: ${w.gym} ${w.gym === 1 ? 'sesión' : 'sesiones'} de ${w.planned} planificadas${w.activities ? ` · ${w.activities} ${w.activities === 1 ? 'actividad' : 'actividades'}` : ''}`,
          }))}
        />
        <p className="hint">Cada semana cuenta por sí sola: lo que no hiciste no se acumula. Tocá una barra para ver el detalle.</p>
        <details className="table-view">
          <summary>Ver como tabla</summary>
          <table>
            <thead>
              <tr>
                <th>Semana del</th>
                <th>Gimnasio</th>
                <th>Actividades</th>
              </tr>
            </thead>
            <tbody>
              {[...stats].reverse().map((w) => (
                <tr key={w.weekStart}>
                  <td>{shortDate(ms(w.weekStart))}</td>
                  <td>
                    {w.gym} de {w.planned}
                  </td>
                  <td>{w.activities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}

// ——— Peso corporal ———

function BodyWeight({ metrics, today }: { metrics: BodyMetric[]; today: string }) {
  const todays = metrics.find((m) => m.date === today);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [error, setError] = useState<string>();
  const [toDelete, setToDelete] = useState<BodyMetric | null>(null);

  const weightAvgs = weeklyAverages(metrics, 'weightKg');
  const waistAvgs = weeklyAverages(metrics, 'waistCm');
  const wTrend = trend(weightAvgs);
  const waistTrend = trend(waistAvgs);
  const lastAvg = weightAvgs[weightAvgs.length - 1];

  const save = async () => {
    const w = parseNumber(weight);
    const c = parseNumber(waist);
    if (w === undefined && c === undefined) return setError('Escribí el peso o la cintura.');
    if ((w !== undefined && (w < 30 || w > 300)) || (c !== undefined && (c < 40 || c > 250))) return setError('Revisá el valor: parece fuera de rango.');
    setError(undefined);
    await saveBodyMetric({ date: today, weightKg: w, waistCm: c });
    setWeight('');
    setWaist('');
  };

  const weightSeries: LineSeries[] = [
    {
      name: 'Registro diario',
      style: 'dots',
      color: SERIES_MUTED,
      points: metrics.filter((m) => m.weightKg !== undefined).map((m) => ({ x: ms(m.date), y: m.weightKg!, label: kg(m.weightKg!) })),
    },
    {
      name: 'Promedio semanal',
      style: 'line',
      color: SERIES_ACCENT,
      // El promedio se ubica a mitad de semana (jueves).
      points: weightAvgs.map((a) => ({ x: ms(a.weekStart) + 3 * 86_400_000, y: a.avg, label: kg(a.avg) })),
    },
  ];

  return (
    <section className="section">
      <h2 className="section-title">Peso corporal</h2>
      <div className="card stack-sm">
        <div className="metric-form">
          <label className="field">
            <span className="field-label">Peso (kg)</span>
            <input
              className="input input-num"
              inputMode="decimal"
              placeholder={todays?.weightKg !== undefined ? String(todays.weightKg).replace('.', ',') : '—'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Cintura (cm, opcional)</span>
            <input
              className="input input-num"
              inputMode="decimal"
              placeholder={todays?.waistCm !== undefined ? String(todays.waistCm).replace('.', ',') : '—'}
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" onClick={save}>
            Anotar
          </button>
        </div>
        {todays && <p className="hint">Hoy ya anotaste: si escribís de nuevo, se reemplaza.</p>}
        {error && <p className="error-text">{error}</p>}
        <p className="hint">Conviene pesarse en condiciones parecidas (por ejemplo, al levantarte). Lo que importa es el promedio semanal.</p>
      </div>

      {weightSeries[0].points.length > 0 && (
        <div className="card chart-card">
          <div className="chart-head">
            <p className="chart-title">Peso</p>
            {lastAvg && (
              <p className="chart-summary">
                Promedio de la última semana <strong>{kg(lastAvg.avg)}</strong>
                {wTrend && ` · ${signed(wTrend.delta, 'kg')} en ${wTrend.weeks} ${wTrend.weeks === 1 ? 'semana' : 'semanas'}`}
              </p>
            )}
          </div>
          <Legend series={weightSeries} />
          <LineChart ariaLabel="Peso corporal: registros diarios y promedio semanal" series={weightSeries} formatX={shortDate} />
          {waistAvgs.length > 0 && (
            <>
              <p className="chart-title">
                Cintura {waistTrend && <span className="chart-summary">· {signed(waistTrend.delta, 'cm')} en {waistTrend.weeks} sem.</span>}
              </p>
              <LineChart
                ariaLabel="Cintura en centímetros"
                height={140}
                formatX={shortDate}
                series={[
                  {
                    name: 'Cintura',
                    style: 'line',
                    color: SERIES_ACCENT,
                    points: metrics.filter((m) => m.waistCm !== undefined).map((m) => ({ x: ms(m.date), y: m.waistCm!, label: `${m.waistCm} cm` })),
                  },
                ]}
              />
            </>
          )}
          <details className="table-view">
            <summary>Ver registros</summary>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Peso</th>
                  <th>Cintura</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...metrics].reverse().map((m) => (
                  <tr key={m.id}>
                    <td>{shortDate(ms(m.date))}</td>
                    <td>{m.weightKg !== undefined ? kg(m.weightKg) : '—'}</td>
                    <td>{m.waistCm !== undefined ? `${m.waistCm} cm` : '—'}</td>
                    <td>
                      <button className="icon-btn" aria-label={`Borrar el registro del ${shortDate(ms(m.date))}`} onClick={() => setToDelete(m)}>
                        <Icon name="trash" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {toDelete && (
        <ConfirmSheet
          title="¿Borrar este registro?"
          message={`Peso y cintura del ${shortDate(ms(toDelete.date))}.`}
          confirmLabel="Borrar"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteBodyMetric(toDelete.id);
            setToDelete(null);
          }}
        />
      )}
    </section>
  );
}

// ——— Evolución por ejercicio ———

function ExerciseEvolution({ sessions, exercises }: { sessions: Session[]; exercises: Exercise[] }) {
  const options = useMemo(
    () =>
      exercises
        .map((e) => ({ e, p: exerciseProgress(sessions, e) }))
        .filter(({ p }) => p.points.length > 0)
        .sort((a, b) => b.p.points.length - a.p.points.length || a.e.name.localeCompare(b.e.name, 'es')),
    [sessions, exercises],
  );
  const [selected, setSelected] = useState<string>();
  if (options.length === 0) return null;
  const current = options.find((o) => o.e.id === selected) ?? options[0];
  const { metric, points } = current.p;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <section className="section">
      <h2 className="section-title">Evolución por ejercicio</h2>
      <div className="card chart-card">
        <select className="input" aria-label="Ejercicio" value={current.e.id} onChange={(e) => setSelected(e.target.value)}>
          {options.map(({ e, p }) => (
            <option key={e.id} value={e.id}>
              {e.name} ({p.points.length})
            </option>
          ))}
        </select>
        <p className="chart-title">{METRIC_TEXT[metric]}</p>
        {points.length > 1 && (
          <p className="chart-summary">
            Primera: <strong>{first.label}</strong> · Última: <strong>{last.label}</strong>
          </p>
        )}
        <LineChart
          ariaLabel={`${current.e.name}: ${METRIC_TEXT[metric]}`}
          formatX={shortDate}
          series={[{ name: current.e.name, style: 'line', color: SERIES_ACCENT, points: points.map((p) => ({ x: ms(p.date), y: metric === 'minutos' ? Math.round(p.value) : p.value, label: p.label })) }]}
        />
        {points.length === 1 && <p className="hint">Con una sola sesión todavía no hay evolución: aparece desde la segunda.</p>}
        <details className="table-view">
          <summary>Ver sesiones</summary>
          <ul className="history-items">
            {[...points].reverse().map((p) => (
              <li key={p.sessionId}>
                <button className="link" onClick={() => navigate(`/sesion/${p.sessionId}`)}>
                  {capitalize(weekdayName(parseISODate(p.date)))} {dayAndMonth(parseISODate(p.date))}
                </button>
                <div className="set-chips">
                  {p.sets.map((x, k) => (
                    <span className="set-chip" key={k}>
                      {formatLoggedSet(x)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </details>
        <button className="link" onClick={() => navigate(`/ejercicios/${current.e.id}`)}>
          Ver el ejercicio
        </button>
      </div>
    </section>
  );
}
