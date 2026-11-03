import type { DayPlan, Exercise, Readiness, Routine } from '../db/types';
import { normalize, stem, STOPWORDS, tokens } from './text';

// ——— Ejercicios ———

/** Palabras que aparecen en muchas frases y no identifican un ejercicio por sí solas. */
const WEAK = new Set(['maquina', 'barra', 'mancuerna', 'polea', 'banco', 'sentado', 'pie', 'con', 'en']);

export interface ExerciseMatch {
  exercise: Exercise;
  score: number;
}

function phrasesOf(e: Exercise): string[] {
  return [e.name, ...(e.aliases ?? []), e.nameEn ?? ''].filter(Boolean).map(normalize);
}

/**
 * Busca ejercicios mencionados en la frase. Devuelve los mejores candidatos (empatados).
 * Usa nombre, otros nombres (incluidos los que vos le enseñes) y el nombre en inglés.
 */
export function matchExercises(norm: string, exercises: Exercise[], preferIds: string[] = []): ExerciseMatch[] {
  const qTokens = tokens(norm).map(stem);
  const qSet = new Set(qTokens);
  const scored: ExerciseMatch[] = [];
  for (const e of exercises) {
    let best = 0;
    for (const p of phrasesOf(e)) {
      const pt = tokens(p).filter((t) => !STOPWORDS.has(t)).map(stem);
      if (!pt.length) continue;
      const hit = pt.filter((t) => qSet.has(t) || (t.length >= 5 && qTokens.some((q) => q.length >= 5 && (q.startsWith(t.slice(0, 5)) || t.startsWith(q.slice(0, 5))))));
      const strongHits = hit.filter((t) => !WEAK.has(t)).length;
      if (!strongHits) continue;
      // Más palabras coincidentes gana; después, qué parte del nombre cubre; la frase completa suma.
      const full = p.length >= 4 && ` ${norm} `.includes(` ${p} `) ? 0.5 : 0;
      best = Math.max(best, strongHits + 0.5 * (hit.length / pt.length) + full);
    }
    if (best > 0) scored.push({ exercise: e, score: best });
  }
  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0].score;
  // Si hay duda, gana el ejercicio de la rutina de hoy (si es uno solo).
  const near = scored.filter((s) => top - s.score < 0.3 && preferIds.includes(s.exercise.id));
  if (near.length === 1) return near;
  return scored.filter((s) => top - s.score < 0.05).slice(0, 5);
}

// ——— Rutinas ———

export function matchRoutine(norm: string, routines: Routine[], weekPlan: DayPlan[]): Routine | undefined {
  const byLetter = norm.match(/\b(?:rutina|la)\s+(a|b)\b/);
  if (byLetter) return routines.find((r) => normalize(r.name) === `rutina ${byLetter[1]}`);
  const named = routines
    .map((r) => ({ r, n: normalize(r.name) }))
    .filter(({ n }) => n.length >= 4 && norm.includes(n))
    .sort((a, b) => b.n.length - a.n.length)[0];
  if (named) return named.r;
  // «la del sábado», «lo del martes»
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const m = norm.match(/\b(?:la|lo|el)\s+(?:de|del)\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (m) {
    const plan = weekPlan.find((d) => d.weekday === days.indexOf(m[1]));
    return routines.find((r) => r.id === plan?.routineId);
  }
  if (/\bcardio\b/.test(norm)) return routines.find((r) => r.kind === 'cardio');
  return undefined;
}

// ——— Actividades ———

const ACTIVITY_WORDS: [RegExp, string, string][] = [
  [/\b(padel|paddle|partido)\b/, 'padel', 'Pádel'],
  [/\b(bici|bicicleta|pedale\w*|ciclismo)\b/, 'bicicleta-exterior', 'Bici'],
  [/\b(camine|caminata|caminar|camin\w*)\b/, 'caminata', 'Caminata'],
  [/\b(trote|trotar|trote\w*|corri|correr|running|sali a correr)\b/, 'trote', 'Trote'],
];

export function matchActivity(norm: string): { exerciseId: string; label: string } | undefined {
  // «bicicleta fija» y «cinta» son ejercicios del gimnasio, no actividades de afuera.
  if (/\b(bici|bicicleta) fija\b|\bcinta\b/.test(norm)) return undefined;
  const hit = ACTIVITY_WORDS.find(([re]) => re.test(norm));
  return hit ? { exerciseId: hit[1], label: hit[2] } : undefined;
}

// ——— Cómo llegás ———

export function matchReadiness(norm: string): Readiness | undefined {
  if (/\b(muy (cansado|fatigado|cansada|fatigada)|reventad[oa]|destruid[oa]|muert[oa]|agotad[oa]|fundid[oa]|hecho pelota|sin energia|no doy mas)\b/.test(norm)) return 'muy-fatigado';
  if (/\b(cansad[oa]|fatigad[oa]|dormi (mal|poco)|medio (cansado|flojo|bajon)|flojo|bajoneado|algo cansado)\b/.test(norm)) return 'cansado';
  if (/\b(bien|joya|barbaro|perfecto|10 puntos|diez puntos|con energia|con pila|re bien|muy bien)\b/.test(norm)) return 'bien';
  return undefined;
}
