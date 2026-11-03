import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/exercises';
import { HISTORY } from '../data/history';
import { ROUTINES } from '../data/routines';
import { summarizeSets } from './format';
import {
  addSet, convertSets, defaultRest, duplicateRoutine, moveItem, newItem, sessionToRoutine, targetKindOf, withNewVersion,
} from './edit';

const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;

describe('edición de rutinas', () => {
  it('mueve ítems sin salirse de la lista', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it('usa los descansos aprobados', () => {
    expect(defaultRest(ex('sentadilla-smith'))).toBe(90);
    expect(defaultRest(ex('elevaciones-laterales'))).toBe(60);
    expect(defaultRest(ex('remo-al-menton'))).toBe(60); // tracción de hombro: accesorio
    expect(defaultRest(ex('gato-vaca'))).toBe(30);
    expect(defaultRest(ex('caminata-cinta'))).toBe(0);
  });

  it('crea ejercicios nuevos con un plan simple', () => {
    expect(summarizeSets(newItem(ex('flexiones')))).toBe('3 × 10');
    expect(summarizeSets(newItem(ex('bicicleta-fija')))).toBe('20 min');
  });

  it('detecta y convierte el tipo de objetivo', () => {
    const a = ROUTINES.find((r) => r.id === 'rutina-a')!;
    expect(targetKindOf(a.items.find((i) => i.id === 'a4')!.sets)).toBe('reps');
    expect(targetKindOf(a.items.find((i) => i.id === 'a8')!.sets)).toBe('segundos');
    expect(targetKindOf(a.items.find((i) => i.id === 'a7')!.sets)).toBe('ninguno');
    expect(targetKindOf([{ repsMin: 8, repsMax: 12 }])).toBe('rango');
    expect(targetKindOf([{ durationSec: 1800, durationMaxSec: 2100 }])).toBe('minutos');
    const converted = convertSets([{ reps: 10 }, { reps: 8, optional: true }], 'rango');
    expect(converted).toEqual([{ repsMin: 8, repsMax: 12 }, { repsMin: 8, repsMax: 12, optional: true }]);
    expect(addSet([{ reps: 6, optional: true }])).toEqual([{ reps: 6, optional: true }, { reps: 6, optional: undefined }]);
  });

  it('sube la versión al guardar y duplica como rutina personal', () => {
    const a = ROUTINES.find((r) => r.id === 'rutina-a')!;
    expect(withNewVersion(a).version).toBe(a.version + 1);
    const copy = duplicateRoutine(a);
    expect(copy.id).not.toBe(a.id);
    expect(copy.origin).toBe('personal');
    expect(copy.items).toEqual(a.items);
    expect(copy.items).not.toBe(a.items);
  });

  it('convierte el registro histórico en rutina alternativa', () => {
    const r = sessionToRoutine(HISTORY.find((h) => h.id === 'hist-piernas-abdomen')!, EXERCISES);
    expect(r.origin).toBe('personal');
    expect(r.items).toHaveLength(7);
    const ext = r.items.find((i) => i.exerciseId === 'extension-cuadriceps')!;
    expect(ext.referenceLoadKg).toBe(50);
    expect(ext.notation).toBe('3 × 10');
    expect(summarizeSets(ext)).toBe('3 × 10');
    expect(r.items[0].notation).toBe('1 km');
    expect(r.items.find((i) => i.exerciseId === 'plancha-frontal')!.notation).toBe('3 × 1 min');
  });
});
