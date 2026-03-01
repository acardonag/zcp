// ── Firebase Messaging (DEBE ir primero para que FCM funcione) ─
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            'AIzaSyDFtznjbqtsJ2EOQXqic0ZvPcQWabzZ-YU',
    authDomain:        'zero-clic-payment.firebaseapp.com',
    projectId:         'zero-clic-payment',
    storageBucket:     'zero-clic-payment.firebasestorage.app',
    messagingSenderId: '367886461501',
    appId:             '1:367886461501:web:25e36faafd8ef4dde4d854'
});

const messaging = firebase.messaging();

// ── Cache ──────────────────────────────────────────────────────
const CACHE_NAME = 'bbva-app-v15';
const ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/firebase-init.js',
    '/manifest.json',
    '/icono-pwa.png'
];

// ── Install ────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW v14] Instalando...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// ── Activate ───────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log('[SW v14] Activando...');
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── URLs que siempre van a la red ──────────────────────────────
const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'fcm.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'gstatic.com/firebasejs'
];

// ── Fetch ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    if (NETWORK_ONLY.some((domain) => url.includes(domain))) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) =>
                            cache.put(event.request, clone)
                        );
                    }
                    return response;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});

// ── FCM: notificaciones en BACKGROUND ─────────────────────────
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] 🔔 Push en background:', payload);
    const { title, body } = payload.notification || {};
    const data = payload.data || {};

    let actions = [];
    if (data.type === 'BIOMETRIC_REQUEST') {
        actions = [
            { action: 'approve', title: '✅ Aprobar' },
            { action: 'reject',  title: '❌ Rechazar' }
        ];
    } else if (data.type === 'AUTH_REQUEST') {
        actions = [
            { action: 'verify', title: '🔐 Verificar identidad' }
        ];
    }

    return self.registration.showNotification(title || 'BBVA Colombia', {
        body:               body || 'Tienes una nueva notificación',
        icon:               '/icono-pwa.png',
        badge:              '/icono-pwa.png',
        tag:                data.type || 'bbva-notification',
        requireInteraction: true,
        vibrate:            [200, 100, 200],
        data: {
            type:      data.type      || '',
            cedula:    data.cedula    || '',
            sessionId: data.sessionId || ''
        },
        actions
    });
});

// ── Clic en la notificación ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data   = event.notification.data || {};
    const action = event.action;
    console.log('[SW] Clic en notificación. Action:', action, '| Data:', data);

    // Construir URL de deep link según el tipo de notificación
    let targetUrl;
    if (data.type === 'AUTH_REQUEST') {
        targetUrl = 'https://zcp.augusto-cardona.workers.dev/?auth=1&cedula=' + encodeURIComponent(data.cedula || '');
    } else {
        targetUrl = 'https://zcp.augusto-cardona.workers.dev/?push=1&type=' + (data.type || '') + '&session=' + (data.sessionId || '');
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    // App abierta: navegar a la URL correcta y enfocar
                    client.postMessage({ type: data.type || 'PUSH_CLICK', action, ...data });
                    return client.focus().then(() => client.navigate(targetUrl));
                }
            }
            // App cerrada: abrir con deep link
            return clients.openWindow(targetUrl);
        })
    );
});
