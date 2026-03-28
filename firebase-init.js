import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, getDocs, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getMessaging, getToken, onMessage }       from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js';

// ── Configuración Firebase por runtime para poder cambiar de proyecto sin tocar el bundle ──
const firebaseConfig = window.BBVA_FIREBASE_CONFIG || {
    apiKey:            "AIzaSyDbtGA_5oyQLWq9X41gsKsLwV7nr9iv0iQ",
    authDomain:        "team-blue-agents.firebaseapp.com",
    projectId:         "team-blue-agents",
    storageBucket:     "team-blue-agents.firebasestorage.app",
    messagingSenderId: "1003987130329",
    appId:             "1:1003987130329:web:1cfa39c493c6be356dabc8"
};
const VAPID_KEY = window.BBVA_FIREBASE_VAPID_KEY || 'BL1nSLXaN-rF8d5EP2SrGAH5YPOW1BTQuq0CD6aWRN6iHUpsHVk3eYZncsHWXdrfvTrkj7SrQHKOqyPpXjuiw9M';

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
        console.log('[updatePagosInteligentes] Ejecutando updateDoc en users/' + cedula);
        await updateDoc(doc(db, 'users', cedula), { pagosInteligentes: isActive });
        console.log('✅ pagosInteligentes actualizado en Firestore:', isActive);
    } catch (e) {
        console.error('❌ Error actualizando pagosInteligentes:', e.code, e.message);
    }
}

// Guarda los medios de pago y canales autorizados para Pagos Inteligentes
async function updatePISettings(piSettings) {
    const cedula = localStorage.getItem('bbva_user_id');
    if (!cedula) {
        console.warn('[updatePISettings] No hay cédula en localStorage. Abortando.');
        return;
    }
    try {
        await updateDoc(doc(db, 'users', cedula), { piSettings });
        console.log('✅ piSettings actualizado en Firestore:', JSON.stringify(piSettings));
    } catch (e) {
        console.error('❌ Error actualizando piSettings:', e.code, e.message);
    }
}

async function updateDeliveryData(deliveryData) {
    const cedula = localStorage.getItem('bbva_user_id');
    if (!cedula) {
        console.warn('[updateDeliveryData] No hay cédula en localStorage. Abortando.');
        return;
    }
    try {
        await updateDoc(doc(db, 'users', cedula), { deliveryData });
        console.log('✅ deliveryData actualizado en Firestore:', JSON.stringify(deliveryData));
    } catch (e) {
        console.error('❌ Error actualizando deliveryData:', e.code, e.message);
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

    localStorage.setItem('bbva_user',               name);
    localStorage.setItem('bbva_user_name',          name);
    localStorage.setItem('bbva_user_id',            cedula);
    localStorage.setItem('bbva_user_email',         email);
    localStorage.setItem('bbva_device_id',          deviceId);
    localStorage.setItem('bbva_pagos_inteligentes', 'false'); // nuevo usuario siempre inicia con PI desactivado

    return userData;
}

// ── Cuenta de Ahorros y Tarjeta de Crédito ───────────────────

/**
 * Crea los datos financieros (cuenta + tarjeta) al registrar un usuario.
 * accountId    = timestamp_1  (e.g. "1741036812345_1")
 * creditCardId = timestamp_2  (e.g. "1741036812345_2")
 * Display      = últimos 4 dígitos del timestamp (antes del "_")
 */
async function createUserFinancialData(cedula) {
    try {
        const ts           = Date.now().toString();
        const accountId    = `${ts}_1`;
        const creditCardId = `${ts}_2`;

        // Últimos 4 dígitos del timestamp para mostrar al usuario
        const accountDisplay = ts.slice(-4);
        const cardDisplay    = ts.slice(-4);

        const accountRef = doc(db, 'accounts', accountId);
        const cardRef    = doc(db, 'creditCards', creditCardId);

        await setDoc(accountRef, {
            cedula,
            accountId,
            accountNumber: `COL-${accountDisplay}-BBVA`,
            type:          'Cuenta de Ahorros',
            balance:       12000000,
            currency:      'COP',
            createdAt:     new Date().toISOString()
        });
        console.log('✅ Cuenta de ahorros creada:', accountId);

        await setDoc(cardRef, {
            cedula,
            creditCardId,
            cardNumber:       `**** **** **** ${cardDisplay}`,
            type:             'Tarjeta de Crédito',
            brand:            'Visa',
            availableBalance: 4000000,
            totalLimit:       4000000,
            currency:         'COP',
            createdAt:        new Date().toISOString()
        });
        console.log('✅ Tarjeta de crédito creada:', creditCardId);

        // Guardar los IDs en el documento del usuario para poder recuperarlos
        // setDoc con merge:true funciona tanto si el doc existe como si no
        await setDoc(doc(db, 'users', cedula), { accountId, creditCardId }, { merge: true });
        console.log('✅ IDs guardados en users/' + cedula);

        return { accountId, creditCardId };
    } catch (err) {
        console.error('❌ Error creando datos financieros:', err);
        throw err;
    }
}

/** Obtiene la cuenta de ahorros del usuario */
async function getUserAccount(cedula) {
    try {
        const userSnap = await getDoc(doc(db, 'users', cedula));
        if (!userSnap.exists()) return null;
        const accountId = userSnap.data().accountId;
        if (!accountId) return null;
        const snap = await getDoc(doc(db, 'accounts', accountId));
        return snap.exists() ? snap.data() : null;
    } catch (err) {
        console.error('❌ Error obteniendo cuenta:', err);
        return null;
    }
}

/** Obtiene la tarjeta de crédito del usuario */
async function getUserCreditCard(cedula) {
    try {
        const userSnap = await getDoc(doc(db, 'users', cedula));
        if (!userSnap.exists()) return null;
        const creditCardId = userSnap.data().creditCardId;
        if (!creditCardId) return null;
        const snap = await getDoc(doc(db, 'creditCards', creditCardId));
        return snap.exists() ? snap.data() : null;
    } catch (err) {
        console.error('❌ Error obteniendo tarjeta:', err);
        return null;
    }
}

/**
 * Descuenta un monto del saldo.
 * @param {string} cedula
 * @param {number} amount
 * @param {'account'|'card'} source
 * @returns {{ newBalance: number }}
 */
async function deductPayment(cedula, amount, source = 'account') {
    // Obtener los IDs desde el documento del usuario
    const userSnap = await getDoc(doc(db, 'users', cedula));
    if (!userSnap.exists()) throw new Error('Usuario no encontrado');
    const userData = userSnap.data();

    if (source === 'account') {
        if (!userData.accountId) throw new Error('ID de cuenta no encontrado');
        const accountRef  = doc(db, 'accounts', userData.accountId);
        const accountSnap = await getDoc(accountRef);
        if (!accountSnap.exists()) throw new Error('Cuenta no encontrada');
        const current = accountSnap.data().balance;
        if (current < amount) throw new Error('Saldo insuficiente');
        const newBalance = current - amount;
        await updateDoc(accountRef, {
            balance:                newBalance,
            lastTransactionAt:      new Date().toISOString(),
            lastTransactionAmount:  -amount
        });
        console.log(`✅ Débito cuenta: -$${amount.toLocaleString('es-CO')} | Nuevo saldo: $${newBalance.toLocaleString('es-CO')}`);
        return { newBalance, source: 'account' };
    }

    if (source === 'card') {
        if (!userData.creditCardId) throw new Error('ID de tarjeta no encontrado');
        const cardRef  = doc(db, 'creditCards', userData.creditCardId);
        const cardSnap = await getDoc(cardRef);
        if (!cardSnap.exists()) throw new Error('Tarjeta no encontrada');
        const current = cardSnap.data().availableBalance;
        if (current < amount) throw new Error('Cupo insuficiente');
        const newBalance = current - amount;
        await updateDoc(cardRef, {
            availableBalance:       newBalance,
            lastTransactionAt:      new Date().toISOString(),
            lastTransactionAmount:  -amount
        });
        console.log(`✅ Cargo tarjeta: -$${amount.toLocaleString('es-CO')} | Cupo restante: $${newBalance.toLocaleString('es-CO')}`);
        return { newBalance, source: 'card' };
    }

    throw new Error('Fuente de pago inválida: ' + source);
}

// ── Guardar transacción en Firestore ────────────────────────────
async function saveTransaction(cedula, { amount, source, productName, orderId, channel = 'app', storeId = '' }) {
    const txRef = collection(db, 'transactions', cedula, 'records');
    await addDoc(txRef, {
        amount,
        source,          // 'account' | 'card'
        productName,
        orderId,
        storeId,         // identificador de la tienda WooCommerce
        channel,         // 'telegram' | 'whatsapp' | 'alexa' | 'chats' | 'app'
        paidByPI: channel !== 'app',   // true si fue via Pagos Inteligentes
        createdAt: new Date().toISOString()
    });
}

// ── Leer transacciones del usuario ──────────────────────────────
async function getTransactions(cedula, maxItems = 50) {
    const txRef = collection(db, 'transactions', cedula, 'records');
    const q     = query(txRef, orderBy('createdAt', 'desc'), limit(maxItems));
    const snap  = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Solicitar permiso push y obtener FCM Token ────────────────
async function initPushNotifications(cedula, options = {}) {
    const { promptPermission = false } = options;
    try {
        if (!('Notification' in window)) {
            console.warn('[FCM] Este navegador no soporta notificaciones');
            return null;
        }

        let permission = Notification.permission;
        if (permission !== 'granted' && promptPermission) {
            console.log('[FCM] Solicitando permiso...');
            permission = await Notification.requestPermission();
        } else {
            console.log('[FCM] Estado actual del permiso:', permission);
        }
        console.log('[FCM] Permiso:', permission);

        if (permission !== 'granted') {
            console.warn('[FCM] Permiso denegado');
            return null;
        }

        // Registrar sw.js con path dinámico según el dominio
        const swPath  = location.hostname === 'acardonag.github.io' ? '/blue-agents-demo/sw.js' : '/sw.js';
        const swScope = location.hostname === 'acardonag.github.io' ? '/blue-agents-demo/'      : '/';
        console.log('[FCM] Registrando SW en:', swPath, '| Scope:', swScope);
        const swReg = await navigator.serviceWorker.register(swPath, { scope: swScope });
        await navigator.serviceWorker.ready;
        console.log('[FCM] ✅ SW registrado:', swReg.scope);
        console.log('[FCM] SW estado:', swReg.active?.state);

        // Verificar suscripción push existente
        const existingSub = await swReg.pushManager.getSubscription();
        console.log('[FCM] Suscripción previa:', existingSub ? '✅ existe' : '❌ ninguna');

        const token = await getToken(messaging, {
            vapidKey:                  VAPID_KEY,
            serviceWorkerRegistration: swReg
        });

        if (!token) {
            console.warn('[FCM] ⚠️ No se pudo obtener el token');
            return null;
        }

        console.log('[FCM] ✅ Token obtenido:', token);
        localStorage.setItem('bbva_fcm_token', token);

        // Verificar suscripción activa después de obtener token
        const activeSub = await swReg.pushManager.getSubscription();
        console.log('[FCM] Suscripción activa:', activeSub ? '✅' : '❌ falló');
        console.log('[FCM] Endpoint:', activeSub?.endpoint);

        // Guardar en Firestore
        if (cedula) {
            await updateDoc(doc(db, 'users', cedula), {
                fcmToken:     token,
                fcmUpdatedAt: new Date().toISOString(),
                deviceId:     generateDeviceId(),
                pushEndpoint: activeSub?.endpoint || null
            });
            console.log('[FCM] ✅ Token guardado en Firestore para:', cedula);
        }

        return token;
    } catch (err) {
        console.error('[FCM] ❌ Error:', err.code, err.message);
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
                icon:    '/icono-pwa.png',
                badge:   '/icono-pwa.png',
                tag:     data.type || 'bbva-foreground',
                vibrate: [200, 100, 200],
                data
            });
            console.log('[FCM] ✅ Notificación nativa mostrada via SW');
        }).catch(err => console.error('[FCM] ❌ Error mostrando notificación:', err));
    } else {
        console.warn('[FCM] ⚠️ Permiso de notificaciones:', Notification.permission);
    }

    // 2️⃣ Toast / modal dentro de la app según el tipo
    // AUTH_REQUEST: solo mostrar notificación nativa (el flujo se activa cuando el usuario hace clic)
    if (data.type === 'BIOMETRIC_REQUEST') {
        window.dispatchEvent(new CustomEvent('bbva-biometric-request', { detail: data }));
    } else if (data.type !== 'AUTH_REQUEST') {
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
window.updatePISettings            = updatePISettings;
window.updateDeliveryData          = updateDeliveryData;
window.initPushNotifications       = initPushNotifications;
window.enablePushNotifications     = (cedula) => initPushNotifications(cedula, { promptPermission: true });
window.createUserFinancialData     = createUserFinancialData;
window.getUserAccount              = getUserAccount;
window.getUserCreditCard           = getUserCreditCard;
window.deductPayment               = deductPayment;
window.saveTransaction             = saveTransaction;
window.getTransactions             = getTransactions;
window.firestoreDoc                = doc;
window.firestoreSetDoc             = setDoc;
window.firestoreGetDoc             = getDoc;
window.firebaseReady               = true;

console.log('🔥 Firebase inicializado correctamente');
window.dispatchEvent(new Event('firebase-ready'));
