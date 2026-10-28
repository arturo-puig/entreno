import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Exercise, RoutineItem } from '../db/types';
import { estimateRoutineMinutes } from '../domain/estimate';
import { formatDuration, formatKg, formatRest, summarizeSets } from '../domain/format';
import { hasShortVersion, itemsForMode, type Mode } from '../domain/plan';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, Loading, NotFound, PendingNote, ScreenHeader, originLabel } from '../ui/common';

export function RoutineDetail({ id }: { id: string }) {
  const [mode, setMode] = useState<Mode>('completa');
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
      {routine.notes && <p className="muted routine-notes">{routine.notes}</p>}

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
      {mode === 'corta' && (
        <p className="hint">Propuesta de versión corta, pendiente de tu aprobación. No modifica la rutina original.</p>
      )}

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

      <p className="hint">La edición de rutinas (cambiar series, confirmar pendientes, reordenar) llega en la etapa 3.</p>
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
