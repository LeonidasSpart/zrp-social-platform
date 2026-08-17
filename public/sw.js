const CACHE_NAME = 'zrp-v6'; // Bumped: page navigations (not just "/") now use network-first, fixing stale like/repost status on post/comment/short pages served from a previously cached version
const STATIC_ASSETS = [
  '/favicon.ico',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/offline.html',
];

// ─── Install event – cache static assets and the root page ──────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cache static assets
      await cache.addAll(STATIC_ASSETS);
      // 2. Cache the root page (home)
      try {
        const response = await fetch('/');
        if (response.ok) {
          await cache.put('/', response);
        }
      } catch (e) {
        console.warn('Could not cache root page during install:', e);
      }
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

// ─── Fetch event – smart caching ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip API calls and non-GET requests — let the browser handle
  // these natively. Calling event.respondWith(fetch(event.request))
  // here is known to corrupt multipart/form-data bodies (e.g. image
  // uploads) on Safari/WebKit, since it re-issues the request through
  // the service worker instead of passing it through untouched.
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // 2. For the home page AND any other page navigation (post detail,
  // shorts, profile, etc.) - try network first, fallback to cache.
  // Previously only "/" got this treatment; every other page fell
  // through to rule 3 below (cache-first), which is fine for genuinely
  // static assets (JS/CSS/images) but wrong for page navigations that
  // embed personalized, frequently-changing data server-side (like
  // whether *this* viewer has liked a specific post/comment/short).
  // event.request.mode === "navigate" reliably distinguishes an actual
  // page load/route change from an asset request, so this only affects
  // navigations, not static files. This is also why "clear cache and
  // history" alone didn't fix stale like status - Service Worker Cache
  // Storage is a separate mechanism from what that browser action
  // typically clears, so a previously cached page could keep being
  // served with its old like state baked in until this fix.
  if (url.pathname === '/' || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If network succeeds, update cache and return response
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloned);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, serve from cache
          return caches.match(event.request)
            .then((cached) => cached || caches.match('/offline.html'));
        })
    );
    return;
  }

  // 3. For other assets – cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response, update cache in background
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
          // Fallback to offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Offline', { status: 503 });
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
