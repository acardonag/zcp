// BBVA App Logic - Vanilla JS
document.addEventListener('DOMContentLoaded', () => {

    // ── Navigation Utility ──
    const showScreen = (screenId) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // ── State ──
    const state = {
        userName: localStorage.getItem('bbva_user') || '',
        isLoggedIn: false
    };

    const updateUI = () => {
        document.getElementById('user-display').innerText = state.userName;
        document.getElementById('dash-user').innerText = state.userName;
    };

    const updatePromoBanner = () => {
        const isActive = localStorage.getItem('bbva_pagos_inteligentes') === 'true';
        const inactive = document.getElementById('promo-inactive');
        const active   = document.getElementById('promo-active');
        if (inactive && active) {
            inactive.style.display = isActive ? 'none'  : 'block';
            active.style.display   = isActive ? 'block' : 'none';
        }
    };

    updateUI();

    // ── Auto-navegar si viene de payment-approval ──
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('screen') === 'dashboard') {
        updatePromoBanner();
        showScreen('dashboard-screen');
        history.replaceState({}, '', window.location.pathname);
    }

    // ── Welcome Screen ──
    document.getElementById('to-register')?.addEventListener('click', () => {
        const hint = document.getElementById('register-hint');
        if (hint) hint.style.display = 'none';
        showScreen('register-screen');
    });
    document.getElementById('to-login')?.addEventListener('click', () => {
        if (!localStorage.getItem('bbva_user')) {
            // No hay usuario registrado, invitar a registrarse
            const toast = document.getElementById('reg-toast');
            const toastMsg = toast.querySelector('span') || toast;
            // Mostrar pantalla de registro con un mensaje
            showScreen('register-screen');
            const hint = document.getElementById('register-hint');
            if (hint) hint.style.display = 'block';
            return;
        }
        showScreen('login-screen');
    });

    // Registration Screen
    document.getElementById('do-register')?.addEventListener('click', async () => {
        const name   = document.getElementById('reg-name').value.trim();
        const cedula = document.getElementById('reg-id').value.trim();
        const email  = document.getElementById('reg-email').value.trim();

        // Limpiar errores previos
        ['reg-name', 'reg-id', 'reg-email'].forEach(id =>
            document.getElementById(id)?.classList.remove('input-error')
        );

        // Validar campos
        let hasError = false;
        if (!name)   { document.getElementById('reg-name').classList.add('input-error');  hasError = true; }
        if (!cedula) { document.getElementById('reg-id').classList.add('input-error');    hasError = true; }
        if (!email)  { document.getElementById('reg-email').classList.add('input-error'); hasError = true; }
        if (hasError) return;

        const btn   = document.getElementById('do-register');
        const toast = document.getElementById('reg-toast');
        btn.disabled    = true;
        btn.textContent = 'Guardando...';

        try {
            // Esperar a Firebase con timeout de 10 segundos
            if (!window.firebaseReady) {
                console.log('⏳ Esperando Firebase...');
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Firebase no cargó a tiempo')), 10000);
                    window.addEventListener('firebase-ready', () => {
                        clearTimeout(timeout);
                        resolve();
                    }, { once: true });
                });
            }

            console.log('🚀 Firebase listo, registrando usuario...');
            await window.registerUserInFirestore(name, cedula, email);

            state.userName = name;
            updateUI();

            // Toast éxito
            toast.style.background = '';
            toast.style.color      = '';
            toast.querySelector('span').textContent = '¡Cuenta creada exitosamente!';
            toast.classList.remove('pi-toast-hidden');
            toast.classList.add('pi-toast-visible');
            if (window.lucide) window.lucide.createIcons();

            setTimeout(() => {
                toast.classList.remove('pi-toast-visible');
                toast.classList.add('pi-toast-hidden');
                btn.disabled    = false;
                btn.textContent = 'Crear cuenta →';
                showScreen('login-screen');
            }, 1800);

        } catch (err) {
            console.error('❌ Error al registrar:', err);

            const msg = err.code === 'permission-denied'
                ? 'Sin permisos. Verifica las reglas de Firestore.'
                : err.message || 'Error al guardar. Intenta de nuevo.';

            // Toast error
            toast.style.background = '#fee2e2';
            toast.style.color      = '#991b1b';
            toast.querySelector('span').textContent = msg;
            toast.classList.remove('pi-toast-hidden');
            toast.classList.add('pi-toast-visible');
            if (window.lucide) window.lucide.createIcons();

            setTimeout(() => {
                toast.classList.remove('pi-toast-visible');
                toast.classList.add('pi-toast-hidden');
                toast.style.background = '';
                toast.style.color      = '';
            }, 4000);

            btn.disabled    = false;
            btn.textContent = 'Crear cuenta →';
        }
    });

    document.getElementById('reg-to-login')?.addEventListener('click', () => showScreen('login-screen'));

    // Login Screen
    document.getElementById('login-back')?.addEventListener('click', () => showScreen('welcome-screen'));
    
    const DEFAULT_PASSWORD = '1234';

    const showLoginError = () => {
        const pwInput = document.getElementById('login-password');
        const err = document.getElementById('login-error');
        pwInput.classList.add('input-error');
        err.classList.remove('login-error-hidden');
        err.classList.add('login-error-visible');
        if (window.lucide) window.lucide.createIcons();
        pwInput.value = '';
        pwInput.focus();
    };

    const clearLoginError = () => {
        const pwInput = document.getElementById('login-password');
        const err = document.getElementById('login-error');
        pwInput?.classList.remove('input-error');
        err?.classList.remove('login-error-visible');
        err?.classList.add('login-error-hidden');
    };

    document.getElementById('login-password')?.addEventListener('input', clearLoginError);

    document.getElementById('do-login')?.addEventListener('click', () => {
        const pw = document.getElementById('login-password')?.value;
        if (pw !== DEFAULT_PASSWORD) {
            showLoginError();
            return;
        }
        clearLoginError();
        updatePromoBanner();
        showScreen('dashboard-screen');
    });

    // Biometrics Simulation
    const biometricModal = document.getElementById('biometric-modal');
    document.getElementById('show-biometrics')?.addEventListener('click', () => {
        biometricModal.style.display = 'flex';
    });

    document.querySelector('.modal-cancel')?.addEventListener('click', () => {
        biometricModal.style.display = 'none';
    });

    // Final "Biometric" Trigger (Click on Fingerprint)
    document.getElementById('fingerprint-scan')?.addEventListener('click', () => {
        // Simulate scanning animation
        const icon = document.querySelector('#fingerprint-scan svg') || document.querySelector('#fingerprint-scan i');
        if (icon) {
            icon.style.transition = 'color 0.5s ease, stroke 0.5s ease';
            icon.style.color = '#1173d4';
            icon.style.stroke = '#1173d4';
        }

        setTimeout(() => {
            biometricModal.style.display = 'none';
            // Show logical success
            updatePromoBanner();
            showScreen('dashboard-screen');
            if (icon) {
                icon.style.color = '';
                icon.style.stroke = '';
            }
        }, 1200);
    });

    // Home nav - sin lógica de cierre
    document.querySelectorAll('.nav-item')[0]?.addEventListener('click', () => {
        // Inicio activo - sin acción adicional
    });

    // Logout modal
    const logoutModal = document.getElementById('logout-modal');

    document.getElementById('nav-logout')?.addEventListener('click', () => {
        logoutModal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    });

    document.getElementById('logout-cancel')?.addEventListener('click', () => {
        logoutModal.style.display = 'none';
    });

    document.getElementById('logout-confirm')?.addEventListener('click', () => {
        logoutModal.style.display = 'none';
        showScreen('welcome-screen');
    });
    // ── Pagos Inteligentes ──
    const PI_KEY = 'bbva_pagos_inteligentes';
    const piToggle = document.getElementById('pi-toggle');
    const piToast = document.getElementById('pi-toast');
    const piToastMsg = document.getElementById('pi-toast-msg');

    // Cargar estado guardado
    const savedPI = localStorage.getItem(PI_KEY);
    if (piToggle && savedPI !== null) {
        piToggle.checked = savedPI === 'true';
    }

    // Navegar a Pagos Inteligentes desde el banner
    document.getElementById('promo-banner-btn')?.addEventListener('click', () => {
        showScreen('pagos-inteligentes-screen');
    });

    // Volver al dashboard
    document.getElementById('pi-back')?.addEventListener('click', () => {
        document.getElementById('app').classList.remove('dark-mode');
        showScreen('dashboard-screen');
    });

    // Guardar configuraci\u00f3n
    document.getElementById('pi-save')?.addEventListener('click', () => {
        const isActive = piToggle?.checked ?? false;
        localStorage.setItem(PI_KEY, isActive);

        const msg = isActive
            ? 'Pagos Inteligentes activados correctamente'
            : 'Pagos Inteligentes desactivados';

        piToastMsg.textContent = msg;
        piToast.classList.remove('pi-toast-hidden');
        piToast.classList.add('pi-toast-visible');
        if (window.lucide) window.lucide.createIcons();
        updatePromoBanner();

        setTimeout(() => {
            piToast.classList.remove('pi-toast-visible');
            piToast.classList.add('pi-toast-hidden');
        }, 3000);
    });

    // Dark mode toggle dentro de Pagos Inteligentes
    document.getElementById('pi-dark-mode')?.addEventListener('click', () => {
        document.getElementById('app').classList.toggle('dark-mode');
    });});
