// Offline-first service worker for the app's own files. Bump CACHE when you ship changes.
const CACHE = 'bloodsoup-v58';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './engine.js',
  './backend.js',
  './rules.js',
  './guide.js',
  './spawndata.js',
  './config.js',
  './vendor/supabase.js',
  './manifest.webmanifest',
  './icon.svg',
  './statue.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates show up), fall back to cache when offline.
// Only the app's own files are ever cached: requests to Supabase (accounts, characters,
// login tokens) are left alone so private data is never stored by the service worker.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
