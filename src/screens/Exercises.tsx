import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { filterExercises, NO_FILTERS, type ExerciseFilters } from '../domain/search';
import { navigate } from '../router';
import { Icon } from '../ui/Icon';
import { Badge, EmptyState, Loading, ScreenHeader } from '../ui/common';

// Se conserva al ir a un ejercicio y volver.
let lastFilters: ExerciseFilters = NO_FILTERS;

const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es'));

export function Exercises() {
  const [filters, setFiltersState] = useState<ExerciseFilters>(lastFilters);
  const setFilters = (f: ExerciseFilters) => {
    lastFilters = f;
    setFiltersState(f);
  };
  const exercises = useLiveQuery(() => db.exercises.toArray());

  const options = useMemo(
    () =>
      exercises && {
        group: uniqueSorted(exercises.map((e) => e.group)),
        equipment: uniqueSorted(exercises.flatMap((e) => e.equipment)),
        movement: uniqueSorted(exercises.map((e) => e.movement)),
      },
    [exercises],
  );

  if (!exercises || !options) return <Loading />;
  const results = filterExercises(exercises, filters);
  const active = filters.q || filters.group || filters.equipment || filters.movement;

  return (
    <>
      <div className="title-row">
        <ScreenHeader title="Ejercicios" />
        <button className="btn btn-sm" onClick={() => navigate('/ejercicios/nuevo')}>
          <Icon name="plus" size={18} /> Nuevo
        </button>
      </div>
      <div className="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          inputMode="search"
          placeholder="Buscar por nombre o músculo"
          aria-label="Buscar ejercicios"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
      </div>
      <div className="filters">
        <FilterSelect label="Grupo" value={filters.group} options={options.group} onChange={(group) => setFilters({ ...filters, group })} />
        <FilterSelect label="Equipo" value={filters.equipment} options={options.equipment} onChange={(equipment) => setFilters({ ...filters, equipment })} />
        <FilterSelect label="Tipo" value={filters.movement} options={options.movement} onChange={(movement) => setFilters({ ...filters, movement })} />
      </div>
      <div className="section-head results-head">
        <span className="muted small">
          {results.length} {results.length === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
        {active && (
          <button className="link" onClick={() => setFilters(NO_FILTERS)}>
            Limpiar
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState icon="search" title="Ningún ejercicio coincide con la búsqueda.">
          Probá con otro nombre o quitá algún filtro.
        </EmptyState>
      ) : (
        <ul className="list">
          {results.map((e) => (
            <li key={e.id}>
              <button className="row" onClick={() => navigate(`/ejercicios/${e.id}`)}>
                <span className="row-main">
                  <span className="row-title">{e.name}</span>
                  <span className="row-sub">
                    {e.group} · {e.equipment.join(', ')}
                  </span>
                  {e.pending && (
                    <span className="row-badge">
                      <Badge tone="warn">Pendiente de confirmar</Badge>
                    </span>
                  )}
                </span>
                <Icon name="chevron" className="row-chevron" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterSelect(props: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      className={`select${props.value ? ' is-active' : ''}`}
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value="">{props.label}: todos</option>
      {props.options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
