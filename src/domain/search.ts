import type { Exercise } from '../db/types';

export interface ExerciseFilters {
  q: string;
  group: string;
  equipment: string;
  movement: string;
}

export const NO_FILTERS: ExerciseFilters = { q: '', group: '', equipment: '', movement: '' };

/** Minúsculas y sin tildes: «biceps» encuentra «Bíceps». */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function searchText(e: Exercise): string {
  return normalize(
    [e.name, ...(e.aliases ?? []), e.nameEn ?? '', e.group, ...e.primaryMuscles, ...e.secondaryMuscles, ...e.equipment, e.movement].join(' '),
  );
}

export function filterExercises(exercises: Exercise[], f: ExerciseFilters): Exercise[] {
  const terms = normalize(f.q).split(/\s+/).filter(Boolean);
  return exercises
    .filter((e) => {
      if (f.group && e.group !== f.group) return false;
      if (f.equipment && !(e.equipment as string[]).includes(f.equipment)) return false;
      if (f.movement && e.movement !== f.movement) return false;
      const text = searchText(e);
      return terms.every((t) => text.includes(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
