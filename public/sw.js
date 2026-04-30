// Minimal service worker for PWA installability
const CACHE_NAME = 'casesync-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy - just pass through
  // This SW exists primarily to enable PWA install prompt
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline') || new Response('Offline', { status: 503 }))
    );
  }
});
