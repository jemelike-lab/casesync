// CaseSync service worker — PWA installability + update signaling
const CACHE_NAME = 'casesync-v2';

self.addEventListener('install', (event) => {
  // Don't skipWaiting automatically — let the "Check for Updates" flow
  // control when the new SW activates via postMessage('SKIP_WAITING')
  // For fresh installs (no previous SW), skipWaiting is fine.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy — this SW exists primarily for PWA install
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline') || new Response('Offline', { status: 503 })
      )
    );
  }
});

// Listen for SKIP_WAITING message from the client (Check for Updates button)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
