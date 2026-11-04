import { useEffect } from 'react';

/** Festejo simple al terminar: tilde que se dibuja, unos puntos que se abren y el resumen. */
export function Celebration(props: { title: string; subtitle: string; highlights?: string[]; onClose: () => void; compact?: boolean }) {
  const { compact, onClose } = props;

  useEffect(() => {
    navigator.vibrate?.(compact ? 60 : [80, 60, 120]);
    if (!compact) return;
    const t = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(t);
  }, [compact, onClose]);

  return (
    <div className={`celebrate-layer${compact ? ' is-compact' : ''}`}>
      <div className="celebrate" role={compact ? 'status' : 'dialog'} aria-modal={compact ? undefined : true} aria-label={props.title} onClick={compact ? onClose : undefined}>
        <div className="celebrate-mark" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="burst" style={{ ['--a' as string]: `${i * 36}deg` }} />
          ))}
          <svg viewBox="0 0 64 64" width={compact ? 44 : 88} height={compact ? 44 : 88}>
            <circle cx="32" cy="32" r="28" className="celebrate-circle" />
            <path d="M20 33l8 8 16-17" className="celebrate-check" />
          </svg>
        </div>
        <p className="celebrate-title">{props.title}</p>
        <p className="celebrate-sub">{props.subtitle}</p>
        {!compact && props.highlights && props.highlights.length > 0 && (
          <ul className="celebrate-list">
            {props.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        {!compact && (
          <button className="btn btn-primary btn-xl" onClick={onClose} autoFocus>
            Listo
          </button>
        )}
      </div>
    </div>
  );
}
