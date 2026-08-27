// ── GymTracker Service Worker ─────────────────────────────────
// Estrategia: Network-first para todo el código local.
// El CACHE_VERSION se actualiza con cada commit vía el script de build
// o manualmente. En iOS PWA es la única forma fiable de invalidar caché.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v-20260827-1421'; // forzar actualización de caché
const CACHE_NAME    = `gymtracker-${CACHE_VERSION}`;
const BASE          = self.location.pathname.replace(/\/service-worker\.js$/, '');

// ── INSTALL: precachear assets ────────────────────────────────
self.addEventListener('install', e => {
  // skipWaiting inmediato: el nuevo SW toma control sin esperar a que
  // el usuario cierre todas las pestañas
  self.skipWaiting();
});

// ── ACTIVATE: limpiar cachés antiguos ────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // tomar control de todos los clientes abiertos
  );
});

// ── FETCH: network-first para código, ignorar APIs externas ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Nunca interceptar peticiones a dominios externos (Supabase, GitHub, etc.)
  if (url.origin !== self.location.origin) return;

  // 2. Solo manejar GET
  if (e.request.method !== 'GET') return;

  const isAppShell = url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.html')
    || url.pathname === BASE + '/'
    || url.pathname === BASE;

  if (isAppShell) {
    // Network-first: siempre intenta la red primero
    // Si hay respuesta → actualiza caché y devuelve la respuesta fresca
    // Si no hay red → usa caché como fallback
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })  // no-store: omitir caché HTTP del browser
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request)
            .then(cached => cached || caches.match(BASE + '/index.html'))
        )
    );
  } else {
    // Imágenes e iconos: cache-first (no cambian)
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request).catch(() => null))
    );
  }
});

// ── Mensaje desde la app para forzar actualización ───────────
// La app puede llamar: navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
