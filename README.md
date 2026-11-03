# Entreno

App personal de entrenamiento para usar en el celular durante el gimnasio: qué toca hoy, cómo se hace cada ejercicio, qué hiciste la vez anterior. Funciona en el navegador, guarda todo en el celular y no necesita cuentas.

## Usarla

Abrí https://arturo-puig.github.io/entreno/ en Chrome desde el celular y elegí **menú ⋮ → Instalar app** (o el botón en **Ajustes**). Una vez abierta con internet, funciona sin señal.

**Tus datos viven solo en ese celular, dentro de Chrome.** Si borrás los datos del navegador o cambiás de teléfono, se pierden. Exportá una copia desde **Ajustes → Exportar datos** antes de hacerlo.

## Desarrollo

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev      # abre http://localhost:5173 (y en la red local, para probar desde el celular)
npm test
npm run build
```

`npm run smoke` corre una prueba de punta a punta en un navegador con tamaño de celular (necesita Playwright con Chromium).

## Publicar

Cada cambio que se sube a `main` se publica solo con GitHub Actions. La primera vez: en el repositorio, **Settings → Pages → Source → GitHub Actions**.
