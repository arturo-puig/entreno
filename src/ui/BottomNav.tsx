import { Icon, type IconName } from './Icon';
import { switchTab } from '../router';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'hoy', label: 'Hoy', icon: 'today' },
  { id: 'rutinas', label: 'Rutinas', icon: 'routines' },
  { id: 'ejercicios', label: 'Ejercicios', icon: 'exercises' },
  { id: 'progreso', label: 'Progreso', icon: 'progress' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="nav" aria-label="Secciones">
      <div className="nav-inner">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#/${t.id}`}
            aria-current={active === t.id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              switchTab(`/${t.id}`);
            }}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
