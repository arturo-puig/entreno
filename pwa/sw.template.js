/* Service worker de Entreno: guarda la app en el celular para que abra sin señal.
   Se genera en cada compilación (vite.config.ts): VERSION cambia si cambia cualquier archivo. */
const VERSION = '__VERSION__';
const CACHE = `entreno-${VERSION}`;
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  // «reload»: baja los archivos frescos, sin usar la caché HTTP del navegador.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('entreno-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La app pide aplicar una versión nueva solo cuando vos tocás «Actualizar».
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // YouTube, licencias y cualquier otro sitio: siempre por la red.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Una sola página: siempre la versión guardada. Abre al instante, con o sin señal.
    event.respondWith(caches.match('./', { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || fetch(req)));
    return;
  }

  // ignoreVary: los archivos son estáticos; si el servidor manda «Vary», igual son los mismos.
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
