const CACHE_NAME = 'invoice-maker-v3';
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

// STRATEGI: stale-while-revalidate untuk file app-shell lokal (HTML/CSS/JS).
// Kalau ada versi tersimpan di cache, LANGSUNG dipakai (instan, tidak nunggu jaringan
// -> ini yang mencegah app "freeze"/lama saat sinyal lambat). Di saat bersamaan,
// versi terbaru tetap diambil dari server di belakang layar untuk update cache,
// dan auto-reload (lihat app.js) akan memuat versi baru itu di kunjungan berikutnya.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request).then(res => {
        cache.put(event.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
