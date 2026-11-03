import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Exercise, RoutineItem } from '../db/types';
import { estimateRoutineMinutes } from '../domain/estimate';
import { formatDuration, formatKg, formatRest, summarizeSets } from '../domain/format';
import { hasShortVersion, itemsForMode, type Mode } from '../domain/plan';
import { navigate, switchTab } from '../router';
import { deleteRoutine, duplicateRoutineById, hasOriginal, restoreRoutine } from '../db/actions';
import { Icon } from '../ui/Icon';
import { Badge, ConfirmSheet, Loading, NotFound, PendingNote, ScreenHeader, originLabel } from '../ui/common';

export function RoutineDetail({ id }: { id: string }) {
  const [mode, setMode] = useState<Mode>('completa');
  const [confirm, setConfirm] = useState<'restaurar' | 'borrar' | null>(null);
  const data = useLiveQuery(async () => {
    const [routine, exercises] = await Promise.all([db.routines.get(id), db.exercises.toArray()]);
    return { routine, exercises };
  }, [id]);

  if (!data) return <Loading />;
  const { routine, exercises } = data;
  if (!routine) return <NotFound what="esta rutina" back="/rutinas" />;

  const exById = new Map(exercises.map((e) => [e.id, e]));
  const items = itemsForMode(routine, mode);
  const canShorten = hasShortVersion(routine);
  const groups = groupItems(items);
  let index = 0;

  return (
    <>
      <ScreenHeader title={routine.name} eyebrow={originLabel(routine)} back="/rutinas" />
      <div className="meta-row">
        <span>
          <Icon name="clock" size={18} /> ≈ {estimateRoutineMinutes(routine, mode)} min
        </span>
        <span>
          <Icon name="list" size={18} /> {items.length} ejercicios
        </span>
      </div>
      {routine.version > 1 && (
        <p className="hint">
          Versión {routine.version} · modificada el {new Date(routine.updatedAt).toLocaleDateString('es-AR')}
        </p>
      )}
      {routine.notes && <p className="muted routine-notes">{routine.notes}</p>}
      <div className="header-actions">
        <button className="btn btn-sm" onClick={() => navigate(`/rutinas/${routine.id}/editar`)}>
          <Icon name="edit" size={18} /> Editar
        </button>
        <button
          className="btn btn-sm"
          onClick={async () => {
            const copyId = await duplicateRoutineById(routine.id);
            navigate(`/rutinas/${copyId}`);
          }}
        >
          <Icon name="copy" size={18} /> Duplicar
        </button>
      </div>

      {canShorten && (
        <div className="segmented two" role="group" aria-label="Versión">
          <button className="seg" aria-pressed={mode === 'completa'} onClick={() => setMode('completa')}>
            Completa
          </button>
          <button className="seg" aria-pressed={mode === 'corta'} onClick={() => setMode('corta')}>
            Tengo poco tiempo
          </button>
        </div>
      )}
      {mode === 'corta' && <p className="hint">Versión para cuando tenés poco tiempo. No modifica la rutina original.</p>}

      {groups.map((g) => (
        <section className="section" key={g.key}>
          {g.label && <h3 className="group-label">{g.label}</h3>}
          <div className="stack-sm">
            {g.items.map((item) => (
              <ItemCard key={item.id} n={++index} item={item} exercise={exById.get(item.exerciseId)} mode={mode} />
            ))}
          </div>
        </section>
      ))}

      {items.length === 0 && <p className="muted">Esta rutina todavía no tiene ejercicios. Tocá «Editar» para agregarlos.</p>}

      <div className="danger-zone">
        {hasOriginal(routine.id) && routine.version > 1 && (
          <button className="btn btn-ghost" onClick={() => setConfirm('restaurar')}>
            Volver a la versión original
          </button>
        )}
        <button className="btn btn-ghost link-danger" onClick={() => setConfirm('borrar')}>
          Eliminar rutina
        </button>
      </div>

      {confirm === 'restaurar' && (
        <ConfirmSheet
          title="¿Volver a la versión original?"
          message="Se descartan los cambios que le hiciste a esta rutina y queda como vino en la app. Tu historial no se toca."
          confirmLabel="Restaurar"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await restoreRoutine(routine.id);
            setConfirm(null);
          }}
        />
      )}
      {confirm === 'borrar' && (
        <ConfirmSheet
          title={`¿Eliminar «${routine.name}»?`}
          message={
            routine.origin === 'profesor'
              ? 'Es una rutina de tu profe. Si está planificada en la semana, ese día pasa a descanso. Tu historial no se borra.'
              : 'Si está planificada en la semana, ese día pasa a descanso. Tu historial no se borra.'
          }
          confirmLabel="Eliminar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await deleteRoutine(routine.id);
            switchTab('/rutinas');
          }}
        />
      )}
    </>
  );
}

/** Agrupa ejercicios consecutivos que comparten grupo (entrada en calor, superseries…). */
function groupItems(items: RoutineItem[]) {
  const out: { key: string; label?: string; items: RoutineItem[] }[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.group && last?.key === item.group.id) last.items.push(item);
    else out.push({ key: item.group?.id ?? item.id, label: item.group?.label, items: [item] });
  }
  return out;
}

function ItemCard({ n, item, exercise, mode }: { n: number; item: RoutineItem; exercise?: Exercise; mode: Mode }) {
  return (
    <article className="card item-card">
      <button className="item-head" onClick={() => navigate(`/ejercicios/${item.exerciseId}`)}>
        <span className="row-index">{n}</span>
        <span className="row-main">
          <span className="item-name">{exercise?.name ?? 'Ejercicio no encontrado'}</span>
          {item.variant && <span className="row-sub">{item.variant}</span>}
        </span>
        <Icon name="chevron" className="row-chevron" size={18} />
      </button>
      <p className="item-sets">{summarizeSets(item, mode)}</p>
      <dl className="item-meta">
        <div>
          <dt>Anotado</dt>
          <dd>«{item.notation}»</dd>
        </div>
        {item.restSec > 0 && (
          <div>
            <dt>Descanso</dt>
            <dd>{formatRest(item.restSec)}</dd>
          </div>
        )}
        {item.referenceLoadKg !== undefined && (
          <div>
            <dt>Carga de referencia</dt>
            <dd>{formatKg(item.referenceLoadKg)}</dd>
          </div>
        )}
      </dl>
      {(item.loadPattern || item.optional || (item.short && mode === 'completa')) && (
        <div className="badges">
          {item.loadPattern && <Badge>Carga ascendente</Badge>}
          {item.optional && <Badge>Opcional</Badge>}
          {item.short && mode === 'completa' && (
            <Badge tone="accent">
              Versión corta: {item.short.durationSec ? formatDuration(item.short.durationSec) : `${item.short.sets} series`}
            </Badge>
          )}
        </div>
      )}
      {item.note && <p className="item-note">{item.note}</p>}
      {item.pending && <PendingNote>{item.pending}</PendingNote>}
    </article>
  );
}
