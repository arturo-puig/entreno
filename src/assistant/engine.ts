import type { BodyMetric, DayPlan, DayState, Exercise, Routine, Session } from '../db/types';
import { illustrationsFor } from '../data/media';
import { capitalize, parseISODate, toISODate, weekdayName, weekdayNameOf } from '../domain/dates';
import { estimateRoutineMinutes } from '../domain/estimate';
import { formatLoggedSet } from '../domain/format';
import { WEEKDAYS_FROM_MONDAY } from '../domain/order';
import { hasShortVersion, itemsForMode, pendingQuestions, type Mode } from '../domain/plan';
import { readinessAdvice } from '../domain/readiness';
import { effectiveRoutineId, planFor } from '../domain/schedule';
import { previousRecord } from '../domain/session';
import { compliance, isActivity, labelOf, metricFor, weekStats } from '../domain/stats';
import { classify, INTENT_LABEL, type IntentId } from './intents';
import { matchActivity, matchExercises, matchReadiness, matchRoutine } from './match';
import { dateMention, normalize, numbers, STOPWORDS, tokens } from './text';

// El asistente no calcula nada propio: elige qué función de la app usar y arma la respuesta.
// Lo que cambia datos se devuelve como acción con confirmación; la pantalla la ejecuta si tocás «Sí».

export interface AssistantContext {
  now: Date;
  exercises: Exercise[];
  routines: Routine[];
  weekPlan: DayPlan[];
  sessions: Session[];
  day?: DayState;
  metrics: BodyMetric[];
  /** Ejercicios con video o foto propios. */
  ownMedia: Set<string>;
  /** Último ejercicio del que hablamos (para «¿y la última vez?»). */
  lastExerciseId?: string;
}

export type AssistantAction =
  | { type: 'say'; text: string }
  | { type: 'force'; intent: IntentId; text: string; exerciseId?: string; teach?: string }
  | { type: 'navigate'; path: string }
  | { type: 'start-session'; routineId: string; mode: Mode }
  | { type: 'set-day'; patch: Partial<Omit<DayState, 'date'>>; done: string }
  | { type: 'log-activity'; params: { exerciseId: string; name: string; date: string; minutes?: number; km?: number }; done: string }
  | { type: 'log-metric'; params: { date: string; weightKg?: number; waistCm?: number }; done: string }
  | { type: 'add-alias'; exerciseId: string; alias: string; done: string };

export interface Choice {
  label: string;
  action: AssistantAction;
}

export interface Reply {
  intent: IntentId;
  decidedBy: 'reglas';
  entities: Record<string, unknown>;
  /** Primero la respuesta; después el detalle. */
  text: string;
  lines?: string[];
  /** Registro o cambio: se ejecuta solo si tocás «Sí». */
  confirm?: { yes: string; no?: string; action: AssistantAction };
  buttons?: Choice[];
  /** «Continuar con:» */
  chips?: Choice[];
  exerciseId?: string;
}

const NEEDS_EXERCISE: IntentId[] = ['como-se-hace', 'ultima-vez', 'mejor-marca'];

/** Palabras de las reglas: lo que sobra de la frase puede ser un nombre nuevo de ejercicio. */
const INTENT_WORDS = new Set(
  'como se hace hacen hago hacer es ejecuta tecnica explica explicame mostrame ensename video ilustracion imagen ultima vez pasada anterior cuanto levante hice puse use cargue meti peso con mejor marca record maximo maxima mas pesado historial registro musculos trabaja'.split(
    ' ',
  ),
);

const say = (label: string, text = label): Choice => ({ label, action: { type: 'say', text } });
const go = (label: string, path: string): Choice => ({ label, action: { type: 'navigate', path } });
const fmtDate = (iso: string) => {
  const d = parseISODate(iso);
  return `${weekdayName(d).slice(0, 3)} ${d.getDate()}/${d.getMonth() + 1}`;
};
const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export function respond(
  text: string,
  ctx: AssistantContext,
  forced?: { intent: IntentId; exerciseId?: string; teach?: string },
): Reply {
  const norm = normalize(text);
  const today = ctx.now;
  const iso = toISODate(today);
  const plan = planFor(ctx.weekPlan, today);
  const todayRoutine = ctx.routines.find((r) => r.id === effectiveRoutineId(plan, ctx.day));
  const preferIds = todayRoutine?.items.map((i) => i.exerciseId) ?? [];

  const exMatches = forced?.exerciseId
    ? ctx.exercises.filter((e) => e.id === forced.exerciseId).map((exercise) => ({ exercise, score: 9 }))
    : matchExercises(norm, ctx.exercises, preferIds);
  const nums = numbers(norm);
  const date = dateMention(norm, today);
  const activity = matchActivity(norm);
  const readiness = matchReadiness(norm);
  const routine = matchRoutine(norm, ctx.routines, ctx.weekPlan);
  const cls = forced ? { intent: forced.intent, score: 9 } : classify(norm);
  let intent: IntentId = cls.intent;

  // Ajustes de la interpretación según lo que se encontró en la frase.
  if (!forced) {
    if (intent === 'no-entendi' && activity && nums.length) intent = 'registrar-actividad';
    else if (intent === 'no-entendi' && readiness) intent = 'estado';
    else if (intent === 'registrar-actividad' && !activity && /\b(peso|cintura)\b/.test(norm)) intent = 'registrar-peso';
    else if (intent === 'que-toca' && /\bsemana\b/.test(norm)) intent = 'semana';
    else if (intent === 'semana' && /\bcuant/.test(norm)) intent = 'constancia';
    else if (intent === 'empezar' && routine && !/\b(sesion|entrenamiento)\b/.test(norm) && /\b(hacer|cambia)/.test(norm)) intent = 'cambiar-rutina';
  }

  const entities: Record<string, unknown> = {
    exercises: exMatches.map((m) => m.exercise.id),
    numbers: nums,
    date: date ? toISODate(date.date) : undefined,
    activity: activity?.exerciseId,
    readiness,
    routine: routine?.id,
  };
  const base = { intent, decidedBy: 'reglas' as const, entities };

  // Empate entre dos intenciones: preguntar en vez de adivinar.
  if (!forced && 'runnerUp' in cls && cls.runnerUp) {
    const a = cls.intent;
    const b = cls.runnerUp;
    return {
      ...base,
      text: `¿Qué querés: «${INTENT_LABEL[a]}» o «${INTENT_LABEL[b]}»?`,
      chips: [a, b].map((i) => ({ label: INTENT_LABEL[i], action: { type: 'force', intent: i, text } })),
    };
  }

  // ——— Ejercicio: identificarlo o preguntar ———
  let exercise: Exercise | undefined;
  if (NEEDS_EXERCISE.includes(intent) || (intent === 'no-entendi' && exMatches.length)) {
    if (exMatches.length === 1) exercise = exMatches[0].exercise;
    else if (exMatches.length === 0 && ctx.lastExerciseId && NEEDS_EXERCISE.includes(intent)) {
      exercise = ctx.exercises.find((e) => e.id === ctx.lastExerciseId);
    }
    if (!exercise) {
      if (intent === 'no-entendi') intent = 'como-se-hace';
      const teach = exMatches.length ? undefined : leftover(norm);
      const options = exMatches.length
        ? exMatches.map((m) => m.exercise)
        : (todayRoutine?.items.map((i) => ctx.exercises.find((e) => e.id === i.exerciseId)).filter((e): e is Exercise => !!e) ?? []).slice(0, 6);
      return {
        ...base,
        intent,
        text: exMatches.length > 1 ? '¿Cuál de estos?' : '¿De qué ejercicio?',
        lines: !exMatches.length && teach ? [`No reconozco «${teach}». Elegí el ejercicio y, si querés, lo recuerdo con ese nombre.`] : undefined,
        chips: [
          ...options.map((e) => ({ label: e.name, action: { type: 'force' as const, intent, text, exerciseId: e.id, teach } })),
          go('Buscar en la biblioteca', '/ejercicios'),
        ],
      };
    }
    if (cls.intent === 'no-entendi' && !forced) {
      // Solo dijo el nombre: ofrecer opciones.
      return {
        ...base,
        intent: 'como-se-hace',
        exerciseId: exercise.id,
        text: `¿Qué querés saber de ${exercise.name}?`,
        chips: [
          { label: 'Cómo se hace', action: { type: 'force', intent: 'como-se-hace', text, exerciseId: exercise.id } },
          { label: 'La última vez', action: { type: 'force', intent: 'ultima-vez', text, exerciseId: exercise.id } },
          { label: 'Mejor marca', action: { type: 'force', intent: 'mejor-marca', text, exerciseId: exercise.id } },
        ],
      };
    }
  }

  const teachChip = (e: Exercise): Choice[] =>
    forced?.teach && !(e.aliases ?? []).some((a) => normalize(a) === forced.teach)
      ? [{ label: `Recordar «${forced.teach}» = ${e.name}`, action: { type: 'add-alias', exerciseId: e.id, alias: forced.teach, done: `Listo: «${forced.teach}» ahora también es ${e.name}.` } }]
      : [];

  switch (intent) {
    case 'que-toca': {
      const when = date?.date ?? today;
      const isToday = toISODate(when) === iso;
      const p = planFor(ctx.weekPlan, when);
      const r = ctx.routines.find((x) => x.id === (isToday ? effectiveRoutineId(p, ctx.day) : p.routineId));
      const label = isToday ? 'Hoy' : capitalize(date!.word);
      if (!r) {
        return {
          ...base,
          text: `${label}: ${p.label.toLowerCase() === 'descanso' ? 'descanso' : p.label}.`,
          lines: p.detail ? [p.detail] : undefined,
          chips: isToday ? [say('Anotar una actividad', 'Anotá una caminata'), say('¿Qué tengo esta semana?')] : [say('¿Qué toca hoy?')],
        };
      }
      const mode: Mode = isToday && ctx.day?.short && hasShortVersion(r) ? 'corta' : 'completa';
      const items = itemsForMode(r, mode);
      const names = items.map((i) => ctx.exercises.find((e) => e.id === i.exerciseId)?.name ?? '').filter(Boolean);
      const open = isToday && ctx.sessions.find((s) => s.date === iso && s.routineId === r.id && s.status === 'en-curso');
      return {
        ...base,
        text: `${label} toca ${r.name}${mode === 'corta' ? ' (versión corta)' : ''}: ${items.length} ejercicios, ≈ ${estimateRoutineMinutes(r, mode)} min.`,
        lines: [names.join(' · ')],
        buttons: isToday
          ? open
            ? [go('Continuar la sesión', `/sesion/${open.id}`)]
            : [{ label: 'Empezar', action: { type: 'start-session', routineId: r.id, mode } }]
          : undefined,
        chips: isToday ? [say('Tengo poco tiempo'), go('Ver rutina', `/rutinas/${r.id}`)] : [go('Ver rutina', `/rutinas/${r.id}`)],
      };
    }

    case 'semana': {
      const lines = WEEKDAYS_FROM_MONDAY.map((wd) => {
        const p = ctx.weekPlan.find((d) => d.weekday === wd);
        const r = ctx.routines.find((x) => x.id === p?.routineId);
        return `${capitalize(weekdayNameOf(wd)).slice(0, 3)}: ${r?.name ?? p?.label ?? 'Descanso'}`;
      });
      return { ...base, text: 'Tu semana:', lines, chips: [say('¿Qué toca hoy?'), go('Cambiar días', '/rutinas')] };
    }

    case 'como-se-hace': {
      const e = exercise!;
      const own = ctx.ownMedia.has(e.id);
      const ills = illustrationsFor(e.id).length;
      const photos = illustrationsFor(e.id).some((i) => i.kind === 'fotos');
      const onlyAi = ills > 0 && illustrationsFor(e.id).every((i) => i.source === 'ia');
      const media = own
        ? 'Tenés un video o foto tuyo.'
        : photos
          ? 'Tiene fotos del movimiento.'
          : onlyAi
            ? 'Tiene una imagen generada con IA (orientativa).'
            : ills
              ? 'Tiene ilustración.'
              : 'Todavía no tiene video ni ilustración: podés grabar uno.';
      return {
        ...base,
        exerciseId: e.id,
        text: `${e.name}: ${e.primaryMuscles.join(', ').toLowerCase()}.`,
        lines: /\berror/.test(norm)
          ? e.commonErrors.length
            ? ['Errores frecuentes:', ...e.commonErrors.map((x) => `• ${x}`)]
            : ['No tengo errores frecuentes cargados para este ejercicio.']
          : [...e.instructions.slice(0, 4).map((s, i) => `${i + 1}. ${s}`), media, ...(e.pending ? [`Pendiente: ${e.pending}`] : [])],
        buttons: [go(own || ills ? 'Ver imagen y ficha' : 'Ver ficha', `/ejercicios/${e.id}`)],
        chips: [
          ...teachChip(e),
          say(`La última vez en ${e.name}`),
          ...(e.commonErrors.length && !/\berror/.test(norm) ? [say('Errores frecuentes', `Errores frecuentes en ${e.name}`)] : []),
        ],
      };
    }

    case 'ultima-vez': {
      const e = exercise!;
      const prev = previousRecord(ctx.sessions, e.id);
      if (!prev) {
        return {
          ...base,
          exerciseId: e.id,
          text: `Todavía no registraste ${e.name}.`,
          chips: [...teachChip(e), say(`Cómo se hace ${e.name}`)],
        };
      }
      const when = prev.isHistoric ? 'en tu registro histórico (sin fecha)' : `el ${fmtDate(prev.session.date!)}`;
      return {
        ...base,
        exerciseId: e.id,
        text: `La última vez, ${when}:`,
        lines: [prev.sets.map(formatLoggedSet).join(' · ')],
        chips: [...teachChip(e), say(`Mejor marca en ${e.name}`), go('Ver evolución', `/ejercicios/${e.id}`)],
      };
    }

    case 'mejor-marca': {
      const e = exercise!;
      const all = ctx.sessions.flatMap((s) =>
        s.items.filter((i) => i.exerciseId === e.id && !i.skipped).flatMap((i) => i.sets.filter((x) => x.done).map((set) => ({ set, s }))),
      );
      if (!all.length) return { ...base, exerciseId: e.id, text: `Todavía no hay registros de ${e.name}.`, chips: teachChip(e) };
      const metric = metricFor(e, all.map((a) => a.set));
      const key = (x: (typeof all)[number]['set']) =>
        metric === 'kg' ? (x.weightKg ?? 0) * 1000 + (x.reps ?? 0) : metric === 'reps' ? (x.reps ?? 0) : metric === 'km' ? (x.distanceKm ?? 0) : (x.durationSec ?? 0);
      const best = [...all].sort((a, b) => key(b.set) - key(a.set))[0];
      const when = best.s.date ? `el ${fmtDate(best.s.date)}` : 'en tu registro histórico';
      return {
        ...base,
        exerciseId: e.id,
        text: `Tu mejor serie en ${e.name}: ${labelOf(best.set, metric)} (${when}).`,
        lines: metric === 'kg' ? ['Se toma la serie con más peso; si hay empate, la de más repeticiones.'] : undefined,
        chips: [...teachChip(e), say(`La última vez en ${e.name}`), go('Ver evolución', `/ejercicios/${e.id}`)],
      };
    }

    case 'poco-tiempo': {
      const minutes = nums.find((n) => n.unit === 'min' || n.unit === undefined)?.value;
      if (!todayRoutine) return { ...base, text: 'Hoy no tenés una rutina planificada.', chips: [say('¿Qué toca hoy?')] };
      const full = estimateRoutineMinutes(todayRoutine, 'completa');
      if (minutes !== undefined && minutes >= full) {
        return { ...base, text: `Con ${minutes} min te alcanza para ${todayRoutine.name} completa (≈ ${full} min).`, buttons: [{ label: 'Empezar', action: { type: 'start-session', routineId: todayRoutine.id, mode: 'completa' } }] };
      }
      if (!hasShortVersion(todayRoutine)) {
        return { ...base, text: `${todayRoutine.name} no tiene versión corta.`, lines: ['Podés hacer los primeros ejercicios y marcar la sesión como incompleta: igual suma.'] };
      }
      const short = estimateRoutineMinutes(todayRoutine, 'corta');
      if (minutes !== undefined && minutes < 15) {
        return { ...base, text: `Con ${minutes} min, mejor algo liviano: movilidad o una caminata.`, lines: ['Sostener el hábito suma más que forzar una sesión apurada.'], chips: [say('Anotá una caminata')] };
      }
      const names = itemsForMode(todayRoutine, 'corta').map((i) => ctx.exercises.find((e) => e.id === i.exerciseId)?.name ?? '');
      return {
        ...base,
        text: `Te sirve la versión corta de ${todayRoutine.name}: ≈ ${short} min.`,
        lines: [names.join(' · '), 'No cambia la rutina original.'],
        confirm: { yes: 'Usar versión corta', no: 'No', action: { type: 'set-day', patch: { short: true }, done: 'Listo: hoy usás la versión corta.' } },
      };
    }

    case 'estado': {
      if (!readiness) return { ...base, text: '¿Cómo llegás hoy?', chips: [say('Me siento bien'), say('Estoy algo cansado'), say('Estoy muy fatigado')] };
      const advice = readinessAdvice(readiness);
      const label = readiness === 'bien' ? 'te sentís bien' : readiness === 'cansado' ? 'estás algo cansado' : 'estás muy fatigado';
      return {
        ...base,
        text: advice.text,
        confirm: { yes: 'Anotar cómo llego', no: 'No', action: { type: 'set-day', patch: { readiness }, done: `Anotado: hoy ${label}.` } },
        chips: [
          ...(advice.offerShort && todayRoutine && hasShortVersion(todayRoutine) ? [say('Tengo poco tiempo', 'Quiero la versión corta')] : []),
          ...(advice.offerLight ? [say('Sesión liviana', 'Hoy quiero hacer cardio')] : []),
        ],
      };
    }

    case 'cambiar-rutina': {
      if (!routine) {
        return {
          ...base,
          text: '¿Qué rutina querés hacer hoy?',
          chips: ctx.routines.map((r) => ({ label: r.name, action: { type: 'say' as const, text: `Hoy quiero hacer ${r.name}` } })),
        };
      }
      if (routine.id === todayRoutine?.id) return { ...base, text: `Hoy ya tenés ${routine.name}.`, chips: [say('¿Qué toca hoy?')] };
      const patch = routine.id === plan.routineId ? { routineId: undefined, short: false } : { routineId: routine.id, short: false };
      return {
        ...base,
        text: `¿Cambio lo de hoy por ${routine.name}? Tu semana planificada no cambia.`,
        confirm: { yes: 'Sí, cambiar', no: 'No', action: { type: 'set-day', patch, done: `Listo: hoy hacés ${routine.name}.` } },
      };
    }

    case 'empezar': {
      const r = routine ?? todayRoutine;
      const open = ctx.sessions.find((s) => s.date === iso && s.status === 'en-curso');
      if (open) return { ...base, text: `Ya tenés una sesión en curso: ${open.name}.`, buttons: [go('Continuar', `/sesion/${open.id}`)] };
      if (!r) return { ...base, text: 'Hoy no tenés una rutina planificada. ¿Querés elegir una?', chips: [say('Hoy quiero hacer otra rutina', 'Quiero hacer otra rutina')] };
      const mode: Mode = r.id === todayRoutine?.id && ctx.day?.short && hasShortVersion(r) ? 'corta' : 'completa';
      return {
        ...base,
        text: `Arrancamos con ${r.name}${mode === 'corta' ? ' (versión corta)' : ''}.`,
        buttons: [{ label: 'Abrir la sesión', action: { type: 'start-session', routineId: r.id, mode } }],
      };
    }

    case 'registrar-actividad': {
      if (!activity && exMatches.length) {
        // Series del gimnasio: se registran a toques en la sesión (más rápido y sin errores de interpretación).
        const open = ctx.sessions.find((s) => s.date === iso && s.status === 'en-curso');
        return {
          ...base,
          text: 'Las series se anotan a toques en la sesión: es más rápido y no hay errores de interpretación.',
          buttons: open
            ? [go('Ir a la sesión', `/sesion/${open.id}`)]
            : todayRoutine
              ? [{ label: `Empezar ${todayRoutine.name}`, action: { type: 'start-session', routineId: todayRoutine.id, mode: 'completa' } }]
              : undefined,
        };
      }
      if (!activity) {
        return {
          ...base,
          text: '¿Qué actividad anoto?',
          chips: ['Pádel', 'Bici', 'Caminata', 'Trote'].map((a) => say(a, `${text} ${a}`)),
        };
      }
      const minutes = nums.find((n) => n.unit === 'min')?.value ?? nums.find((n) => n.unit === undefined && n.value >= 5 && n.value <= 300)?.value;
      const km = nums.find((n) => n.unit === 'km')?.value;
      const when = date?.date ?? today;
      const whenText = toISODate(when) === iso ? 'hoy' : date!.word;
      const detail = [minutes !== undefined ? `${num(minutes)} min` : undefined, km !== undefined ? `${num(km)} km` : undefined].filter(Boolean).join(' · ');
      return {
        ...base,
        text: `Anoto: ${activity.label}${detail ? ` · ${detail}` : ''} · ${whenText}. ¿Está bien?`,
        confirm: {
          yes: 'Sí, anotar',
          no: 'No',
          action: {
            type: 'log-activity',
            params: { exerciseId: activity.exerciseId, name: activity.label, date: toISODate(when), minutes, km },
            done: `Anotado: ${activity.label}${detail ? ` · ${detail}` : ''}.`,
          },
        },
        lines: minutes === undefined ? ['Si querés sumar los minutos, decímelos: «pádel 90 minutos».'] : undefined,
      };
    }

    case 'registrar-peso': {
      const isWaist = /\bcintura\b/.test(norm);
      const value = nums.find((n) => n.unit === (isWaist ? 'cm' : 'kg') || n.unit === undefined)?.value;
      if (value === undefined) return { ...base, text: isWaist ? '¿Cuánto mide tu cintura? Por ejemplo: «cintura 94».' : '¿Cuánto pesás? Por ejemplo: «peso 82,5».' };
      const ok = isWaist ? value >= 40 && value <= 250 : value >= 30 && value <= 300;
      if (!ok) return { ...base, text: `${num(value)} parece un error. Probá de nuevo, por ejemplo: «${isWaist ? 'cintura 94' : 'peso 82,5'}».` };
      const when = date?.date ?? today;
      const params = { date: toISODate(when), ...(isWaist ? { waistCm: value } : { weightKg: value }) };
      const label = isWaist ? `cintura ${num(value)} cm` : `peso ${num(value)} kg`;
      return {
        ...base,
        text: `Anoto ${label} (${toISODate(when) === iso ? 'hoy' : date!.word}). ¿Está bien?`,
        confirm: { yes: 'Sí, anotar', no: 'No', action: { type: 'log-metric', params, done: `Anotado: ${label}.` } },
      };
    }

    case 'constancia': {
      if (!ctx.sessions.some((s) => s.source === 'registro' && s.status !== 'en-curso')) {
        return { ...base, text: 'Todavía no registraste sesiones: cuando hagas la primera, te cuento cómo venís.', chips: [say('¿Qué toca hoy?')] };
      }
      const stats = weekStats(ctx.sessions, ctx.weekPlan, today, 4);
      const cur = stats[stats.length - 1];
      const comp = compliance(stats);
      const month = ctx.sessions.filter((s) => s.source === 'registro' && s.date && s.date.slice(0, 7) === iso.slice(0, 7) && s.status !== 'en-curso');
      return {
        ...base,
        text: `Esta semana: ${cur.gym} de ${cur.planned} sesiones de gimnasio${cur.activities ? ` y ${cur.activities} ${cur.activities === 1 ? 'actividad' : 'actividades'}` : ''}.`,
        lines: [
          `Últimas 4 semanas: ${comp.done} de ${comp.planned} sesiones planificadas (${comp.pct} %).`,
          `Este mes: ${month.filter((s) => !isActivity(s)).length} sesiones de gimnasio y ${month.filter(isActivity).length} actividades.`,
          'Lo que no hiciste no se acumula: cada semana empieza de cero.',
        ],
        chips: [go('Ver progreso', '/progreso')],
      };
    }

    case 'pendientes': {
      const list = [
        ...ctx.routines.flatMap((r) => pendingQuestions(r).map(({ item, question }) => `${ctx.exercises.find((e) => e.id === item.exerciseId)?.name ?? ''} (${r.name}): ${question}`)),
        ...ctx.exercises.filter((e) => e.pending).map((e) => `${e.name}: ${e.pending}`),
      ];
      if (!list.length) return { ...base, text: 'No tenés nada pendiente de confirmar con tu profe.' };
      return { ...base, text: `Tenés ${list.length} cosas para confirmar con tu profe:`, lines: list, chips: [go('Ver en Rutinas', '/rutinas')] };
    }

    case 'ayuda':
      return {
        ...base,
        text: 'Te puedo ayudar con tu rutina, tus registros y cómo se hace cada ejercicio. Algunos ejemplos:',
        chips: [
          say('¿Qué toca hoy?'),
          say('Tengo 20 minutos'),
          say('¿Cómo se hace el Pallof?'),
          say('¿Qué hice la última vez en jalón?'),
          say('Anotá pádel 90 minutos'),
          say('Peso 82,5'),
          say('¿Cuántas veces entrené esta semana?'),
          say('¿Qué le tengo que preguntar al profe?'),
        ],
      };

    case 'salud': {
      const e = exMatches.length === 1 ? exMatches[0].exercise : undefined;
      return {
        ...base,
        text: 'No puedo evaluar dolores ni lesiones.',
        lines: [
          'Si algo duele, pará ese ejercicio. Si el dolor sigue o es fuerte, consultá a un profesional (médico o kinesiólogo).',
          ...(e?.substitutions?.length ? ['Si querés, hoy podés sustituirlo desde la sesión (botón «Sustituir»).'] : []),
        ],
        chips: e ? [go(`Ver ${e.name} y sus sustituciones`, `/ejercicios/${e.id}`)] : undefined,
      };
    }

    case 'calorias':
      return {
        ...base,
        text: 'La app no calcula calorías ni grasa corporal.',
        lines: ['Con los datos que tiene no se pueden estimar bien, y prefiero no inventarte números. Lo que sí podés seguir: tu peso con promedio semanal y la cintura.'],
        chips: [go('Ver peso', '/progreso')],
      };

    case 'comidas':
      return { ...base, text: 'El registro de comidas todavía no está: es una versión futura de la app.', chips: [say('¿Qué podés hacer?')] };

    default:
      return {
        ...base,
        intent: 'no-entendi',
        text: 'No te entendí. Probá con algo así:',
        chips: [say('¿Qué toca hoy?'), say('Tengo poco tiempo'), say('¿Cómo se hace el dead bug?'), say('Anotá pádel 90 minutos'), say('¿Qué podés hacer?')],
      };
  }
}

/** Lo que queda de la frase sin palabras de las reglas: puede ser un nombre de ejercicio que todavía no conozco. */
function leftover(norm: string): string | undefined {
  const rest = tokens(norm).filter((t) => !STOPWORDS.has(t) && !INTENT_WORDS.has(t) && !/^\d/.test(t));
  const phrase = rest.join(' ').trim();
  return phrase.length >= 3 ? phrase : undefined;
}

/** Texto plano de la respuesta (para el registro). */
export function replySummary(r: Reply): string {
  return [r.text, ...(r.lines ?? [])].join(' ');
}
