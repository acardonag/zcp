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

    // ── Deep link desde push de autenticación: ?auth=1&cedula=XXXXXXXX ──
    if (urlParams.get('auth') === '1') {
        const cedula = urlParams.get('cedula') || '';
        history.replaceState({}, '', window.location.pathname);
        if (cedula) {
            sessionStorage.setItem('bbva_auth_from_push', '1');
            // Esperar a que el DOM y Firebase estén listos antes de navegar
            const doAuth = () => triggerAuthFromPush(cedula);
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                doAuth();
            } else {
                window.addEventListener('load', doAuth, { once: true });
            }
        }
    }

    // ── Welcome Screen ──
    document.getElementById('to-register')?.addEventListener('click', () => {
        const hint = document.getElementById('register-hint');
        if (hint) hint.style.display = 'none';
        showScreen('register-screen');
    });
    document.getElementById('to-login')?.addEventListener('click', () => {
        initLoginScreen();
        showScreen('login-screen');
    });

    // Prepara la pantalla de login según si hay usuario guardado localmente
    function initLoginScreen() {
        const savedName = localStorage.getItem('bbva_user');
        const savedId   = localStorage.getItem('bbva_user_id');

        if (savedName && savedId) {
            // Usuario conocido → saltar directamente al paso de contraseña
            console.log('[initLoginScreen] Usuario local encontrado:', savedName);
            loginStep    = 'password';
            loginUserData = { name: savedName, cedula: savedId,
                              pagosInteligentes: localStorage.getItem('bbva_pagos_inteligentes') === 'true' };

            document.getElementById('user-display').textContent    = savedName.split(' ')[0];
            document.getElementById('login-subtitle').textContent  = 'Ingresa tu contraseña para continuar';
            document.getElementById('login-cedula-section').style.display  = 'none';
            document.getElementById('login-password-section').style.display = 'block';
            document.getElementById('login-not-you').style.display          = 'inline-block';
            document.getElementById('show-biometrics').style.display        = 'flex';
            document.getElementById('do-login').textContent                 = 'Ingresar';
        } else {
            // Sin usuario guardado → pedir cédula
            resetLoginToStep1();
        }
    }

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

            // Verificar si la cédula ya está registrada
            console.log('[registro] Verificando si cédula ya existe:', cedula);
            console.log('[registro] window.checkUserExists disponible:', typeof window.checkUserExists);
            const yaExiste = await window.checkUserExists(cedula);
            console.log('[registro] Resultado checkUserExists:', yaExiste);
            if (yaExiste) {
                toast.style.background = '#FEF9C3';
                toast.style.color      = '#854D0E';
                toast.querySelector('span').textContent = 'Ya existe una cuenta con esta cédula.';
                toast.classList.remove('pi-toast-hidden');
                toast.classList.add('pi-toast-visible');
                if (window.lucide) window.lucide.createIcons();
                document.getElementById('reg-id').classList.add('input-error');
                setTimeout(() => {
                    toast.classList.remove('pi-toast-visible');
                    toast.classList.add('pi-toast-hidden');
                    toast.style.background = '';
                    toast.style.color      = '';
                }, 4000);
                btn.disabled    = false;
                btn.textContent = 'Crear cuenta →';
                return;
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
    document.getElementById('login-back')?.addEventListener('click', () => {
        resetLoginToStep1();
        showScreen('welcome-screen');
    });
    document.getElementById('login-close')?.addEventListener('click', () => {
        resetLoginToStep1();
        showScreen('welcome-screen');
    });
    document.getElementById('login-not-you')?.addEventListener('click', () => {
        resetLoginToStep1();
    });

    const DEFAULT_PASSWORD = '1234';
    let loginStep     = 'cedula';
    let loginUserData = null;

    function resetLoginToStep1() {
        loginStep     = 'cedula';
        loginUserData = null;
        document.getElementById('login-cedula').value                       = '';
        document.getElementById('login-password').value                     = '';
        document.getElementById('user-display').textContent                 = 'bienvenido';
        document.getElementById('login-subtitle').textContent               = 'Ingresa tu número de documento';
        document.getElementById('login-cedula-section').style.display       = 'block';
        document.getElementById('login-password-section').style.display     = 'none';
        document.getElementById('login-not-you').style.display              = 'none';
        document.getElementById('show-biometrics').style.display            = 'none';
        document.getElementById('do-login').textContent                     = 'Continuar';
        // Ocultar banner de autenticación push
        const banner = document.getElementById('login-auth-banner');
        if (banner) banner.style.display = 'none';
        clearCedulaError();
        clearLoginError();
    }

    const showLoginCedulaError = (msg) => {
        const input = document.getElementById('login-cedula');
        const err   = document.getElementById('login-cedula-error');
        const errMsg = document.getElementById('login-cedula-error-msg');
        input.classList.add('input-error');
        if (msg) errMsg.textContent = msg;
        err.classList.remove('login-error-hidden');
        err.classList.add('login-error-visible');
        if (window.lucide) window.lucide.createIcons();
    };

    const clearCedulaError = () => {
        document.getElementById('login-cedula')?.classList.remove('input-error');
        const err = document.getElementById('login-cedula-error');
        err?.classList.remove('login-error-visible');
        err?.classList.add('login-error-hidden');
    };

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
        document.getElementById('login-password')?.classList.remove('input-error');
        const err = document.getElementById('login-error');
        err?.classList.remove('login-error-visible');
        err?.classList.add('login-error-hidden');
    };

    // ── Auth desde notificación push: pre-cargar cédula y saltar al paso biométrico ──
    async function triggerAuthFromPush(cedula) {
        resetLoginToStep1();
        showScreen('login-screen');

        const banner = document.getElementById('login-auth-banner');
        if (banner) {
            banner.style.display = 'flex';
            if (window.lucide) window.lucide.createIcons();
        }

        const btn = document.getElementById('do-login');
        if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }

        try {
            if (!window.firebaseReady) {
                await new Promise((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error('Firebase timeout')), 10000);
                    window.addEventListener('firebase-ready', () => { clearTimeout(t); resolve(); }, { once: true });
                });
            }

            const userData = await window.getUserByCedula(cedula);
            if (!userData) {
                if (banner) banner.style.display = 'none';
                resetLoginToStep1();
                showLoginCedulaError('No encontramos esta cédula registrada.');
                if (btn) { btn.disabled = false; btn.textContent = 'Continuar'; }
                return;
            }

            loginUserData = userData;
            loginStep     = 'password';

            document.getElementById('user-display').textContent              = userData.name.split(' ')[0];
            document.getElementById('login-subtitle').textContent            = 'Verifica tu identidad para continuar';
            document.getElementById('login-cedula-section').style.display    = 'none';
            document.getElementById('login-password-section').style.display  = 'block';
            document.getElementById('login-not-you').style.display           = 'inline-block';
            document.getElementById('show-biometrics').style.display         = 'flex';
            document.getElementById('do-login').textContent                  = 'Ingresar';

        } catch (err) {
            console.error('[auth-push] Error:', err);
            if (banner) banner.style.display = 'none';
            resetLoginToStep1();
        }

        if (btn) btn.disabled = false;
    }

    document.getElementById('login-cedula')?.addEventListener('input', clearCedulaError);
    document.getElementById('login-password')?.addEventListener('input', clearLoginError);

    document.getElementById('do-login')?.addEventListener('click', async () => {
        const btn = document.getElementById('do-login');

        if (loginStep === 'cedula') {
            const cedula = document.getElementById('login-cedula')?.value.trim();
            if (!cedula) {
                showLoginCedulaError('Ingresa tu número de cédula.');
                return;
            }

            btn.disabled    = true;
            btn.textContent = 'Buscando...';
            clearCedulaError();

            try {
                if (!window.firebaseReady) {
                    await new Promise((resolve, reject) => {
                        const t = setTimeout(() => reject(new Error('Firebase timeout')), 10000);
                        window.addEventListener('firebase-ready', () => { clearTimeout(t); resolve(); }, { once: true });
                    });
                }

                console.log('[login] Buscando cédula:', cedula);
                loginUserData = await window.getUserByCedula(cedula);

                if (!loginUserData) {
                    showLoginCedulaError('No encontramos esta cédula. ¿Estás registrado?');
                    btn.disabled    = false;
                    btn.textContent = 'Continuar';
                    return;
                }

                // Cédula válida → mostrar campo de contraseña y biometría
                console.log('[login] Usuario encontrado:', loginUserData.name);
                document.getElementById('user-display').textContent                 = loginUserData.name.split(' ')[0];
                document.getElementById('login-subtitle').textContent               = 'Ingresa tu contraseña para continuar';
                document.getElementById('login-cedula-section').style.display       = 'none';
                document.getElementById('login-password-section').style.display     = 'block';
                document.getElementById('login-not-you').style.display              = 'inline-block';
                document.getElementById('show-biometrics').style.display            = 'flex';
                document.getElementById('do-login').textContent                     = 'Ingresar';
                document.getElementById('login-password').focus();
                loginStep = 'password';

            } catch (err) {
                console.error('[login] Error buscando cédula:', err);
                showLoginCedulaError('Error de conexión. Inténtalo de nuevo.');
            }

            btn.disabled    = false;
            btn.textContent = loginStep === 'password' ? 'Ingresar' : 'Continuar';

        } else {
            // Paso 2: validar contraseña
            const pw = document.getElementById('login-password')?.value;
            console.log('[login] Validando contraseña para:', loginUserData?.name);
            if (pw !== DEFAULT_PASSWORD) {
                showLoginError();
                return;
            }
            // Login exitoso
            state.userName = loginUserData.name;
            const cedLogin = loginUserData.cedula;
            localStorage.setItem('bbva_user',    loginUserData.name);
            localStorage.setItem('bbva_user_id', loginUserData.cedula);
            localStorage.setItem('bbva_pagos_inteligentes', loginUserData.pagosInteligentes ? 'true' : 'false');
            updateUI();
            clearLoginError();
            updatePromoBanner();
            loginStep = 'cedula';
            loginUserData = null;
            showScreen('dashboard-screen');
            // Solicitar permiso push y registrar FCM token
            if (window.initPushNotifications) window.initPushNotifications(cedLogin);
            // Mostrar modal de bienvenida PI si aplica
            showPIWelcomeModal();
        }
    });

    // Biometrics Simulation
    const biometricModal = document.getElementById('biometric-modal');
    document.getElementById('show-biometrics')?.addEventListener('click', () => {
        biometricModal.style.display = 'flex';
    });

    document.querySelector('.modal-cancel')?.addEventListener('click', () => {
        biometricModal.style.display = 'none';
    });

    document.getElementById('fingerprint-scan')?.addEventListener('click', () => {
        const icon = document.querySelector('#fingerprint-scan svg') || document.querySelector('#fingerprint-scan i');
        if (icon) {
            icon.style.transition = 'color 0.5s ease, stroke 0.5s ease';
            icon.style.color = '#1173d4';
            icon.style.stroke = '#1173d4';
        }

        const isFromPush = sessionStorage.getItem('bbva_auth_from_push') === '1';

        setTimeout(() => {
            biometricModal.style.display = 'none';

            if (isFromPush) {
                // ── Flujo desde notificación push ──
                sessionStorage.removeItem('bbva_auth_from_push');
                if (loginUserData) {
                    state.userName = loginUserData.name;
                    localStorage.setItem('bbva_user',               loginUserData.name);
                    localStorage.setItem('bbva_user_id',             loginUserData.cedula);
                    localStorage.setItem('bbva_pagos_inteligentes',  loginUserData.pagosInteligentes ? 'true' : 'false');
                    updateUI();
                }
                updatePromoBanner();
                showScreen('dashboard-screen');
                // Mostrar modal de éxito de autenticación
                const successModal = document.getElementById('auth-success-modal');
                if (successModal) {
                    successModal.style.display = 'flex';
                    if (window.lucide) window.lucide.createIcons();
                }
                const cedBio = localStorage.getItem('bbva_user_id');
                if (window.initPushNotifications) window.initPushNotifications(cedBio);
            } else {
                // ── Flujo normal de biometría ──
                updatePromoBanner();
                showScreen('dashboard-screen');
                showPIWelcomeModal();
                const cedBio = localStorage.getItem('bbva_user_id');
                if (window.initPushNotifications) window.initPushNotifications(cedBio);
            }

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

    // Guardar configuración
    document.getElementById('pi-save')?.addEventListener('click', async () => {
        const isActive = piToggle?.checked ?? false;
        console.log('[pi-save] Guardando configuración. isActive:', isActive);
        console.log('[pi-save] firebaseReady:', window.firebaseReady, '| updatePagosInteligentes:', typeof window.updatePagosInteligentes);
        console.log('[pi-save] cédula en localStorage:', localStorage.getItem('bbva_user_id'));
        localStorage.setItem(PI_KEY, isActive);

        // Sincronizar con Firestore si Firebase está listo
        if (window.firebaseReady && window.updatePagosInteligentes) {
            await window.updatePagosInteligentes(isActive);
        } else {
            console.warn('[pi-save] Firebase no disponible, solo guardado en localStorage.');
        }

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
    });

    // ── Escuchar notificaciones push en foreground ─────────────────────
    window.addEventListener('bbva-biometric-request', (event) => {
        const data = event.detail;
        console.log('[push] Biometric request recibido:', data);
        sessionStorage.setItem('bbva_auth_session',  data.sessionId     || '');
        sessionStorage.setItem('bbva_telegram_chat', data.telegramChatId || '');
        const bm = document.getElementById('biometric-modal');
        if (bm) {
            bm.style.display = 'flex';
            if (window.lucide) window.lucide.createIcons();
        }
    });

    // ── Escuchar evento de autenticación desde push (foreground) ──
    window.addEventListener('bbva-auth-request', (event) => {
        const data = event.detail;
        console.log('[push] Auth request recibido (foreground):', data);
        if (data.cedula) {
            sessionStorage.setItem('bbva_auth_from_push', '1');
            triggerAuthFromPush(data.cedula);
        }
    });

    // ── Escuchar mensajes del SW (app abierta, usuario clica la notificación) ──
    navigator.serviceWorker?.addEventListener('message', (event) => {
        const msg = event.data || {};
        console.log('[SW → app] Mensaje recibido:', msg);
        if (msg.type === 'AUTH_REQUEST' && msg.cedula) {
            sessionStorage.setItem('bbva_auth_from_push', '1');
            triggerAuthFromPush(msg.cedula);
        } else if (msg.type === 'BIOMETRIC_REQUEST') {
            sessionStorage.setItem('bbva_auth_session',  msg.sessionId     || '');
            sessionStorage.setItem('bbva_telegram_chat', msg.telegramChatId || '');
            const bm = document.getElementById('biometric-modal');
            if (bm) {
                bm.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
            }
        }
    });

    // ── Modal de éxito de autenticación ──
    document.getElementById('auth-success-cta')?.addEventListener('click', () => {
        document.getElementById('auth-success-modal').style.display = 'none';
        showPIWelcomeModal();
    });

    window.addEventListener('bbva-push-notification', (event) => {
        const { title, body } = event.detail;
        const piToast    = document.getElementById('pi-toast');
        const piToastMsg = document.getElementById('pi-toast-msg');
        if (piToast && piToastMsg) {
            piToastMsg.textContent = `${title}: ${body}`;
            piToast.classList.remove('pi-toast-hidden');
            piToast.classList.add('pi-toast-visible');
            setTimeout(() => {
                piToast.classList.remove('pi-toast-visible');
                piToast.classList.add('pi-toast-hidden');
            }, 4000);
        }
    });

    // ── PI Welcome Modal ──
    function showPIWelcomeModal() {
        // No mostrar si pagos inteligentes ya están activos
        if (localStorage.getItem('bbva_pagos_inteligentes') === 'true') return;
        // No mostrar si el usuario eligió no volver a ver
        if (localStorage.getItem('bbva_pi_modal_dismissed') === '1') return;

        const modal = document.getElementById('pi-welcome-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();

        document.getElementById('pi-welcome-cta')?.addEventListener('click', () => {
            modal.style.display = 'none';
            showScreen('pagos-inteligentes-screen');
        }, { once: true });

        document.getElementById('pi-welcome-later')?.addEventListener('click', () => {
            modal.style.display = 'none';
        }, { once: true });

        document.getElementById('pi-welcome-never')?.addEventListener('click', () => {
            localStorage.setItem('bbva_pi_modal_dismissed', '1');
            modal.style.display = 'none';
        }, { once: true });
    }

    // ── Helper de prueba (solo desarrollo) ────────────────────
    // Úsalo desde la consola del navegador:
    //   bbvaTestPush()                          → notificación genérica
    //   bbvaTestPush('biometric')               → solicitud biométrica
    //   bbvaTestPush('generic', 'Mi mensaje')   → texto personalizado
    window.bbvaTestPush = function(type = 'generic', body = 'Prueba de notificación BBVA') {
        const token = localStorage.getItem('bbva_fcm_token');
        console.log('─────────────────────────────────────');
        console.log('🔔 FCM Token activo:', token || '⚠️ No hay token (¿concediste permiso?)');
        console.log('─────────────────────────────────────');

        if (type === 'biometric') {
            // Simula un push de autenticación biométrica
            window.dispatchEvent(new CustomEvent('bbva-biometric-request', {
                detail: {
                    type:           'BIOMETRIC_REQUEST',
                    sessionId:      'test-session-' + Date.now(),
                    telegramChatId: '123456789',
                    userName:       localStorage.getItem('bbva_user') || 'Usuario'
                }
            }));
            console.log('✅ Evento biométrico simulado → el modal biométrico debería abrirse');
        } else {
            // Simula un push genérico (toast)
            window.dispatchEvent(new CustomEvent('bbva-push-notification', {
                detail: { title: 'BBVA Colombia', body }
            }));
            console.log('✅ Notificación genérica simulada → debería aparecer el toast');
        }

        // También dispara una notificación nativa del navegador si hay permiso
        if (Notification.permission === 'granted') {
            new Notification('BBVA Colombia', {
                body,
                icon: '/zcp/icono-pwa.png'
            });
            console.log('✅ Notificación nativa del navegador enviada');
        } else {
            console.warn('⚠️ Permiso de notificaciones no concedido. Permiso actual:', Notification.permission);
        }
    };

});
