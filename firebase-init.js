import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc }      from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getMessaging, getToken, onMessage }       from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js';

// ── VAPID Key generada en Firebase Console → Project Settings → Cloud Messaging
const VAPID_KEY = 'BL1nSLXaN-rF8d5EP2SrGAH5YPOW1BTQuq0CD6aWRN6iHUpsHVk3eYZncsHWXdrfvTrkj7SrQHKOqyPpXjuiw9M';

const firebaseConfig = {
    apiKey:            "AIzaSyDFtznjbqtsJ2EOQXqic0ZvPcQWabzZ-YU",
    authDomain:        "zero-clic-payment.firebaseapp.com",
    projectId:         "zero-clic-payment",
    storageBucket:     "zero-clic-payment.firebasestorage.app",
    messagingSenderId: "367886461501",
    appId:             "1:367886461501:web:25e36faafd8ef4dde4d854"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const messaging   = getMessaging(firebaseApp);

function generateDeviceId() {
    const existing = localStorage.getItem('bbva_device_id');
    if (existing) return existing;
    const id = 'bbva-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    localStorage.setItem('bbva_device_id', id);
    return id;
}

// Verifica si ya existe un usuario con esa cédula
async function checkUserExists(cedula) {
    console.log('[checkUserExists] Buscando cédula en Firestore:', cedula);
    try {
        const snapshot = await getDoc(doc(db, 'users', cedula));
        const exists = snapshot.exists();
        console.log('[checkUserExists] ¿Existe?', exists, '| Datos:', exists ? snapshot.data() : 'ninguno');
        return exists;
    } catch (e) {
        console.error('[checkUserExists] Error al consultar Firestore:', e.code, e.message);
        throw e;
    }
}

// Obtiene los datos de un usuario por cédula
async function getUserByCedula(cedula) {
    console.log('[getUserByCedula] Buscando usuario:', cedula);
    try {
        const snapshot = await getDoc(doc(db, 'users', cedula));
        if (snapshot.exists()) {
            console.log('[getUserByCedula] Usuario encontrado:', snapshot.data().name);
            return snapshot.data();
        }
        console.warn('[getUserByCedula] No existe usuario con cédula:', cedula);
        return null;
    } catch (e) {
        console.error('[getUserByCedula] Error:', e.code, e.message);
        throw e;
    }
}

// Actualiza solo el campo pagosInteligentes en Firestore
async function updatePagosInteligentes(isActive) {
    const cedula = localStorage.getItem('bbva_user_id');
    console.log('[updatePagosInteligentes] cédula:', cedula, '| isActive:', isActive);
    if (!cedula) {
        console.warn('[updatePagosInteligentes] No hay cédula en localStorage. Abortando.');
        return;
    }
    try {
        const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
        console.log('[updatePagosInteligentes] Ejecutando updateDoc en users/' + cedula);
        await updateDoc(doc(db, 'users', cedula), { pagosInteligentes: isActive });
        console.log('✅ pagosInteligentes actualizado en Firestore:', isActive);
    } catch (e) {
        console.error('❌ Error actualizando pagosInteligentes:', e.code, e.message);
    }
}

async function registerUserInFirestore(name, cedula, email) {
    const deviceId = generateDeviceId();

    const userData = {
        name,
        cedula,
        email,
        deviceId,
        fcmToken:          localStorage.getItem('bbva_fcm_token') || null,
        registeredAt:      new Date().toISOString(),
        platform:          navigator.userAgent,
        pagosInteligentes: false
    };

    console.log('📝 Intentando guardar en Firestore...', { name, cedula, deviceId });

    try {
        await setDoc(doc(db, 'users', cedula), userData);
        console.log('✅ Guardado exitosamente en Firestore');
    } catch (e) {
        console.error('❌ Error Firestore:', e.code, e.message);
        throw e; // re-lanzar para que app.js lo capture y muestre el error real
    }

    localStorage.setItem('bbva_user',       name);
    localStorage.setItem('bbva_user_name',  name);
    localStorage.setItem('bbva_user_id',    cedula);
    localStorage.setItem('bbva_user_email', email);
    localStorage.setItem('bbva_device_id',  deviceId);

    return userData;
}

// ── Solicitar permiso push y obtener FCM Token ────────────────
async function initPushNotifications(cedula) {
    try {
        if (!('Notification' in window)) {
            console.warn('[FCM] Este navegador no soporta notificaciones');
            return null;
        }

        console.log('[FCM] Solicitando permiso de notificaciones...');
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            console.warn('[FCM] Permiso denegado por el usuario');
            return null;
        }

        // Registrar sw.js unificado (contiene FCM + cache)
        const swReg = await navigator.serviceWorker.register('/zcp/sw.js', { scope: '/zcp/' });
        await navigator.serviceWorker.ready;
        console.log('[FCM] ✅ SW registrado:', swReg.scope);

        const token = await getToken(messaging, {
            vapidKey:                  VAPID_KEY,
            serviceWorkerRegistration: swReg
        });

        if (!token) {
            console.warn('[FCM] No se pudo obtener el token');
            return null;
        }

        console.log('[FCM] ✅ Token obtenido:', token);
        localStorage.setItem('bbva_fcm_token', token);

        // Guardar token en Firestore vinculado al usuario
        if (cedula) {
            const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
            await updateDoc(doc(db, 'users', cedula), {
                fcmToken:     token,
                fcmUpdatedAt: new Date().toISOString(),
                deviceId:     generateDeviceId()
            });
            console.log('[FCM] Token guardado en Firestore para cédula:', cedula);
        }

        return token;
    } catch (err) {
        console.error('[FCM] Error al inicializar push:', err);
        return null;
    }
}

// ── Escuchar mensajes FCM en FOREGROUND ───────────────────────
onMessage(messaging, (payload) => {
    console.log('[FCM] Mensaje en foreground:', payload);
    const data  = payload.data || {};
    const notif = payload.notification || {};
    const title = notif.title || 'BBVA Colombia';
    const body  = notif.body  || '';

    // 1️⃣ Notificación nativa via SW (funciona en PWA y navegador)
    if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then((swReg) => {
            swReg.showNotification(title, {
                body,
                icon:    '/zcp/icono-pwa.png',
                badge:   '/zcp/icono-pwa.png',
                tag:     data.type || 'bbva-foreground',
                vibrate: [200, 100, 200],
                data
            });
            console.log('[FCM] ✅ Notificación nativa mostrada via SW');
        }).catch(err => console.error('[FCM] ❌ Error mostrando notificación:', err));
    } else {
        console.warn('[FCM] ⚠️ Permiso de notificaciones:', Notification.permission);
    }

    // 2️⃣ Toast / modal dentro de la app
    if (data.type === 'BIOMETRIC_REQUEST') {
        window.dispatchEvent(new CustomEvent('bbva-biometric-request', { detail: data }));
    } else {
        window.dispatchEvent(new CustomEvent('bbva-push-notification', {
            detail: { title, body, data }
        }));
    }
});

window.firebaseDB                  = db;
window.registerUserInFirestore     = registerUserInFirestore;
window.checkUserExists             = checkUserExists;
window.getUserByCedula             = getUserByCedula;
window.updatePagosInteligentes     = updatePagosInteligentes;
window.initPushNotifications       = initPushNotifications;
window.firestoreDoc                = doc;
window.firestoreSetDoc             = setDoc;
window.firestoreGetDoc             = getDoc;
window.firebaseReady               = true;

console.log('🔥 Firebase inicializado correctamente');
window.dispatchEvent(new Event('firebase-ready'));
