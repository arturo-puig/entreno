import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { goBack } from '../router';
import type { Routine } from '../db/types';

export function ScreenHeader({ title, eyebrow, back }: { title: string; eyebrow?: string; back?: string }) {
  return (
    <header className="screen-header">
      {back && (
        <button className="icon-btn back-btn" onClick={() => goBack(back)} aria-label="Volver">
          <Icon name="back" />
        </button>
      )}
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
    </header>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      Cargando…
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function NotFound({ what, back }: { what: string; back: string }) {
  return (
    <>
      <ScreenHeader title="No encontrado" back={back} />
      <EmptyState icon="alert" title={`No existe ${what}.`}>
        Puede que se haya borrado o que el enlace esté incompleto.
      </EmptyState>
    </>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'warn' | 'accent'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PendingNote({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-warn">
      <Icon name="alert" size={18} />
      <div>
        <strong>Pendiente de confirmar</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  // Muestra el cambio al instante; el valor guardado lo confirma enseguida.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [checked]);
  const value = optimistic ?? checked;

  return (
    <label className={`switch-row${disabled ? ' is-disabled' : ''}`}>
      <span className="switch-text">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={value}
        disabled={disabled}
        onChange={(e) => {
          setOptimistic(e.target.checked);
          onChange(e.target.checked);
        }}
      />
    </label>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function originLabel(r: Routine): string {
  if (r.origin === 'profesor') return 'De tu profe';
  if (r.origin === 'complementaria') return 'Complementaria';
  return 'Personal';
}
