import { useId, useMemo } from 'react';
import { BACK_VIEWBOX, BODY_BACK, BODY_FRONT, FRONT_VIEWBOX } from '../data/bodymap';
import { COSMETIC, drawParts, hasHighlight, muscleLevels, type DrawnPart } from '../domain/musclemap';

function Figure({ parts, viewBox, label }: { parts: DrawnPart[]; viewBox: string; label: string }) {
  // Lo secundario va rayado (no solo más oscuro) para distinguirlo bien en cualquier pantalla.
  const hatch = `bm-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <figure className="bodymap-fig">
      <svg viewBox={viewBox} aria-hidden="true" focusable="false">
        <defs>
          <pattern id={hatch} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="22" height="22" className="bm-hatch-bg" />
            <rect width="9" height="22" className="bm-hatch-fg" />
          </pattern>
        </defs>
        {parts.map((p, i) => (
          <path
            key={`${p.slug}-${i}`}
            d={p.d}
            className={COSMETIC.has(p.slug) ? `bm-${p.slug}` : p.level === 'principal' ? 'bm-primary' : p.level === 'secundario' ? 'bm-secondary' : 'bm-base'}
            fill={p.level === 'secundario' ? `url(#${hatch})` : undefined}
          />
        ))}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/**
 * Mapa de músculos (frente y espalda). Los nombres siguen en el texto: el dibujo es un apoyo visual.
 * Siluetas de MuscleMap (MIT, © Melih Colpan).
 */
export function BodyMap({ primary, secondary, compact }: { primary: string[]; secondary: string[]; compact?: boolean }) {
  const { front, back } = useMemo(() => {
    const levels = muscleLevels(primary, secondary);
    return { front: drawParts(BODY_FRONT, levels), back: drawParts(BODY_BACK, levels) };
  }, [primary, secondary]);
  if (!hasHighlight(front) && !hasHighlight(back)) return null;
  const anySecondary = [...front, ...back].some((p) => p.level === 'secundario');
  return (
    <div className={compact ? 'bodymap bodymap-compact' : 'bodymap'}>
      <div className="bodymap-figs">
        <Figure parts={front} viewBox={FRONT_VIEWBOX} label="Frente" />
        <Figure parts={back} viewBox={BACK_VIEWBOX} label="Espalda" />
      </div>
      <p className="bodymap-legend">
        <span>
          <i className="sw sw-primary" /> Principal
        </span>
        {anySecondary && (
          <span>
            <i className="sw sw-secondary" /> Secundario
          </span>
        )}
      </p>
      {!compact && (
        <p className="hint center credit">
          Dibujo:{' '}
          <a href="https://github.com/melihcolpan/MuscleMap" target="_blank" rel="noopener noreferrer">
            MuscleMap
          </a>{' '}
          © Melih Colpan,{' '}
          <a href={`${import.meta.env.BASE_URL}licencias/musclemap-LICENSE.txt`} target="_blank" rel="noopener noreferrer">
            licencia MIT
          </a>
          . Orientativo: la zona exacta depende de cómo hagas el ejercicio.
        </p>
      )}
    </div>
  );
}
