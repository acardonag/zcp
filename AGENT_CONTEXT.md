# BBVA Demo Agent Context

## Purpose

This repo is the BBVA-style mobile PWA that acts as the user-facing wallet/approval app for the demo.

It simulates:

- login by cedula
- dashboard balances
- `Pagos Inteligentes`
- payment approval / rejection flows
- push reception via FCM

The app persists state in Firebase and receives pushes from the GCP bridges.

## Topology

- `index.html`: main login/dashboard shell.
- `app.js`: front-end state machine and UI logic.
- `firebase-init.js`: Firebase bootstrap and Firestore helpers.
- `payment-approval.html`: payment approval modal/page opened from push notifications.
- `chat/index.html`: chat channel entrypoint.
- `sw.js`: service worker, FCM background handler, cache strategy.
- `manifest.json`: PWA metadata.

## Runtime flow

### Login and dashboard

1. User enters `cedula` and password.
2. `getUserByCedula()` loads the user from Firestore.
3. User state drives dashboard, balances, and PI settings.

### Auth push

1. `ces-session-bridge` sends an `AUTH_REQUEST` push to the device token.
2. The service worker or foreground Firebase handler opens `payment-approval.html`.
3. The approval page renders the product/order data and simulated biometric approval.
4. On approval, the page posts the auth result back to CES.

### Payment push

1. `voice-commerce-bridge` sends a payment request push.
2. The same approval page renders the final payment prompt.
3. On approval, the page posts the payment result back to the commerce bridge.
4. WooCommerce status should transition to `processing` for the same order.

## Important data sources

- Firestore `users/{cedula}`
- Firestore fields:
  - `pagosInteligentes`
  - `piSettings`
  - `deliveryData`
  - `fcmToken`
- FCM token is required for push delivery.

## Critical contracts

### Auth approval

The approval page must preserve:

- `sessionId`
- `cedula`
- `userName`

These are required for the callback to land on the same auth session.

### Payment approval

The approval page must preserve:

- `sessionId`
- `orderId`
- `orderKey`
- `productId`
- `storeId`

The payment callback must update the exact purchase session that the wrapper is polling.

## Deployment

- Firebase Hosting site: `zero-clic-payments`
- Local development may run through a local static server, but cached service worker state can hide updates.

## Failure modes to watch

- Service worker cache holding old `payment-approval.html`.
- `sessionId=None` or missing query params in approval pages.
- CORS blocking local callbacks to Cloud Run.
- Payment approval updating WooCommerce but not the bridge session state.
- Duplicate order creation if the commerce bridge is called twice.

## Operational notes

- This repo is the client app, not the orchestration backend.
- Do not mix auth session state with payment session state.
- Keep Firebase config and FCM token management aligned with the deployed hosting version.

