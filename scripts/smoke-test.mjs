// Prueba de punta a punta en un navegador con tamaño de celular.
// Uso: npm run build && npm run smoke   (requiere el paquete «playwright» con Chromium)
// Opcional: SCREENSHOTS=carpeta  para guardar capturas de pantalla.
import { preview } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// require (no import) para poder usar una instalación global de Playwright.
const { chromium } = createRequire(import.meta.url)('playwright');

const SHOTS = process.env.SCREENSHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4173/';
const browser = await chromium.launch();

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Contexto nuevo (almacenamiento vacío) con fecha fija en hora de Argentina. */
async function openAt(isoDateTime, { width = 360, height = 800, flowingClock = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // Reloj fijo para las pantallas; reloj controlable (avanza y se puede adelantar) para los temporizadores.
  if (flowingClock) await page.clock.install({ time: new Date(isoDateTime) });
  else await page.clock.setFixedTime(new Date(isoDateTime));
  await page.goto(BASE);
  await page.getByRole('navigation', { name: 'Secciones' }).waitFor();
  return { context, page, errors };
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Espera a que aparezcan todos los textos (como lo haría una persona mirando la pantalla). */
async function has(page, ...strings) {
  try {
    for (const s of strings) await page.locator('main').getByText(s).first().waitFor({ timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

/** Espera a que un texto desaparezca. */
async function lacks(page, s) {
  try {
    await page.locator('main').getByText(s).first().waitFor({ state: 'detached', timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function reload(page) {
  await page.reload();
  await page.getByRole('navigation', { name: 'Secciones' }).waitFor();
}

const title = (page) => page.locator('h1').first().innerText();

try {
  // ——— Lunes: Rutina A ———
  {
    const { context, page, errors } = await openAt('2026-10-26T20:00:00-03:00');
    check('lunes: muestra día y fecha', await has(page, 'Lunes', '26 de octubre'));
    check('lunes: Rutina A de tu profe', await has(page, 'Rutina A', 'de tu profe'));
    check('lunes: 9 ejercicios, ≈ 75 min', await has(page, '9 ejercicios', '≈ 75 min'));
    check('lunes: press de banca pendiente', (await page.locator('li', { hasText: 'Press de banca' }).getByText('Pendiente').count()) === 1);
    check('lunes: botón Comenzar visible y habilitado', await page.getByRole('button', { name: 'Comenzar' }).isEnabled());
    check('lunes: sin scroll horizontal a 360 px', await noHorizontalScroll(page));
    await shot(page, '01-hoy-lunes');

    await page.getByRole('switch').check();
    check('poco tiempo: 3 ejercicios, ≈ 20 min', await has(page, '3 ejercicios', '≈ 20 min', 'Versión corta'));
    await page.getByRole('button', { name: 'Algo cansado' }).click();
    check('estado previo: muestra recomendación', await has(page, 'sin buscar récords'));
    await reload(page);
    check('persistencia: «Tengo poco tiempo» sigue activo tras recargar', await page.getByRole('switch').isChecked());
    check(
      'persistencia: estado previo sigue marcado tras recargar',
      (await page.getByRole('button', { name: 'Algo cansado' }).getAttribute('aria-pressed')) === 'true',
    );
    await shot(page, '02-hoy-corta-cansado');

    // Elegir otra rutina desde la hoja inferior.
    await page.getByRole('button', { name: 'Hacer otra rutina hoy' }).click();
    await shot(page, '02b-elegir-rutina');
    await page.getByRole('dialog').getByRole('button', { name: /Rutina B/ }).click();
    check('otra rutina hoy: muestra Rutina B elegida', await has(page, 'Elegida para hoy', 'Peso muerto unilateral'));
    await page.getByRole('button', { name: /Volver a lo planificado/ }).click();
    check('volver a lo planificado: Rutina A', await lacks(page, 'Elegida para hoy') && (await page.locator('.hero-title').innerText()) === 'Rutina A');

    // Navegación: Rutinas → Rutina B → ejercicio → atrás.
    await page.getByRole('link', { name: 'Rutinas' }).click();
    check('rutinas: semana completa de lunes a domingo', await has(page, 'Tu semana', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'));
    check('rutinas: lista de pendientes', await has(page, 'Pendientes de confirmar', '¿Cuántas repeticiones de Pallof press'));
    await shot(page, '03-rutinas');
    await page.getByRole('button', { name: /Rutina B/ }).first().click();
    check('rutina B: conserva notación original', await has(page, '«Vuelos laterales y posteriores: 4 × 8»'));
    check('rutina B: carga de referencia 25 kg', await has(page, '25 kg'));
    await shot(page, '04-rutina-b');
    await page.getByRole('button', { name: 'Tengo poco tiempo' }).click();
    check('rutina B corta: 3 ejercicios sin tocar la original', await has(page, '3 ejercicios', 'No modifica la rutina original'));
    await page.getByRole('button', { name: 'Completa' }).click();
    await page.getByRole('button', { name: /Peso muerto unilateral/ }).click();
    check('ejercicio: instrucciones y aviso de medios honesto', await has(page, 'Cómo se hace', 'Todavía no hay video ni ilustración'));
    await page.getByRole('button', { name: 'Volver' }).click();
    check('volver: regresa a la Rutina B', await has(page, 'Vuelos posteriores') && (await title(page)) === 'Rutina B');

    // Biblioteca: búsqueda y filtros.
    await page.getByRole('link', { name: 'Ejercicios' }).click();
    await page.getByRole('searchbox').fill('biceps');
    check('búsqueda sin tildes: «biceps»', await has(page, 'Curl de bíceps en banco inclinado', 'Curl de bíceps con mancuernas'));
    await page.getByRole('searchbox').fill('');
    await page.getByLabel('Grupo').selectOption('Espalda');
    check('filtro por grupo: Espalda = 2', await has(page, '2 ejercicios'));
    await shot(page, '05-ejercicios');
    await page.getByRole('button', { name: /Jalón al pecho/ }).click();
    check('historial: jalón 45 kg × 12 … 60 kg × 6', await has(page, '45 kg × 12', '60 kg × 6', 'Registro histórico'));
    await shot(page, '06-ejercicio-jalon');
    await page.getByRole('button', { name: 'Volver' }).click();
    check('volver: conserva el filtro de la biblioteca', await has(page, '2 ejercicios'));

    // Progreso.
    await page.getByRole('link', { name: 'Progreso' }).click();
    check('progreso: sin sesiones registradas y con históricos', await has(page, 'Todavía no registraste sesiones', 'Piernas y abdomen'));
    await page.getByText('Piernas y abdomen').click();
    const opened = page.locator('details[open]', { hasText: 'Piernas y abdomen' });
    check(
      'progreso: detalle del histórico (50 kg × 10)',
      await opened.getByText('50 kg × 10').first().waitFor({ timeout: 4000 }).then(() => true, () => false),
    );
    await shot(page, '07-progreso');

    // Ajustes: exportar copia.
    await page.getByRole('link', { name: 'Ajustes' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exportar datos/ }).click(),
    ]);
    const data = JSON.parse(readFileSync(await download.path(), 'utf8'));
    check('exportar: archivo con nombre fechado', download.suggestedFilename() === 'entreno-copia-2026-10-26.json', download.suggestedFilename());
    check(
      'exportar: contiene rutinas, ejercicios, historial y estado del día',
      data.tables.routines.length === 5 && data.tables.exercises.length > 30 && data.tables.sessions.length === 2 && data.tables.days.length === 1,
    );
    check('exportar: registra la fecha de la última copia', await has(page, 'Última copia'));
    await shot(page, '08-ajustes');

    check('lunes: sin errores en consola', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ——— Etapa 3: imágenes, videos propios y edición ———
  {
    const { context, page, errors } = await openAt('2026-11-02T20:00:00-03:00');
    const go = async (hash, wait) => {
      await page.goto(`${BASE}${hash}`);
      await page.getByText(wait).first().waitFor({ timeout: 5000 });
    };

    // Ilustración con licencia, animada, con créditos.
    await go('#/ejercicios/sentadilla-smith', 'Cómo se hace');
    const img = page.locator('.media-illustration img.is-visible');
    await img.waitFor();
    const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0 && el.src.includes('media/everkinetic/0124'));
    check('ilustración: carga la imagen incluida en la app', loaded);
    check('ilustración: aclara que no es un video y muestra la licencia', await has(page, 'no es un video', 'Everkinetic', 'CC BY-SA 4.0'));
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    check('ilustración: se puede pausar', await page.getByRole('button', { name: 'Animar', exact: true }).isVisible());
    await shot(page, '11-ejercicio-ilustracion');
    await go('#/ejercicios/jalon-al-pecho', 'Cómo se hace');
    check('ilustración por variante: jalón con agarre neutro', await has(page, 'Muestra el agarre neutro'));

    // Sin ilustración: aviso honesto + agregar video/foto propio.
    await go('#/ejercicios/hip-thrust-maquina', 'Cómo se hace');
    check('sin ilustración: aviso honesto', await has(page, 'Todavía no hay video ni ilustración'));
    const yt = await page.getByRole('link', { name: /Buscar en YouTube/ }).getAttribute('href');
    check('buscar en YouTube: enlace de búsqueda', yt?.startsWith('https://www.youtube.com/results?search_query=') ?? false, yt);
    await shot(page, '12-ejercicio-sin-medios');
    await page.locator('input[type=file]').setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: readFileSync('public/media/everkinetic/0124-a.png'),
    });
    await page.getByRole('dialog', { name: 'Guardar foto' }).getByRole('button', { name: 'Guardar' }).click();
    check('foto propia: se guarda y se muestra', await has(page, 'Tu foto'));
    // Video corto generado en el navegador (WebM).
    const webm = await page.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 120 });
      const ctx = canvas.getContext('2d');
      const rec = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.start();
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#5cb8a0' : '#222';
        ctx.fillRect(0, 0, 160, 120);
        await new Promise((r) => setTimeout(r, 60));
      }
      await new Promise((r) => {
        rec.onstop = r;
        rec.stop();
      });
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    });
    await page.locator('input[type=file]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from(webm) });
    await page.getByRole('dialog', { name: 'Guardar video' }).getByRole('button', { name: 'Guardar' }).click();
    check('video propio: se guarda y se reproduce', await has(page, 'Tu video') && (await page.locator('video.media-own').count()) === 1);
    await shot(page, '13-ejercicio-video-propio');
    await reload(page);
    check('videos y fotos propios: persisten tras recargar', await has(page, 'Tu video', 'Tu foto'));
    await page.getByRole('button', { name: 'Tu video' }).click();
    await page.getByRole('button', { name: 'Borrar' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    check('borrar medio: pide confirmación y borra el elegido', (await lacks(page, 'Tu video')) && (await has(page, 'Tu foto')));

    // Editar una rutina: confirmar el press de banca, reordenar, agregar ejercicio.
    await go('#/rutinas/rutina-a', 'Sentadilla en Smith');
    await page.getByRole('button', { name: 'Editar' }).click();
    await has(page, 'Editar rutina');
    check('editor: sin barra de navegación', (await page.getByRole('navigation', { name: 'Secciones' }).count()) === 0);
    await page.locator('article', { hasText: 'Press de banca' }).getByRole('button', { name: 'Editar' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Tipo de objetivo').selectOption('reps');
    for (const [i, v] of [[1, '12'], [2, '10'], [3, '8'], [4, '6']]) await sheet.getByLabel(`Repeticiones serie ${i}`).fill(v);
    await sheet.getByRole('button', { name: 'Marcar como confirmado' }).click();
    await sheet.getByRole('switch', { name: /Carga ascendente/ }).check();
    check('editor de ejercicio: sin scroll horizontal', await noHorizontalScroll(page));
    await shot(page, '14-editor-ejercicio-en-rutina');
    await sheet.getByRole('button', { name: 'Listo' }).click();
    check('editor: aplica el cambio al borrador', await has(page, '12 · 10 · 8 · 6'));
    await page.getByRole('button', { name: 'Subir Gemelos sentado' }).click();
    await page.getByRole('button', { name: 'Agregar ejercicio' }).click();
    await page.getByRole('dialog').getByRole('searchbox').fill('flexiones');
    await page.getByRole('dialog').getByRole('button', { name: /Flexiones de brazos/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Listo' }).click();
    await shot(page, '15-editor-rutina');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    check('rutina editada: versión 2, 10 ejercicios', await has(page, 'Versión 2', '10 ejercicios'));
    check('rutina editada: press confirmado con carga ascendente', (await page.locator('article', { hasText: 'Press de banca' }).innerText()).includes('Carga ascendente'));
    check('rutina editada: el press ya no está pendiente', !(await page.locator('article', { hasText: 'Press de banca' }).getByText('Pendiente de confirmar').count()));
    const order = await page.locator('.item-name').allInnerTexts();
    check('rutina editada: gemelos subió un lugar', order.indexOf('Gemelos sentado') === order.indexOf('Sentadilla isométrica') - 1, order.join(', '));
    await reload(page);
    check('rutina editada: persiste tras recargar', await has(page, 'Versión 2', 'Flexiones de brazos'));
    await page.getByRole('button', { name: 'Volver a la versión original' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restaurar' }).click();
    check('restaurar: vuelve la versión original (9 ejercicios, press pendiente)', await has(page, '9 ejercicios', 'Versión 3', '¿También es 12, 10, 8 y 6'));

    // Descartar cambios pide confirmación.
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nombre').fill('Otro nombre');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Descartar' }).click();
    check('descartar: no guarda el nombre', (await title(page)) === 'Rutina A');

    // Cambiar un día de la semana.
    await page.getByRole('link', { name: 'Rutinas' }).click();
    await page.getByRole('button', { name: 'Cambiar días' }).click();
    await page.getByRole('button', { name: 'Cambiar domingo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Cardio y movilidad/ }).click();
    await page.getByRole('button', { name: 'Listo' }).click();
    check('semana: el domingo pasa a Cardio y movilidad', (await page.locator('li', { hasText: 'DOM' }).innerText()).includes('Cardio y movilidad'));

    // Registro histórico → rutina alternativa.
    await page.getByRole('link', { name: 'Progreso' }).click();
    await page.getByText('Piernas y abdomen').click();
    await page.getByRole('button', { name: 'Usar como rutina alternativa' }).click();
    check('histórico → rutina: crea rutina personal de 7 ejercicios', await has(page, 'Piernas y abdomen', '7 ejercicios', 'Personal'));
    check('histórico → rutina: conserva la carga como referencia', await has(page, '50 kg'));

    // Completar un ejercicio pendiente de la biblioteca.
    await go('#/ejercicios/movilidad-cadera', 'Cómo se hace');
    await page.getByRole('button', { name: 'Editar ejercicio' }).click();
    await page.locator('h1', { hasText: 'Editar ejercicio' }).waitFor();
    await page.getByLabel('Cómo se hace', { exact: true }).fill('Paso uno de prueba\nPaso dos de prueba');
    await page.getByRole('button', { name: 'Marcar como confirmado' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    check('editar ejercicio: guarda los pasos y quita el pendiente', (await has(page, 'Paso dos de prueba')) && !(await page.getByText('Pendiente de confirmar').count()));

    // Ejercicio nuevo.
    await page.getByRole('link', { name: 'Ejercicios' }).click();
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Remo con mancuerna');
    await page.getByRole('button', { name: 'Mancuernas' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('h1', { hasText: 'Remo con mancuerna' }).waitFor({ timeout: 4000 }).catch(() => {});
    await shot(page, '16-ejercicio-nuevo');
    check('ejercicio nuevo: se crea y se abre', (await title(page)) === 'Remo con mancuerna', await title(page));

    check('etapa 3: sin errores en consola', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ——— Etapa 4: entrenamiento activo ———
  {
    const { context, page, errors } = await openAt('2026-11-03T08:00:00-03:00', { flowingClock: true });
    const set = (n) => page.locator('.set').nth(n - 1);
    const pad = page.getByRole('group', { name: 'Teclado numérico' });
    const key = (k) => pad.getByRole('button', { name: k, exact: true }).click();

    await page.getByRole('button', { name: 'Comenzar' }).click();
    check('sesión: arranca en el primer ejercicio', await has(page, 'Ejercicio 1 de 5', 'Jalón al pecho', 'Plan', '3 × 8–12'));
    check('sesión: sin barra de navegación', (await page.getByRole('navigation', { name: 'Secciones' }).count()) === 0);
    check('sesión: usa el histórico como referencia', await has(page, 'tu registro histórico'));
    check('sesión: sugiere 45 kg y muestra el rango del plan', (await set(1).innerText()).includes('45 kg') && (await set(1).innerText()).includes('8–12'));
    await shot(page, '17-sesion-inicio');

    // Teclado propio: peso → Siguiente → repeticiones.
    await set(1).getByRole('button', { name: /Peso \(kg\), serie 1/ }).click();
    for (const k of ['4', '7', ',', '5']) await key(k);
    check('teclado: escribe 47,5', (await pad.locator('.numpad-value').innerText()) === '47,5');
    await shot(page, '18-sesion-teclado');
    await pad.getByRole('button', { name: 'Siguiente' }).click();
    await key('1');
    await key('0');
    await pad.getByRole('button', { name: 'Listo' }).click();
    await set(1).getByRole('button', { name: /marcar como hecha/ }).click();
    check('serie 1: guarda lo escrito', (await set(1).innerText()).includes('47,5 kg') && (await set(1).innerText()).includes('10'));
    await has(page, 'Descanso');
    const restText = await page.locator('.timer-label strong').innerText();
    check('descanso: arranca solo con 1:30', /^1:(30|29|28)$/.test(restText), restText);
    await shot(page, '19-sesion-descanso');
    await page.clock.fastForward(92_000);
    check('descanso: termina solo y avisa', await has(page, 'Descanso terminado'));

    // Completar sin escribir: toma la sugerencia visible; pregunta las repeticiones del rango.
    await set(2).getByRole('button', { name: /marcar como hecha/ }).click();
    check('serie 2: completa con la carga sugerida (50 kg)', (await set(2).innerText()).includes('50 kg'));
    check('serie 2: pregunta las repeticiones (rango sin número)', (await pad.locator('.numpad-label').innerText()).includes('Repeticiones · serie 2'));
    await pad.getByRole('button', { name: 'Listo' }).click();
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).waitFor();

    await page.reload();
    await page.locator('.session-top').waitFor();
    check(
      'persistencia: la sesión sigue tras recargar',
      (await has(page, 'Ejercicio 1 de 5')) && (await set(2).getByRole('button', { name: /hecha \(tocá/ }).count()) === 1,
    );

    // Siguiente ejercicio: primera vez → «Cómo se hace» abierto con su ilustración.
    await page.getByRole('button', { name: 'Siguiente' }).click();
    check('primera vez: muestra cómo se hace con ilustración', (await has(page, 'Press inclinado con mancuernas', 'Primera vez', 'Peso por mancuerna')) && (await page.locator('.media-illustration').count()) === 1);
    await shot(page, '20-sesion-primera-vez');
    await page.getByRole('button', { name: 'Sustituir' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Press de pecho en máquina/ }).click();
    check('sustituir: cambia solo en la sesión', await has(page, 'Press de pecho en máquina', 'En lugar de Press inclinado con mancuernas'));
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Omitir' }).click();
    check('omitir: se puede deshacer', await has(page, 'Omitiste este ejercicio'));

    // Ir a un ejercicio desde la lista.
    await page.getByRole('button', { name: 'Lista de ejercicios' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Dead bug/ }).click();
    check('lista: salta al ejercicio 5 (sin campo de peso)', (await has(page, 'Ejercicio 5 de 5', 'Dead bug')) && (await set(1).getByRole('button', { name: /Peso/ }).count()) === 0);
    check('sesión: sin scroll horizontal', await noHorizontalScroll(page));

    // Terminar con esfuerzo de la sesión.
    await page.getByRole('button', { name: 'Terminar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '7', exact: true }).click();
    await shot(page, '21-sesion-terminar');
    await page.getByRole('dialog').getByRole('button', { name: 'Terminar' }).click();
    check('terminar: vuelve a Hoy como incompleta (igual suma)', await has(page, 'Igual suma', 'Ver sesión', '1 de 5 sesiones'));
    check('recordatorio de copia: aparece después de registrar', await has(page, 'Todavía no hiciste ninguna copia', 'Exportar ahora'));
    await shot(page, '22-hoy-sesion-hecha');

    await page.getByRole('link', { name: 'Progreso' }).click();
    check('progreso: lista la sesión con su esfuerzo', await has(page, 'Tus sesiones', 'Tren superior', 'Incompleta', 'esfuerzo 7/10'));
    await page.goto(`${BASE}#/ejercicios/jalon-al-pecho`);
    check('historial del ejercicio: muestra lo de hoy', await has(page, '47,5 kg × 10'));

    // Preferencia RPE + ejercicio por tiempo (sentadilla isométrica).
    await page.goto(`${BASE}#/ajustes`);
    await page.getByRole('switch', { name: /Registrar esfuerzo por serie/ }).check();
    await page.getByRole('link', { name: 'Hoy' }).click();
    await page.getByRole('button', { name: 'Hacer otra rutina hoy' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Rutina A/ }).click();
    await page.getByRole('button', { name: 'Comenzar' }).click();
    await page.getByRole('button', { name: 'Lista de ejercicios' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Sentadilla isométrica/ }).click();
    check('RPE: aparece cuando está activado', await has(page, 'RPE —'));
    await set(1).getByRole('button', { name: /Iniciar 1 min/ }).click();
    const workText = await page.locator('.timer-label strong').innerText();
    check('ejercicio por tiempo: cuenta regresiva de 1:00', /^(1:00|0:59|0:58)$/.test(workText), workText);
    await page.clock.fastForward(61_000);
    check('ejercicio por tiempo: marca la serie al terminar', (await set(1).getByRole('button', { name: /hecha \(tocá/ }).count()) === 1);
    check('ejercicio por tiempo: arranca el descanso', await has(page, 'Descanso'));

    // Al día siguiente, la sesión que quedó abierta se cierra como incompleta (sin deuda).
    await page.clock.fastForward(24 * 3600 * 1000);
    await page.goto(`${BASE}#/progreso`);
    await page.reload();
    check('sesión olvidada abierta: se cierra sola como incompleta', (await has(page, 'Rutina A')) && !(await page.getByText('En curso').count()));

    check('etapa 4: sin errores en consola', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ——— Etapa 5: instalable, sin conexión, importar y borrar ———
  {
    const { context, page, errors } = await openAt('2026-11-04T08:00:00-03:00');
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    check('manifiesto: nombre, inicio y modo app', manifest.name === 'Entreno' && manifest.display === 'standalone' && manifest.start_url === './#/hoy');
    const iconStatus = await page.evaluate(async (list) => Promise.all(list.map(async (i) => (await fetch(i.src)).status)), manifest.icons);
    check('manifiesto: íconos 192, 512 y maskable', iconStatus.every((st) => st === 200) && manifest.icons.some((i) => i.purpose === 'maskable'), iconStatus.join(','));
    const controlled = await page
      .waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
      .then(() => true, () => false);
    check('sin conexión: service worker activo', controlled);
    await page.goto(`${BASE}#/ajustes`);
    check('ajustes: informa que está lista sin conexión', await has(page, 'Sin conexión: lista'));

    await context.setOffline(true);
    await page.goto(`${BASE}#/hoy`);
    await page.reload();
    await page.getByRole('navigation', { name: 'Secciones' }).waitFor({ timeout: 10000 }).catch(() => {});
    check('sin conexión: la app abre sin señal', await has(page, 'Miércoles', 'Cardio y movilidad'));
    await page.goto(`${BASE}#/ejercicios/sentadilla-smith`);
    const offImg = page.locator('.media-illustration img.is-visible');
    await offImg.waitFor({ timeout: 5000 }).catch(() => {});
    check('sin conexión: las ilustraciones se ven', await offImg.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false));
    await shot(page, '23-sin-conexion');
    await context.setOffline(false);

    // Exportar, borrar una rutina e importar la copia.
    await page.goto(`${BASE}#/ajustes`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar datos/ }).click()]);
    const backup = readFileSync(await dl.path());
    await page.goto(`${BASE}#/rutinas/rutina-b`);
    await has(page, 'Peso muerto unilateral');
    await page.getByRole('button', { name: 'Eliminar rutina' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    check('eliminar rutina: el sábado pasa a descanso', (await has(page, 'Tu semana')) && (await page.locator('li', { hasText: 'SÁB' }).innerText()).includes('Descanso'));

    await page.goto(`${BASE}#/ajustes`);
    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles({ name: 'otra.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
    check('importar: rechaza un archivo que no es una copia', await has(page, 'no es una copia de Entreno'));
    await fileInput.setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: backup });
    check('importar: muestra qué trae la copia', await has(page, '5 rutinas'));
    await shot(page, '24-importar');
    const [safety] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      page.getByRole('dialog').getByRole('button', { name: 'Reemplazar' }).click(),
    ]);
    check('importar: antes descarga una copia de lo actual', !!safety);
    check('importar: avisa que terminó', await has(page, 'Copia importada'));
    await page.goto(`${BASE}#/rutinas`);
    check('importar: vuelve la Rutina B', (await has(page, 'Tu semana')) && (await page.locator('li', { hasText: 'SÁB' }).innerText()).includes('Rutina B'));

    // Borrar todo con confirmación escrita.
    await page.goto(`${BASE}#/ajustes`);
    await page.getByRole('button', { name: 'Borrar todos los datos' }).click();
    const dialog = page.getByRole('dialog');
    check('borrar todo: pide escribir «borrar»', await dialog.getByRole('button', { name: 'Borrar todo' }).isDisabled());
    await dialog.getByLabel('Escribí «borrar» para confirmar').fill('borrar');
    await dialog.getByRole('button', { name: 'Borrar todo' }).click();
    await page.getByRole('navigation', { name: 'Secciones' }).waitFor({ timeout: 10000 });
    await page.goto(`${BASE}#/ajustes`);
    check('borrar todo: la app vuelve a como vino', await has(page, 'Todavía no hiciste ninguna copia'));

    check('etapa 5: sin errores en consola', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ——— Martes sin haber hecho la A: sugerencia sin deuda ———
  {
    const { context, page, errors } = await openAt('2026-10-27T08:00:00-03:00');
    check('martes: Tren superior complementaria', await has(page, 'Tren superior', 'complementaria'));
    check('martes: sugiere hacer la Rutina A', await has(page, 'todavía no hiciste la'));
    await shot(page, '09-hoy-martes-sugerencia');
    await page.getByRole('button', { name: 'Hacer Rutina A hoy' }).click();
    await has(page, 'Elegida para hoy');
    await reload(page);
    check(
      'martes: la elección persiste tras recargar',
      (await has(page, 'Elegida para hoy', 'Sentadilla en Smith')) && !(await page.getByText('todavía no hiciste la').count()),
    );
    check('martes: sin errores en consola', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ——— Miércoles, viernes y domingo ———
  {
    const { context, page } = await openAt('2026-10-28T08:00:00-03:00');
    check('miércoles: cardio ≈ 35 min, 1 ejercicio', await has(page, 'Cardio y movilidad', '≈ 35 min', '1 ejercicio'));
    await page.getByRole('button', { name: 'Seguir con lo de hoy' }).click();
    check('miércoles: descartar sugerencia', await lacks(page, 'todavía no hiciste la'));
    await page.getByRole('button', { name: 'Muy fatigado' }).click();
    check('muy fatigado: recomendación prudente y opción corta', await has(page, 'consultá con un profesional', 'Usar versión corta'));
    await context.close();
  }
  {
    const { context, page } = await openAt('2026-10-30T08:00:00-03:00');
    check('viernes: pádel con gimnasio opcional', await has(page, 'Pádel', 'Elegir rutina para la mañana (opcional)'));
    check('viernes: sin estado previo (no hay rutina)', !(await page.getByText('¿Cómo llegás hoy?').count()));
    await shot(page, '10-hoy-viernes');
    await context.close();
  }
  {
    const { context, page } = await openAt('2026-11-01T11:00:00-03:00');
    check('domingo: descanso', await has(page, 'Domingo', 'Sin entrenamiento'));
    await context.close();
  }

  // ——— Pantalla muy angosta ———
  {
    const { context, page } = await openAt('2026-10-31T12:00:00-03:00', { width: 320, height: 640 });
    await has(page, 'Rutina B');
    check('320 px: sin scroll horizontal en Hoy', await noHorizontalScroll(page));
    await page.getByRole('link', { name: 'Ejercicios' }).click();
    await has(page, 'ejercicios');
    check('320 px: sin scroll horizontal en Ejercicios', await noHorizontalScroll(page));
    await context.close();
  }
} catch (e) {
  check('la prueba terminó sin excepciones', false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} verificaciones fallaron` : `\nTodas las verificaciones pasaron (${results.length}).`);
process.exit(failures ? 1 : 0);
