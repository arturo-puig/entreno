import type { Readiness } from '../db/types';

export const READINESS_OPTIONS: { id: Readiness; label: string }[] = [
  { id: 'bien', label: 'Me siento bien' },
  { id: 'cansado', label: 'Algo cansado' },
  { id: 'muy-fatigado', label: 'Muy fatigado' },
];

export interface Advice {
  text: string;
  offerShort: boolean;
  offerLight: boolean;
}

// Recomendaciones prudentes. No diagnostican ni cambian nada por su cuenta:
// solo ofrecen opciones que vos elegís.
export function readinessAdvice(r: Readiness): Advice {
  switch (r) {
    case 'bien':
      return { text: 'Hacé la sesión como está planificada.', offerShort: false, offerLight: false };
    case 'cansado':
      return {
        text: 'Podés hacer la sesión completa sin buscar récords: repetí las cargas de la última vez. Si no te alcanza la energía o el tiempo, usá la versión corta.',
        offerShort: true,
        offerLight: false,
      };
    case 'muy-fatigado':
      return {
        text: 'Hoy conviene algo liviano: la versión corta con cargas cómodas, o caminata o bici suave con movilidad. Si la fatiga se repite varios días o aparece dolor, consultá con un profesional.',
        offerShort: true,
        offerLight: true,
      };
  }
}
