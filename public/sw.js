const CACHE_NAME = 'invoice-maker-v7';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './assets/style.css',
  './assets/supabase-config.js',
  './assets/api.js',
  './assets/invoice-template.js',
  './assets/quotation-template.js',
  './assets/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(SHELL_FILES.map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// STRATEGI: NETWORK-FIRST dengan batas waktu.
// Selalu ambil versi terbaru dari server -> setiap HP otomatis menjalankan kode terbaru
// begitu online (penting: satu HP versi lama saja bisa merusak data bersama).
// Kalau server tidak menjawab dalam 4 detik / offline, baru pakai salinan tersimpan
// supaya aplikasi tetap bisa dibuka dan tidak "freeze".
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await Promise.race([
        fetch(event.request, { cache: 'no-cache' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
      ]);
      if (res && res.ok) cache.put(event.request, res.clone());
      return res;
    } catch (e) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return fetch(event.request);
    }
  })());
});
