const CACHE_NAME = 'gymtracker-v3';

// Detecta la base path automáticamente (funciona en localhost y GitHub Pages)
const BASE = self.location.pathname.replace(/\/service-worker\.js$/, '');

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/style.css',
  BASE + '/sync.js',
  BASE + '/manifest.json',
  // Módulos JS
  BASE + '/js/db.js',
  BASE + '/js/constants.js',
  BASE + '/js/utils.js',
  BASE + '/js/charts.js',
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

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match(BASE + '/index.html')))
  );
});
