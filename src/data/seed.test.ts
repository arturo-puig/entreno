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
