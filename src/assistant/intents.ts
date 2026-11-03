// Intenciones y reglas. Cada regla suma puntos; gana la de más puntos.
// Si dos quedan muy parejas, el asistente pregunta en lugar de adivinar.

export type IntentId =
  | 'que-toca'
  | 'semana'
  | 'como-se-hace'
  | 'ultima-vez'
  | 'mejor-marca'
  | 'poco-tiempo'
  | 'estado'
  | 'cambiar-rutina'
  | 'empezar'
  | 'registrar-actividad'
  | 'registrar-peso'
  | 'constancia'
  | 'pendientes'
  | 'ayuda'
  | 'salud'
  | 'calorias'
  | 'comidas'
  | 'no-entendi';

export const INTENT_LABEL: Record<IntentId, string> = {
  'que-toca': 'Qué toca',
  semana: 'Tu semana',
  'como-se-hace': 'Cómo se hace',
  'ultima-vez': 'La última vez',
  'mejor-marca': 'Mejor marca',
  'poco-tiempo': 'Poco tiempo',
  estado: 'Cómo llegás',
  'cambiar-rutina': 'Cambiar la rutina de hoy',
  empezar: 'Empezar',
  'registrar-actividad': 'Anotar actividad',
  'registrar-peso': 'Anotar peso',
  constancia: 'Constancia',
  pendientes: 'Pendientes',
  ayuda: 'Ayuda',
  salud: 'Dolor o molestia',
  calorias: 'Calorías',
  comidas: 'Comidas',
  'no-entendi': 'No entendí',
};

type Rule = [RegExp, number];

export const RULES: Record<Exclude<IntentId, 'no-entendi'>, Rule[]> = {
  'que-toca': [
    [/\b(que|q) (me )?(toca|tengo|hago|entreno|hay)\b/, 3],
    [/\btoca\b/, 2],
    [/\brutina (de|para) (hoy|manana|el)\b/, 2],
    [/\b(que|q) (hago|entreno) (hoy|manana)\b/, 1],
    [/\b(hoy|manana)\b.*\b(entreno|toca|gimnasio|gym)\b/, 1],
  ],
  semana: [
    [/\bsemana\b/, 1.5],
    [/\b(mostrame|ver|dame|decime) (la|mi) semana\b/, 3],
    [/\b(plan|planificad[oa]|rutinas) (de|para) (la|esta) semana\b/, 2],
    [/\bque (tengo|toca|hago) (esta|en la) semana\b/, 3],
  ],
  'como-se-hace': [
    [/\bcomo (se )?(hace|hacen|hago|hacer|es|ejecuta)\b/, 3],
    [/\btecnica\b/, 3],
    [/\b(explica|explicame|mostrame|ensename|video|ilustracion|imagen)\b/, 2.5],
    [/\bque musculos?\b/, 2],
    [/\berror(es)?\b/, 2.5],
  ],
  'ultima-vez': [
    [/\b(ultima vez|vez pasada|la anterior|anteriormente)\b/, 3],
    [/\bcuanto (levante|hice|puse|use|cargue|meti)\b/, 3],
    [/\b(que|cuanto) peso (use|puse|levante|hice)\b/, 3],
    [/\bcon cuanto\b/, 2.5],
    [/\b(historial|registro)\b/, 1],
  ],
  'mejor-marca': [
    [/\b(mejor marca|record|maximo|maxima|lo mas pesado|mi mejor|pr)\b/, 3],
    [/\bmas (pesado|kilos|peso) (que|en)\b/, 2],
  ],
  'poco-tiempo': [
    [/\bpoco tiempo\b/, 3],
    [/\btengo (solo |solamente |nada mas )?\d+ ?(min|minutos|m)\b/, 3],
    [/\b(apurad[oa]|rapid[oa]|corta|version corta|express)\b/, 2],
    [/\bno me da el tiempo\b|\bno tengo tiempo\b/, 3],
    [/\btengo (media hora|una hora)\b/, 3],
  ],
  estado: [
    [/\b(estoy|me siento|ando|vengo|llego) (muy |algo |medio |re |bastante )?(cansad|fatigad|bien|reventad|destruid|muert|agotad|fundid|joya|barbaro|flojo|bajonead|con energia|con pila)/, 3],
    [/\bdormi (mal|poco)\b/, 3],
    [/\b(sin energia|no doy mas|hecho pelota)\b/, 3],
  ],
  'cambiar-rutina': [
    [/\b(quiero|prefiero|voy a|vamos a|podria) hacer\b/, 2],
    [/\b(cambia|cambiar|cambiame|cambio|en vez de|en lugar de)\b/, 2],
    [/\bhoy (hago|quiero|prefiero)\b/, 1.5],
    [/\b(rutina|la) (a|b)\b/, 1],
  ],
  empezar: [
    [/^(empezar|empeza|empezamos|arranca|arrancar|arrancamos|comenzar|comenza|comenzamos|iniciar|inicia|vamos|dale)\b/, 3],
    [/\b(empezar|arrancar|comenzar|iniciar) (la |el )?(sesion|entrenamiento|rutina)\b/, 3],
  ],
  'registrar-actividad': [
    [/\b(anota|anotame|registra|registrame|agrega|guarda)\b/, 1.5],
    [/\b(jugue|camine|corri|trote|pedalee|fui en bici|hice bici|sali a correr|sali a caminar)\b/, 2.5],
    [/\b(padel|paddle|partido|bici|bicicleta|caminata|trote|running)\b/, 1.5],
  ],
  'registrar-peso': [
    [/\b(peso|pese|pesaba|me pese|cintura)\b\s*(de |es |hoy |da )?\d/, 4],
    [/\b(anota|registra) (mi |el )?(peso|cintura)\b/, 3],
    [/\b(mi peso|peso corporal|balanza)\b/, 1.5],
    [/\b(me pese|pese|pesaba|peso)\b.*\d/, 3],
  ],
  constancia: [
    [/\bcuant[oa]s? (veces|sesiones|entrenamientos|dias)\b/, 3],
    [/\bcuanto (entrene|fui|vine)\b/, 3],
    [/\b(constancia|como vengo|como voy|cumpli|cumplimiento|racha)\b/, 3],
    [/\b(entrene|fui al gimnasio|fui al gym)\b/, 1],
    [/\b(fui|vine|entrene)\b.*\b(semana|mes)\b/, 2.5],
  ],
  pendientes: [
    [/\bpendientes?\b/, 3],
    [/\b(preguntar|pregunto|preguntarle|consultar|consulto) (al|a mi) profe\b/, 3],
    [/\bdudas\b/, 2],
  ],
  ayuda: [
    [/^(hola|buenas|buen dia|buenos dias|ayuda|help)\b/, 2],
    [/\bque (podes|sabes|puedo) (hacer|pedir|preguntar)\b/, 3],
    [/\bcomo (funciona|te uso|se usa)\b/, 3],
  ],
  salud: [
    [/\b(duele|dolor|dolio|me lastime|lesion|lesionado|molestia|contractura|tendinitis|desgarro|esguince|mareo|mareado|me descompuse|me torci|pinchazo)\b/, 6],
  ],
  calorias: [[/\b(caloria|calorias|kcal|quemar|queme|quemo|grasa corporal|porcentaje de grasa)\b/, 5]],
  comidas: [
    [/\b(comida|comer|comi|dieta|proteina|cena|almuerzo|desayuno|macros)\b/, 4],
    [/\bque (como|ceno|desayuno|almuerzo|meriendo)\b/, 4],
  ],
};

export interface Classification {
  intent: IntentId;
  score: number;
  /** Segunda opción si quedó muy pareja (el asistente pregunta). */
  runnerUp?: IntentId;
}

export function classify(norm: string): Classification {
  const scores = (Object.keys(RULES) as (keyof typeof RULES)[])
    .map((id) => ({ id, score: RULES[id].reduce((s, [re, w]) => (re.test(norm) ? s + w : s), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scores.length || scores[0].score < 1.5) return { intent: 'no-entendi', score: scores[0]?.score ?? 0 };
  const [top, second] = scores;
  const close = second && top.score - second.score < 0.5 && top.score < 4;
  return { intent: top.id, score: top.score, runnerUp: close ? second.id : undefined };
}
