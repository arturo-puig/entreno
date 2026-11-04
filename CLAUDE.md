# Entreno — contexto para Claude

App personal de entrenamiento, **mobile first**, en español rioplatense (voseo). Un solo usuario.
Se usa en el gimnasio desde un Android: la prioridad es saber qué toca, ver cómo se hace, registrar rápido y no perder datos.

## Reglas del proyecto (acordadas con el usuario)

- **No modificar las rutinas del profesor sin autorización.** Las notaciones originales se guardan tal cual en `RoutineItem.notation` y nunca se reinterpretan. Lo dudoso va en `pending` (pregunta) y se muestra como «Pendiente de confirmar».
- **Nada de datos inventados**: ni historial ficticio, ni calorías, ni % de grasa, ni métricas que no salgan de datos reales. El historial previo del usuario está en `src/data/history.ts` con `source: 'historico'` y `date: null`.
- **Planificado ≠ ejecutado ≠ anterior.** Rutina = plan; Session = lo hecho; «la vez anterior» se calcula desde Session. Las cargas anteriores son referencia, nunca obligación.
- **Sin deuda**: si se saltea un día, no se acumula. Solo se sugiere (nunca se impone) recuperar A o B dentro de la misma semana.
- **Recursos visuales**: no inventar videos ni presentar ilustraciones o fotos como demostraciones verificadas. Solo se asocia una imagen si muestra el mismo ejercicio y equipamiento (revisadas una por una, a ojo); si algo difiere (p. ej. sin carga), se aclara en `caption`. Fuentes (`src/data/media.ts`, archivos en `public/media/` con su LEEME): videos/fotos propios del usuario (guardados localmente); Everkinetic (CC BY-SA 4.0, dibujos de dos posiciones); **Ejército de EE.UU., manual ATP 7-22.02** (fotos producidas por el Ejército → dominio público, «distribution unlimited»; secuencias recortadas y alineadas cuadro por cuadro con scripts de Python; aclarar que no implica respaldo); Wikimedia Commons archivo por archivo con su autor y licencia (`credit`). Descartadas: free-exercise-db (procedencia no verificable), exercemus (solo enlaces), bases con medios de Gym visual (prohibidas), RepDB (licencia propia con restricciones), fotos de yoga de gato-vaca del NPS (vista de atrás, nombres dudosos), fotos de plancha con brazos extendidos (la del usuario es sobre antebrazos), press de pecho/jalón/remo del manual (máquinas de palanca o encuadres que saltan), curl del manual (gira las palmas). Red: Commons y army.mil se habilitaron en el entorno; Wikimedia limita mucho (429: pausas largas, User-Agent propio) y `thumb.wikimedia.org` no está habilitado (bajar originales de `upload.wikimedia.org`). wger sigue sin acceso.
- Sin backend, sin cuentas, sin suscripciones en la v1. Datos en IndexedDB (Dexie) del navegador. La única conexión externa opcional es la copia en el Google Drive del propio usuario (con su ID de cliente gratuito).
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
- `src/db/actions.ts` — todas las escrituras (las usan las pantallas y el asistente).
- `src/assistant/` — asistente: normalización y entidades, reglas de intención, motor de respuestas, banco de frases. `src/ui/device.ts` — Wake Lock, vibración, sonido.
- `src/ui/` — componentes compartidos e íconos SVG propios.

## Estado por etapas

1. ✅ Análisis y arquitectura.
2. ✅ Estructura visual, navegación de 5 secciones, base de datos local, carga inicial, pantalla Hoy (estado previo, versión corta, elegir otra rutina, sugerencia sin deuda, semana), Rutinas y biblioteca de solo lectura, exportar JSON.
3. ✅ Edición: rutinas (series y tipo de objetivo, descansos, notación, pendientes → confirmado, reordenar, agregar/quitar, versión corta, versión y «volver a la original»), duplicar/crear/eliminar rutinas, semana editable, histórico → rutina alternativa, editor y alta de ejercicios. Medios adelantados: 18 ilustraciones Everkinetic (CC BY-SA 4.0) animadas alternando las dos posiciones, videos/fotos propios por ejercicio y variante (tabla `userMedia`, Dexie v2), búsqueda en YouTube como complemento externo rotulado.
4. ✅ Entrenamiento activo (`src/screens/Session.tsx`, lógica en `src/domain/session.ts`): sesión creada desde Hoy (copia el plan), teclado numérico propio (nunca el del celular), valores sugeridos en gris = carga de la vez anterior + objetivo del plan («lo que ves es lo que se registra» al tocar ✓; si el plan es un rango y no hay número, pregunta), descanso automático por hora de fin con vibración/sonido y pantalla encendida (Wake Lock), cuenta regresiva para ejercicios por tiempo, anterior/siguiente/lista, omitir y sustituir (solo en la sesión), series extra, RPE por serie opcional (Ajustes), esfuerzo de la sesión opcional, sesiones incompletas que igual suman, cierre automático de sesiones olvidadas de otro día, sugerencia de progresión solo con rangos y sesiones reales. Progreso lista las sesiones.
5. ✅ PWA instalable y sin conexión con service worker propio (sin dependencias): `pwa/sw.template.js` + plugin en `vite.config.ts` que genera `dist/sw.js` con la lista exacta de archivos y una versión por hash. Caché primero (abre al instante con o sin señal), `ignoreVary` (si no, los módulos no coinciden), actualización solo cuando el usuario toca «Actualizar» (`src/pwa.ts`). Manifiesto + íconos (`scripts/make-icons.py`). Importar copia con validación y descarga automática de lo actual antes de reemplazar (`src/db/backup.ts`), borrar todo escribiendo «borrar», recordatorio semanal de copia en Hoy.
6. ✅ Progreso (`src/screens/Progress.tsx`, lógica en `src/domain/stats.ts`, gráficos SVG propios en `src/ui/charts.tsx`): tarjetas de constancia, columnas de sesiones por semana (cada semana cuenta sola: sin deuda ni crédito), peso con puntos diarios + promedio semanal y tendencia a ~4 semanas, cintura opcional, evolución por ejercicio (mejor serie de cada sesión; el histórico sin fecha no se grafica), tablas equivalentes a cada gráfico, toque para ver el detalle. Actividades (pádel, bici, caminata, trote) en un toque desde Hoy (`kind: 'actividad'`, cuentan aparte del gimnasio). Peso en la tabla `bodyMetrics` (Dexie v3) e incluido en la copia. Colores de gráficos validados con la skill dataviz (acento + gris #6b7179).
7. ✅ Asistente v0 (`src/assistant/`, pantalla `src/screens/Assistant.tsx`, entrada «Pedile algo…» en Hoy): capa sobre la app; las series se registran a toques en la sesión. Comprensión con reglas locales (`intents.ts`: 17 intenciones con pesos; empate → pregunta) + entidades (`text.ts`, `match.ts`: ejercicios por nombre/otros nombres/inglés con preferencia por la rutina de hoy, números con unidades, fechas, rutinas, actividades, cómo llegás). `engine.ts` es puro: elige la función de la app y arma la respuesta (veredicto primero, detalle, «Continuar con:»); lo que cambia datos vuelve como acción con confirmación Sí/No. Salud, calorías y comidas: respuestas fijas prudentes. Si no reconoce un ejercicio, pregunta y ofrece recordar el nombre (se guarda como «otro nombre» del ejercicio). Registro local de pedidos (tabla `assistantLog`) con útil/no útil; revisión en Ajustes. Banco de desarrollo de 96 frases en `bank.test.ts` (100 %); FALTA la medición independiente con frases escritas por el usuario sin ver el código.
8. ✅ Interactividad (pedido tras la primera prueba real: «poco interactiva»). Coach con datos reales (`src/domain/coach.ts`, `src/ui/Coach.tsx`): saludo en Hoy según el momento (qué toca / en curso / ya entrenaste / descanso) con sugerencias que abren el asistente ya preguntando (`#/asistente/<texto>`); en la sesión, línea de fase y qué sigue, compara con la vez anterior solo si mejoraste o igualaste. Festejo al terminar (`src/ui/Celebration.tsx`, animación simple con alternativa sin movimiento) y festejo chico al anotar actividades. Cardio con anillo y cronómetro con meta, pausa, avisos a mitad y al llegar, velocidad e inclinación opcionales. Temporizadores guardados en la sesión (`Session.work`, sobreviven a recargas; la hora se toma al tocar). En días de cardio, una actividad (caminata/bici/trote) puede contar como la sesión del día.
9. ✅ Pendientes. Destello de pantalla al terminar el descanso o un tiempo (`src/ui/Flash.tsx`, evento desde `alertDone`; 3 pulsos lentos, fijo con movimiento reducido; preferencia `flash`, activada por defecto). Mapa de músculos (`src/ui/BodyMap.tsx`, lógica en `src/domain/musclemap.ts`): siluetas de MuscleMap (MIT, © Melih Colpan, extraídas a `src/data/bodymap.ts`, licencia en `public/licencias/`), principal en acento y secundario rayado, en el detalle y en «Cómo se hace»; los nombres sin zona (p. ej. «Sistema cardiovascular») quedan solo en el texto. Ejercicio de respaldo: `RoutineItem.backupExerciseId` (lo elige el usuario en el editor; no cambia el plan y se conserva al «volver a la original»); en la sesión «Máquina ocupada» cambia en un toque manteniendo series y repeticiones, o abre la lista y ofrece recordarlo; «Volver al original». Sesión en papel (`Session.backfill`): desde Progreso, con fecha y rutina, sin temporizadores, coach ni pantalla encendida; «la vez anterior» se mira hasta su fecha. En cualquier sesión terminada: cambiar fecha (nunca a futuro) y borrar; una caminata/bici/trote puede pasar a contar como el cardio de ese día y volver a ser actividad; actividades de otro día. Copia en Google Drive (`src/db/drive.ts`, `src/ui/DriveBackup.tsx`): Google Identity Services + Drive API v3, permiso `drive.file` (solo ve su archivo `entreno-copia.json`), token solo en memoria; el usuario pega un ID de cliente de OAuth gratuito (pasos en Ajustes); copia automática al tocar «Terminar» (el permiso se pide en el mismo toque), si falla queda pendiente y Hoy ofrece «Subir ahora»; restaurar con validación y copia local previa. «Compartir copia» con el menú de Android (Web Share). Probado con Google simulado (unitarias y Playwright): con Google real NO se pudo probar desde el entorno de desarrollo.
10. ✅ Más medios de uso público: fotos reales del manual del Ejército de EE.UU. animadas cuadro por cuadro para movilidad de tobillo en caballero (8), peso muerto unilateral (11, sin carga, aclarado), press de banca con barra (7) y remo al mentón con barra (8); dibujo de plancha frontal sobre antebrazos (Commons, CC BY-SA 4.0, Pk0001). `ExerciseMedia` muestra secuencias de N cuadros (`frames`, `frameMs`, `kind: 'dibujo' | 'fotos'`), imagen fija si hay un solo cuadro y el crédito de cada fuente. Siguen sin medios verificados: dead bug, Pallof, búlgara, gato-vaca, manguito rotador con banda, plancha lateral con rotación, hip thrust en máquina, sentadilla isométrica, movilidad de cadera y los del histórico (para esos: video propio).
Después: comidas (v2), Strava / Health Connect (v3). Ideas de openGym que quedan (solo ideas; sus imágenes son de Gym visual y NO se pueden usar): calculadora de discos.

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
