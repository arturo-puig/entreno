# Entreno — contexto para Claude

App personal de entrenamiento, **mobile first**, en español rioplatense (voseo). Un solo usuario.
Se usa en el gimnasio desde un Android: la prioridad es saber qué toca, ver cómo se hace, registrar rápido y no perder datos.

## Reglas del proyecto (acordadas con el usuario)

- **No modificar las rutinas del profesor sin autorización.** Las notaciones originales se guardan tal cual en `RoutineItem.notation` y nunca se reinterpretan. Lo dudoso va en `pending` (pregunta) y se muestra como «Pendiente de confirmar».
- **Nada de datos inventados**: ni historial ficticio, ni calorías, ni % de grasa, ni métricas que no salgan de datos reales. El historial previo del usuario está en `src/data/history.ts` con `source: 'historico'` y `date: null`.
- **Planificado ≠ ejecutado ≠ anterior.** Rutina = plan; Session = lo hecho; «la vez anterior» se calcula desde Session. Las cargas anteriores son referencia, nunca obligación.
- **Sin deuda**: si se saltea un día, no se acumula. Solo se sugiere (nunca se impone) recuperar A o B dentro de la misma semana.
- **Recursos visuales**: no inventar videos ni presentar ilustraciones como demostraciones verificadas. Solo se asocia una ilustración si muestra el mismo ejercicio y equipamiento (revisadas una por una). Fuentes: videos/fotos propios del usuario (guardados localmente) + Everkinetic (CC BY-SA 4.0, con atribución y cambios declarados). Descartadas: free-exercise-db (procedencia de imágenes no verificable) y exercemus (solo enlaces externos). wger y Wikimedia no son accesibles desde el entorno de desarrollo.
- Sin backend, sin cuentas, sin suscripciones en la v1. Datos en IndexedDB (Dexie) del navegador.
- Recomendaciones de fatiga y progresión: prudentes, editables, sin diagnósticos.
- Descansos por defecto (aprobados): 90 s básicos, 60 s accesorios; 30 s movilidad (supuesto, editable).
- Al terminar cada etapa: informar qué funciona, archivos modificados, pruebas hechas y limitaciones.

## Stack y comandos

React 19 + TypeScript + Vite 8 + Dexie 4. Sin librería de rutas (rutas con `#`, ver `src/router.ts`). CSS propio con tokens en `src/styles/app.css`.

```
npm install          # .npmrc fija legacy-peer-deps (npm 10.9 falla sin eso)
npm run dev          # servidor local (--host para abrirlo desde el celular en la misma red)
npm test             # Vitest: dominio + integridad de datos iniciales
npm run build        # tsc + vite build → dist/
npm run smoke        # Playwright: prueba de punta a punta a 360×800 (necesita build y el paquete playwright)
```

Despliegue: `.github/workflows/deploy.yml` publica en GitHub Pages en cada push a `main`. Trabajar en una rama `etapa-N` y pasar a `main` (fast-forward) al cerrar la etapa con todas las pruebas en verde.
`vite.config.ts` no está en el `include` de tsconfig (usa APIs de Node y no hay @types/node).

## Estructura

- `src/db/types.ts` — modelo de datos. `src/db/db.ts` — Dexie + `ensureSeed` (agrega lo que falta sin pisar ediciones; subir `SEED_REVISION` al sumar datos iniciales nuevos). `src/db/backup.ts` — exportar JSON.
- `src/data/` — carga inicial: `exercises.ts`, `routines.ts` (rutinas + `WEEK_PLAN`), `history.ts`.
- `src/domain/` — lógica pura y testeada: fechas, plan semanal y sugerencias, versión corta, estimación de duración, formato, búsqueda, recomendaciones según el estado previo.
- `src/screens/` — Hoy, Rutinas, RoutineDetail, RoutineEditor, Ejercicios, ExerciseDetail, ExerciseEditor, Session (entrenamiento activo), Progreso, Ajustes.
- `src/db/actions.ts` — todas las escrituras (fichas de tareas para el futuro asistente). `src/ui/device.ts` — Wake Lock, vibración, sonido.
- `src/ui/` — componentes compartidos e íconos SVG propios.

## Estado por etapas

1. ✅ Análisis y arquitectura.
2. ✅ Estructura visual, navegación de 5 secciones, base de datos local, carga inicial, pantalla Hoy (estado previo, versión corta, elegir otra rutina, sugerencia sin deuda, semana), Rutinas y biblioteca de solo lectura, exportar JSON.
3. ✅ Edición: rutinas (series y tipo de objetivo, descansos, notación, pendientes → confirmado, reordenar, agregar/quitar, versión corta, versión y «volver a la original»), duplicar/crear/eliminar rutinas, semana editable, histórico → rutina alternativa, editor y alta de ejercicios. Medios adelantados: 18 ilustraciones Everkinetic (CC BY-SA 4.0) animadas alternando las dos posiciones, videos/fotos propios por ejercicio y variante (tabla `userMedia`, Dexie v2), búsqueda en YouTube como complemento externo rotulado.
4. ✅ Entrenamiento activo (`src/screens/Session.tsx`, lógica en `src/domain/session.ts`): sesión creada desde Hoy (copia el plan), teclado numérico propio (nunca el del celular), valores sugeridos en gris = carga de la vez anterior + objetivo del plan («lo que ves es lo que se registra» al tocar ✓; si el plan es un rango y no hay número, pregunta), descanso automático por hora de fin con vibración/sonido y pantalla encendida (Wake Lock), cuenta regresiva para ejercicios por tiempo, anterior/siguiente/lista, omitir y sustituir (solo en la sesión), series extra, RPE por serie opcional (Ajustes), esfuerzo de la sesión opcional, sesiones incompletas que igual suman, cierre automático de sesiones olvidadas de otro día, sugerencia de progresión solo con rangos y sesiones reales. Progreso lista las sesiones.
5. ✅ PWA instalable y sin conexión con service worker propio (sin dependencias): `pwa/sw.template.js` + plugin en `vite.config.ts` que genera `dist/sw.js` con la lista exacta de archivos y una versión por hash. Caché primero (abre al instante con o sin señal), `ignoreVary` (si no, los módulos no coinciden), actualización solo cuando el usuario toca «Actualizar» (`src/pwa.ts`). Manifiesto + íconos (`scripts/make-icons.py`). Importar copia con validación y descarga automática de lo actual antes de reemplazar (`src/db/backup.ts`), borrar todo escribiendo «borrar», recordatorio semanal de copia en Hoy.
6. ⏳ Progreso (constancia semanal, cargas por ejercicio, peso y cintura con promedio semanal), pulido.
7. ⏳ Asistente v0 (aprobado, después de la etapa 4): capa sobre la app, no reemplazo; las series se registran a toques. Barra «Pedile algo…» en Hoy, ~12 intenciones, comprensión con reglas locales (sin modelos pagos), fichas de tareas con efecto declarado (consulta / registro con eco / acto con confirmación), «Continuar con:», registro local de pedidos con útil/no útil y sinónimos enseñados por el usuario. Medición con un banco de 40–50 frases escrito por el usuario antes de programar. Las acciones de `src/db/actions.ts` son la base de esas fichas.
Después: copia en Google Drive (v1.1), comidas (v2), Strava / Health Connect (v3).

**Condición del usuario: TODO GRATUITO.** Nada de servicios pagos, APIs con costo ni consumo de tokens. Hosting en GitHub Pages.

## Preguntas abiertas (también visibles en la app, sección Rutinas)

- Press de banca «4 × 8/6»: ¿también 12-10-8-6 subiendo el peso, como el hip thrust?
- Peso muerto unilateral (25 kg) y sentadilla búlgara (10 kg): ¿reps por pierna? ¿una mancuerna, dos o barra?
- Vuelos laterales y posteriores 4 × 8: ¿dos ejercicios en superserie, 4 × 8 cada uno?
- Pallof press del sábado: ¿cuántas repeticiones?
- Movilidad de cadera: ¿qué ejercicio?
- Histórico: «Sentadilla en máquina guiada», ¿es la Smith? «Elevación de talones en máquina», ¿de pie o sentado?

## Respuestas ya confirmadas por el usuario

- Hip thrust: máquina de discos con barra guiada; 12-10-8-6 subiendo el peso.
- «Remo alto» = remo al mentón. Pirámides 12-10-8-6: la carga sube en cada serie.
- Plancha lateral con rotación: 3 × 10 de cada lado (series separadas).
- Movilidad de tobillo: de rodillas, paso al frente, posición de caballero (ambas rodillas a 90°).
- Manguito rotador: banda pisada con el pie derecho, se levanta con la mano derecha, codo alineado con el hombro.
- Plancha + Pallof (sábado): alternados o no, 3 series.
- «Bíceps a 45°» = curl en banco inclinado (nunca lo hizo todavía).
- «Remo en polea» del historial = remo sentado en polea del martes.
- Sin fechas para los registros históricos.
- Versión corta aprobada (A: Smith, hip thrust, banca ×3 series; Mar: jalón, press inclinado, remo; Jue: curl femoral, press máquina ×2, Pallof; B: PM unilateral, búlgara, tríceps ×3; Mié: 20 min).
- Ver bien la técnica de cada ejercicio es prioritario: los medios se adelantaron a la etapa 3.
- Horarios: lunes noche ~75 min; mar–jue (y vie opcional) mañana ~40 min; sábado mediodía ~75 min; viernes noche pádel; domingo descanso.
