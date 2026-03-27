# ZCP — Zero Clic Payment (App BBVA Colombia)

> Proyecto frontend PWA — Estado: 10 de marzo de 2026

---

## Qué es

PWA (Progressive Web App) que simula la app móvil de **BBVA Colombia**. Es el lado del **usuario/cliente** del ecosistema Blue Agents. Permite al usuario registrarse, consultar saldos, configurar **Pagos Inteligentes** y **aprobar pagos** iniciados desde el agente de Telegram.

No tiene backend propio — todo el estado persiste en **Firebase Firestore** y las notificaciones push llegan vía **FCM**.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + Vanilla JS (sin frameworks) |
| Base de datos | Firebase Firestore (`zero-clic-payment`) |
| Push notifications | Firebase Cloud Messaging (FCM) |
| PWA | Service Worker (`sw.js`) — cache v16 |
| Deploy | Cloudflare Pages (`_headers`, `_redirects`) |
| Fuentes / íconos | Google Fonts Inter + Lucide Icons |

---

## Archivos principales

| Archivo | Descripción |
|---|---|
| `index.html` | App principal: login, dashboard, configuración de Pagos Inteligentes |
| `app.js` | Toda la lógica de UI/UX: navegación entre pantallas, login, dashboard, saldos, PI |
| `firebase-init.js` | Inicialización Firebase, funciones Firestore (CRUD usuarios, cuentas, deliveryData, piSettings) |
| `styles.css` | Estilos globales con variables CSS (`--bbva-navy`, `--bbva-light-blue`, etc.) |
| `payment-approval.html` | Pantalla de **aprobación/rechazo de pago** — se abre al recibir un push `AUTH_REQUEST` |
| `chat/index.html` | Interfaz de chat con el agente virtual BBVA (canal "Chats" de Pagos Inteligentes) |
| `sw.js` | Service Worker: cache de assets, manejo FCM en background |
| `manifest.json` | Configuración PWA (nombre BBVA Colombia, color `#004481`, standalone) |

---

## Flujo principal del usuario

```
1. Registro / Login
   └── Ingresa cédula + password (default: 1234)
   └── Si nuevo → registerUserInFirestore() crea doc en users/{cedula}
   └── Si existente → getUserByCedula() valida y carga datos

2. Dashboard
   └── Muestra saldo cuenta (COP) y tarjeta de crédito
   └── loadDashboardBalances() → lee Firestore en paralelo
   └── Banner "Pagos Inteligentes" activo/inactivo

3. Configuración de Pagos Inteligentes
   └── Toggle ON/OFF → updatePagosInteligentes()
   └── Checkboxes canales: WhatsApp, Telegram, Alexa, Chats → updatePISettings()
   └── Datos de envío: dirección, ciudad, email, teléfono → updateDeliveryData()

4. Aprobación de pago (payment-approval.html)
   └── Se abre cuando llega push FCM tipo AUTH_REQUEST
   └── Muestra producto, monto, datos del pedido
   └── Usuario aprueba con biometría simulada → POST al bridge de CES
   └── Usuario rechaza → pantalla de rechazo

5. Chat (chat/index.html)
   └── Solo visible si piSettings.channels.chats === true
   └── Conecta con el bridge de CES en GCP
```

---

## Modelo de datos — Firestore `users/{cedula}`

```json
{
  "name": "NOMBRE COMPLETO",
  "cedula": "1053798697",
  "email": "usuario@gmail.com",
  "deviceId": "bbva-xxxx-uuid",
  "fcmToken": "...",
  "fcmUpdatedAt": "ISO timestamp",
  "registeredAt": "ISO timestamp",
  "platform": "User-Agent string",
  "accountId": "timestamp_1",
  "creditCardId": "timestamp_2",
  "pagosInteligentes": true,
  "piSettings": {
    "paymentMethods": { "account": true, "card": true },
    "channels": {
      "whatsapp": false,
      "telegram": true,
      "alexa": true,
      "chats": false
    }
  },
  "deliveryData": {
    "address": "Calle 48 # 19 200",
    "department": "Risaralda",
    "city": "Pereira",
    "email": "usuario@gmail.com",
    "phone": "3128175657"
  }
}
```

---

## Integración con GCP (Blue Agents)

| Evento | Dirección | Detalle |
|---|---|---|
| FCM push `AUTH_REQUEST` | GCP → App | El bridge en GCP envía push cuando el agente pide autenticar al usuario |
| `payment-approval.html` abre | App (cliente) | La app recibe el push y abre la pantalla de aprobación |
| POST `/payment-result` | App → CES bridge | Al aprobar, la app llama al bridge de CES con `{sessionId, status}` |
| Chat BBVA | App → CES bridge | `chat/index.html` hace POST al bridge `/chat` |

**Bridge CES:** `https://ces-session-bridge-bla4v7hs7a-uc.a.run.app`

---

## Firebase

```
Project ID:   zero-clic-payment
App ID:       1:367886461501:web:25e36faafd8ef4dde4d854
Messaging ID: 367886461501
VAPID Key:    BL1nSLXaN-rF8d5EP2SrGAH5YPOW1BTQuq0CD6aWRN6iHUpsHVk3eYZncsHWXdrfvTrkj7SrQHKOqyPpXjuiw9M
```

---

## Deploy

- **Cloudflare Pages** — `_redirects` redirige todo a `index.html` (SPA)
- `_headers` configura cache: `sw.js` y `manifest.json` no se cachean; assets estáticos se cachean 1 año
- Service Worker versión actual: **v16** (`CACHE_NAME = 'bbva-app-v16'`)
- También desplegado en **GitHub Pages** (`acardonag.github.io/zcp`) — el SW detecta el dominio y ajusta el `BASE` path

---

## Variables CSS importantes

```css
--bbva-navy:       #004481   /* azul oscuro corporativo */
--bbva-light-blue: #1173d4   /* azul claro / CTAs */
--bbva-gray:       #F4F4F4
--bbva-border:     #DDE3EA
```
