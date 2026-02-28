const CACHE_NAME = 'bbva-app-v6';
const ASSETS = [
    './',
    './index.html',
    './payment-approval.html',
    './styles.css',
    './app.js',
    './firebase-init.js',
    './manifest.json',
    './icono-pwa.png'
];

// Instalación: cachear todos los assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS.filter(url => !url.startsWith('http')));
        })
    );
    self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// URLs que siempre deben ir a la red (Firebase APIs y Firestore)
const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com'
];

// Fetch: network-only para Firebase APIs, cache-first para el resto
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // Firebase/Firestore → siempre red, nunca caché
    if (NETWORK_ONLY.some(domain => url.includes(domain))) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request)
                .then((response) => {
                    // Cachear respuestas exitosas (SDK de Firebase, fonts, lucide, assets)
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) =>
                            cache.put(event.request, clone)
                        );
                    }
                    return response;
                })
                .catch(() => {
                    // Offline fallback para navegación
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
        })
    );
});
