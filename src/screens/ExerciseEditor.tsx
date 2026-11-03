import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createExercise, deleteExercise, routinesUsing, saveExercise } from '../db/actions';
import type { Equipment, Exercise } from '../db/types';
import { EQUIPMENT, MOVEMENTS, MUSCLE_GROUPS, splitList } from '../domain/catalog';
import { goBack, switchTab } from '../router';
import { ConfirmSheet, Field, Loading, NotFound, ScreenHeader } from '../ui/common';

const BLANK: Omit<Exercise, 'id'> = {
  name: '',
  group: 'Piernas',
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  movement: 'Aislamiento',
  instructions: [],
  commonErrors: [],
};

/** Formulario: listas como texto para poder escribir con comas y renglones sin perder lo tipeado. */
interface Draft {
  base: Omit<Exercise, 'id'>;
  aliases: string;
  primary: string;
  secondary: string;
  instructions: string;
  errors: string;
  variants: string;
  pending: string;
  hasPending: boolean;
}

const toDraft = (e: Omit<Exercise, 'id'>): Draft => ({
  base: e,
  aliases: (e.aliases ?? []).join(', '),
  primary: e.primaryMuscles.join(', '),
  secondary: e.secondaryMuscles.join(', '),
  instructions: e.instructions.join('\n'),
  errors: e.commonErrors.join('\n'),
  variants: (e.variants ?? []).join('\n'),
  pending: e.pending ?? '',
  hasPending: !!e.pending,
});

function fromDraft(d: Draft): Omit<Exercise, 'id'> {
  const aliases = splitList(d.aliases, 'coma');
  const variants = splitList(d.variants, 'renglon');
  const out: Omit<Exercise, 'id'> = {
    ...d.base,
    name: d.base.name.trim(),
    nameEn: d.base.nameEn?.trim() || undefined,
    aliases: aliases.length ? aliases : undefined,
    primaryMuscles: splitList(d.primary, 'coma'),
    secondaryMuscles: splitList(d.secondary, 'coma'),
    instructions: splitList(d.instructions, 'renglon'),
    commonErrors: splitList(d.errors, 'renglon'),
    variants: variants.length ? variants : undefined,
    pending: d.hasPending && d.pending.trim() ? d.pending.trim() : undefined,
  };
  return out;
}

export function ExerciseEditor({ id }: { id?: string }) {
  const isNew = !id;
  const stored = useLiveQuery(async () => (id ? ((await db.exercises.get(id)) ?? null) : null), [id]);
  const [draft, setDraft] = useState<Draft>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<'descartar' | 'borrar' | null>(null);
  const [usedIn, setUsedIn] = useState<string[]>([]);

  useEffect(() => {
    if (draft) return;
    if (isNew) setDraft(toDraft(BLANK));
    else if (stored) setDraft(toDraft(stored));
  }, [stored, isNew, draft]);

  useEffect(() => {
    if (id) routinesUsing(id).then((rs) => setUsedIn(rs.map((r) => r.name)));
  }, [id]);

  if (!isNew && stored === undefined) return <Loading />;
  if (!isNew && stored === null) return <NotFound what="este ejercicio" back="/ejercicios" />;
  if (!draft) return <Loading />;

  const back = id ? `/ejercicios/${id}` : '/ejercicios';
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const setBase = (patch: Partial<Omit<Exercise, 'id'>>) => set({ base: { ...draft.base, ...patch } });
  const toggleEquipment = (eq: Equipment) =>
    setBase({ equipment: draft.base.equipment.includes(eq) ? draft.base.equipment.filter((x) => x !== eq) : [...draft.base.equipment, eq] });

  const save = async () => {
    const data = fromDraft(draft);
    if (!data.name) return setError('Poné un nombre.');
    if (!data.equipment.length) return setError('Elegí al menos un equipamiento.');
    setError(undefined);
    if (isNew) {
      const newId = await createExercise(data);
      switchTab(`/ejercicios/${newId}`);
    } else {
      await saveExercise({ ...data, id: id! });
      goBack(back);
    }
  };

  return (
    <>
      <ScreenHeader title={isNew ? 'Nuevo ejercicio' : 'Editar ejercicio'} back={back} />
      <div className="form">
        <Field label="Nombre">
          <input className="input" value={draft.base.name} onChange={(e) => setBase({ name: e.target.value })} />
        </Field>
        <Field label="Otros nombres" help="Separados por coma. Sirven para buscarlo (p. ej. «Remo alto»).">
          <input className="input" value={draft.aliases} onChange={(e) => set({ aliases: e.target.value })} />
        </Field>
        <Field label="Nombre en inglés (opcional)">
          <input className="input" value={draft.base.nameEn ?? ''} onChange={(e) => setBase({ nameEn: e.target.value })} />
        </Field>
        <div className="form-row">
          <Field label="Grupo">
            <select className="input" value={draft.base.group} onChange={(e) => setBase({ group: e.target.value as Exercise['group'] })}>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="input" value={draft.base.movement} onChange={(e) => setBase({ movement: e.target.value as Exercise['movement'] })}>
              {MOVEMENTS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="field">
          <span className="field-label">Equipamiento</span>
          <div className="chips">
            {EQUIPMENT.map((eq) => (
              <button key={eq} type="button" className="chip-btn" aria-pressed={draft.base.equipment.includes(eq)} onClick={() => toggleEquipment(eq)}>
                {eq}
              </button>
            ))}
          </div>
        </div>
        <Field label="Músculos principales" help="Separados por coma.">
          <input className="input" value={draft.primary} onChange={(e) => set({ primary: e.target.value })} />
        </Field>
        <Field label="Músculos secundarios" help="Separados por coma.">
          <input className="input" value={draft.secondary} onChange={(e) => set({ secondary: e.target.value })} />
        </Field>
        <Field label="Cómo se hace" help="Un paso por renglón.">
          <textarea className="input textarea" rows={5} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
        </Field>
        <Field label="Origen de la descripción (opcional)" help="Por ejemplo: «Consigna de mi profe, 3/11».">
          <input className="input" value={draft.base.instructionsNote ?? ''} onChange={(e) => setBase({ instructionsNote: e.target.value || undefined })} />
        </Field>
        <Field label="Errores frecuentes" help="Uno por renglón.">
          <textarea className="input textarea" rows={3} value={draft.errors} onChange={(e) => set({ errors: e.target.value })} />
        </Field>
        <Field label="Variantes" help="Una por renglón. Cada variante puede tener su propio video o foto.">
          <textarea className="input textarea" rows={2} value={draft.variants} onChange={(e) => set({ variants: e.target.value })} />
        </Field>

        {draft.hasPending ? (
          <div className="notice notice-warn pending-edit">
            <div>
              <strong>Pendiente de confirmar</strong>
              <textarea
                className="input textarea"
                rows={2}
                aria-label="Pregunta pendiente"
                value={draft.pending}
                onChange={(e) => set({ pending: e.target.value })}
              />
              <button className="btn btn-sm" onClick={() => set({ hasPending: false })}>
                Marcar como confirmado
              </button>
            </div>
          </div>
        ) : (
          <button className="link" onClick={() => set({ hasPending: true })}>
            Agregar una pregunta pendiente
          </button>
        )}

        {error && <p className="error-text">{error}</p>}

        {!isNew && stored?.custom && (
          <button className="btn btn-ghost link-danger" onClick={() => setConfirm('borrar')}>
            Borrar ejercicio
          </button>
        )}
      </div>

      <div className="save-bar">
        <button className="btn" onClick={() => (dirty ? setConfirm('descartar') : goBack(back))}>
          {dirty ? 'Descartar' : 'Volver'}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!dirty}>
          Guardar
        </button>
      </div>

      {confirm === 'descartar' && (
        <ConfirmSheet
          title="¿Descartar los cambios?"
          message="Lo que cambiaste en este ejercicio no se va a guardar."
          confirmLabel="Descartar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => goBack(back)}
        />
      )}
      {confirm === 'borrar' && (
        <ConfirmSheet
          title="¿Borrar este ejercicio?"
          message={
            usedIn.length
              ? `No se puede: está en ${usedIn.join(', ')}. Sacalo de esas rutinas primero.`
              : 'Se borran también tus videos y fotos de este ejercicio. No se puede deshacer.'
          }
          confirmLabel="Borrar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (usedIn.length) return setConfirm(null);
            await deleteExercise(id!);
            switchTab('/ejercicios');
          }}
        />
      )}
    </>
  );
}
