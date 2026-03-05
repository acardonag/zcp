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
        // Mostrar/ocultar FAB de chat según pantalla activa
        const fab = document.getElementById('fab-chat-btn');
        if (fab) fab.style.display = (screenId === 'dashboard-screen' && localStorage.getItem('bbva_chats_enabled') === 'true') ? 'flex' : 'none';
    };

    // ── Login state (declarado al inicio para evitar TDZ en triggerAuthFromPush) ──
    const DEFAULT_PASSWORD = '1234';
    let loginStep     = 'cedula';
    let loginUserData = null;

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

            // Sincronizar visibilidad del FAB de chat con la config de canales PI
            const chatsEnabled = !!userData?.piSettings?.channels?.chats;
            localStorage.setItem('bbva_chats_enabled', chatsEnabled ? 'true' : 'false');
            const fabEl = document.getElementById('fab-chat-btn');
            if (fabEl) fabEl.style.display = chatsEnabled ? 'flex' : 'none';

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

    // ── Auth desde notificación push: buscar usuario y abrir modal biométrico ──
    async function triggerAuthFromPush(cedula) {
        console.log('[auth-push] 🔔 triggerAuthFromPush() llamado con cédula:', cedula);
        console.log('[auth-push] Estado actual → firebaseReady:', window.firebaseReady, '| getUserByCedula:', typeof window.getUserByCedula);

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
            loadDashboardBalances();
            // Solicitar permiso push y registrar FCM token
            if (window.initPushNotifications) window.initPushNotifications(cedLogin);
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
        biometricModal.style.display = 'none';
        // Ocultar info de usuario push al cancelar
        const userInfo = document.getElementById('biometric-user-info');
        if (userInfo) userInfo.style.display = 'none';
        sessionStorage.removeItem('bbva_auth_from_push');
        console.log('[biometric] Modal cancelado');
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
                // ── Notificar a n8n que la autenticación biométrica fue exitosa ──
                (async () => {
                    const pushSessionId = sessionStorage.getItem('bbva_push_session_id') || '';
                    const pushUserName  = sessionStorage.getItem('bbva_push_user_name')  || localStorage.getItem('bbva_user') || '';
                    sessionStorage.removeItem('bbva_push_session_id');
                    sessionStorage.removeItem('bbva_push_user_name');
                    if (pushSessionId) {
                        try {
                            const formData = new URLSearchParams();
                            formData.append('status',    'APROBADO');
                            formData.append('sessionId', pushSessionId);
                            formData.append('cedula',    localStorage.getItem('bbva_user_id') || '');
                            formData.append('userName',  pushUserName);
                            formData.append('mensaje',   'Autenticación biométrica exitosa en BBVA.');
                            const n8nUrls = [
                                'https://nuketownlabs-n8n.ko2m0t.easypanel.host/webhook-test/pago-confirmado',
                                'https://nuketownlabs-n8n.ko2m0t.easypanel.host/webhook/pago-confirmado'
                            ];
                            for (const url of n8nUrls) {
                                try {
                                    const res = await fetch(url, { method: 'POST', body: formData });
                                    if (res.ok) { console.log('✅ Sesión confirmada en n8n:', pushSessionId); break; }
                                } catch (e) { console.warn('⚠️ n8n endpoint no respondió:', url); }
                            }
                        } catch (err) {
                            console.warn('⚠️ No se pudo notificar a n8n, continuando al dashboard:', err.message);
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
                if (window.initPushNotifications) window.initPushNotifications(cedBio);
            } else {
                // ── Flujo normal de biometría ──
                console.log('[fingerprint] Flujo NORMAL → dashboard');
                updatePromoBanner();
                showScreen('dashboard-screen');
                loadDashboardBalances();
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
                // Sincronizar FAB de chat con la config guardada
                const chatsOn = !!ch.chats;
                localStorage.setItem('bbva_chats_enabled', chatsOn ? 'true' : 'false');
                const fabSync = document.getElementById('fab-chat-btn');
                if (fabSync && document.getElementById('dashboard-screen')?.classList.contains('active')) {
                    fabSync.style.display = chatsOn ? 'flex' : 'none';
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
                icon: '/zcp/icono-pwa.png'
            });
            console.log('✅ Notificación nativa del navegador enviada');
        } else {
            console.warn('⚠️ Permiso de notificaciones no concedido. Permiso actual:', Notification.permission);
        }
    };

});
