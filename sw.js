// sw.js - Z-Keeper Service Worker
const CACHE_NAME = 'zkeeper-ocr-v2';
const APP_SHELL = [
    './',
    './index.html'
];

// Tesseract core URLs (cached dynamically via fetch)
const OCR_URLS = [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Cache the app shell
            return cache.addAll(APP_SHELL);
        })
    );
});

self.addEventListener('activate', event => {
    // Clean up old caches
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Cache Tesseract and language data files
    if (url.includes('tesseract') || 
        url.includes('traineddata') || 
        url.includes('projectnaptha') || 
        url.includes('jsdelivr') ||
        url.includes('tesseract.js-core')) {
        
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request).then(networkResponse => {
                    // Cache successful responses
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, clone);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Offline and no cache - return a fallback
                    return new Response(
                        'OCR data not available offline. Please connect to the internet once to download.',
                        { status: 503, statusText: 'Offline' }
                    );
                });
            })
        );
    } else {
        // For everything else - app shell strategy
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Network fallback
                return fetch(event.request).catch(() => {
                    // If both cache and network fail, show offline page
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
        );
    }
});
