// Modelo de datos. Regla central: lo planificado (Routine), lo ejecutado (Session)
// y "la vez anterior" (se calcula desde Session) nunca se mezclan.

export type MuscleGroup =
  | 'Piernas'
  | 'Glúteos'
  | 'Pecho'
  | 'Espalda'
  | 'Hombros'
  | 'Brazos'
  | 'Core'
  | 'Cardio'
  | 'Movilidad';

export type Equipment =
  | 'Máquina'
  | 'Smith'
  | 'Barra'
  | 'Mancuernas'
  | 'Polea'
  | 'Banda elástica'
  | 'Banco'
  | 'Peso corporal'
  | 'Cinta'
  | 'Bicicleta fija';

export type MovementType =
  | 'Sentadilla'
  | 'Bisagra de cadera'
  | 'Empuje'
  | 'Tracción'
  | 'Aislamiento'
  | 'Core'
  | 'Isométrico'
  | 'Cardio'
  | 'Movilidad';

/** Video o foto propios, guardados solo en este dispositivo. */
export interface UserMedia {
  id: string;
  exerciseId: string;
  variant?: string;
  kind: 'video' | 'imagen';
  mime: string;
  blob: Blob;
  size: number;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  aliases?: string[];
  nameEn?: string;
  group: MuscleGroup;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: Equipment[];
  movement: MovementType;
  instructions: string[];
  /** De dónde sale la descripción (consigna del profe, descripción estándar…) */
  instructionsNote?: string;
  commonErrors: string[];
  variants?: string[];
  substitutions?: string[];
  /** Pregunta abierta sobre el ejercicio en sí */
  pending?: string;
  custom?: boolean;
}

/** Objetivo de una serie. Todo es opcional: una serie sin objetivo es válida. */
export interface PlannedSet {
  reps?: number;
  repsMin?: number;
  repsMax?: number;
  durationSec?: number;
  durationMaxSec?: number;
  distanceKm?: number;
  /** Serie opcional, p. ej. la tercera de «2–3 × 8–12» */
  optional?: boolean;
}

export interface RoutineItem {
  id: string;
  exerciseId: string;
  variant?: string;
  /** Notación original, copiada tal cual. Nunca se reinterpreta. */
  notation: string;
  sets: PlannedSet[];
  /** separado = todas las series de un lado y después del otro; alternado = ambos lados en la misma serie */
  perSide?: 'separado' | 'alternado';
  /** Pirámide con carga que sube en cada serie */
  loadPattern?: 'ascendente';
  /** Carga de referencia indicada (no es una obligación) */
  referenceLoadKg?: number;
  restSec: number;
  optional?: boolean;
  /** Si existe, el ejercicio entra en «Tengo poco tiempo» con estos ajustes */
  short?: { sets?: number; durationSec?: number };
  group?: { id: string; label: string };
  /** Pregunta pendiente de confirmar. Mientras exista, el ítem se muestra como pendiente. */
  pending?: string;
  note?: string;
}

export interface Routine {
  id: string;
  name: string;
  origin: 'profesor' | 'complementaria' | 'personal';
  kind: 'fuerza' | 'cardio';
  items: RoutineItem[];
  notes?: string;
  version: number;
  updatedAt: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo (como Date#getDay)

export interface DayPlan {
  weekday: Weekday;
  type: 'rutina' | 'actividad' | 'descanso';
  routineId?: string;
  label: string;
  when?: string;
  detail?: string;
  /** Se puede elegir una rutina opcional ese día (p. ej. viernes por la mañana) */
  optionalGym?: boolean;
}

export type Readiness = 'bien' | 'cansado' | 'muy-fatigado';

/** Estado del día: lo que elegiste hoy, sin tocar la planificación. */
export interface DayState {
  date: string; // AAAA-MM-DD
  routineId?: string;
  readiness?: Readiness;
  short?: boolean;
  /** Rechazaste la sugerencia de recuperar una rutina del profe */
  dismissedSuggestion?: boolean;
}

export interface LoggedSet {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceKm?: number;
  done: boolean;
  rpe?: number;
  /** Objetivo de esta serie al momento de entrenar (copia del plan). */
  planned?: PlannedSet;
  completedAt?: string;
}

export interface SessionItem {
  id: string;
  exerciseId: string;
  routineItemId?: string;
  variant?: string;
  /** Copia del plan del ejercicio al empezar: si después editás la rutina, el registro no cambia. */
  plan?: RoutineItem;
  optional?: boolean;
  substitutedFrom?: string;
  skipped?: boolean;
  sets: LoggedSet[];
  note?: string;
}

export interface Session {
  id: string;
  /** registro = hecho con la app; historico = cargado a partir de tus notas */
  source: 'registro' | 'historico';
  /** AAAA-MM-DD; null = fecha desconocida */
  date: string | null;
  name: string;
  routineId?: string;
  routineVersion?: number;
  mode?: 'completa' | 'corta' | 'liviana';
  readiness?: Readiness;
  status: 'en-curso' | 'completa' | 'incompleta';
  startedAt?: string;
  finishedAt?: string;
  sessionRpe?: number;
  note?: string;
  items: SessionItem[];
  /** Ejercicio que estabas mirando (para retomar donde dejaste). */
  currentIndex?: number;
  /** Fin del descanso en curso (hora absoluta: no se desfasa si la pantalla se apaga). */
  restEndsAt?: string;
}

export interface Prefs {
  vibrate: boolean;
  sound: boolean;
  rpe: boolean;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}
