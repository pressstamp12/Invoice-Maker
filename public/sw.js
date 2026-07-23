const CACHE_NAME = 'invoice-maker-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './assets/style.css',
  './assets/supabase-config.js',
  './assets/api.js',
  './assets/invoice-template.js',
  './assets/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App-shell (HTML/CSS/JS lokal): cache-first supaya cepat & bisa dibuka offline.
// Request lain (Supabase API, CDN, dst): selalu ambil dari network agar data selalu fresh.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
