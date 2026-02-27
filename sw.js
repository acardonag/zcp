const CACHE_NAME = 'bbva-app-v1';
const ASSETS = [
    './',
    './index.html',
    './payment-approval.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icono-pwa.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap',
    'https://unpkg.com/lucide@latest'
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

// Fetch: responder desde caché, con fallback a red
self.addEventListener('fetch', (event) => {
    // Solo manejar GET
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request)
                .then((response) => {
                    // Cachear respuestas exitosas de mismo origen
                    if (
                        response &&
                        response.status === 200 &&
                        response.type === 'basic'
                    ) {
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
