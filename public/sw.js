const CACHE_NAME = 'invoice-maker-v2';
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

// STRATEGI: network-first untuk file app-shell lokal (HTML/CSS/JS).
// Ini PENTING: memastikan pengguna SELALU dapat versi kode terbaru saat online
// (mencegah bug "kode/tampilan lama nyangkut" akibat cache basi).
// Kalau offline, baru fallback ke cache supaya app tetap bisa dibuka.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin || event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
