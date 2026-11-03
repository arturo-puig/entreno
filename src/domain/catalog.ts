import type { DayPlan, Equipment, MovementType, MuscleGroup } from '../db/types';

export const MUSCLE_GROUPS: MuscleGroup[] = ['Piernas', 'Glúteos', 'Pecho', 'Espalda', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Movilidad'];

export const EQUIPMENT: Equipment[] = [
  'Máquina', 'Smith', 'Barra', 'Mancuernas', 'Polea', 'Banda elástica', 'Banco', 'Peso corporal', 'Cinta', 'Bicicleta fija',
];

export const MOVEMENTS: MovementType[] = [
  'Sentadilla', 'Bisagra de cadera', 'Empuje', 'Tracción', 'Aislamiento', 'Core', 'Isométrico', 'Cardio', 'Movilidad',
];

/** «Movilidad de cadera» → «movilidad-de-cadera» */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Texto separado por comas o renglones → lista sin vacíos. */
export function splitList(text: string, by: 'coma' | 'renglon'): string[] {
  return text
    .split(by === 'coma' ? /[,\n]/ : /\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Reemplaza el plan de un día de la semana sin tocar los demás. */
export function replaceDay(weekPlan: DayPlan[], day: DayPlan): DayPlan[] {
  return [...weekPlan.filter((d) => d.weekday !== day.weekday), day].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
}
