import { describe, expect, it } from 'vitest';
import { BODY_BACK, BODY_FRONT } from '../data/bodymap';
import { EXERCISES } from '../data/exercises';
import { drawParts, hasHighlight, muscleLevels, slugsFor, unmappedMuscles } from './musclemap';

const ALL_SLUGS = new Set([...BODY_FRONT, ...BODY_BACK].map((p) => p.slug));

describe('mapa de músculos', () => {
  it('traduce nombres con o sin tildes y con detalle entre paréntesis', () => {
    expect(slugsFor('Cuádriceps')).toEqual(['quadriceps']);
    expect(slugsFor('gluteo mayor')).toEqual(['gluteal']);
    expect(slugsFor('Pectoral mayor (porción superior)')).toEqual(['upperChest']);
    expect(slugsFor('Bíceps (cabeza larga)')).toEqual(['biceps']);
    expect(slugsFor('Sistema cardiovascular')).toEqual([]);
  });

  it('todas las zonas del mapeo existen en los dibujos', () => {
    for (const ex of EXERCISES)
      for (const m of [...ex.primaryMuscles, ...ex.secondaryMuscles]) for (const s of slugsFor(m)) expect(ALL_SLUGS.has(s), s).toBe(true);
  });

  it('cada ejercicio de fuerza resalta al menos una zona', () => {
    for (const ex of EXERCISES.filter((e) => e.movement !== 'Cardio' && e.group !== 'Movilidad' && e.primaryMuscles.length))
      expect(muscleLevels(ex.primaryMuscles, ex.secondaryMuscles).size, ex.name).toBeGreaterThan(0);
  });

  it('lo principal gana sobre lo secundario', () => {
    const levels = muscleLevels(['Deltoides'], ['Hombros', 'Tríceps']);
    expect(levels.get('deltoids')).toBe('principal');
    expect(levels.get('triceps')).toBe('secundario');
  });

  it('las subdivisiones van encima y solo si están resaltadas', () => {
    const drawn = drawParts(BODY_FRONT, muscleLevels(['Deltoides anterior'], ['Deltoides lateral']));
    const slugs = drawn.map((p) => p.slug);
    expect(slugs).not.toContain('upperChest');
    expect(slugs.indexOf('frontDeltoid')).toBeGreaterThan(slugs.indexOf('deltoids'));
    expect(drawn.find((p) => p.slug === 'frontDeltoid')?.level).toBe('principal');
    expect(drawn.find((p) => p.slug === 'deltoids')?.level).toBe('secundario');
    expect(hasHighlight(drawParts(BODY_BACK, muscleLevels(['Pectoral mayor'], [])))).toBe(false);
  });

  it('el manguito rotador toma el color de la espalda alta', () => {
    const drawn = drawParts(BODY_BACK, muscleLevels(['Dorsal ancho'], []));
    expect(drawn.find((p) => p.slug === 'rotatorCuff')?.level).toBe('principal');
  });

  it('informa lo que no se puede dibujar', () => {
    expect(unmappedMuscles(['Glúteos', 'Sistema cardiovascular', ''])).toEqual(['Sistema cardiovascular']);
  });
});
