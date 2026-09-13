const CACHE_NAME = 'zrp-v7'; // Bumped: Next.js App Router client-side (RSC) navigation/prefetch requests are no longer treated as cacheable static assets - see the fetch handler's own comment below
const STATIC_ASSETS = [
  '/favicon.ico',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/offline.html',
];

// ─── Install event: cache static assets and the root page ──────
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

// ─── Activate event: clean old caches ────────────────────────────
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

// ─── Fetch event: smart caching ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip API calls and non-GET requests: let the browser handle
  // these natively. Calling event.respondWith(fetch(event.request))
  // here is known to corrupt multipart/form-data bodies (e.g. image
  // uploads) on Safari/WebKit, since it re-issues the request through
  // the service worker instead of passing it through untouched.
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Genuinely static, content-hashed or otherwise non-personalized
  // assets: build output chunks, the handful of files precached at
  // install, and anything else identifiable purely by extension. This is
  // an ALLOWLIST on purpose (see rule 2's comment below for why an
  // exclude-list is not safe here) - only requests recognized here ever
  // reach rule 3's cache-first handling.
  function isStaticAsset(pathname) {
    if (pathname.startsWith('/_next/static/')) return true;
    if (STATIC_ASSETS.includes(pathname)) return true;
    return /\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|map)$/i.test(pathname);
  }

  // 2. Network-first for the home page, any full-page navigation, AND -
  // this is the fix - every other same-origin GET that isn't recognized
  // as a static asset by isStaticAsset() above.
  //
  // That last clause matters because event.request.mode === 'navigate'
  // only covers an actual browser-level navigation (typing a URL,
  // clicking a plain <a>, a form submit). It does NOT cover how the
  // Next.js App Router itself moves between pages after the first load:
  // clicking a <Link>, a router.push(), and prefetching all go through
  // fetchServerResponse()'s createFetch(), which is a plain same-origin
  // fetch() call to the SAME page path carrying an `RSC: 1` header (see
  // node_modules/next/dist/client/components/router-reducer/
  // fetch-server-response.js - read directly, not assumed) - a request
  // this service worker's fetch handler DOES intercept, but whose `mode`
  // the Fetch/Service-Worker spec fixes at 'cors' (fetch()'s own
  // default), never 'navigate' - 'navigate' cannot be set from script at
  // all. Before this fix, such a request matched neither "/" nor
  // mode==='navigate', so it fell all the way through to rule 3's
  // cache-first handling below, exactly like a JS/CSS file: a second
  // client-side visit to the same route (a repeat Link click, browser
  // back/forward, or a stale prefetch resolving late) could be served a
  // CACHED RSC payload carrying stale personalized data (like/notification
  // state, or - on a shared/kiosk device where a different account has
  // since logged in - a previous account's page data entirely) instead of
  // the fresh network response every hard navigation to that exact URL
  // already correctly gets.
  //
  // Rewriting rule 3 as an allowlist of real static assets (above) rather
  // than trying to enumerate every personalized/dynamic path is
  // deliberate: a new personalized route added later is safe by default
  // (network-first) instead of silently inheriting cache-first the way an
  // exclude-list would.
  if (url.pathname === '/' || event.request.mode === 'navigate' || !isStaticAsset(url.pathname)) {
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

  // 3. For genuine static assets only (isStaticAsset() above): cache
  // first, fallback to network.
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
// ⚠️ Every push event MUST result in a shown notification. This used to
// call event.data.json() directly, outside any try/catch and before
// event.waitUntil() - a push whose body isn't valid JSON (malformed
// delivery, a future payload shape this worker doesn't know about yet)
// threw synchronously and skipped showNotification() entirely. Browsers
// treat a silent push as a violation of the Push API contract: Chrome
// injects its own generic "this site has been updated in the
// background" notification, and iOS/Safari's web push implementation
// can revoke the subscription outright after repeated events that never
// show anything - silently breaking push forever for that user, with no
// error surfaced anywhere the app could detect it. Parsing now happens
// inside the same waitUntil'd async function, wrapped so a malformed
// payload still produces a fallback notification instead of an
// unhandled rejection.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        if (event.data) data = event.data.json();
      } catch (e) {
        console.warn('Push payload was not valid JSON, showing a fallback notification:', e);
      }
      const options = {
        body: data.body || 'You have a new notification.',
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [200, 100, 200],
        data: {
          url: data.url || '/',
        },
      };
      await self.registration.showNotification(data.title || 'ZRP Social', options);
    })()
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
