import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** La cara del asistente: la misma en Hoy, en la sesión y en el chat. */
export function Avatar({ size = 36 }: { size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      <Icon name="spark" size={Math.round(size * 0.55)} />
    </span>
  );
}

/** Mensaje del asistente. Cambia con una transición suave cuando cambia el texto. */
export function CoachBubble({ text, sub, children }: { text: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="coach" role="status" aria-live="polite">
      <Avatar />
      <div className="coach-body" key={text}>
        <p className="coach-text">{text}</p>
        {sub && <p className="coach-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
