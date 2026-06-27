// sw.js - Z-Keeper Service Worker
const CACHE_NAME = 'zkeeper-ocr-v1';

// We dynamically cache Tesseract files as they are requested, 
// but we can also pre-cache the known URLs here if needed.
const CORE_URLS = [
    './',
    './index.html'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_URLS))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Specifically target Tesseract and language data files
    if (url.includes('tesseract') || url.includes('traineddata') || url.includes('projectnaptha') || url.includes('jsdelivr')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                // Return cached version if we have it
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Otherwise fetch from network, then cache it for next time
                return fetch(event.request).then(networkResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                }).catch(() => {
                    // Offline and no cache
                    return new Response(null, { status: 503, statusText: 'Offline and no cache available' });
                });
            })
        );
    }
});
