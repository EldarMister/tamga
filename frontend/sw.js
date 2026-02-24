const CACHE_NAME = 'tamga-v4';

const STATIC_ASSETS = [
    '/',
    '/css/app.css',
    '/js/app.js',
    '/js/api.js',
    '/js/state.js',
    '/js/utils.js',
    '/js/i18n.js',
    '/js/components/tab-bar.js',
    '/js/components/toast.js',
    '/js/components/modal.js',
    '/js/pages/calculator.js',
    '/lang/ru.json',
    '/lang/ky.json',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// Install: pre-cache static shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch strategy:
//   /api/*          → network-first (always fresh data)
//   /api/uploads/*  → network-first (user photos)
//   everything else → stale-while-revalidate (fast + stays fresh in background)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin GET requests
    if (event.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // Network-first for API calls
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Stale-while-revalidate for static assets
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetched = fetch(event.request).then(response => {
                if (response.ok) {
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                }
                return response;
            }).catch(() => cached);
            return cached || fetched;
        })
    );
});
