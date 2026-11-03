// Ilustraciones con licencia abierta verificada, incluidas en la app (no dependen de enlaces externos).
// Solo se asocian cuando muestran el mismo ejercicio y el mismo tipo de equipamiento.
// Fuente: Everkinetic (https://github.com/everkinetic/data), CC BY-SA 4.0.

export interface Illustration {
  /** Id de origen en Everkinetic */
  sourceId: string;
  /** Dos posiciones del movimiento */
  frames: [string, string];
  variant?: string;
  caption?: string;
}

export const EVERKINETIC_CREDIT = {
  name: 'Everkinetic',
  authors: 'Greg Priday y Frank Paczynski',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
  sourceUrl: 'https://github.com/everkinetic/data',
  changes: 'Redimensionadas y reducidas a 16 tonos de gris. Se muestran alternando las dos posiciones del movimiento.',
};

const ek = (sourceId: string, extra: Omit<Illustration, 'sourceId' | 'frames'> = {}): Illustration => ({
  sourceId,
  frames: [`media/everkinetic/${sourceId}-a.png`, `media/everkinetic/${sourceId}-b.png`],
  ...extra,
});

export const ILLUSTRATIONS: Record<string, Illustration[]> = {
  'sentadilla-smith': [ek('0124')],
  'remo-al-menton': [
    ek('0014', { variant: 'Con barra' }),
    ek('0015', { variant: 'En polea' }),
    ek('0016', { variant: 'Con mancuernas' }),
  ],
  'press-banca-barra': [ek('0042')],
  'press-inclinado-mancuernas': [ek('0061')],
  'press-pecho-maquina': [ek('0066', { caption: 'El diseño de la máquina cambia según la marca; el movimiento es el mismo.' })],
  'remo-sentado-polea': [ek('0025')],
  'jalon-al-pecho': [
    ek('0096', {
      variant: 'Agarre neutro',
      caption: 'Muestra el agarre neutro (barra en V). Con agarre abierto, el recorrido es el mismo.',
    }),
  ],
  'elevaciones-laterales': [ek('0018')],
  'vuelos-posteriores': [ek('0032', { variant: 'Con la frente apoyada en banco inclinado' })],
  'triceps-polea-barra': [ek('0205')],
  'curl-femoral-sentado': [ek('0119')],
  'extension-cuadriceps': [ek('0142')],
  'gemelos-sentado': [ek('0279')],
  'gemelos-pie': [ek('0282')],
  'curl-biceps-inclinado': [ek('0214', { caption: 'En la ilustración se alternan los brazos.' })],
  'curl-biceps-mancuernas': [ek('0224')],
  flexiones: [ek('0077')],
  'abdominales-banco-inclinado': [ek('0292', { caption: 'Banco declinado: cabeza más baja que la cadera.' })],
};

export function illustrationsFor(exerciseId: string): Illustration[] {
  return ILLUSTRATIONS[exerciseId] ?? [];
}
