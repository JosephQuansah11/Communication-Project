/*
 * Service worker: what makes the app installable and usable on a phone.
 *
 * A home-screen app has to open without a network round trip, so the shell (the HTML
 * and the hashed build assets) is cached. Decks and uploads are never cached — they
 * live on the server and change — and neither are the live websocket upgrades.
 */
const CACHE = 'quandrion-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/** Requests that must always go to the network. */
const isLive = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/media/') ||
  url.pathname.startsWith('/ws') ||
  url.pathname.startsWith('/uploads/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isLive(url)) return;

  // Opening the app: try the network, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Build assets carry a content hash, so a cache hit is always the right file.
  const hashed = url.pathname.startsWith('/assets/');
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && hashed) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
    })
  );
});
