// public/sw.js
const CACHE_NAME = 'zrp-v2'; // ✅ Incremented version to force update
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html', // optional fallback page
];

// ─── Install event – cache static assets ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate event – clean old caches ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  event.waitUntil(clients.claim());
});

// ─── Fetch event – serve from cache, fallback to network ──────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip API calls and non-GET requests
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return event.respondWith(fetch(event.request));
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response, but update the cache in the background
        event.waitUntil(
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            })
            .catch(() => {})
        );
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloned);
            });
          }
          return response;
        })
        .catch(() => {
          // Optionally return offline fallback page
          return caches.match('/offline.html');
        });
    })
  );
});

// ─── Push Notification handling ──────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
    },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'ZRP Social', options)
  );
});

// ─── Notification click ────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.openWindow(url)
  );
});
