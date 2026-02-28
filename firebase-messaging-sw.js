importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            "AIzaSyDFtznjbqtsJ2EOQXqic0ZvPcQWabzZ-YU",
    authDomain:        "zero-clic-payment.firebaseapp.com",
    projectId:         "zero-clic-payment",
    storageBucket:     "zero-clic-payment.firebasestorage.app",
    messagingSenderId: "367886461501",
    appId:             "1:367886461501:web:25e36faafd8ef4dde4d854"
});

const messaging = firebase.messaging();

// ── Notificaciones recibidas en BACKGROUND ─────────────────────
messaging.onBackgroundMessage((payload) => {
    console.log('[FCM-SW] Mensaje en background:', payload);

    const title = payload.notification?.title || 'BBVA Colombia';
    const body  = payload.notification?.body  || 'Tienes una nueva notificación';
    const data  = payload.data || {};

    const options = {
        body,
        icon:               '/zcp/icono-pwa.png',
        badge:              '/zcp/icono-pwa.png',
        tag:                data.type || 'bbva-push',
        requireInteraction: data.type === 'BIOMETRIC_REQUEST',
        data,
        actions: data.type === 'BIOMETRIC_REQUEST'
            ? [
                { action: 'approve', title: '✅ Aprobar' },
                { action: 'reject',  title: '❌ Rechazar' }
              ]
            : []
    };

    self.registration.showNotification(title, options);
});

// ── Clic en la notificación ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data   = event.notification.data || {};
    const action = event.action;

    console.log('[FCM-SW] Clic en notificación. Action:', action, '| Data:', data);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si la app ya está abierta → mandarle el mensaje y traerla al frente
            for (const client of clientList) {
                if ('focus' in client) {
                    client.postMessage({ type: data.type || 'PUSH_CLICK', action, ...data });
                    return client.focus();
                }
            }
            // Si está cerrada → abrirla
            const url = `https://acardonag.github.io/zcp/?push=1&type=${data.type || ''}&session=${data.sessionId || ''}`;
            return clients.openWindow(url);
        })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.log('[FCM-SW] Notificación cerrada sin interacción');
});
