import { normalize } from './search';
import type { BodyPart } from '../data/bodymap';

/** Nivel con que se resalta una zona: principal (color pleno) o secundario (atenuado). */
export type MuscleLevel = 'principal' | 'secundario';

/**
 * Nombres de músculos que usan los ejercicios → zonas del mapa (slugs de MuscleMap).
 * Lo que no figura acá (p. ej. «Sistema cardiovascular», «Cadera») no se dibuja: solo queda en el texto.
 */
const SLUGS: Record<string, string[]> = {
  cuadriceps: ['quadriceps'],
  gluteos: ['gluteal'],
  gluteo: ['gluteal'],
  'gluteo mayor': ['gluteal'],
  'gluteo medio': ['gluteal'],
  gemelos: ['calves'],
  gastrocnemio: ['calves'],
  soleo: ['calves'],
  pantorrillas: ['calves'],
  triceps: ['triceps'],
  biceps: ['biceps'],
  braquial: ['biceps'],
  braquiorradial: ['forearm'],
  antebrazo: ['forearm'],
  antebrazos: ['forearm'],
  'deltoides anterior': ['frontDeltoid'],
  'deltoides posterior': ['rearDeltoid'],
  'deltoides lateral': ['deltoids'],
  deltoides: ['deltoids'],
  hombros: ['deltoids'],
  'recto abdominal': ['abs'],
  'transverso abdominal': ['abs'],
  abdominales: ['abs'],
  core: ['abs', 'obliques'],
  oblicuos: ['obliques'],
  isquiotibiales: ['hamstring'],
  romboides: ['rhomboids'],
  'pectoral mayor': ['chest'],
  pectoral: ['chest'],
  pecho: ['chest'],
  'pectoral mayor (porcion superior)': ['upperChest'],
  aductores: ['adductors'],
  trapecio: ['trapezius'],
  'trapecio superior': ['upperTrapezius'],
  'trapecio medio': ['trapezius'],
  'trapecio medio e inferior': ['trapezius', 'lowerTrapezius'],
  'trapecio inferior': ['lowerTrapezius'],
  'flexores de cadera': ['hipFlexors'],
  'dorsal ancho': ['upperBack'],
  dorsales: ['upperBack'],
  supraespinoso: ['rotatorCuff'],
  'manguito rotador': ['rotatorCuff'],
  'erectores espinales': ['lowerBack'],
  lumbares: ['lowerBack'],
  'tobillo (flexion dorsal)': ['ankles'],
  tibial: ['tibialis'],
};

/** Zonas que en MuscleMap son subdivisiones de otra: se dibujan encima solo si están resaltadas. */
const SUBGROUP = new Set([
  'upperChest',
  'lowerChest',
  'innerQuad',
  'outerQuad',
  'hipFlexors',
  'upperAbs',
  'lowerAbs',
  'frontDeltoid',
  'rearDeltoid',
  'upperTrapezius',
  'lowerTrapezius',
  'serratus',
  'rhomboids',
]);

/** Zonas que no son músculos (se pintan con colores neutros). */
export const COSMETIC = new Set(['head', 'hair']);

/** Zona del mapa para un nombre de músculo (o ninguna). Acepta «X (detalle)» si «X» se conoce. */
export function slugsFor(muscle: string): string[] {
  const key = normalize(muscle).trim();
  return SLUGS[key] ?? SLUGS[key.replace(/\s*\(.*\)\s*$/, '')] ?? [];
}

/** Nivel de cada zona: lo principal gana sobre lo secundario. */
export function muscleLevels(primary: string[], secondary: string[]): Map<string, MuscleLevel> {
  const levels = new Map<string, MuscleLevel>();
  for (const m of secondary) for (const s of slugsFor(m)) levels.set(s, 'secundario');
  for (const m of primary) for (const s of slugsFor(m)) levels.set(s, 'principal');
  return levels;
}

/** Músculos que no se pueden mostrar en el mapa (quedan solo en el texto). */
export function unmappedMuscles(muscles: string[]): string[] {
  return muscles.filter((m) => m.trim() && slugsFor(m).length === 0);
}

export interface DrawnPart {
  slug: string;
  d: string;
  level?: MuscleLevel;
}

/**
 * Qué trazados dibujar y con qué nivel, en orden: primero el cuerpo, encima las subdivisiones resaltadas.
 * El manguito rotador está recortado de la espalda alta y toma su color si no tiene uno propio.
 */
export function drawParts(parts: BodyPart[], levels: Map<string, MuscleLevel>): DrawnPart[] {
  const base: DrawnPart[] = [];
  const over: DrawnPart[] = [];
  for (const p of parts) {
    const level = levels.get(p.slug) ?? (p.slug === 'rotatorCuff' ? levels.get('upperBack') : undefined);
    if (SUBGROUP.has(p.slug)) {
      if (level) over.push({ ...p, level });
    } else base.push({ ...p, level });
  }
  return [...base, ...over];
}

/** ¿Se resalta algo en esta vista? */
export const hasHighlight = (drawn: DrawnPart[]) => drawn.some((p) => p.level);
