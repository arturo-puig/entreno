import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/exercises';
import { HISTORY } from '../data/history';
import { ROUTINES, WEEK_PLAN } from '../data/routines';
import { respond, type AssistantContext, type Reply } from './engine';
import type { IntentId } from './intents';

// Banco de DESARROLLO (escrito por quien programa el asistente): sirve para no romper lo que anda.
// La medición independiente necesita frases escritas por el usuario sin ver este código.

const ctx = (extra: Partial<AssistantContext> = {}): AssistantContext => ({
  now: new Date(2026, 10, 3, 8, 0), // martes 3/11/2026 → Tren superior
  exercises: EXERCISES,
  routines: ROUTINES,
  weekPlan: WEEK_PLAN,
  sessions: HISTORY,
  metrics: [],
  ownMedia: new Set(),
  ...extra,
});

type Check = (r: Reply) => boolean;
const ex = (id: string): Check => (r) => r.exerciseId === id || (r.entities.exercises as string[]).includes(id);
const asks: Check = (r) => !r.confirm && !!r.chips?.length;
const confirms: Check = (r) => !!r.confirm;
const textHas = (s: string): Check => (r) => [r.text, ...(r.lines ?? [])].join(' ').includes(s);

const BANK: [string, IntentId, ...Check[]][] = [
  // Qué toca
  ['¿Qué toca hoy?', 'que-toca', textHas('Tren superior')],
  ['que me toca', 'que-toca'],
  ['qué entreno hoy', 'que-toca'],
  ['que hago hoy en el gym', 'que-toca'],
  ['y mañana qué toca?', 'que-toca', textHas('Cardio y movilidad')],
  ['qué tengo el sábado', 'que-toca', textHas('Rutina B')],
  ['rutina de hoy', 'que-toca'],
  ['que toca el viernes', 'que-toca', textHas('Pádel')],
  // Semana
  ['qué tengo esta semana', 'semana'],
  ['mostrame la semana', 'semana'],
  ['plan de la semana', 'semana'],
  // Cómo se hace
  ['¿Cómo se hace el pallof?', 'como-se-hace', ex('pallof-press')],
  ['como hago el dead bug', 'como-se-hace', ex('dead-bug')],
  ['técnica de sentadilla búlgara', 'como-se-hace', ex('sentadilla-bulgara')],
  ['explicame el remo al menton', 'como-se-hace', ex('remo-al-menton')],
  ['como es la plancha lateral', 'como-se-hace', ex('plancha-lateral-rotacion')],
  ['que musculos trabaja el hip thrust', 'como-se-hace', ex('hip-thrust-maquina')],
  ['errores frecuentes en sentadilla smith', 'como-se-hace', ex('sentadilla-smith'), textHas('Errores frecuentes')],
  ['video de vuelos posteriores', 'como-se-hace', ex('vuelos-posteriores')],
  ['como se hacen los gemelos sentado', 'como-se-hace', ex('gemelos-sentado')],
  ['cómo se hace el bicho muerto', 'como-se-hace', ex('dead-bug')],
  ['como hago la movilidad de tobillo', 'como-se-hace', ex('movilidad-tobillo')],
  ['como se hace el curl femoral', 'como-se-hace', ex('curl-femoral-sentado')],
  ['como se hace el press', 'como-se-hace', ex('press-inclinado-mancuernas')], // martes: el de la rutina de hoy
  ['como se hace el sillon', 'como-se-hace', ex('extension-cuadriceps')],
  ['cómo se hace la remada alta', 'como-se-hace'],
  ['mostrame el jalón', 'como-se-hace', ex('jalon-al-pecho')],
  ['como se hace el biceps a 45', 'como-se-hace', ex('curl-biceps-inclinado')],
  // La última vez
  ['¿Qué hice la última vez en jalón?', 'ultima-vez', ex('jalon-al-pecho'), textHas('45 kg × 12')],
  ['cuanto levante en sentadilla smith', 'ultima-vez', ex('sentadilla-smith')],
  ['con cuanto hice remo en polea', 'ultima-vez', ex('remo-sentado-polea')],
  ['que peso use en press inclinado', 'ultima-vez', ex('press-inclinado-mancuernas')],
  ['la vez pasada en hip thrust', 'ultima-vez', ex('hip-thrust-maquina')],
  ['cuánto puse en extensión de cuádriceps', 'ultima-vez', ex('extension-cuadriceps'), textHas('50 kg')],
  // Mejor marca
  ['mi mejor marca en jalon', 'mejor-marca', ex('jalon-al-pecho'), textHas('60 kg × 6')],
  ['record en remo en polea', 'mejor-marca', ex('remo-sentado-polea')],
  ['cuál es mi máximo en curl de biceps con mancuernas', 'mejor-marca', ex('curl-biceps-mancuernas')],
  // Poco tiempo
  ['tengo poco tiempo', 'poco-tiempo', confirms],
  ['tengo 20 minutos', 'poco-tiempo', confirms],
  ['solo tengo media hora', 'poco-tiempo'],
  ['estoy apurado hoy', 'poco-tiempo'],
  ['no tengo tiempo', 'poco-tiempo'],
  ['quiero la version corta', 'poco-tiempo'],
  ['tengo una hora', 'poco-tiempo', textHas('completa')],
  ['tengo 10 minutos', 'poco-tiempo', textHas('liviano')],
  // Cómo llegás
  ['estoy cansado', 'estado', confirms],
  ['me siento re bien', 'estado'],
  ['dormí mal', 'estado'],
  ['estoy reventado', 'estado', textHas('liviano')],
  ['hoy no doy más', 'estado'],
  ['llego medio flojo', 'estado'],
  ['cansado', 'estado'],
  // Cambiar la rutina de hoy
  ['hoy quiero hacer la rutina B', 'cambiar-rutina', confirms, (r) => r.entities.routine === 'rutina-b'],
  ['prefiero hacer tren superior', 'cambiar-rutina'],
  ['cambiame a la del sábado', 'cambiar-rutina', (r) => r.entities.routine === 'rutina-b'],
  ['en vez de esto quiero hacer cardio', 'cambiar-rutina', (r) => r.entities.routine === 'cardio-movilidad'],
  ['quiero hacer otra rutina', 'cambiar-rutina', asks],
  // Empezar
  ['empezar', 'empezar'],
  ['arrancamos', 'empezar'],
  ['iniciar la sesión', 'empezar'],
  ['dale, vamos', 'empezar'],
  // Anotar actividad
  ['anotá pádel 90 minutos', 'registrar-actividad', confirms, textHas('90 min')],
  ['hoy jugué al pádel una hora', 'registrar-actividad', textHas('60 min')],
  ['hice 15 km de bici', 'registrar-actividad', textHas('15 km')],
  ['ayer caminé 40 minutos', 'registrar-actividad', textHas('ayer')],
  ['salí a correr 5 km', 'registrar-actividad', textHas('Trote')],
  ['registrá una caminata', 'registrar-actividad', confirms],
  ['fui en bici al gimnasio 20 min', 'registrar-actividad', textHas('Bici')],
  ['anotá 3x10 de flexiones', 'registrar-actividad', textHas('sesión')],
  // Anotar peso
  ['peso 82,5', 'registrar-peso', confirms, textHas('82,5 kg')],
  ['hoy pesé 83 kilos', 'registrar-peso', textHas('83 kg')],
  ['anotá mi peso: 81.9', 'registrar-peso', textHas('81,9')],
  ['cintura 94', 'registrar-peso', textHas('94 cm')],
  ['me pesé y di 82', 'registrar-peso', textHas('82 kg')],
  ['peso 8250', 'registrar-peso', textHas('error')],
  // Constancia
  ['cuantas veces entrené esta semana', 'constancia'],
  ['cómo vengo?', 'constancia'],
  ['cuántos entrenamientos hice este mes', 'constancia'],
  ['fui al gimnasio esta semana?', 'constancia'],
  // Pendientes
  ['qué le tengo que preguntar al profe', 'pendientes'],
  ['pendientes', 'pendientes'],
  ['tengo dudas para consultar', 'pendientes'],
  // Ayuda
  ['hola', 'ayuda'],
  ['qué podés hacer?', 'ayuda'],
  ['como funciona esto', 'ayuda'],
  // Fuera de alcance: salud, calorías, comidas
  ['me duele la rodilla en la sentadilla', 'salud'],
  ['tengo una contractura', 'salud'],
  ['siento un pinchazo en el hombro', 'salud'],
  ['cuántas calorías quemé hoy', 'calorias'],
  ['cuánta grasa corporal tengo', 'calorias'],
  ['qué como antes de entrenar', 'comidas'],
  ['cuánta proteína tengo que comer', 'comidas'],
  // Ambiguos o desconocidos: pregunta en vez de adivinar
  ['pallof', 'como-se-hace', asks, textHas('¿Qué querés saber de Pallof press?')],
  ['cómo se hace', 'como-se-hace', asks],
  ['cuanto levante en la maquina de gluteos', 'ultima-vez', asks, textHas('maquina gluteos')],
  ['asdf qwerty', 'no-entendi', asks],
];

describe('asistente: banco de desarrollo', () => {
  const results = BANK.map(([phrase, intent, ...checks]) => {
    const r = respond(phrase, ctx());
    const ok = r.intent === intent && checks.every((c) => c(r));
    return { phrase, expected: intent, got: r.intent, ok, text: r.text };
  });
  const passed = results.filter((x) => x.ok).length;

  it(`acierta ${passed} de ${results.length} frases`, () => {
    const failed = results.filter((x) => !x.ok).map((x) => `«${x.phrase}» → ${x.got} (esperado ${x.expected}): ${x.text}`);
    expect(failed, failed.join('\n')).toEqual([]);
  });
});

describe('asistente: conversación y confirmaciones', () => {
  it('recuerda el último ejercicio («¿y la última vez?»)', () => {
    const r = respond('y la última vez?', ctx({ lastExerciseId: 'remo-sentado-polea' }));
    expect(r.intent).toBe('ultima-vez');
    expect(r.exerciseId).toBe('remo-sentado-polea');
  });

  it('elegir un ejercicio desconocido ofrece recordarlo con ese nombre', () => {
    const first = respond('cuanto levante en la maquina de gluteos', ctx());
    const pick = first.chips!.find((c) => c.action.type === 'force')!.action;
    expect(pick.type).toBe('force');
    if (pick.type !== 'force') return;
    const second = respond(pick.text, ctx(), { intent: pick.intent, exerciseId: 'jalon-al-pecho', teach: pick.teach });
    const teach = second.chips!.find((c) => c.action.type === 'add-alias');
    expect(teach?.label).toBe('Recordar «maquina gluteos» = Jalón al pecho');
  });

  it('anotar: nunca guarda sin confirmación y el dato sale de la frase', () => {
    const r = respond('anotá pádel 90 minutos', ctx());
    expect(r.confirm?.action).toMatchObject({ type: 'log-activity', params: { exerciseId: 'padel', minutes: 90, date: '2026-11-03' } });
  });

  it('cambiar la rutina de hoy no toca la semana planificada', () => {
    const r = respond('hoy quiero hacer la rutina B', ctx());
    expect(r.confirm?.action).toMatchObject({ type: 'set-day', patch: { routineId: 'rutina-b' } });
  });

  it('el empate entre dos intenciones se pregunta', () => {
    const r = respond('semana constancia', ctx());
    expect(r.chips?.length).toBeGreaterThan(0);
  });
});
