/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * Genera dist/sw.js con la lista exacta de archivos de esta compilación,
 * para que la app funcione sin conexión. Sin dependencias extra.
 */
function serviceWorker(): Plugin {
  return {
    name: 'entreno-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = listFiles('public')
        .map((f) => relative('public', f).split(sep).join('/'))
        .filter((f) => !f.endsWith('.txt'));
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const name of [...built].sort()) {
        const out = bundle[name];
        hash.update(name);
        hash.update(out.type === 'chunk' ? out.code : out.source);
      }
      for (const name of [...publicFiles].sort()) hash.update(name).update(readFileSync(join('public', name)));
      const assets = ['./', ...[...built, ...publicFiles].map((f) => `./${f}`)];
      const source = readFileSync('pwa/sw.template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// base relativa + rutas con "#": funciona en GitHub Pages sin configuración extra.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
  },
});
