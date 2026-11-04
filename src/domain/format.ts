import type { LoggedSet, PlannedSet, RoutineItem } from '../db/types';
import { setsForMode, type Mode } from './plan';

const kgFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export function formatKg(kg: number): string {
  return `${kgFormat.format(kg)} kg`;
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function formatRest(sec: number): string {
  return sec <= 120 ? `${sec} s` : formatDuration(sec);
}

function repsLabel(s: PlannedSet): string | null {
  if (s.reps !== undefined) return String(s.reps);
  if (s.repsMin !== undefined && s.repsMax !== undefined) return `${s.repsMin}–${s.repsMax}`;
  return null;
}

function durationLabel(s: PlannedSet): string | null {
  if (!s.durationSec) return null;
  if (s.durationMaxSec) return `${s.durationSec / 60}–${s.durationMaxSec / 60} min`;
  return formatDuration(s.durationSec);
}

/** Resumen legible de las series planificadas: «3 × 8–12», «12 · 10 · 8 · 6», «3 × 1 min». */
export function summarizeSets(item: RoutineItem, mode: Mode = 'completa'): string {
  const sets = setsForMode(item, mode);
  const suffix = item.perSide ? ' por lado' : '';
  if (sets.length === 0) return 'Sin series';

  const durations = sets.map(durationLabel);
  if (durations.every((d) => d !== null)) {
    if (sets.length === 1) return `${durations[0]}${suffix}`;
    if (new Set(durations).size === 1) return `${sets.length} × ${durations[0]}${suffix}`;
    return `${durations.join(' · ')}${suffix}`;
  }

  const labels = sets.map(repsLabel);
  if (labels.every((l) => l === null)) {
    return `${sets.length} series · repeticiones a confirmar`;
  }
  const required = sets.filter((s) => !s.optional).length;
  const count = required === sets.length ? `${sets.length}` : `${required}–${sets.length}`;
  if (new Set(labels).size === 1) return `${count} × ${labels[0]}${suffix}`;
  return `${labels.map((l) => l ?? '?').join(' · ')}${suffix}`;
}

export function formatLoggedSet(s: LoggedSet): string {
  const parts: string[] = [];
  if (s.weightKg !== undefined && s.reps !== undefined) parts.push(`${formatKg(s.weightKg)} × ${s.reps}`);
  else if (s.reps !== undefined) parts.push(`${s.reps} reps`);
  else if (s.weightKg !== undefined) parts.push(formatKg(s.weightKg));
  if (s.durationSec !== undefined) parts.push(formatDuration(s.durationSec));
  if (s.distanceKm !== undefined) parts.push(`${kgFormat.format(s.distanceKm)} km`);
  if (s.speedKmh !== undefined) parts.push(`${kgFormat.format(s.speedKmh)} km/h`);
  if (s.inclinePct !== undefined) parts.push(`${kgFormat.format(s.inclinePct)} %`);
  return parts.join(' · ') || '—';
}
