import { initializeApp }                      from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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
    const snapshot = await getDoc(doc(db, 'users', cedula));
    return snapshot.exists();
}

// Actualiza solo el campo pagosInteligentes en Firestore
async function updatePagosInteligentes(isActive) {
    const cedula = localStorage.getItem('bbva_user_id');
    if (!cedula) return;
    try {
        const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
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

window.firebaseDB                  = db;
window.registerUserInFirestore     = registerUserInFirestore;
window.checkUserExists             = checkUserExists;
window.updatePagosInteligentes     = updatePagosInteligentes;
window.firestoreDoc                = doc;
window.firestoreSetDoc             = setDoc;
window.firestoreGetDoc             = getDoc;
window.firebaseReady               = true;

console.log('🔥 Firebase inicializado correctamente');
window.dispatchEvent(new Event('firebase-ready'));
