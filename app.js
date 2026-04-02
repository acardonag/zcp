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
        // Mostrar/ocultar chat-messenger según pantalla activa y canal habilitado
        const chatWrapper = document.getElementById('chat-messenger-wrapper');
        if (chatWrapper) chatWrapper.style.display = (screenId === 'dashboard-screen' && localStorage.getItem('bbva_chats_enabled') === 'true') ? 'block' : 'none';
    };

    // ── Login state (declarado al inicio para evitar TDZ en triggerAuthFromPush) ──
    const DEFAULT_PASSWORD = '1234';
    let loginStep     = 'cedula';
    let loginUserData = null;
    const AGENT_AUTH_RESULT_URLS = [
        'https://ces-session-bridge-1003987130329.us-central1.run.app/auth-result',
        // Backend de voz: se añade cuando esté en Cloud Run (configurar en config.js)
        ...(typeof window !== 'undefined' && window.VOICE_AGENT_BACKEND_URL
            ? [window.VOICE_AGENT_BACKEND_URL + '/auth-result']
            : [])
    ];

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

    // ── Formateo de moneda COP ──
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-CO', {
            style:                 'currency',
            currency:              'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    // ── Carga saldos reales desde Firestore en el dashboard ──
    async function loadDashboardBalances() {
        const cedula = localStorage.getItem('bbva_user_id');
        if (!cedula) return;

        // Activar skeleton en los 3 elementos
        const balanceEl    = document.getElementById('account-balance');
        const cardBalanceEl= document.getElementById('card-available-balance');
        const cardNumEl    = document.getElementById('card-number-display');
        [balanceEl, cardBalanceEl, cardNumEl].forEach(el => el?.classList.add('skeleton'));

        // Esperar a Firebase si no está listo aún
        if (!window.firebaseReady) {
            await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('Firebase timeout')), 8000);
                window.addEventListener('firebase-ready', () => { clearTimeout(t); resolve(); }, { once: true });
            }).catch(() => null);
        }
        if (!window.getUserAccount) return;

        try {
            const [account, card, userData] = await Promise.all([
                window.getUserAccount(cedula),
                window.getUserCreditCard(cedula),
                window.getUserByCedula ? window.getUserByCedula(cedula) : Promise.resolve(null)
            ]);

            // Sincronizar visibilidad del chat-messenger con la config de canales PI
            const chatsEnabled = !!userData?.piSettings?.channels?.chats;
            localStorage.setItem('bbva_chats_enabled', chatsEnabled ? 'true' : 'false');
            const chatWrapper = document.getElementById('chat-messenger-wrapper');
            if (chatWrapper) chatWrapper.style.display = chatsEnabled ? 'block' : 'none';

            if (account && balanceEl) {
                balanceEl.classList.remove('skeleton');
                balanceEl.innerHTML = `${formatCurrency(account.balance)} <span class="balance-currency">COP</span>`;
            }
            if (card) {
                if (cardBalanceEl) {
                    cardBalanceEl.classList.remove('skeleton');
                    cardBalanceEl.textContent = formatCurrency(card.availableBalance);
                }
                if (cardNumEl) {
                    cardNumEl.classList.remove('skeleton');
                    cardNumEl.textContent = card.cardNumber;
                }
            }
        } catch (err) {
            console.error('❌ Error cargando saldos:', err);
            // Quitar skeleton aunque falle
            [balanceEl, cardBalanceEl, cardNumEl].forEach(el => el?.classList.remove('skeleton'));
        }
        checkPendingPayment(cedula);
    }

    updateUI();

    // ── Auto-navegar si viene de payment-approval ──
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('screen') === 'dashboard') {
        updatePromoBanner();
        showScreen('dashboard-screen');
        loadDashboardBalances();
        history.replaceState({}, '', window.location.pathname);
    }

    // ── Deep link desde push de autenticación: ?auth=1&cedula=XXXXXXXX ──
    if (urlParams.get('auth') === '1') {
        const cedula    = urlParams.get('cedula')    || '';
        const sessionId = urlParams.get('sessionId') || '';
        const userName  = urlParams.get('userName')  || '';
        console.log('[url-params] 🔔 Push deep link detectado. Cédula:', cedula, '| SessionId:', sessionId, '| UserName:', userName);
        history.replaceState({}, '', window.location.pathname);
        if (cedula) {
            sessionStorage.setItem('bbva_auth_from_push', '1');
            if (sessionId) sessionStorage.setItem('bbva_push_session_id', sessionId);
            if (userName)  sessionStorage.setItem('bbva_push_user_name',  userName);
            // Esperar tanto al DOM como a Firebase antes de ejecutar
            const doAuth = async () => {
                console.log('[url-params] Ejecutando triggerAuthFromPush para:', cedula);
                console.log('[url-params] firebaseReady:', window.firebaseReady, '| getUserByCedula:', typeof window.getUserByCedula);
                await triggerAuthFromPush(cedula);
            };
            // Defer para asegurar que todos los listeners de app.js estén listos
            setTimeout(doAuth, 100);
        } else {
            console.warn('[url-params] ⚠️ Push deep link sin cédula en URL');
        }
    }

    // ── Welcome Screen ──
    document.getElementById('to-register')?.addEventListener('click', () => {
        // Limpiar campos del formulario
        document.getElementById('reg-name').value  = '';
        document.getElementById('reg-id').value    = '';
        document.getElementById('reg-email').value = '';
        // Ocultar hint y toast
        const hint = document.getElementById('register-hint');
        if (hint) hint.style.display = 'none';
        const toast = document.getElementById('reg-toast');
        if (toast) { toast.classList.add('pi-toast-hidden'); toast.classList.remove('pi-toast-visible'); }
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
        if (cedula && !/^\d+$/.test(cedula)) {
            document.getElementById('reg-id').classList.add('input-error');
            hasError = true;
        }
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

            // Crear cuenta de ahorros y tarjeta de crédito
            // Error aislado: si falla no aborta el registro (el usuario ya quedó guardado)
            if (window.createUserFinancialData) {
                try {
                    await window.createUserFinancialData(cedula);
                } catch (finErr) {
                    console.warn('⚠️ Datos financieros no creados (se reintentará al login):', finErr.message);
                }
            }

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

    // DEFAULT_PASSWORD, loginStep y loginUserData declarados al inicio del callback

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

    async function notifyAgentAuthResult({ sessionId, status, cedula, userName }) {
        if (!sessionId) return false;

        const payload = JSON.stringify({
            sessionId,
            status,
            cedula,
            userName
        });

        for (const url of AGENT_AUTH_RESULT_URLS) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                });

                if (res.ok) {
                    console.log('✅ Sesión confirmada en CES bridge:', sessionId, '| URL:', url);
                    return true;
                }

                console.warn('⚠️ CES bridge respondió con error:', url, res.status);
            } catch (error) {
                console.warn('⚠️ CES bridge no respondió:', url, error.message);
            }
        }

        return false;
    }

    // ── Auth desde notificación push: buscar usuario y abrir modal biométrico ──
    async function triggerAuthFromPush(cedula, context = {}) {
        console.log('[auth-push] 🔔 triggerAuthFromPush() llamado con cédula:', cedula);
        console.log('[auth-push] Estado actual → firebaseReady:', window.firebaseReady, '| getUserByCedula:', typeof window.getUserByCedula);

        const pushSessionId = String(context?.sessionId || '').trim();
        const pushUserName = String(context?.userName || '').trim();
        if (pushSessionId) {
            sessionStorage.setItem('bbva_push_session_id', pushSessionId);
            sessionStorage.setItem('bbva_auth_session', pushSessionId);
            localStorage.setItem('bbva_push_session_id', pushSessionId);
            localStorage.setItem('bbva_auth_session', pushSessionId);
            console.log('[auth-push] SessionId de push guardado:', pushSessionId);
        }
        if (pushUserName) {
            sessionStorage.setItem('bbva_push_user_name', pushUserName);
            localStorage.setItem('bbva_push_user_name', pushUserName);
            console.log('[auth-push] UserName de push guardado:', pushUserName);
        }

        try {
            // Esperar a Firebase si no está listo
            if (!window.firebaseReady || typeof window.getUserByCedula !== 'function') {
                console.log('[auth-push] ⏳ Esperando evento firebase-ready...');
                await new Promise((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error('Firebase timeout 10s')), 10000);
                    window.addEventListener('firebase-ready', () => {
                        console.log('[auth-push] ✅ firebase-ready recibido');
                        clearTimeout(t);
                        resolve();
                    }, { once: true });
                });
            }

            console.log('[auth-push] 🔍 Buscando usuario en Firestore para cédula:', cedula);
            const userData = await window.getUserByCedula(cedula);
            console.log('[auth-push] Resultado Firestore:', userData ? '✅ encontrado: ' + userData.name : '❌ no encontrado');

            if (!userData) {
                console.warn('[auth-push] ⚠️ Usuario no encontrado, abortando flujo biométrico');
                return;
            }

            // Guardar datos del usuario para el flujo biométrico
            loginUserData = userData;
            loginStep     = 'password';
            sessionStorage.setItem('bbva_auth_from_push', '1');
            console.log('[auth-push] loginUserData seteado:', loginUserData.name, '| loginStep:', loginStep);

            // Mostrar nombre en el modal biométrico
            const userInfo = document.getElementById('biometric-user-info');
            const userName = document.getElementById('biometric-user-name');
            if (userInfo && userName) {
                userName.textContent = userData.name.split(' ').slice(0, 2).join(' ');
                userInfo.style.display = 'block';
                console.log('[auth-push] Nombre mostrado en modal:', userName.textContent);
            }

            // Abrir directamente el modal biométrico
            const bm = document.getElementById('biometric-modal');
            if (bm) {
                console.log('[auth-push] 👁️ Abriendo modal biométrico...');
                bm.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
                console.log('[auth-push] ✅ Modal biométrico abierto');
            } else {
                console.error('[auth-push] ❌ No se encontró el elemento #biometric-modal en el DOM');
            }

        } catch (err) {
            console.error('[auth-push] ❌ Error en triggerAuthFromPush:', err.message, err);
        }
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
                if (window.enablePushNotifications && cedula) {
                    window.enablePushNotifications(cedula);
                }
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
            // Usar el valor que ya tiene loginUserData (viene de Firestore si el usuario
            // escribió la cédula manualmente, o de localStorage si era sesión guardada)
            localStorage.setItem('bbva_pagos_inteligentes', loginUserData.pagosInteligentes ? 'true' : 'false');
            updateUI();
            clearLoginError();
            updatePromoBanner();
            loginStep = 'cedula';
            loginUserData = null;
            showScreen('dashboard-screen');
            // Deeplink: pago pendiente desde Alexa (usuario llegó sin sesión activa)
            const _pendingDeeplink = sessionStorage.getItem('bbva_pending_deeplink');
            if (_pendingDeeplink) {
                sessionStorage.removeItem('bbva_pending_deeplink');
                window.location.href = 'payment-approval.html' + _pendingDeeplink;
                return;
            }
            loadDashboardBalances();
            // Registrar FCM con prompt explícito en un gesto del usuario
            if (window.enablePushNotifications) {
                window.enablePushNotifications(cedLogin);
            } else if (window.initPushNotifications) {
                window.initPushNotifications(cedLogin, { promptPermission: true });
            }
            // Re-sincronizar pagosInteligentes desde Firestore en segundo plano
            // (necesario cuando el login omitió la búsqueda en Firestore por sesión guardada)
            if (window.getUserByCedula) {
                window.getUserByCedula(cedLogin).then(freshData => {
                    if (freshData) {
                        localStorage.setItem('bbva_pagos_inteligentes', freshData.pagosInteligentes ? 'true' : 'false');
                        updatePromoBanner();
                    }
                }).catch(() => {});
            }
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
        const isFromPush = sessionStorage.getItem('bbva_auth_from_push') === '1';
        biometricModal.style.display = 'none';
        // Ocultar info de usuario push al cancelar
        const userInfo = document.getElementById('biometric-user-info');
        if (userInfo) userInfo.style.display = 'none';
        sessionStorage.removeItem('bbva_auth_from_push');
        console.log('[biometric] Modal cancelado | isFromPush:', isFromPush);

        // Si venía de notificación push, notificar RECHAZADO al agente de voz
        if (isFromPush) {
            const pushSessionId =
                sessionStorage.getItem('bbva_push_session_id') ||
                sessionStorage.getItem('bbva_auth_session')    ||
                localStorage.getItem('bbva_push_session_id')  ||
                localStorage.getItem('bbva_auth_session')     || '';
            const pushUserName = sessionStorage.getItem('bbva_push_user_name') || localStorage.getItem('bbva_user') || '';
            const cedula = localStorage.getItem('bbva_user_id') || loginUserData?.cedula || '';
            console.log('[biometric cancel] Enviando RECHAZADO → sessionId:', pushSessionId, '| cedula:', cedula);
            if (pushSessionId) {
                notifyAgentAuthResult({ status: 'RECHAZADO', sessionId: pushSessionId, cedula, userName: pushUserName })
                    .catch(err => console.warn('[biometric cancel] Error notificando rechazo:', err.message));
            }
            // Limpiar todas las claves de sesión push
            ['bbva_push_session_id', 'bbva_auth_session', 'bbva_push_user_name'].forEach(k => {
                sessionStorage.removeItem(k);
                localStorage.removeItem(k);
            });
        }
    });

    document.getElementById('fingerprint-scan')?.addEventListener('click', () => {
        console.log('[fingerprint] 👆 Huella tocada');
        const icon = document.querySelector('#fingerprint-scan svg') || document.querySelector('#fingerprint-scan i');
        if (icon) {
            icon.style.transition = 'color 0.5s ease, stroke 0.5s ease';
            icon.style.color = '#1173d4';
            icon.style.stroke = '#1173d4';
        }

        const isFromPush = sessionStorage.getItem('bbva_auth_from_push') === '1';
        console.log('[fingerprint] isFromPush:', isFromPush, '| loginUserData:', loginUserData?.name || 'null');

        const cedPrompt = localStorage.getItem('bbva_user_id') || loginUserData?.cedula || '';
        if (cedPrompt && window.enablePushNotifications) {
            window.enablePushNotifications(cedPrompt);
        }

        setTimeout(() => {
            biometricModal.style.display = 'none';
            // Ocultar info de usuario push
            const userInfo = document.getElementById('biometric-user-info');
            if (userInfo) userInfo.style.display = 'none';

            if (isFromPush) {
                // ── Flujo desde notificación push ──
                sessionStorage.removeItem('bbva_auth_from_push');
                console.log('[fingerprint] Flujo PUSH → loginUserData:', loginUserData?.name);
                if (loginUserData) {
                    state.userName = loginUserData.name;
                    localStorage.setItem('bbva_user',               loginUserData.name);
                    localStorage.setItem('bbva_user_id',             loginUserData.cedula);
                    localStorage.setItem('bbva_pagos_inteligentes',  loginUserData.pagosInteligentes ? 'true' : 'false');
                    updateUI();
                    console.log('[fingerprint] ✅ Usuario guardado en localStorage:', loginUserData.name);
                } else {
                    console.warn('[fingerprint] ⚠️ loginUserData es null en flujo push');
                }
                // ── Notificar a CES que la autenticación biométrica fue exitosa ──
                (async () => {
                    const pushSessionId =
                        sessionStorage.getItem('bbva_push_session_id') ||
                        sessionStorage.getItem('bbva_auth_session') ||
                        localStorage.getItem('bbva_push_session_id') ||
                        localStorage.getItem('bbva_auth_session') ||
                        '';
                    const pushUserName  = sessionStorage.getItem('bbva_push_user_name')  || localStorage.getItem('bbva_user') || '';
                    console.log('[fingerprint] Preparando notifyAgentAuthResult', {
                        pushSessionId,
                        cedula: localStorage.getItem('bbva_user_id') || '',
                        userName: pushUserName
                    });
                    sessionStorage.removeItem('bbva_push_session_id');
                    sessionStorage.removeItem('bbva_auth_session');
                    sessionStorage.removeItem('bbva_push_user_name');
                    localStorage.removeItem('bbva_push_session_id');
                    localStorage.removeItem('bbva_auth_session');
                    localStorage.removeItem('bbva_push_user_name');
                    if (pushSessionId) {
                        try {
                            await notifyAgentAuthResult({
                                status: 'APROBADO',
                                sessionId: pushSessionId,
                                cedula: localStorage.getItem('bbva_user_id') || '',
                                userName: pushUserName
                            });
                        } catch (err) {
                            console.warn('⚠️ No se pudo notificar a CES, continuando al dashboard:', err.message);
                        }
                    }
                })();
                updatePromoBanner();
                showScreen('dashboard-screen');
                loadDashboardBalances();
                // Mostrar modal de éxito de autenticación
                const successModal = document.getElementById('auth-success-modal');
                if (successModal) {
                    successModal.style.display = 'flex';
                    if (window.lucide) window.lucide.createIcons();
                    console.log('[fingerprint] ✅ Modal de éxito mostrado');
                }
                const cedBio = localStorage.getItem('bbva_user_id');
                if (window.enablePushNotifications) {
                    window.enablePushNotifications(cedBio);
                } else if (window.initPushNotifications) {
                    window.initPushNotifications(cedBio, { promptPermission: true });
                }
            } else {
                // ── Flujo normal de biometría ──
                console.log('[fingerprint] Flujo NORMAL → dashboard');
                updatePromoBanner();
                showScreen('dashboard-screen');
                loadDashboardBalances();
                showPIWelcomeModal();
                const cedBio = localStorage.getItem('bbva_user_id');
                if (window.enablePushNotifications) {
                    window.enablePushNotifications(cedBio);
                } else if (window.initPushNotifications) {
                    window.initPushNotifications(cedBio, { promptPermission: true });
                }
            }

            if (icon) {
                icon.style.color = '';
                icon.style.stroke = '';
            }
        }, 1200);
    });

    // Home nav
    document.querySelectorAll('.nav-item')[0]?.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.nav-item')[0].classList.add('active');
        showScreen('dashboard-screen');
        loadDashboardBalances();
    });

    // ── Pago pendiente: IndexedDB helpers ──────────────────────
    function openPendingDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('bbva-pending', 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('payments')) {
                    db.createObjectStore('payments', { keyPath: 'orderId' });
                }
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function checkPendingPayment(cedula) {
        const FIVE_MIN = 5 * 60 * 1000;
        const card     = document.getElementById('pending-payment-card');
        if (!card) return;
        try {
            const db  = await openPendingDB();
            const all = await new Promise((resolve, reject) => {
                const t   = db.transaction('payments', 'readonly');
                const req = t.objectStore('payments').getAll();
                req.onsuccess = e => resolve(e.target.result);
                req.onerror   = e => reject(e.target.error);
            });
            const now     = Date.now();
            const pending = all.find(p =>
                p.cedula  === cedula &&
                p.status  === 'pending' &&
                (now - p.timestamp) < FIVE_MIN
            );
            if (pending) {
                const sub = document.getElementById('pending-sub-text');
                if (sub) sub.innerHTML = `${pending.productName} &bull; <strong>$${parseInt(pending.amount).toLocaleString('es-CO')}</strong>`;
                card.href = `payment-approval.html`
                    + `?product=${encodeURIComponent(pending.productName)}`
                    + `&amount=${encodeURIComponent(pending.amount)}`
                    + `&reference=${encodeURIComponent(pending.orderId)}`
                    + `&orderId=${encodeURIComponent(pending.orderId)}`
                    + `&orderKey=${encodeURIComponent(pending.orderKey || '')}`
                    + `&sessionId=${encodeURIComponent(pending.sessionId)}`
                    + `&cedula=${encodeURIComponent(pending.cedula)}`
                    + `&storeId=${encodeURIComponent(pending.storeId || '')}`
                    + `&productId=${encodeURIComponent(pending.productId || '')}`
                    + `&image=${encodeURIComponent(pending.imageUrl || '')}`
                    + `&shippingRecipient=${encodeURIComponent(pending.shippingRecipient || '')}`
                    + `&shippingAddress=${encodeURIComponent(pending.shippingAddress || '')}`
                    + `&shippingCity=${encodeURIComponent(pending.shippingCity || '')}`
                    + `&shippingDepartment=${encodeURIComponent(pending.shippingDepartment || '')}`
                    + `&shippingEmail=${encodeURIComponent(pending.shippingEmail || '')}`
                    + `&shippingPhone=${encodeURIComponent(pending.shippingPhone || '')}`;
                card.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
            } else {
                card.style.display = 'none';
            }
        } catch (e) {
            console.warn('[PendingPayment] Error:', e);
            card.style.display = 'none';
        }
    }

    async function loadMovimientos() {
        const cedula = localStorage.getItem('bbva_user_id');
        const list   = document.getElementById('mov-list');
        const empty  = document.getElementById('mov-empty');
        const loading = document.getElementById('mov-loading');
        if (!list || !cedula) return;
        list.innerHTML = '';
        if (loading) loading.style.display = 'flex';
        if (empty)   empty.style.display   = 'none';

        const CHANNEL_ICONS = {
            telegram:  '✈️',
            whatsapp:  '💬',
            alexa:     '🔵',
            chats:     '💙',
            app:       '📱'
        };
        const CHANNEL_LABELS = {
            telegram:  'Telegram',
            whatsapp:  'WhatsApp',
            alexa:     'Alexa',
            chats:     'Chat App',
            app:       'App'
        };
        const SOURCE_LABELS = {
            account: 'Cuenta de Ahorros',
            card:    'Tarjeta de Crédito'
        };

        try {
            const txs = await window.getTransactions(cedula);
            if (loading) loading.style.display = 'none';
            if (!txs || txs.length === 0) {
                if (empty) empty.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
                return;
            }
            let lastMonth = '';
            txs.forEach(tx => {
                const date    = new Date(tx.createdAt);
                const month   = date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
                const dayTime = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
                              + ' · ' + date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                const amount  = '$' + parseInt(tx.amount).toLocaleString('es-CO');
                const channel     = tx.channel || 'app';
                const icon        = CHANNEL_ICONS[channel]  || '📱';
                const label       = CHANNEL_LABELS[channel] || channel;
                const isPI        = tx.paidByPI;
                const source      = tx.source || 'account';
                const sourceLabel = SOURCE_LABELS[source] || source;

                if (month !== lastMonth) {
                    lastMonth = month;
                    const lbl = document.createElement('div');
                    lbl.className = 'mov-month-label';
                    lbl.textContent = month.charAt(0).toUpperCase() + month.slice(1);
                    list.appendChild(lbl);
                }

                const el = document.createElement('div');
                el.className = 'mov-item';
                el.dataset.source = source;
                el.innerHTML = `
                    <div class="mov-icon-wrap ${isPI ? 'pi' : 'app'}" title="${label}">${icon}</div>
                    <div class="mov-info">
                        <div class="mov-product">${tx.productName || 'Pago'}</div>
                        <div class="mov-sub">
                            <span>${dayTime}</span>
                            <span class="mov-source-badge ${source}">${source === 'card' ? '💳' : '🏦'} ${sourceLabel}</span>
                            ${isPI ? `<span class="mov-pi-badge">⚡ PI · ${label}</span>` : ''}
                        </div>
                    </div>
                    <div class="mov-amount">-${amount}</div>
                `;
                list.appendChild(el);
            });
        } catch (e) {
            if (loading) loading.style.display = 'none';
            console.error('[Movimientos] Error:', e);
            if (list) list.innerHTML = '<p style="color:#999;text-align:center;padding:32px;">Error al cargar movimientos</p>';
        }
    }

    // Logout modal
    const logoutModal = document.getElementById('logout-modal');

    // Movimientos nav
    document.getElementById('nav-movimientos')?.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById('nav-movimientos').classList.add('active');
        showScreen('movimientos-screen');
        loadMovimientos();
    });

    // Botón atrás en movimientos
    document.getElementById('mov-back')?.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.nav-item')[0].classList.add('active');
        showScreen('dashboard-screen');
        loadDashboardBalances();
    });

    document.getElementById('nav-logout')?.addEventListener('click', () => {
        logoutModal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    });

    document.getElementById('logout-cancel')?.addEventListener('click', () => {
        logoutModal.style.display = 'none';
    });

    document.getElementById('logout-confirm')?.addEventListener('click', () => {
        logoutModal.style.display = 'none';
        // Limpiar sesión del usuario anterior para evitar contaminación de estado
        localStorage.removeItem('bbva_user');
        localStorage.removeItem('bbva_user_name');
        localStorage.removeItem('bbva_user_id');
        localStorage.removeItem('bbva_user_email');
        localStorage.removeItem('bbva_pagos_inteligentes');
        localStorage.removeItem('bbva_pi_modal_dismissed');
        localStorage.removeItem('bbva_chats_enabled');
        // Resetear toggle PI a inactivo
        const tog = document.getElementById('pi-toggle');
        if (tog) tog.checked = false;
        applyPIToggleUI(false);
        updatePromoBanner();
        showScreen('welcome-screen');
    });
    // ── Pagos Inteligentes ──
    const PI_KEY    = 'bbva_pagos_inteligentes';
    const piToggle  = document.getElementById('pi-toggle');
    const piToast   = document.getElementById('pi-toast');
    const piToastMsg = document.getElementById('pi-toast-msg');

    // ── Muestra/oculta secciones PI según estado del toggle ──
    function applyPIToggleUI(isActive) {
        const pmSection  = document.getElementById('pi-payment-methods-section');
        const chSection  = document.getElementById('pi-channels-section');
        const accHeader  = document.getElementById('pi-features-toggle');
        const labelStatic = document.getElementById('pi-features-label-static');
        const featBody   = document.getElementById('pi-features-body');
        const chevron    = document.getElementById('pi-features-chevron');

        // Medios de pago y canales: solo visibles con PI activo
        if (pmSection)   pmSection.style.display   = isActive ? 'block' : 'none';
        if (chSection)   chSection.style.display   = isActive ? 'block' : 'none';

        // Sección de features
        if (isActive) {
            // Acordeón colapsado por defecto cuando PI está activo
            if (accHeader)   { accHeader.style.display   = 'flex'; }
            if (labelStatic) { labelStatic.style.display = 'none'; }
            if (featBody)    { featBody.style.display    = 'none'; }
            if (chevron)     { chevron.style.transform   = 'rotate(0deg)'; }
        } else {
            // Normal (expandido) cuando PI está inactivo
            if (accHeader)   { accHeader.style.display   = 'none'; }
            if (labelStatic) { labelStatic.style.display = 'block'; }
            if (featBody)    { featBody.style.display    = 'block'; }
        }
    }

    // ── Estado del botón Datos de entrega según PI activo/inactivo ──
    function setDeliveryBtnState(isActive) {
        const btn = document.getElementById('pi-delivery-open');
        if (!btn) return;
        btn.disabled      = !isActive;
        btn.style.opacity = isActive ? '1'         : '0.45';
        btn.style.cursor  = isActive ? 'pointer'   : 'not-allowed';
    }

    // ── Acordeón: expandir/colapsar features ──
    document.getElementById('pi-features-toggle')?.addEventListener('click', () => {
        const featBody = document.getElementById('pi-features-body');
        const chevron  = document.getElementById('pi-features-chevron');
        if (!featBody) return;
        const isOpen = featBody.style.display !== 'none';
        featBody.style.display = isOpen ? 'none' : 'block';
        if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        if (window.lucide) window.lucide.createIcons();
    });

    // Cargar estado guardado y aplicar UI inicial
    const savedPI = localStorage.getItem(PI_KEY);
    if (piToggle && savedPI !== null) {
        piToggle.checked = savedPI === 'true';
    }
    applyPIToggleUI(savedPI === 'true');

    // Reaccionar al cambio del toggle en tiempo real
    piToggle?.addEventListener('change', () => {
        applyPIToggleUI(piToggle.checked);
        setDeliveryBtnState(piToggle.checked);
    });

    // ── Cargar datos de cuenta/tarjeta y settings PI desde Firestore ──
    async function loadPIScreenData() {
        const cedula = localStorage.getItem('bbva_user_id');
        if (!cedula) return;

        // Activar skeleton en los subtítulos de medios de pago
        const piAccountEl = document.getElementById('pi-pm-account-num');
        const piCardEl    = document.getElementById('pi-pm-card-num');
        [piAccountEl, piCardEl].forEach(el => el?.classList.add('skeleton'));

        // Bloquear visualmente las secciones completas hasta tener datos reales
        const pmSection = document.getElementById('pi-payment-methods-section');
        const chSection = document.getElementById('pi-channels-section');
        [pmSection, chSection].forEach(el => el?.classList.add('pi-section-loading'));

        if (!window.firebaseReady) {
            await new Promise(resolve => window.addEventListener('firebase-ready', resolve, { once: true }));
        }

        try {
            const [account, card, userData] = await Promise.all([
                window.getUserAccount    ? window.getUserAccount(cedula)    : null,
                window.getUserCreditCard ? window.getUserCreditCard(cedula) : null,
                window.getUserByCedula   ? window.getUserByCedula(cedula)   : null
            ]);

            // Mostrar números de cuenta y tarjeta
            if (piAccountEl) {
                piAccountEl.classList.remove('skeleton');
                piAccountEl.textContent = account?.accountNumber || '—';
            }
            if (piCardEl) {
                piCardEl.classList.remove('skeleton');
                piCardEl.textContent = card?.cardNumber || '—';
            }

            // Sincronizar toggle principal desde Firestore
            if (userData) {
                const piActive = !!userData.pagosInteligentes;
                if (piToggle) piToggle.checked = piActive;
                localStorage.setItem(PI_KEY, piActive ? 'true' : 'false');
                applyPIToggleUI(piActive);
                setDeliveryBtnState(piActive);
            }

            // Actualizar resumen de datos de entrega
            if (userData?.deliveryData) updateDeliverySummary(userData.deliveryData);

            // Restaurar checkboxes desde Firestore
            if (userData?.piSettings) {
                const pm = userData.piSettings.paymentMethods || {};
                const ch = userData.piSettings.channels       || {};
                const set = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.checked = !!val;
                };
                set('pi-pm-account',  pm.account);
                set('pi-pm-card',     pm.card);
                set('pi-ch-whatsapp', ch.whatsapp);
                set('pi-ch-telegram', ch.telegram);
                set('pi-ch-alexa',    ch.alexa);
                set('pi-ch-chats',    ch.chats);
                // Sincronizar chat-messenger con la config guardada
                const chatsOn = !!ch.chats;
                localStorage.setItem('bbva_chats_enabled', chatsOn ? 'true' : 'false');
                const chatWrapper = document.getElementById('chat-messenger-wrapper');
                if (chatWrapper && document.getElementById('dashboard-screen')?.classList.contains('active')) {
                    chatWrapper.style.display = chatsOn ? 'block' : 'none';
                }
            }
        } catch (err) {
            console.error('[PI] Error cargando datos de pantalla PI:', err);
            [piAccountEl, piCardEl].forEach(el => el?.classList.remove('skeleton'));
        } finally {
            // Siempre quitar el bloqueo al terminar (con o sin error)
            [pmSection, chSection].forEach(el => el?.classList.remove('pi-section-loading'));
        }
    }

    // Navegar a Pagos Inteligentes desde el banner
    document.getElementById('promo-banner-btn')?.addEventListener('click', () => {
        showScreen('pagos-inteligentes-screen');
        loadPIScreenData();
    });

    // Volver al dashboard
    document.getElementById('pi-back')?.addEventListener('click', () => {
        document.getElementById('app').classList.remove('dark-mode');
        showScreen('dashboard-screen');
    });

    // Guardar configuración
    document.getElementById('pi-save')?.addEventListener('click', async () => {
        const isActive = piToggle?.checked ?? false;

        // ── Validación: PI activo requiere al menos 1 medio de pago Y 1 canal ──
        if (isActive) {
            const hasPaymentMethod =
                document.getElementById('pi-pm-account')?.checked ||
                document.getElementById('pi-pm-card')?.checked;
            const hasChannel =
                document.getElementById('pi-ch-whatsapp')?.checked ||
                document.getElementById('pi-ch-telegram')?.checked ||
                document.getElementById('pi-ch-alexa')?.checked    ||
                document.getElementById('pi-ch-chats')?.checked;

            if (!hasPaymentMethod && !hasChannel) {
                showPIToast('Debes seleccionar al menos un medio de pago y un canal autorizado.', true);
                return;
            }
            if (!hasPaymentMethod) {
                showPIToast('Debes seleccionar al menos un medio de pago autorizado.', true);
                return;
            }
            if (!hasChannel) {
                showPIToast('Debes seleccionar al menos un canal autorizado.', true);
                return;
            }
        }

        console.log('[pi-save] Guardando. isActive:', isActive);
        localStorage.setItem(PI_KEY, isActive);

        // Recopilar medios de pago y canales autorizados
        const piSettings = {
            paymentMethods: {
                account: document.getElementById('pi-pm-account')?.checked  ?? false,
                card:    document.getElementById('pi-pm-card')?.checked     ?? false
            },
            channels: {
                whatsapp: document.getElementById('pi-ch-whatsapp')?.checked ?? false,
                telegram: document.getElementById('pi-ch-telegram')?.checked ?? false,
                alexa:    document.getElementById('pi-ch-alexa')?.checked    ?? false,
                chats:    document.getElementById('pi-ch-chats')?.checked    ?? false
            }
        };

        if (window.firebaseReady) {
            if (window.updatePagosInteligentes) await window.updatePagosInteligentes(isActive);
            if (window.updatePISettings)        await window.updatePISettings(piSettings);
        } else {
            console.warn('[pi-save] Firebase no disponible, solo guardado local.');
        }

        const msg = isActive
            ? 'Pagos Inteligentes activados correctamente'
            : 'Pagos Inteligentes desactivados';
        showPIToast(msg, false);
        updatePromoBanner();
        // Sincronizar FAB de chat con el nuevo estado del canal Chats BBVA
        localStorage.setItem('bbva_chats_enabled', piSettings.channels.chats ? 'true' : 'false');
    });

    // ── Helper toast PI (éxito y error) ──
    function showPIToast(message, isError = false) {
        piToastMsg.textContent = message;
        const icon = piToast.querySelector('[data-lucide]');
        if (icon) {
            icon.setAttribute('data-lucide', isError ? 'alert-circle' : 'check-circle');
            icon.style.color = isError ? '#e53935' : '';
        }
        piToast.classList.toggle('pi-toast-error', isError);
        piToast.classList.remove('pi-toast-hidden');
        piToast.classList.add('pi-toast-visible');
        if (window.lucide) window.lucide.createIcons();
        clearTimeout(piToast._hideTimer);
        piToast._hideTimer = setTimeout(() => {
            piToast.classList.remove('pi-toast-visible');
            piToast.classList.add('pi-toast-hidden');
            piToast.classList.remove('pi-toast-error');
        }, 3500);
    }

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
            if (data.sessionId) {
                sessionStorage.setItem('bbva_push_session_id', data.sessionId);
                sessionStorage.setItem('bbva_auth_session', data.sessionId);
            }
            if (data.userName) {
                sessionStorage.setItem('bbva_push_user_name', data.userName);
            }
            triggerAuthFromPush(data.cedula, data);
        }
    });

    // ── Escuchar mensajes del SW (app abierta, usuario clica la notificación) ──
    navigator.serviceWorker?.addEventListener('message', (event) => {
        const msg = event.data || {};
        console.log('[SW → app] Mensaje recibido:', msg);
        if (msg.type === 'AUTH_REQUEST' && msg.cedula) {
            sessionStorage.setItem('bbva_auth_from_push', '1');
            if (msg.sessionId) {
                sessionStorage.setItem('bbva_push_session_id', msg.sessionId);
                sessionStorage.setItem('bbva_auth_session', msg.sessionId);
            }
            if (msg.userName) {
                sessionStorage.setItem('bbva_push_user_name', msg.userName);
            }
            triggerAuthFromPush(msg.cedula, msg);
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

    // ── Modal Datos de entrega ──
    const deliveryModal = document.getElementById('pi-delivery-modal');

    document.getElementById('pi-delivery-open')?.addEventListener('click', async () => {
        deliveryModal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
        // Cargar datos guardados si hay
        const cedula = localStorage.getItem('bbva_user_id');
        if (!cedula) return;
        if (!window.firebaseReady) {
            await new Promise(resolve => window.addEventListener('firebase-ready', resolve, { once: true }));
        }
        try {
            const userData = await window.getUserByCedula(cedula);
            if (userData?.deliveryData) {
                const d = userData.deliveryData;
                const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
                setVal('del-address', d.address);
                setVal('del-dept',    d.department);
                setVal('del-city',    d.city);
                setVal('del-email',   d.email);
                setVal('del-phone',   d.phone);
                updateDeliverySummary(d);
            }
        } catch (e) {
            console.error('[delivery] Error cargando datos:', e);
        }
    });

    document.getElementById('pi-delivery-close')?.addEventListener('click', () => {
        deliveryModal.style.display = 'none';
    });
    deliveryModal?.addEventListener('click', (e) => {
        if (e.target === deliveryModal) deliveryModal.style.display = 'none';
    });

    document.getElementById('pi-delivery-save')?.addEventListener('click', async () => {
        const address    = document.getElementById('del-address')?.value.trim();
        const department = document.getElementById('del-dept')?.value.trim();
        const city       = document.getElementById('del-city')?.value.trim();
        const email      = document.getElementById('del-email')?.value.trim();
        const phone      = document.getElementById('del-phone')?.value.trim();

        if (!address || !department || !city || !email || !phone) {
            const toast = document.getElementById('pi-delivery-toast');
            if (toast) {
                toast.style.background = '#FFF0F0';
                toast.style.borderColor = '#e53935';
                toast.style.color = '#b71c1c';
                const icon = toast.querySelector('[data-lucide]');
                if (icon) { icon.setAttribute('data-lucide', 'alert-circle'); icon.style.color = '#e53935'; window.lucide?.createIcons(); }
                toast.querySelector('span').textContent = 'Completa todos los campos antes de guardar.';
                toast.style.display = 'flex';
                setTimeout(() => { toast.style.display = 'none'; }, 3000);
            }
            return;
        }

        const deliveryData = { address, department, city, email, phone };

        const saveBtn = document.getElementById('pi-delivery-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            if (window.firebaseReady && window.updateDeliveryData) {
                await window.updateDeliveryData(deliveryData);
            }
            updateDeliverySummary(deliveryData);
            const toast = document.getElementById('pi-delivery-toast');
            if (toast) {
                toast.style.background = '#E8F5E9';
                toast.style.borderColor = '#43a047';
                toast.style.color = '#1B5E20';
                const icon = toast.querySelector('[data-lucide]');
                if (icon) { icon.setAttribute('data-lucide', 'check-circle'); icon.style.color = '#2e7d32'; window.lucide?.createIcons(); }
                toast.querySelector('span').textContent = 'Datos guardados correctamente';
                toast.style.display = 'flex';
                setTimeout(() => { toast.style.display = 'none'; }, 2500);
            }
        } catch (e) {
            console.error('[delivery] Error guardando:', e);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar datos';
        }
    });

    function updateDeliverySummary(d) {
        const el = document.getElementById('pi-delivery-summary');
        if (!el) return;
        if (d?.city && d?.department) {
            el.textContent = `${d.city}, ${d.department}`;
        } else if (d?.address) {
            el.textContent = d.address.length > 32 ? d.address.slice(0, 32) + '…' : d.address;
        }
    }

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
                icon: '/blue-agents-demo/icono-pwa.png'
            });
            console.log('✅ Notificación nativa del navegador enviada');
        } else {
            console.warn('⚠️ Permiso de notificaciones no concedido. Permiso actual:', Notification.permission);
        }
    };

});
