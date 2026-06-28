// sw.js - Z-Keeper Service Worker
const CACHE_VERSION = 'zkeeper-ocr-v3'; // 🔄 Bumped version
const CACHE_NAME = `zkeeper-${CACHE_VERSION}`;

// App shell assets - cached on install
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// CDN patterns to be cached aggressively (cache-first)
const OCR_PATTERNS = [
    'tesseract.js@5',
    'tesseract.js-core@5',
    'traineddata',
    'projectnaptha',
    'tensorflow',    // ✅ Added for TF.js
    'doctr',         // ✅ Added for docTR-TFJS
    'jsdelivr'       // Catch‑all for other CDN assets
];

// =============================================================
// INSTALL EVENT
// =============================================================
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(APP_SHELL);
            })
            .then(() => self.skipWaiting())
    );
});

// =============================================================
// ACTIVATE EVENT
// =============================================================
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log(`🧹 Deleting old cache: ${key}`);
                        return caches.delete(key);
                    })
            );
        })
        .then(() => self.clients.claim())
    );
});

// =============================================================
// FETCH EVENT
// =============================================================
self.addEventListener('fetch', event => {
    const url = event.request.url;
    const request = event.request;

    // ---------------------------------------------------------
    // 1. OCR & CDN ASSETS - Cache First, Network Fallback
    // ---------------------------------------------------------
    if (isOcrAsset(url)) {
        event.respondWith(
            caches.match(request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetchAndCache(request);
                })
                .catch(() => {
                    return new Response(
                        'OCR data not available offline. Please connect to the internet once to download.',
                        { status: 503, statusText: 'Offline' }
                    );
                })
        );
        return;
    }

    // ---------------------------------------------------------
    // 2. API CALLS (GitHub) - Network First, Cache Fallback
    // ---------------------------------------------------------
    if (isApiCall(url)) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }

    // ---------------------------------------------------------
    // 3. APP SHELL & OTHER ASSETS - Stale-While-Revalidate
    // ---------------------------------------------------------
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    updateCacheInBackground(request);
                    return cachedResponse;
                }
                return fetchAndCache(request);
            })
            .catch(() => {
                if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return new Response('Offline', { status: 503 });
            })
    );
});

// =============================================================
// HELPER FUNCTIONS
// =============================================================

function isOcrAsset(url) {
    return OCR_PATTERNS.some(pattern => url.includes(pattern));
}

function isApiCall(url) {
    return url.includes('api.github.com') || url.includes('githubusercontent');
}

function fetchAndCache(request) {
    return fetch(request)
        .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, clone);
                });
            }
            return networkResponse;
        });
}

function updateCacheInBackground(request) {
    fetch(request)
        .then(response => {
            if (response && response.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, response);
                });
            }
        })
        .catch(() => {});
}

// =============================================================
// MESSAGE HANDLER
// =============================================================
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data && event.data.action === 'clearCache') {
        caches.keys().then(keys => {
            keys.forEach(key => {
                if (key !== CACHE_NAME) {
                    caches.delete(key);
                }
            });
        });
    }
    if (event.data && event.data.action === 'getStatus') {
        caches.keys().then(keys => {
            event.ports[0].postMessage({
                cacheCount: keys.length,
                cacheNames: keys,
                version: CACHE_VERSION
            });
        });
    }
});
