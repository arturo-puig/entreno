import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { EXERCISES } from './exercises';
import { ROUTINES, WEEK_PLAN } from './routines';
import { HISTORY } from './history';
import { EntrenoDB, ensureSeed } from '../db/db';

const exerciseIds = new Set(EXERCISES.map((e) => e.id));

describe('datos iniciales', () => {
  it('los ids de ejercicios son únicos', () => {
    expect(exerciseIds.size).toBe(EXERCISES.length);
  });

  it('toda rutina, sustitución e historial apunta a ejercicios existentes', () => {
    for (const r of ROUTINES) for (const i of r.items) expect(exerciseIds, `${r.id}/${i.id}`).toContain(i.exerciseId);
    for (const e of EXERCISES) for (const s of e.substitutions ?? []) expect(exerciseIds, `${e.id}→${s}`).toContain(s);
    for (const h of HISTORY) for (const i of h.items) expect(exerciseIds, `${h.id}/${i.id}`).toContain(i.exerciseId);
  });

  it('los ids de ítems son únicos dentro de cada rutina', () => {
    for (const r of ROUTINES) {
      const ids = r.items.map((i) => i.id);
      expect(new Set(ids).size, r.id).toBe(ids.length);
    }
  });

  it('la semana tiene los 7 días y cada rutina planificada existe', () => {
    expect(new Set(WEEK_PLAN.map((d) => d.weekday)).size).toBe(7);
    const routineIds = new Set(ROUTINES.map((r) => r.id));
    for (const d of WEEK_PLAN) if (d.routineId) expect(routineIds).toContain(d.routineId);
  });

  it('las rutinas del profe conservan las notaciones originales', () => {
    const a = ROUTINES.find((r) => r.id === 'rutina-a')!;
    expect(a.items.find((i) => i.exerciseId === 'press-banca-barra')?.notation).toBe('4 × 8/6');
    expect(a.items.find((i) => i.exerciseId === 'hip-thrust-maquina')?.notation).toBe('4 × 8/6');
  });

  it('el historial es real y sin fecha inventada', () => {
    for (const h of HISTORY) {
      expect(h.source).toBe('historico');
      expect(h.date).toBeNull();
    }
  });
});

describe('ensureSeed', () => {
  it('carga todo la primera vez y no pisa ediciones después', async () => {
    const db = new EntrenoDB(`test-${Math.random()}`);
    await ensureSeed(db);
    expect(await db.exercises.count()).toBe(EXERCISES.length);
    expect(await db.routines.count()).toBe(ROUTINES.length);
    expect(await db.sessions.count()).toBe(HISTORY.length);

    await db.routines.update('rutina-a', { name: 'Rutina A (editada)' });
    await db.meta.delete('seedRevision'); // simula una actualización de la carga inicial
    await ensureSeed(db);
    expect((await db.routines.get('rutina-a'))?.name).toBe('Rutina A (editada)');
    db.close();
  });
});

describe('ilustraciones', async () => {
  const { ILLUSTRATIONS } = await import('./media');
  // Lista los archivos reales de public/ (sin depender de las APIs de Node).
  const files = new Set(Object.keys(import.meta.glob('/public/media/**/*.{png,jpg,svg}')));
  const existsSync = (path: string) => files.has(`/${path}`);

  it('cada ilustración apunta a un ejercicio existente y a archivos que existen', () => {
    for (const [exerciseId, list] of Object.entries(ILLUSTRATIONS)) {
      expect(exerciseIds, exerciseId).toContain(exerciseId);
      for (const ill of list) for (const f of ill.frames) expect(existsSync(`public/${f}`), f).toBe(true);
    }
  });

  it('las variantes ilustradas existen en el ejercicio', () => {
    for (const [exerciseId, list] of Object.entries(ILLUSTRATIONS)) {
      const ex = EXERCISES.find((e) => e.id === exerciseId)!;
      for (const ill of list) if (ill.variant) {
        expect(ex.variants ?? [], `${exerciseId}: ${ill.variant}`).toContain(ill.variant);
      }
    }
  });
});

describe('actualización de la carga inicial', () => {
  it('suma variantes nuevas sin borrar las agregadas por vos', async () => {
    const db = new EntrenoDB(`test-${Math.random()}`);
    await ensureSeed(db);
    await db.exercises.update('remo-al-menton', { variants: ['Mi variante'] });
    await db.meta.put({ key: 'seedRevision', value: 1 });
    await ensureSeed(db);
    expect((await db.exercises.get('remo-al-menton'))?.variants).toEqual(['Mi variante', 'Con barra', 'En polea', 'Con mancuernas']);
    db.close();
  });

  it('martes: cambia el dead bug por la rueda abdominal una sola vez y solo si no lo editaste', async () => {
    const a = new EntrenoDB(`test-${Math.random()}`);
    await ensureSeed(a);
    const r = (await a.routines.get('tren-superior'))!;
    const m5 = r.items.find((i) => i.id === 'm5')!;
    expect(m5).toMatchObject({ exerciseId: 'rueda-abdominal', notation: '2 × 8–10' });
    expect(m5.perSide).toBeUndefined();
    expect(m5.sets).toEqual(ROUTINES.find((x) => x.id === 'tren-superior')!.items.find((i) => i.id === 'm5')!.sets);
    expect(r.version).toBe(2);
    // El original de la app sigue con el dead bug («Volver a la original»).
    expect(ROUTINES.find((x) => x.id === 'tren-superior')!.items.find((i) => i.id === 'm5')!.exerciseId).toBe('dead-bug');
    // Si volvés a la original, no se vuelve a cambiar.
    await a.routines.put(structuredClone(ROUTINES.find((x) => x.id === 'tren-superior')!));
    await ensureSeed(a);
    expect((await a.routines.get('tren-superior'))!.items.find((i) => i.id === 'm5')!.exerciseId).toBe('dead-bug');
    a.close();

    // Celular con la versión anterior donde ya lo cambiaste vos → no se toca.
    const b = new EntrenoDB(`test-${Math.random()}`);
    await b.routines.bulkAdd(structuredClone(ROUTINES));
    const mine = (await b.routines.get('tren-superior'))!;
    mine.items.find((i) => i.id === 'm5')!.exerciseId = 'plancha-frontal';
    await b.routines.put(mine);
    await b.meta.put({ key: 'seedRevision', value: 4 });
    await ensureSeed(b);
    expect((await b.routines.get('tren-superior'))!.items.find((i) => i.id === 'm5')!.exerciseId).toBe('plancha-frontal');
    b.close();
  });

  it('actualiza un texto corregido solo si no lo editaste', async () => {
    const seedManguito = EXERCISES.find((e) => e.id === 'manguito-rotador-banda')!;
    const old = {
      instructions: [
        'Pisá la banda con el pie derecho.',
        'Con la mano derecha, levantá la banda manteniendo el codo alineado con el hombro.',
        'Hacé las repeticiones y cambiá de lado.',
      ],
      instructionsNote: 'Pasos 1 y 2: según tu descripción. El paso 3 (cambiar de lado) es una suposición: corregilo si no corresponde.',
      commonErrors: ['Subir el hombro hacia la oreja.', 'Usar una banda tan dura que pierdas la posición del codo.', 'Hacerlo rápido: es un ejercicio de control.'],
    };
    // Celular con la versión anterior, sin tocar → pasa a la nueva.
    const a = new EntrenoDB(`test-${Math.random()}`);
    await ensureSeed(a);
    await a.exercises.update('manguito-rotador-banda', old);
    await a.meta.put({ key: 'seedRevision', value: 3 });
    await ensureSeed(a);
    expect((await a.exercises.get('manguito-rotador-banda'))?.instructions).toEqual(seedManguito.instructions);
    a.close();
    // Celular donde lo editaste → queda tu texto.
    const b = new EntrenoDB(`test-${Math.random()}`);
    await ensureSeed(b);
    await b.exercises.update('manguito-rotador-banda', { ...old, instructions: ['Mi versión'] });
    await b.meta.put({ key: 'seedRevision', value: 3 });
    await ensureSeed(b);
    expect((await b.exercises.get('manguito-rotador-banda'))?.instructions).toEqual(['Mi versión']);
    b.close();
  });
});
