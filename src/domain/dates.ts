const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Fecha local en formato AAAA-MM-DD (no UTC: el día cambia a medianoche en tu zona). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** Lunes de la semana de «d». La semana va de lunes a domingo. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

export function weekdayName(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

export function weekdayNameOf(weekday: number): string {
  return WEEKDAYS[weekday];
}

export function weekdayLetter(d: Date): string {
  return WEEKDAY_LETTERS[d.getDay()];
}

/** «28 de octubre» */
export function dayAndMonth(d: Date): string {
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
