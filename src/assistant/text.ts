// Normalización y extracción de datos de una frase. Todo local, sin modelos.

/** Minúsculas, sin tildes, sin signos; «82,5» queda como «82.5». */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[¿?¡!.,;:()"'«»]/g, (m) => (m === '.' ? '.' : ' '))
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'a', 'al', 'y', 'o', 'un', 'una', 'que', 'q', 'me', 'mi', 'por', 'para',
  'lo', 'le', 'se', 'es', 'hoy', 'tu', 'te', 'cual', 'como', 'hice', 'hago', 'tengo', 'vez', 'ultima', 'esta',
]);

export function tokens(norm: string): string[] {
  return norm.split(' ').filter(Boolean);
}

/** Raíz simple: «elevaciones» ≈ «elevacion», «gemelos» ≈ «gemelo». */
export function stem(t: string): string {
  if (t.length > 5 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

export interface NumberEntity {
  value: number;
  unit?: 'kg' | 'min' | 'km' | 'cm' | 'reps' | 'h';
}

const UNIT_ALIASES: [RegExp, NumberEntity['unit']][] = [
  [/^(kg|kgs|kilo|kilos)$/, 'kg'],
  [/^(min|mins|minuto|minutos|m)$/, 'min'],
  [/^(h|hs|hora|horas)$/, 'h'],
  [/^(km|kms|kilometro|kilometros)$/, 'km'],
  [/^(cm|centimetro|centimetros)$/, 'cm'],
  [/^(rep|reps|repeticion|repeticiones)$/, 'reps'],
];

export function numbers(norm: string): NumberEntity[] {
  const out: NumberEntity[] = [];
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const unit = m[2] ? UNIT_ALIASES.find(([r]) => r.test(m![2]))?.[1] : undefined;
    out.push({ value: Number(m[1]), unit });
  }
  // «una hora», «media hora»
  if (/\bmedia hora\b/.test(norm)) out.push({ value: 30, unit: 'min' });
  else if (/\buna hora\b/.test(norm)) out.push({ value: 60, unit: 'min' });
  return out.map((n) => (n.unit === 'h' ? { value: n.value * 60, unit: 'min' } : n));
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** «hoy», «mañana», «ayer», «el sábado» → fecha. Sin mención → undefined. */
export function dateMention(norm: string, today: Date): { date: Date; word: string } | undefined {
  const d = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  if (/\bpasado manana\b/.test(norm)) return { date: d(2), word: 'pasado mañana' };
  if (/\bmanana\b/.test(norm) && !/\bpor la manana\b|\bde manana\b|\ba la manana\b/.test(norm)) return { date: d(1), word: 'mañana' };
  if (/\bayer\b/.test(norm)) return { date: d(-1), word: 'ayer' };
  if (/\bhoy\b/.test(norm)) return { date: d(0), word: 'hoy' };
  const idx = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(norm));
  if (idx >= 0) {
    const diff = (idx - today.getDay() + 7) % 7;
    return { date: d(diff), word: `el ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][idx]}` };
  }
  return undefined;
}
