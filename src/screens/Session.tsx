import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getWeekPlan } from '../db/db';
import { discardSession, finishSession, getPrefs, updateSession } from '../db/actions';
import type { Exercise, LoggedSet, Session, SessionItem, WorkTimer } from '../db/types';
import { capitalize, dayAndMonth, parseISODate, weekdayName } from '../domain/dates';
import { formatDuration, formatKg, formatLoggedSet, formatRest, summarizeSets } from '../domain/format';
import { filterExercises, NO_FILTERS } from '../domain/search';
import {
  completeSet, fieldsFor, formatClock, previousRecord, progressionHint, remainingMs, setHints, summarize,
  type FieldKind, type PreviousRecord, type SetHints,
} from '../domain/session';
import { switchTab } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, ConfirmSheet, Loading, NotFound, PendingNote, Sheet } from '../ui/common';
import { ExerciseMedia } from '../ui/ExerciseMedia';
import { alertDone, primeAudio, useWakeLock } from '../ui/device';
import { celebrate, coachLine, workElapsedMs, type CelebrationData } from '../domain/coach';
import { weekStats } from '../domain/stats';
import { CoachBubble } from '../ui/Coach';
import { Celebration } from '../ui/Celebration';

type PadField = FieldKind | 'rpe' | 'speedKmh' | 'inclinePct';
interface PadTarget {
  itemId: string;
  setIndex: number;
  field: PadField;
}

const STEP: Record<PadField, number> = { weightKg: 2.5, reps: 1, durationSec: 15, durationMin: 5, distanceKm: 0.5, rpe: 1, speedKmh: 0.5, inclinePct: 1 };
const LABEL: Record<PadField, string> = {
  weightKg: 'Peso (kg)',
  reps: 'Repeticiones',
  durationSec: 'Tiempo (s)',
  durationMin: 'Tiempo (min)',
  distanceKm: 'Distancia (km)',
  rpe: 'Esfuerzo (RPE 1–10)',
  speedKmh: 'Velocidad (km/h)',
  inclinePct: 'Inclinación (%)',
};
const DECIMALS: Record<PadField, boolean> = {
  weightKg: true, reps: false, durationSec: false, durationMin: true, distanceKm: true, rpe: false, speedKmh: true, inclinePct: true,
};

const num = (n: number) => String(Number(n.toFixed(2))).replace('.', ',');

/** Valor guardado de un campo (minutos se guardan como segundos). */
function fieldValue(set: LoggedSet, f: PadField): number | undefined {
  if (f === 'durationMin') return set.durationSec !== undefined ? set.durationSec / 60 : undefined;
  return set[f];
}

function hintValue(h: SetHints, f: PadField): number | undefined {
  if (f === 'durationMin') return h.durationSec !== undefined ? h.durationSec / 60 : undefined;
  if (f === 'rpe' || f === 'speedKmh' || f === 'inclinePct') return undefined;
  return h[f];
}

function writeField(set: LoggedSet, f: PadField, v: number | undefined) {
  if (f === 'durationMin') set.durationSec = v !== undefined ? Math.round(v * 60) : undefined;
  else set[f] = v;
}

export function SessionScreen({ id }: { id: string }) {
  const data = useLiveQuery(async () => {
    const [session, exercises, sessions, prefs, weekPlan] = await Promise.all([
      db.sessions.get(id),
      db.exercises.toArray(),
      db.sessions.toArray(),
      getPrefs(),
      getWeekPlan(),
    ]);
    return { session: session ?? null, exercises, sessions, prefs, weekPlan };
  }, [id]);

  const session = data?.session;
  const active = session?.status === 'en-curso';
  useWakeLock(!!active);

  // El intervalo solo redibuja; el tiempo se calcula siempre con la hora exacta.
  const [tick, setTick] = useState(0);
  const now = tick >= 0 ? Date.now() : 0;
  const [pad, setPad] = useState<PadTarget | null>(null);
  const [padText, setPadText] = useState('');
  const [padFresh, setPadFresh] = useState(true);
  const [restEnded, setRestEnded] = useState(false);
  const [sheet, setSheet] = useState<'lista' | 'sustituir' | 'terminar' | 'descartar' | null>(null);
  const [howOpen, setHowOpen] = useState<Record<string, boolean>>({});
  const notifiedRest = useRef<string | undefined>(undefined);
  const notifiedWork = useRef<string | undefined>(undefined);
  const notifiedHalf = useRef<string | undefined>(undefined);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);

  const exById = useMemo(() => new Map((data?.exercises ?? []).map((e) => [e.id, e])), [data?.exercises]);
  const restLeft = remainingMs(session?.restEndsAt, now);
  const mutate = (change: (s: Session) => void) => updateSession(id, change);
  // Temporizador de trabajo guardado en la sesión: sobrevive a recargas y pausas.
  const work = session?.work;
  const workMs = work ? workElapsedMs(work, now) : 0;

  // Fin del descanso: aviso una sola vez y se limpia.
  useEffect(() => {
    if (!session?.restEndsAt || !data) return;
    if (restLeft > 0 || notifiedRest.current === session.restEndsAt) return;
    notifiedRest.current = session.restEndsAt;
    alertDone(data.prefs);
    setRestEnded(true);
    updateSession(id, (s) => {
      s.restEndsAt = undefined;
    });
  }, [restLeft, session?.restEndsAt, data, id]);

  useEffect(() => {
    if (!restEnded) return;
    const t = window.setTimeout(() => setRestEnded(false), 4000);
    return () => window.clearTimeout(t);
  }, [restEnded]);

  // Planchas e isométricos: al llegar a cero se marca la serie. Cardio: aviso a mitad y al llegar a la meta.
  useEffect(() => {
    if (!work || !data) return;
    const goal = work.durationSec * 1000;
    if (work.mode === 'cuenta-regresiva' && workMs >= goal && notifiedWork.current !== work.startedAt) {
      notifiedWork.current = work.startedAt;
      alertDone(data.prefs);
      markDone(work.itemId, work.setIndex, true);
    }
    if (work.mode === 'cronometro') {
      if (workMs >= goal / 2 && notifiedHalf.current !== work.startedAt) {
        notifiedHalf.current = work.startedAt;
        if (data.prefs.vibrate) navigator.vibrate?.(120);
      }
      if (workMs >= goal && notifiedWork.current !== work.startedAt) {
        notifiedWork.current = work.startedAt;
        alertDone(data.prefs);
      }
    }
  }, [workMs, work, data]);

  if (!data) return <Loading />;
  if (!session) return <NotFound what="esta sesión" back="/hoy" />;

  const index = Math.min(session.currentIndex ?? 0, session.items.length - 1);
  const item = session.items[index];
  const exercise = exById.get(item.exerciseId);
  const previous = previousRecord(data.sessions, item.exerciseId, session.id);
  const fields = fieldsFor(exercise, item);
  const sum = summarize(session, new Date(now));
  const isLast = index === session.items.length - 1;
  const firstTime = !previous;
  // Se abre solo la primera vez que hacés un ejercicio de fuerza o movilidad (en cardio no hace falta).
  const showHow = howOpen[item.id] ?? (firstTime && exercise?.movement !== 'Cardio');

  const goTo = (i: number) => {
    setPad(null);
    mutate((s) => {
      s.currentIndex = Math.max(0, Math.min(i, s.items.length - 1));
    });
    window.scrollTo(0, 0);
  };

  function hintsFor(it: SessionItem, i: number) {
    return setHints(it, i, previousRecord(data!.sessions, it.exerciseId, session!.id));
  }

  function startRest(it: SessionItem, setIndex: number) {
    const restSec = it.plan?.restSec ?? 60;
    const lastOfAll = it === session!.items[session!.items.length - 1] && setIndex === it.sets.length - 1;
    if (!active || restSec <= 0 || lastOfAll) return;
    mutate((s) => {
      s.restEndsAt = new Date(Date.now() + restSec * 1000).toISOString();
    });
  }

  async function markDone(itemId: string, setIndex: number, fromTimer = false) {
    const it = session!.items.find((x) => x.id === itemId)!;
    if (it.sets[setIndex].done && !fromTimer) {
      await mutate((s) => {
        s.items.find((x) => x.id === itemId)!.sets[setIndex].done = false;
      });
      return;
    }
    primeAudio();
    const h = hintsFor(it, setIndex);
    let completed: LoggedSet | undefined;
    // Se completa sobre lo guardado: si recién escribiste un valor, no se pisa.
    await mutate((s) => {
      const fresh = s.items.find((x) => x.id === itemId)!;
      completed = completeSet(fresh.sets[setIndex], h);
      fresh.sets[setIndex] = completed;
      if (s.work?.itemId === itemId && s.work.setIndex === setIndex) s.work = undefined;
    });
    startRest(it, setIndex);
    // Si no hay número para las repeticiones (p. ej. rango 8–12 la primera vez), te lo pregunta.
    const exFields = fieldsFor(exById.get(it.exerciseId), it);
    if (completed && exFields.includes('reps') && completed.reps === undefined) openPad({ itemId, setIndex, field: 'reps' }, completed);
  }

  // La hora se toma en el momento del toque (no cuando termina de guardarse).
  function startWork(itemId: string, setIndex: number, durationSec: number, mode: WorkTimer['mode']) {
    primeAudio();
    const startedAt = new Date().toISOString();
    mutate((s) => {
      s.work = { itemId, setIndex, durationSec, mode, startedAt, pausedMs: 0 };
    });
  }

  function pauseWork(pause: boolean) {
    const at = Date.now();
    mutate((s) => {
      if (!s.work) return;
      if (pause && !s.work.pausedAt) s.work.pausedAt = new Date(at).toISOString();
      if (!pause && s.work.pausedAt) {
        s.work.pausedMs += at - new Date(s.work.pausedAt).getTime();
        s.work.pausedAt = undefined;
      }
    });
  }

  /** Cierra el cardio: con cronómetro guarda el tiempo real; sin cronómetro, el del plan (lo que ves). */
  function finishCardio(itemId: string) {
    const elapsedSec = work && work.itemId === itemId ? Math.round(workElapsedMs(work, Date.now()) / 1000) : undefined;
    mutate((s) => {
      const it = s.items.find((x) => x.id === itemId)!;
      const set = it.sets[0];
      it.sets[0] = {
        ...set,
        durationSec: elapsedSec && elapsedSec >= 60 ? elapsedSec : (set.durationSec ?? set.planned?.durationSec),
        done: true,
        completedAt: new Date().toISOString(),
      };
      if (s.work?.itemId === itemId) s.work = undefined;
    });
  }

  function openPad(target: PadTarget, set?: LoggedSet) {
    const s = set ?? session!.items.find((x) => x.id === target.itemId)!.sets[target.setIndex];
    const v = fieldValue(s, target.field);
    setPad(target);
    setPadText(v !== undefined ? num(v) : '');
    setPadFresh(true);
    requestAnimationFrame(() =>
      document.querySelector(`[data-set="${target.itemId}-${target.setIndex}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
  }

  function savePad(text: string) {
    if (!pad) return;
    setPadText(text);
    const parsed = text === '' ? undefined : Number(text.replace(',', '.'));
    const value = parsed === undefined || Number.isNaN(parsed) ? undefined : pad.field === 'rpe' ? Math.min(10, Math.max(1, Math.round(parsed))) : parsed;
    const target = pad;
    mutate((s) => {
      writeField(s.items.find((x) => x.id === target.itemId)!.sets[target.setIndex], target.field, value);
    });
  }

  function padKey(k: string) {
    if (!pad) return;
    primeAudio();
    const base = padFresh ? '' : padText;
    setPadFresh(false);
    if (k === '⌫') return savePad(base.slice(0, -1));
    if (k === ',') {
      if (!DECIMALS[pad.field] || base.includes(',')) return;
      return savePad((base || '0') + ',');
    }
    if (base.replace(',', '').length >= 5) return;
    savePad(base === '0' ? k : base + k);
  }

  function padStep(sign: 1 | -1) {
    if (!pad) return;
    const it = session!.items.find((x) => x.id === pad.itemId)!;
    const current = fieldValue(it.sets[pad.setIndex], pad.field) ?? hintValue(hintsFor(it, pad.setIndex), pad.field) ?? 0;
    const next = Math.max(0, Number((current + sign * STEP[pad.field]).toFixed(2)));
    setPadFresh(false);
    savePad(num(next));
  }

  function padNext() {
    if (!pad) return;
    const it = session!.items.find((x) => x.id === pad.itemId)!;
    const ex = exById.get(it.exerciseId);
    const order: PadField[] =
      ex?.movement === 'Cardio'
        ? ['distanceKm', 'speedKmh', 'inclinePct']
        : [...fieldsFor(ex, it), ...(data!.prefs.rpe ? (['rpe'] as PadField[]) : [])];
    const pos = order.indexOf(pad.field);
    if (pos === -1) return setPad(null);
    if (pos < order.length - 1) return openPad({ ...pad, field: order[pos + 1] });
    if (pad.setIndex < it.sets.length - 1) return openPad({ ...pad, setIndex: pad.setIndex + 1, field: order[0] });
    setPad(null);
  }

  const elapsed = session.startedAt ? (session.finishedAt ? new Date(session.finishedAt).getTime() : now) - new Date(session.startedAt).getTime() : 0;

  return (
    <div className={`session${pad ? ' has-pad' : ''}`}>
      <header className="session-top">
        <button className="icon-btn" onClick={() => switchTab(active ? '/hoy' : '/progreso')} aria-label={active ? 'Salir (la sesión queda guardada)' : 'Volver'}>
          <Icon name="close" />
        </button>
        <div className="session-top-main">
          <span className="session-top-title">{session.name}</span>
          <span className="session-top-sub">
            Ejercicio {index + 1} de {session.items.length} · {formatClock(elapsed)}
            {!active && ` · ${session.status === 'completa' ? 'completa' : 'incompleta'}`}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setSheet('lista')} aria-label="Lista de ejercicios">
          <Icon name="list" />
        </button>
      </header>

      <div className="session-progress" aria-hidden="true">
        {session.items.map((it, i) => (
          <span
            key={it.id}
            className={`${i === index ? 'is-current' : ''} ${it.skipped ? 'is-skipped' : it.sets.length && it.sets.every((x) => x.done) ? 'is-done' : it.sets.some((x) => x.done) ? 'is-partial' : ''}`}
          />
        ))}
      </div>

      {(() => {
        const isCardio = exercise?.movement === 'Cardio';
        const planned = item.sets[0]?.planned;
        const text = coachLine({
          session,
          index,
          nameOf: (eid) => exById.get(eid)?.name ?? 'el ejercicio',
          previous,
          restLeftMs: restLeft,
          firstTime,
          cardio: isCardio
            ? {
                elapsedSec: work && work.itemId === item.id ? workMs / 1000 : undefined,
                targetSec: planned?.durationSec ?? 1800,
                maxSec: planned?.durationMaxSec,
              }
            : undefined,
        });
        return active ? <CoachBubble text={text} /> : null;
      })()}

      <section className="ex">
        <h1 className="ex-name">
          {exercise?.name ?? 'Ejercicio'}
          {item.variant && <span className="row-variant"> · {item.variant}</span>}
        </h1>
        {item.substitutedFrom && <p className="hint">En lugar de {exById.get(item.substitutedFrom)?.name ?? 'otro ejercicio'}.</p>}
        {item.plan && (
          <p className="ex-plan">
            <span className="ex-plan-label">Plan</span> {summarizeSets(item.plan, session.mode === 'corta' ? 'corta' : 'completa')}
            {item.plan.loadPattern && ' · subiendo el peso'}
            {item.plan.restSec > 0 && ` · descanso ${formatRest(item.plan.restSec)}`}
            {item.optional && ' · opcional'}
          </p>
        )}
        {exercise?.equipment.includes('Mancuernas') && fields.includes('weightKg') && <p className="hint">Peso por mancuerna.</p>}

        {item.skipped ? (
          <div className="card skipped">
            <p>Omitiste este ejercicio.</p>
            <button className="btn btn-sm" onClick={() => mutate((s) => void (s.items[index].skipped = false))}>
              Deshacer
            </button>
          </div>
        ) : (
          <>
            <button className="how-toggle" aria-expanded={showHow} onClick={() => setHowOpen({ ...howOpen, [item.id]: !showHow })}>
              <Icon name="image" size={18} /> Cómo se hace
              <span className="how-chevron">{showHow ? '▴' : '▾'}</span>
            </button>
            {showHow && exercise && (
              <div className="how">
                <ExerciseMedia exercise={exercise} preferredVariant={item.variant} />
                {exercise.instructions.length > 0 && (
                  <ol className="steps">
                    {exercise.instructions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
                <p className="muted small">
                  <span className="label">Músculos</span> {exercise.primaryMuscles.join(', ')}
                </p>
              </div>
            )}

            {item.plan?.pending && <PendingNote>{item.plan.pending}</PendingNote>}
            {(() => {
              const hint = progressionHint(item, previous);
              return hint ? <p className="notice notice-accent">{hint}</p> : null;
            })()}
            <PreviousLine previous={previous} />

            {exercise?.movement === 'Cardio' ? (
              <CardioPanel
                item={item}
                work={work && work.itemId === item.id ? work : undefined}
                elapsedMs={work && work.itemId === item.id ? workMs : 0}
                pad={pad}
                onStart={() => startWork(item.id, 0, item.sets[0]?.planned?.durationSec ?? 1800, 'cronometro')}
                onPause={(p) => pauseWork(p)}
                onFinish={() => finishCardio(item.id)}
                onUndo={() => mutate((s) => void (s.items[index].sets[0].done = false))}
                onField={(field) => openPad({ itemId: item.id, setIndex: 0, field })}
              />
            ) : (
            <SetsTable
              item={item}
              fields={fields}
              previous={previous}
              rpe={data.prefs.rpe}
              pad={pad}
              hints={(i) => hintsFor(item, i)}
              onField={(setIndex, field) => openPad({ itemId: item.id, setIndex, field })}
              onDone={(setIndex) => markDone(item.id, setIndex)}
              onTimer={(setIndex, sec) => startWork(item.id, setIndex, sec, 'cuenta-regresiva')}
            />
            )}
            <div className="ex-actions">
              {exercise?.movement === 'Cardio' ? <span /> : <button
                className="link"
                onClick={() =>
                  mutate((s) => {
                    const it = s.items[index];
                    const last = it.sets[it.sets.length - 1];
                    it.sets.push({ done: false, weightKg: last?.weightKg });
                  })
                }
              >
                + Agregar serie
              </button>}
              <span className="ex-actions-right">
                <button className="link" onClick={() => setSheet('sustituir')}>
                  Sustituir
                </button>
                <button className="link" onClick={() => mutate((s) => void (s.items[index].skipped = true))}>
                  Omitir
                </button>
              </span>
            </div>
          </>
        )}
      </section>

      {/* Barra inferior: teclado, temporizador o navegación. Siempre a mano, nunca tapada por el teclado del celular. */}
      {pad ? (
        <Numpad
          label={`${LABEL[pad.field]} · serie ${pad.setIndex + 1}`}
          text={padText}
          placeholder={(() => {
            const it = session.items.find((x) => x.id === pad.itemId);
            const v = it ? hintValue(hintsFor(it, pad.setIndex), pad.field) : undefined;
            return v !== undefined ? num(v) : '—';
          })()}
          decimals={DECIMALS[pad.field]}
          step={STEP[pad.field]}
          onKey={padKey}
          onStep={padStep}
          onNext={padNext}
          onClose={() => setPad(null)}
        />
      ) : work && work.mode === 'cuenta-regresiva' ? (
        <div className="session-bar is-timer">
          <span className="timer-label">
            {exById.get(session.items.find((x) => x.id === work.itemId)?.exerciseId ?? '')?.name ?? 'Tiempo'}{' '}
            <strong>{formatClock(work.durationSec * 1000 - workMs)}</strong>
          </span>
          <button className="btn btn-sm" onClick={() => pauseWork(!work.pausedAt)}>
            {work.pausedAt ? 'Seguir' : 'Pausar'}
          </button>
          <button className="btn btn-sm" onClick={() => mutate((s) => void (s.work = undefined))}>
            Detener
          </button>
        </div>
      ) : restLeft > 0 ? (
        <div className="session-bar is-timer" role="timer" aria-live="off">
          <span className="timer-label">
            {(() => {
              // Qué sigue, para no tener que subir hasta el mensaje del coach.
              const done = item.sets.filter((x) => x.done).length;
              const next = session.items[index + 1];
              const what =
                done < item.sets.length
                  ? `sigue la serie ${done + 1} de ${item.sets.length}`
                  : next
                    ? `sigue ${exById.get(next.exerciseId)?.name ?? 'el próximo'}`
                    : '';
              return `Descanso${what ? ` · ${what}` : ''}`;
            })()}{' '}
            <strong>{formatClock(restLeft)}</strong>
          </span>
          <button
            className="btn btn-sm"
            aria-label="Restar 15 segundos"
            onClick={() => mutate((s) => void (s.restEndsAt = new Date(Math.max(Date.now(), new Date(s.restEndsAt!).getTime() - 15000)).toISOString()))}
          >
            −15
          </button>
          <button
            className="btn btn-sm"
            aria-label="Sumar 15 segundos"
            onClick={() => mutate((s) => void (s.restEndsAt = new Date(new Date(s.restEndsAt!).getTime() + 15000).toISOString()))}
          >
            +15
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => mutate((s) => void (s.restEndsAt = undefined))}>
            Saltar
          </button>
        </div>
      ) : (
        <div className={`session-bar${restEnded ? ' is-alert' : ''}`}>
          {restEnded && <span className="rest-done" role="status">Descanso terminado</span>}
          <button className="btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
            <Icon name="back" size={20} /> Anterior
          </button>
          {isLast ? (
            <button className="btn btn-primary" onClick={() => (active ? setSheet('terminar') : switchTab('/progreso'))}>
              {active ? 'Terminar' : 'Listo'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => goTo(index + 1)}>
              Siguiente <Icon name="chevron" size={20} />
            </button>
          )}
        </div>
      )}

      {sheet === 'lista' && (
        <Sheet title="Ejercicios de la sesión" onClose={() => setSheet(null)}>
          <ol className="list">
            {session.items.map((it, i) => {
              const done = it.sets.filter((x) => x.done).length;
              return (
                <li key={it.id}>
                  <button
                    className="row"
                    onClick={() => {
                      setSheet(null);
                      goTo(i);
                    }}
                  >
                    <span className="row-index">{i + 1}</span>
                    <span className="row-main">
                      <span className="row-title">{exById.get(it.exerciseId)?.name ?? 'Ejercicio'}</span>
                      <span className="row-sub">{it.skipped ? 'Omitido' : `${done} de ${it.sets.length} series`}</span>
                    </span>
                    {!it.skipped && done === it.sets.length && done > 0 && <Icon name="check" className="row-check" />}
                  </button>
                </li>
              );
            })}
          </ol>
          {active && (
            <div className="sheet-actions">
              <button className="btn btn-ghost link-danger" onClick={() => setSheet('descartar')}>
                Descartar sesión
              </button>
              <button className="btn btn-primary" onClick={() => setSheet('terminar')}>
                Terminar
              </button>
            </div>
          )}
        </Sheet>
      )}

      {sheet === 'sustituir' && exercise && (
        <SubstituteSheet
          exercise={exercise}
          exercises={data.exercises}
          hasData={item.sets.some((x) => x.done)}
          onCancel={() => setSheet(null)}
          onPick={(sub) => {
            setSheet(null);
            mutate((s) => {
              const it = s.items[index];
              it.substitutedFrom ??= it.exerciseId;
              it.exerciseId = sub.id;
              it.variant = undefined;
              it.sets = it.sets.map((x) => ({ done: false, planned: x.planned }));
            });
          }}
        />
      )}

      {celebration && <Celebration {...celebration} onClose={() => switchTab('/hoy')} />}

      {sheet === 'terminar' && <FinishSheet session={session} summary={sum} onCancel={() => setSheet(null)} onFinish={async (extra) => {
        await finishSession(id, extra);
        const [fresh, all] = await Promise.all([db.sessions.get(id), db.sessions.toArray()]);
        const week = weekStats(all, data.weekPlan, new Date(), 1)[0];
        setSheet(null);
        if (fresh) setCelebration(celebrate(fresh, all, (eid) => exById.get(eid)?.name ?? eid, { done: week.gym, planned: week.planned }));
        else switchTab('/hoy');
      }} />}

      {sheet === 'descartar' && (
        <ConfirmSheet
          title="¿Descartar esta sesión?"
          message="Se borra todo lo que registraste hoy en esta sesión. No se puede deshacer."
          confirmLabel="Descartar"
          danger
          onCancel={() => setSheet(null)}
          onConfirm={async () => {
            await discardSession(id);
            switchTab('/hoy');
          }}
        />
      )}
    </div>
  );
}

function PreviousLine({ previous }: { previous?: PreviousRecord }) {
  if (!previous) return <p className="prev-line">Primera vez: no hay registro anterior.</p>;
  if (previous.isHistoric) return <p className="prev-line">Anterior: tu registro histórico (sin fecha). Es una referencia.</p>;
  const d = parseISODate(previous.session.date!);
  return (
    <p className="prev-line">
      Anterior: {capitalize(weekdayName(d))} {dayAndMonth(d)}
    </p>
  );
}

function SetsTable(props: {
  item: SessionItem;
  fields: FieldKind[];
  previous?: PreviousRecord;
  rpe: boolean;
  pad: PadTarget | null;
  hints: (i: number) => SetHints;
  onField: (setIndex: number, field: PadField) => void;
  onDone: (setIndex: number) => void;
  onTimer: (setIndex: number, sec: number) => void;
}) {
  const { item, fields, previous, pad } = props;
  const show = (f: PadField, v: number | undefined) => {
    if (v === undefined) return undefined;
    if (f === 'durationSec') return formatDuration(v);
    if (f === 'weightKg') return formatKg(v);
    if (f === 'durationMin') return `${num(v)} min`;
    if (f === 'distanceKm') return `${num(v)} km`;
    return num(v);
  };

  return (
    <ol className="sets" aria-label="Series">
      {item.sets.map((set, i) => {
        const h = props.hints(i);
        const prev = previous?.sets[i];
        const planned = set.planned;
        const planLabel = planned
          ? planned.durationSec
            ? formatDuration(planned.durationSec)
            : (h.repsLabel ?? 'sin objetivo')
          : 'serie extra';
        return (
          <li key={i} className={`set${set.done ? ' is-done' : ''}`} data-set={`${item.id}-${i}`}>
            <div className="set-main">
              <span className="set-num">{i + 1}</span>
              {fields.map((f) => {
                const value = show(f, fieldValue(set, f));
                const placeholder = f === 'reps' ? h.repsLabel : show(f, hintValue(h, f));
                const isActive = pad?.itemId === item.id && pad.setIndex === i && pad.field === f;
                return (
                  <button
                    key={f}
                    className={`set-field${isActive ? ' is-active' : ''}${value === undefined ? ' is-empty' : ''}`}
                    onClick={() => props.onField(i, f)}
                    aria-label={`${LABEL[f]}, serie ${i + 1}: ${value ?? `sin cargar${placeholder ? `, sugerido ${placeholder}` : ''}`}`}
                  >
                    {value ?? placeholder ?? '—'}
                    {f === 'reps' && <span className="set-unit">reps</span>}
                  </button>
                );
              })}
              {(fields[0] === 'durationSec' || fields[0] === 'durationMin') && !set.done && planned?.durationSec && (
                <button className="set-timer" onClick={() => props.onTimer(i, planned.durationSec!)} aria-label={`Iniciar ${formatDuration(planned.durationSec)}`}>
                  ▶
                </button>
              )}
              <button className="set-check" aria-pressed={set.done} aria-label={`Serie ${i + 1}: ${set.done ? 'hecha (tocá para desmarcar)' : 'marcar como hecha'}`} onClick={() => props.onDone(i)}>
                <Icon name="check" size={22} />
              </button>
            </div>
            <div className="set-sub">
              <span>Plan {planLabel}</span>
              {prev && <span>· Ant. {formatLoggedSet(prev)}</span>}
              {planned?.optional && <span>· opcional</span>}
              {props.rpe && (
                <button
                  className={`set-rpe${pad?.itemId === item.id && pad.setIndex === i && pad.field === 'rpe' ? ' is-active' : ''}`}
                  onClick={() => props.onField(i, 'rpe')}
                >
                  RPE {set.rpe ?? '—'}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Numpad(props: {
  label: string;
  text: string;
  placeholder: string;
  decimals: boolean;
  step: number;
  onKey: (k: string) => void;
  onStep: (sign: 1 | -1) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const stepLabel = num(props.step);
  const key = (k: string, label = k, cls = '') => (
    <button key={k} className={`pad-key ${cls}`} onClick={() => props.onKey(k)} aria-label={k === '⌫' ? 'Borrar' : label}>
      {label}
    </button>
  );
  return (
    <div className="numpad" role="group" aria-label="Teclado numérico">
      <div className="numpad-head">
        <span className="numpad-label">{props.label}</span>
        <span className={`numpad-value${props.text ? '' : ' is-empty'}`}>{props.text || props.placeholder}</span>
      </div>
      <div className="numpad-grid">
        {key('1')}
        {key('2')}
        {key('3')}
        <button className="pad-key pad-step" onClick={() => props.onStep(-1)} aria-label={`Restar ${stepLabel}`}>
          −{stepLabel}
        </button>
        {key('4')}
        {key('5')}
        {key('6')}
        <button className="pad-key pad-step" onClick={() => props.onStep(1)} aria-label={`Sumar ${stepLabel}`}>
          +{stepLabel}
        </button>
        {key('7')}
        {key('8')}
        {key('9')}
        {key('⌫', '⌫', 'pad-fn')}
        {props.decimals ? key(',') : <span className="pad-key is-blank" />}
        {key('0')}
        <button className="pad-key pad-fn" onClick={props.onClose}>
          Listo
        </button>
        <button className="pad-key pad-next" onClick={props.onNext}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

function SubstituteSheet(props: {
  exercise: Exercise;
  exercises: Exercise[];
  hasData: boolean;
  onPick: (e: Exercise) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<Exercise | null>(null);
  const suggested = (props.exercise.substitutions ?? []).map((id) => props.exercises.find((e) => e.id === id)).filter((e): e is Exercise => !!e);
  const results = q ? filterExercises(props.exercises, { ...NO_FILTERS, q }).filter((e) => e.id !== props.exercise.id) : suggested;
  const pick = (e: Exercise) => (props.hasData ? setConfirm(e) : props.onPick(e));

  if (confirm) {
    return (
      <ConfirmSheet
        title={`¿Cambiar a ${confirm.name}?`}
        message="Las series que ya registraste de este ejercicio se borran de esta sesión."
        confirmLabel="Cambiar"
        onCancel={() => setConfirm(null)}
        onConfirm={() => props.onPick(confirm)}
      />
    );
  }
  return (
    <Sheet title={`Sustituir ${props.exercise.name}`} onClose={props.onCancel}>
      <p className="muted small">Solo cambia la sesión de hoy. La rutina sigue igual.</p>
      <div className="search">
        <Icon name="search" size={20} />
        <input type="search" placeholder="Buscar otro ejercicio" aria-label="Buscar ejercicio para sustituir" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!q && <p className="section-title">{suggested.length ? 'Sustituciones sugeridas' : 'No hay sustituciones sugeridas: buscá uno.'}</p>}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <button className="row" onClick={() => pick(e)}>
              <span className="row-main">
                <span className="row-title">{e.name}</span>
                <span className="row-sub">
                  {e.group} · {e.equipment.join(', ')}
                </span>
              </span>
              <Icon name="swap" className="row-chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function FinishSheet(props: {
  session: Session;
  summary: ReturnType<typeof summarize>;
  onFinish: (extra: { sessionRpe?: number; note?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { summary } = props;
  const [rpe, setRpe] = useState<number>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = summary.setsPlanned - summary.setsDone;
  return (
    <Sheet
      title="Terminar sesión"
      onClose={props.onCancel}
      footer={
        <div className="sheet-actions">
          <button className="btn" onClick={props.onCancel} disabled={busy}>
            Seguir
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await props.onFinish({ sessionRpe: rpe, note });
            }}
          >
            Terminar
          </button>
        </div>
      }
    >
      <div className="finish-stats">
        <div>
          <strong>{summary.setsDone}</strong>
          <span>series hechas</span>
        </div>
        <div>
          <strong>{summary.exercisesDone}</strong>
          <span>de {summary.exercisesTotal} ejercicios</span>
        </div>
        <div>
          <strong>{summary.minutes ?? '—'}</strong>
          <span>minutos</span>
        </div>
      </div>
      {pending > 0 && (
        <p className="muted small">
          {pending === 1 ? 'Quedó 1 serie sin marcar' : `Quedaron ${pending} series sin marcar`}
          {summary.skipped === 1 ? ' y 1 ejercicio omitido' : summary.skipped > 1 ? ` y ${summary.skipped} ejercicios omitidos` : ''}. Se guarda como
          sesión incompleta: igual cuenta para tu semana.
        </p>
      )}
      <div className="field">
        <span className="field-label">¿Qué tan dura fue la sesión? (opcional)</span>
        <div className="rpe-scale" role="group" aria-label="Esfuerzo de la sesión del 1 al 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} className="chip-btn" aria-pressed={rpe === n} onClick={() => setRpe(rpe === n ? undefined : n)}>
              {n}
            </button>
          ))}
        </div>
        <span className="field-help">1 = muy fácil · 10 = máximo esfuerzo.</span>
      </div>
      <label className="field">
        <span className="field-label">Nota (opcional)</span>
        <textarea className="input textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cómo te sentiste, molestias, algo para tu profe…" />
      </label>
      {props.session.mode === 'corta' && <Badge tone="accent">Versión corta</Badge>}
    </Sheet>
  );
}

/** Cardio: cronómetro con meta en un anillo que se va llenando, pausa y datos opcionales de la cinta o la bici. */
function CardioPanel(props: {
  item: SessionItem;
  work?: WorkTimer;
  elapsedMs: number;
  pad: PadTarget | null;
  onStart: () => void;
  onPause: (pause: boolean) => void;
  onFinish: () => void;
  onUndo: () => void;
  onField: (field: PadField) => void;
}) {
  const { item, work, pad } = props;
  const set = item.sets[0];
  if (!set) return null;
  const planned = set.planned ?? {};
  const target = planned.durationSec ?? 1800;
  const max = planned.durationMaxSec;
  const elapsedSec = work ? props.elapsedMs / 1000 : set.done ? (set.durationSec ?? 0) : 0;
  const frac = Math.min(1, elapsedSec / target);
  const r = 86;
  const c = 2 * Math.PI * r;
  const metaText = `Meta ${Math.round(target / 60)}${max ? `–${Math.round(max / 60)}` : ''} min`;
  const field = (f: PadField, unit: string) => {
    const v = f === 'durationMin' ? (set.durationSec !== undefined ? set.durationSec / 60 : undefined) : (set[f as 'distanceKm' | 'speedKmh' | 'inclinePct'] as number | undefined);
    const isActive = pad?.itemId === item.id && pad.field === f;
    return (
      <button key={f} className={`set-field${isActive ? ' is-active' : ''}${v === undefined ? ' is-empty' : ''}`} onClick={() => props.onField(f)} aria-label={`${LABEL[f]}: ${v ?? 'sin cargar'}`}>
        {v !== undefined ? num(f === 'durationMin' ? Math.round(v) : v) : '—'}
        <span className="set-unit">{unit}</span>
      </button>
    );
  };

  return (
    <div className="cardio">
      <div className={`cardio-ring${work?.pausedAt ? ' is-paused' : ''}`}>
        <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
          <circle cx="100" cy="100" r={r} className="cardio-track" />
          <circle
            cx="100"
            cy="100"
            r={r}
            className={`cardio-progress${frac >= 1 ? ' is-done' : ''}`}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="cardio-center" role="timer" aria-label={`${formatClock(elapsedSec * 1000)} de ${metaText}`}>
          <strong>{formatClock(elapsedSec * 1000)}</strong>
          <span>{set.done ? 'Hecho' : work?.pausedAt ? 'En pausa' : metaText}</span>
        </div>
      </div>

      {set.done ? (
        <div className="cardio-actions">
          <p className="done-line">
            <Icon name="check" size={18} /> Listo · {formatLoggedSet(set)}
          </p>
          <button className="btn btn-sm" onClick={props.onUndo}>
            Deshacer
          </button>
        </div>
      ) : !work ? (
        <div className="cardio-actions is-column">
          <button className="btn btn-primary btn-xl" onClick={props.onStart}>
            ▶ Empezar
          </button>
          <button className="link" onClick={props.onFinish}>
            Ya lo hice: anotar {Math.round(target / 60)} min sin cronómetro
          </button>
        </div>
      ) : (
        <div className="cardio-actions">
          <button className="btn btn-xl" onClick={() => props.onPause(!work.pausedAt)}>
            {work.pausedAt ? '▶ Seguir' : '❚❚ Pausar'}
          </button>
          <button className="btn btn-primary btn-xl" onClick={props.onFinish}>
            Terminar
          </button>
        </div>
      )}

      <div className="cardio-fields">
        {set.done && field('durationMin', 'min')}
        {field('distanceKm', 'km')}
        {field('speedKmh', 'km/h')}
        {field('inclinePct', '% incl.')}
      </div>
      <p className="hint">Distancia, velocidad e inclinación son opcionales: anotalas si la cinta o la bici las muestran.</p>
    </div>
  );
}
