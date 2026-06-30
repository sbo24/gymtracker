// CACHE_VERSION se actualiza automáticamente con la fecha/hora del deploy
// Cada vez que cambies código, este número cambia y el SW invalida la caché
const CACHE_VERSION = '20260626-002';
const CACHE_NAME    = `gymtracker-${CACHE_VERSION}`;

const BASE = self.location.pathname.replace(/\/service-worker\.js$/, '');

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/style.css',
  BASE + '/sync.js',
  BASE + '/manifest.json',
  BASE + '/js/db.js',
  BASE + '/js/constants.js',
  BASE + '/js/utils.js',
  BASE + '/js/charts.js',
  BASE + '/js/backup.js',
  BASE + '/js/nav.js',
  BASE + '/js/dashboard.js',
  BASE + '/js/exercises.js',
  BASE + '/js/workouts.js',
  BASE + '/js/history.js',
  BASE + '/js/weight.js',
  BASE + '/js/records.js',
  BASE + '/js/goals.js',
  BASE + '/js/stats.js',
  BASE + '/js/photos.js',
  BASE + '/js/app.js',
];

// INSTALL: cachear todos los assets con la nueva versión
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()) // activar inmediatamente sin esperar a que cierren tabs
  );
});

// ACTIVATE: eliminar cachés antiguas y tomar control de todos los clientes
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // controlar tabs abiertas sin recargar
  );
});

// FETCH: network-first para JS/CSS (siempre fresco), cache-first para el resto
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Para archivos JS, CSS e HTML: intentar red primero, caer en caché si offline
  const isDynamic = url.pathname.endsWith('.js') ||
                    url.pathname.endsWith('.css') ||
                    url.pathname.endsWith('.html') ||
                    url.pathname === BASE + '/';

  if (isDynamic) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Actualizar la caché con la versión fresca
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match(BASE + '/index.html')))
    );
  } else {
    // Imágenes, iconos: cache-first
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request).catch(() => null))
    );
  }
});
