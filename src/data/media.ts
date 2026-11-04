// Imágenes con licencia abierta verificada, incluidas en la app (no dependen de enlaces externos).
// Solo se asocian cuando muestran el mismo ejercicio y el mismo tipo de equipamiento (revisadas una por una).
// Fuentes:
// - Everkinetic (https://github.com/everkinetic/data), CC BY-SA 4.0: dibujos de dos posiciones.
// - Ejército de EE.UU., ATP 7-22.02 «Holistic Health and Fitness Drills and Exercises» (2020, cambio 1 de 2025):
//   fotos producidas por el propio Ejército, obra del gobierno federal de EE.UU. → dominio público.
//   «Approved for public release; distribution unlimited». Se recortaron de las secuencias del manual.
// - Wikimedia Commons: archivos sueltos, cada uno con su autor y licencia (van en `credit`).
// - IA: dibujos que el usuario generó con ChatGPT o Gemini a partir de un pedido preciso. Se revisan a ojo
//   uno por uno y se muestran siempre rotulados como «Generada con IA» y orientativos (nunca como demostración).

export type MediaSource = 'everkinetic' | 'ejercito' | 'commons' | 'ia';

export interface Illustration {
  /** Identificador único (archivo de origen) */
  sourceId: string;
  source: MediaSource;
  /** dibujo = dos posiciones dibujadas; fotos = secuencia de fotos reales del movimiento */
  kind: 'dibujo' | 'fotos';
  /** Cuadros del movimiento, en orden */
  frames: string[];
  /** Cuánto se muestra cada cuadro al animar */
  frameMs: number;
  variant?: string;
  caption?: string;
  /** Una sola imagen con las dos posiciones (se muestra fija): una al lado de la otra o una arriba de la otra. */
  layout?: 'lado-a-lado' | 'apiladas';
  /** Crédito propio del archivo (Commons); si no, el de la fuente. */
  credit?: MediaCredit;
}

export interface MediaCredit {
  name: string;
  authors: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
  changes: string;
  note?: string;
}

export const CREDITS: Record<MediaSource, MediaCredit> = {
  everkinetic: {
    name: 'Everkinetic',
    authors: 'Greg Priday y Frank Paczynski',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    sourceUrl: 'https://github.com/everkinetic/data',
    changes: 'Redimensionadas y reducidas a 16 tonos de gris. Se muestran alternando las dos posiciones del movimiento.',
  },
  ejercito: {
    name: 'Ejército de EE.UU. (ATP 7-22.02)',
    authors: 'U.S. Army Center for Initial Military Training',
    license: 'Dominio público',
    licenseUrl: 'https://www.copyright.gov/title17/92chap1.html#105',
    sourceUrl: 'https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1020967',
    changes: 'Cuadros recortados de la secuencia de fotos del manual y alineados para mostrarlos en movimiento.',
    note: 'Su uso no implica respaldo del Ejército de EE.UU.',
  },
  commons: {
    name: 'Wikimedia Commons',
    authors: 'varios autores',
    license: 'según el archivo',
    licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing/es',
    sourceUrl: 'https://commons.wikimedia.org/',
    changes: '',
  },
  ia: {
    name: 'Generada con IA',
    authors: 'a pedido del usuario, con ChatGPT o Gemini',
    license: 'Uso personal',
    changes: 'Paneles separados (o juntados) y alineados; fondo limpiado y pasado a grises.',
    note: 'Revisada a ojo; es orientativa, no una demostración.',
  },
};

export const creditFor = (ill: Illustration): MediaCredit => ill.credit ?? CREDITS[ill.source];

/** @deprecated usar CREDITS.everkinetic */
export const EVERKINETIC_CREDIT = CREDITS.everkinetic;

const ek = (sourceId: string, extra: Partial<Pick<Illustration, 'variant' | 'caption'>> = {}): Illustration => ({
  sourceId,
  source: 'everkinetic',
  kind: 'dibujo',
  frames: [`media/everkinetic/${sourceId}-a.png`, `media/everkinetic/${sourceId}-b.png`],
  frameMs: 1300,
  ...extra,
});

/** Secuencia de fotos del manual del Ejército: `atp-<figura>-<n>.jpg`. */
const army = (figure: string, count: number, extra: Partial<Pick<Illustration, 'variant' | 'caption' | 'frameMs'>> = {}): Illustration => ({
  sourceId: `atp-${figure}`,
  source: 'ejercito',
  kind: 'fotos',
  frames: Array.from({ length: count }, (_, i) => `media/ejercito/atp-${figure}-${i + 1}.jpg`),
  frameMs: 420,
  ...extra,
});

/** Dibujo generado con IA (archivos en `media/ia/`, detalle en su LEEME). */
const ia = (
  sourceId: string,
  frames: string[],
  extra: Partial<Pick<Illustration, 'variant' | 'caption' | 'layout'>> = {},
): Illustration => ({
  sourceId: `ia-${sourceId}`,
  source: 'ia',
  kind: 'dibujo',
  frames: frames.map((f) => `media/ia/${f}`),
  frameMs: 1300,
  ...extra,
});

// En cada ejercicio, primero las fotos reales (si hay), después los dibujos con licencia y al final los de IA.
export const ILLUSTRATIONS: Record<string, Illustration[]> = {
  'sentadilla-smith': [ek('0124')],
  'remo-al-menton': [
    army('14-15', 8, { variant: 'Con barra' }),
    ek('0014', { variant: 'Con barra' }),
    ek('0015', { variant: 'En polea' }),
    ek('0016', { variant: 'Con mancuernas' }),
  ],
  'press-banca-barra': [army('14-6', 7), ek('0042')],
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
  'plancha-frontal': [
    {
      sourceId: 'commons-plank-exercise',
      source: 'commons',
      kind: 'dibujo',
      frames: ['media/commons/plank-exercise.svg'],
      frameMs: 0,
      caption: 'Posición que se sostiene: antebrazos apoyados, codos debajo de los hombros y el cuerpo en línea.',
      credit: {
        name: 'Plank exercise.svg',
        authors: 'Pk0001, Wikimedia Commons',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Plank_exercise.svg',
        changes: 'Sin cambios.',
      },
    },
  ],
  'movilidad-tobillo': [army('17-7', 8, { frameMs: 480, caption: 'La rodilla de adelante avanza sobre el pie sin despegar el talón. Hacelo con las dos piernas.' })],
  'peso-muerto-unilateral': [
    army('5-17', 11, {
      frameMs: 380,
      caption: 'Sin carga. Con mancuerna(s) o barra el movimiento es el mismo: la carga se mantiene cerca del cuerpo.',
    }),
  ],
  'pallof-press': [
    ia('pallof-press', ['pallof-press-a.png', 'pallof-press-b.png'], {
      variant: 'En polea',
      caption: 'Con banda elástica es igual: atala a la altura del pecho, a un costado. Hacelo de los dos lados.',
    }),
  ],
  'hip-thrust-maquina': [
    ia('hip-thrust-maquina', ['hip-thrust-maquina-a.jpg', 'hip-thrust-maquina-b.jpg'], {
      caption:
        'La máquina de tu gimnasio puede ser distinta; el movimiento es el mismo: espalda alta en el respaldo, barra sobre la cadera y, arriba, tronco y muslos en línea con las canillas verticales.',
    }),
  ],
  'rueda-abdominal': [
    ia('rueda-abdominal', ['rueda-abdominal.png'], {
      layout: 'apiladas',
      caption: 'Arriba: inicio, la rueda debajo de los hombros. Abajo: hasta donde llegues sin que la zona lumbar se hunda.',
    }),
  ],
  'sentadilla-isometrica': [
    ia('sentadilla-isometrica', ['sentadilla-isometrica-pared.png'], {
      variant: 'Contra la pared',
      caption: 'Posición que se sostiene: espalda apoyada en la pared, muslos cerca de la horizontal y rodillas sobre los tobillos. Las manos descansan sin empujar los muslos.',
    }),
  ],
  'sentadilla-bulgara': [
    ia('sentadilla-bulgara', ['sentadilla-bulgara.png'], {
      layout: 'lado-a-lado',
      caption: 'Izquierda: arriba. Derecha: abajo, con la rodilla de atrás cerca del piso sin tocarlo. Muestra dos mancuernas; el pie de adelante no se mueve durante la serie.',
    }),
  ],
};

export function illustrationsFor(exerciseId: string): Illustration[] {
  return ILLUSTRATIONS[exerciseId] ?? [];
}
