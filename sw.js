// sw.js - Z-Keeper Service Worker
const CACHE_VERSION = 'zkeeper-ocr-v3';
const CACHE_NAME = `zkeeper-${CACHE_VERSION}`;

// App shell assets - cached on install
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Tesseract CDN paths (cached dynamically)
const OCR_PATTERNS = [
    'tesseract.js@5',
    'tesseract.js-core@5',
    'traineddata',
    'projectnaptha'
];

// =============================================================
// INSTALL EVENT
// =============================================================
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Cache the app shell
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
    // 1. TESSERACT & OCR ASSETS - Cache First, Network Fallback
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
                    // Cache successful API responses
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
    // 3. APP SHELL & OTHER ASSETS - Cache First, Network Fallback
    // ---------------------------------------------------------
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached, but update in background (stale-while-revalidate)
                    updateCacheInBackground(request);
                    return cachedResponse;
                }
                return fetchAndCache(request);
            })
            .catch(() => {
                // If offline and not cached, return offline page
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

/**
 * Check if URL is an OCR/Tesseract asset
 */
function isOcrAsset(url) {
    return OCR_PATTERNS.some(pattern => url.includes(pattern)) ||
           url.includes('jsdelivr') ||
           url.includes('tesseract');
}

/**
 * Check if URL is an API call (GitHub sync)
 */
function isApiCall(url) {
    return url.includes('api.github.com') || url.includes('githubusercontent');
}

/**
 * Fetch and cache a request
 */
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

/**
 * Background cache update (stale-while-revalidate)
 */
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
// MESSAGE HANDLER (for client communication)
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

    // Respond with current cache status
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
