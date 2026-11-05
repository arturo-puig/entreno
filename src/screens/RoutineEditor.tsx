import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { saveRoutine } from '../db/actions';
import type { Exercise, PlannedSet, Routine, RoutineItem } from '../db/types';
import { addSet, convertSets, moveItem, newItem, TARGET_KINDS, targetKindOf, type TargetKind } from '../domain/edit';
import { formatRest, summarizeSets } from '../domain/format';
import { filterExercises, NO_FILTERS } from '../domain/search';
import { goBack } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, ConfirmSheet, Field, Loading, NotFound, parseNumber, ScreenHeader, Sheet, Stepper, Switch } from '../ui/common';

export function RoutineEditor({ id }: { id: string }) {
  const data = useLiveQuery(async () => {
    const [routine, exercises] = await Promise.all([db.routines.get(id), db.exercises.toArray()]);
    return { routine: routine ?? null, exercises };
  }, [id]);
  const [draft, setDraft] = useState<Routine>();
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<RoutineItem | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'descartar' } | { kind: 'quitar'; item: RoutineItem } | null>(null);

  useEffect(() => {
    if (!draft && data?.routine) setDraft(structuredClone(data.routine));
  }, [data, draft]);

  if (!data) return <Loading />;
  if (!data.routine) return <NotFound what="esta rutina" back="/rutinas" />;
  if (!draft) return <Loading />;

  const back = `/rutinas/${id}`;
  const exById = new Map(data.exercises.map((e) => [e.id, e]));
  const update = (patch: Partial<Routine>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const setItems = (items: RoutineItem[]) => update({ items });

  const applyItem = (item: RoutineItem) => {
    const exists = draft.items.some((i) => i.id === item.id);
    setItems(exists ? draft.items.map((i) => (i.id === item.id ? item : i)) : [...draft.items, item]);
    setEditing(null);
  };

  return (
    <>
      <ScreenHeader title="Editar rutina" eyebrow={data.routine.name} back={back} />
      {draft.origin === 'profesor' && (
        <p className="notice notice-accent">
          Es una rutina de tu profe. Cambiala solo con lo que él te confirme; siempre podés volver a la versión original.
        </p>
      )}

      <div className="form">
        <Field label="Nombre">
          <input className="input" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Notas (opcional)">
          <textarea className="input textarea" rows={2} value={draft.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
        </Field>
      </div>

      <section className="section">
        <h2 className="section-title">Ejercicios</h2>
        {draft.items.length === 0 && <p className="muted">Todavía no hay ejercicios. Agregá el primero.</p>}
        <div className="stack-sm">
          {draft.items.map((item, idx) => {
            const ex = exById.get(item.exerciseId);
            return (
              <article className="card edit-item" key={item.id}>
                <div className="edit-item-head">
                  <span className="row-index">{idx + 1}</span>
                  <span className="row-main">
                    <span className="row-title">
                      {ex?.name ?? 'Ejercicio no encontrado'}
                      {item.variant && <span className="row-variant"> · {item.variant}</span>}
                    </span>
                    <span className="row-sub">
                      {summarizeSets(item)}
                      {item.restSec > 0 && ` · descanso ${formatRest(item.restSec)}`}
                    </span>
                  </span>
                </div>
                {(item.pending || item.optional || item.short) && (
                  <div className="badges">
                    {item.pending && <Badge tone="warn">Pendiente de confirmar</Badge>}
                    {item.optional && <Badge>Opcional</Badge>}
                    {item.short && <Badge tone="accent">En versión corta</Badge>}
                  </div>
                )}
                <div className="edit-item-actions">
                  <button className="icon-btn" aria-label={`Subir ${ex?.name}`} disabled={idx === 0} onClick={() => setItems(moveItem(draft.items, idx, -1))}>
                    <Icon name="up" size={20} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Bajar ${ex?.name}`}
                    disabled={idx === draft.items.length - 1}
                    onClick={() => setItems(moveItem(draft.items, idx, 1))}
                  >
                    <Icon name="down" size={20} />
                  </button>
                  <button className="icon-btn" aria-label={`Quitar ${ex?.name}`} onClick={() => setConfirm({ kind: 'quitar', item })}>
                    <Icon name="trash" size={20} />
                  </button>
                  <button className="btn btn-sm edit-item-edit" onClick={() => setEditing(item)}>
                    <Icon name="edit" size={18} /> Editar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <button className="btn btn-block" onClick={() => setPicking(true)}>
          <Icon name="plus" size={20} /> Agregar ejercicio
        </button>
      </section>

      <div className="save-bar">
        <button className="btn" onClick={() => (dirty ? setConfirm({ kind: 'descartar' }) : goBack(back))}>
          {dirty ? 'Descartar' : 'Volver'}
        </button>
        <button
          className="btn btn-primary"
          disabled={!dirty || !draft.name.trim()}
          onClick={async () => {
            await saveRoutine({ ...draft, name: draft.name.trim() });
            goBack(back);
          }}
        >
          Guardar cambios
        </button>
      </div>

      {editing && (
        <ItemEditorSheet
          item={editing}
          exercise={exById.get(editing.exerciseId)}
          exercises={data.exercises}
          onApply={applyItem}
          onCancel={() => setEditing(null)}
        />
      )}
      {picking && (
        <ExercisePickerSheet
          exercises={data.exercises}
          onCancel={() => setPicking(false)}
          onPick={(ex) => {
            setPicking(false);
            setEditing(newItem(ex));
          }}
        />
      )}
      {confirm?.kind === 'descartar' && (
        <ConfirmSheet
          title="¿Descartar los cambios?"
          message="Lo que cambiaste en esta rutina no se va a guardar."
          confirmLabel="Descartar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => goBack(back)}
        />
      )}
      {confirm?.kind === 'quitar' && (
        <ConfirmSheet
          title="¿Quitar este ejercicio?"
          message={`${exById.get(confirm.item.exerciseId)?.name ?? 'El ejercicio'} sale de la rutina. Tu historial no se borra. Se aplica cuando guardes.`}
          confirmLabel="Quitar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setItems(draft.items.filter((i) => i.id !== confirm.item.id));
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

// ——— Editor de un ejercicio dentro de la rutina ———

function ItemEditorSheet(props: {
  item: RoutineItem;
  exercise?: Exercise;
  exercises: Exercise[];
  onApply: (i: RoutineItem) => void;
  onCancel: () => void;
}) {
  const { exercise } = props;
  // Respaldo: primero las sustituciones sugeridas del ejercicio, después del mismo grupo, después el resto.
  const suggestedIds = new Set(exercise?.substitutions ?? []);
  const others = props.exercises.filter((e) => e.id !== props.item.exerciseId && !suggestedIds.has(e.id) && e.movement !== 'Cardio');
  const suggested = props.exercises.filter((e) => suggestedIds.has(e.id));
  const sameGroup = others.filter((e) => e.group === exercise?.group).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const rest = others.filter((e) => e.group !== exercise?.group).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const [item, setItem] = useState<RoutineItem>(() => structuredClone(props.item));
  const [kind, setKind] = useState<TargetKind>(() => targetKindOf(props.item.sets));
  const [hasPending, setHasPending] = useState(!!props.item.pending);
  const [refLoad, setRefLoad] = useState(item.referenceLoadKg !== undefined ? String(item.referenceLoadKg).replace('.', ',') : '');
  const set = (patch: Partial<RoutineItem>) => setItem((cur) => ({ ...cur, ...patch }));
  const setSet = (i: number, patch: Partial<PlannedSet>) => set({ sets: item.sets.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const apply = () => {
    const out: RoutineItem = {
      ...item,
      pending: hasPending && item.pending?.trim() ? item.pending.trim() : undefined,
      referenceLoadKg: parseNumber(refLoad),
      variant: item.variant || undefined,
      note: item.note?.trim() || undefined,
      backupExerciseId: item.backupExerciseId || undefined,
    };
    if (out.short?.sets) out.short = { sets: Math.min(out.short.sets, out.sets.length) };
    props.onApply(out);
  };

  const confirmPending = () => {
    setHasPending(false);
    const today = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
    if (!item.note?.trim()) set({ note: `Confirmado el ${today}.` });
  };

  const minutes = kind === 'minutos';
  const isTime = kind === 'segundos' || minutes;

  return (
    <Sheet title={exercise?.name ?? 'Ejercicio'} onClose={props.onCancel} footer={
      <div className="sheet-actions">
        <button className="btn" onClick={props.onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={apply} disabled={item.sets.length === 0}>
          Listo
        </button>
      </div>
    }>
      <div className="form">
        {exercise?.variants && exercise.variants.length > 0 && (
          <Field label="Variante">
            <select className="input" value={item.variant ?? ''} onChange={(e) => set({ variant: e.target.value || undefined })}>
              <option value="">Sin variante</option>
              {exercise.variants.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Notación original" help="Como lo anotó tu profe. La app no la interpreta: las series de abajo son las que cuentan.">
          <input className="input" value={item.notation} onChange={(e) => set({ notation: e.target.value })} />
        </Field>

        {hasPending ? (
          <div className="notice notice-warn pending-edit">
            <div>
              <strong>Pendiente de confirmar</strong>
              <textarea
                className="input textarea"
                rows={2}
                aria-label="Pregunta pendiente"
                value={item.pending ?? ''}
                onChange={(e) => set({ pending: e.target.value })}
              />
              <button className="btn btn-sm" onClick={confirmPending}>
                Marcar como confirmado
              </button>
            </div>
          </div>
        ) : (
          <button className="link" onClick={() => setHasPending(true)}>
            Marcar como pendiente de confirmar
          </button>
        )}

        <div className="field">
          <span className="field-label">Series</span>
          <select
            className="input"
            aria-label="Tipo de objetivo"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as TargetKind;
              setKind(k);
              set({ sets: convertSets(item.sets, k) });
            }}
          >
            {TARGET_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                Objetivo: {k.label}
              </option>
            ))}
          </select>
          <ol className="set-list">
            {item.sets.map((s, i) => (
              <li key={i} className="set-row">
                <span className="set-label">Serie {i + 1}</span>
                {kind === 'reps' && (
                  <NumInput label={`Repeticiones serie ${i + 1}`} value={s.reps} onChange={(v) => setSet(i, { reps: v })} suffix="reps" />
                )}
                {kind === 'rango' && (
                  <span className="set-range">
                    <NumInput label={`Mínimo serie ${i + 1}`} value={s.repsMin} onChange={(v) => setSet(i, { repsMin: v })} />
                    <span>a</span>
                    <NumInput label={`Máximo serie ${i + 1}`} value={s.repsMax} onChange={(v) => setSet(i, { repsMax: v })} />
                  </span>
                )}
                {isTime && (
                  <span className="set-range">
                    <NumInput
                      label={`Duración serie ${i + 1}`}
                      value={s.durationSec !== undefined ? s.durationSec / (minutes ? 60 : 1) : undefined}
                      onChange={(v) => setSet(i, { durationSec: v !== undefined ? v * (minutes ? 60 : 1) : undefined })}
                      suffix={minutes && !s.durationMaxSec ? 'min' : minutes ? undefined : 's'}
                    />
                    {minutes && (
                      <>
                        <span>a</span>
                        <NumInput
                          label={`Duración máxima serie ${i + 1}`}
                          value={s.durationMaxSec !== undefined ? s.durationMaxSec / 60 : undefined}
                          onChange={(v) => setSet(i, { durationMaxSec: v !== undefined ? v * 60 : undefined })}
                          suffix="min"
                          placeholder="—"
                        />
                      </>
                    )}
                  </span>
                )}
                {kind === 'ninguno' && <span className="muted small">Sin objetivo</span>}
                <label className="check">
                  <input type="checkbox" checked={!!s.optional} onChange={(e) => setSet(i, { optional: e.target.checked || undefined })} />
                  Opcional
                </label>
                {item.sets.length > 1 && (
                  <button className="icon-btn" aria-label={`Quitar serie ${i + 1}`} onClick={() => set({ sets: item.sets.filter((_, k) => k !== i) })}>
                    <Icon name="close" size={18} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          <button className="link" onClick={() => set({ sets: addSet(item.sets) })}>
            + Agregar serie
          </button>
        </div>

        <Field label="Lados">
          <select
            className="input"
            value={item.perSide ?? ''}
            onChange={(e) => set({ perSide: (e.target.value || undefined) as RoutineItem['perSide'] })}
          >
            <option value="">No aplica</option>
            <option value="separado">Por lado: todas de un lado y después del otro</option>
            <option value="alternado">Por lado: alternando en la misma serie</option>
          </select>
        </Field>

        {!isTime && (
          <>
            <Switch
              checked={item.loadPattern === 'ascendente'}
              onChange={(v) => set({ loadPattern: v ? 'ascendente' : undefined })}
              label="Carga ascendente"
              description="Subir el peso en cada serie (pirámide)."
            />
            <Switch
              checked={item.loadPattern === 'fija'}
              onChange={(v) => set({ loadPattern: v ? 'fija' : undefined })}
              label="Misma carga en todas las series"
              description="La app te sugiere el peso de tu serie anterior: no perdés tiempo cambiando discos."
            />
          </>
        )}

        {!isTime && (
          <Field label="Carga de referencia (kg, opcional)" help="Una referencia, no una obligación.">
            <input className="input input-num" inputMode="decimal" value={refLoad} onChange={(e) => setRefLoad(e.target.value)} />
          </Field>
        )}

        <div className="field">
          <span className="field-label">Descanso entre series</span>
          <Stepper label="descanso" value={item.restSec} step={15} min={0} max={600} onChange={(v) => set({ restSec: v })} format={(v) => (v ? formatRest(v) : 'Sin descanso')} />
        </div>

        <Switch checked={!!item.optional} onChange={(v) => set({ optional: v || undefined })} label="Ejercicio opcional" description="Se hace según cómo estés ese día." />

        <Field
          label="Respaldo si la máquina está ocupada"
          help="En la sesión aparece «Máquina ocupada» para cambiar en un toque. Se mantienen las mismas series y repeticiones; el plan de tu profe no cambia."
        >
          <select className="input" value={item.backupExerciseId ?? ''} onChange={(e) => set({ backupExerciseId: e.target.value || undefined })}>
            <option value="">Sin respaldo</option>
            {suggested.length > 0 && (
              <optgroup label="Sustituciones sugeridas">
                {suggested.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
            {sameGroup.length > 0 && (
              <optgroup label={`Otros de ${exercise?.group ?? 'este grupo'}`}>
                {sameGroup.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Todos los demás">
              {rest.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Switch
          checked={!!item.short}
          onChange={(v) =>
            set({ short: v ? (minutes ? { durationSec: 20 * 60 } : { sets: Math.min(3, item.sets.length) }) : undefined })
          }
          label="Incluir en «Tengo poco tiempo»"
          description="Entra en la versión corta del día."
        />
        {item.short && !minutes && (
          <div className="field">
            <span className="field-label">Series en la versión corta</span>
            <Stepper label="series en versión corta" value={item.short.sets ?? item.sets.length} step={1} min={1} max={item.sets.length} onChange={(v) => set({ short: { sets: v } })} />
          </div>
        )}
        {item.short && minutes && (
          <div className="field">
            <span className="field-label">Minutos en la versión corta</span>
            <Stepper
              label="minutos en versión corta"
              value={(item.short.durationSec ?? 1200) / 60}
              step={5}
              min={5}
              max={90}
              onChange={(v) => set({ short: { durationSec: v * 60 } })}
              format={(v) => `${v} min`}
            />
          </div>
        )}

        <Field label="Nota (opcional)">
          <textarea className="input textarea" rows={2} value={item.note ?? ''} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

/** Campo numérico que respeta lo que estás tipeando (incluso vacío) y solo informa números válidos. */
function NumInput(props: { label: string; value?: number; onChange: (v: number | undefined) => void; suffix?: string; placeholder?: string }) {
  const [text, setText] = useState(props.value !== undefined ? String(props.value).replace('.', ',') : '');
  return (
    <span className="num-input">
      <input
        className="input input-num"
        inputMode="decimal"
        aria-label={props.label}
        placeholder={props.placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          props.onChange(parseNumber(e.target.value));
        }}
      />
      {props.suffix && <span className="num-suffix">{props.suffix}</span>}
    </span>
  );
}

function ExercisePickerSheet(props: { exercises: Exercise[]; onPick: (e: Exercise) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const results = filterExercises(props.exercises, { ...NO_FILTERS, q });
  return (
    <Sheet title="Agregar ejercicio" onClose={props.onCancel}>
      <div className="search">
        <Icon name="search" size={20} />
        <input type="search" placeholder="Buscar por nombre o músculo" aria-label="Buscar ejercicio para agregar" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <button className="row" onClick={() => props.onPick(e)}>
              <span className="row-main">
                <span className="row-title">{e.name}</span>
                <span className="row-sub">
                  {e.group} · {e.equipment.join(', ')}
                </span>
              </span>
              <Icon name="plus" className="row-chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">¿No está? Crealo desde Ejercicios → Nuevo ejercicio.</p>
    </Sheet>
  );
}
