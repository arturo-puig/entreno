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
async function openAt(isoDateTime, { width = 360, height = 800 } = {}) {
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
  await page.clock.setFixedTime(new Date(isoDateTime));
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
    check('lunes: botón Comenzar visible y deshabilitado (etapa 4)', await page.getByRole('button', { name: 'Comenzar' }).isDisabled());
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
    check('rutina B corta: 3 ejercicios y aviso de propuesta', await has(page, '3 ejercicios', 'pendiente de tu aprobación'));
    await page.getByRole('button', { name: 'Completa' }).click();
    await page.getByRole('button', { name: /Peso muerto unilateral/ }).click();
    check('ejercicio: instrucciones y aviso de medios honesto', await has(page, 'Cómo se hace', 'Sin video ni imagen verificados'));
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
