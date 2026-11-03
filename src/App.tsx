import { Component, useEffect, type ReactNode } from 'react';
import { useRoute } from './router';
import { BottomNav } from './ui/BottomNav';
import { Today } from './screens/Today';
import { Routines } from './screens/Routines';
import { RoutineDetail } from './screens/RoutineDetail';
import { Exercises } from './screens/Exercises';
import { ExerciseDetail } from './screens/ExerciseDetail';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { RoutineEditor } from './screens/RoutineEditor';
import { ExerciseEditor } from './screens/ExerciseEditor';
import { SessionScreen } from './screens/Session';

const TABS = ['hoy', 'rutinas', 'ejercicios', 'progreso', 'ajustes', 'sesion'];

export function App() {
  const route = useRoute();
  const tab = TABS.includes(route[0]) ? route[0] : 'hoy';
  const detail = route[1];
  const action = route[2];
  const key = route.join('/');
  // Los editores ocupan toda la pantalla: sin barra de navegación para no perder cambios por un toque.
  const isEditor = action === 'editar' || (tab === 'ejercicios' && detail === 'nuevo');
  const isSession = tab === 'sesion' && !!detail;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  return (
    <div className="app">
      <main className={`screen${isEditor ? ' is-editor' : ''}${isSession ? ' is-session' : ''}`}>
        <ErrorBoundary key={isSession ? 'sesion' : key}>{renderScreen(tab, detail, action)}</ErrorBoundary>
      </main>
      {!isEditor && !isSession && <BottomNav active={tab} />}
    </div>
  );
}

function renderScreen(tab: string, detail?: string, action?: string) {
  switch (tab) {
    case 'rutinas':
      if (detail && action === 'editar') return <RoutineEditor id={detail} />;
      return detail ? <RoutineDetail id={detail} /> : <Routines />;
    case 'ejercicios':
      if (detail === 'nuevo') return <ExerciseEditor />;
      if (detail && action === 'editar') return <ExerciseEditor id={detail} />;
      return detail ? <ExerciseDetail id={detail} /> : <Exercises />;
    case 'progreso':
      return <Progress />;
    case 'ajustes':
      return <Settings />;
    case 'sesion':
      return detail ? <SessionScreen id={detail} /> : <Today />;
    default:
      return <Today />;
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <p className="empty-title">Algo falló al mostrar esta pantalla.</p>
        <p className="empty-text">Tus datos no se tocaron. Probá volver atrás o recargar la app.</p>
        <p className="hint">{this.state.error.message}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}
