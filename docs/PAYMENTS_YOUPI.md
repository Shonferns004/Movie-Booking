# YouPI PG Payment Integration

This project uses [YouPI-PG](https://github.com/youpi-pg/YouPI-PG) — a self-hosted UPI payment
gateway with zero gateway fees, direct-to-bank settlement, a browser SDK checkout modal, and
HMAC-SHA256 signed webhooks.

> YouPI PG is an independent research project. It is **not** NPCI/RBI approved or production
> certified. Use it for development/testing only and follow the risk guidance in its README.

## 1. The gateway is vendored and runs inside this server

The gateway lives in `server/vendor/youpi-pg` and is started by the movie API itself
(`server/src/payments/youpi/gateway.js`). There is **no second project to clone, no second
`npm install` and no extra public port** — the checkout page, the browser SDK and the payment
REST API are all served by the one port this app already uses (`API_PORT`, default `4000`).

```
browser ──► http://<host>:4000
             ├── /api/v1/...                     movie API (unchanged)
             ├── /youpi/api/v1/...              YouPI payment core      (internal proxy)
             ├── /checkout/<paymentId>           YouPI checkout page     (internal proxy)
             ├── /youpi.js                       YouPI browser SDK       (internal proxy)
             └── /css, /icons, /js               checkout page assets    (internal proxy)
```

Inside the process the gateway keeps its own loopback listeners (6100 payment core,
7000 checkout portal). They are bound to `127.0.0.1` and are never published — the movie API
is the only public entry point.

The three vendored packages (`@youpi/common`, `@youpi/core`, `@youpi/db`) are npm workspaces of
this repo, so `npm install` at the repository root links them.

## 2. Configure this app

In the root `.env`:

```env
# Embedded gateway (single port)
YOUPI_ENABLED=true
YOUPI_GATEWAY_API_PORT=6100          # internal loopback port of the payment core
YOUPI_GATEWAY_PORTAL_PORT=7000       # internal loopback port of the checkout portal
YOUPI_CLIENT_API_BASE=/youpi         # prefix the checkout page uses for its own /api/v1 calls
YOUPI_PUBLIC_BASE_URL=               # empty = derive from the request host (localhost + LAN work)

# Merchant
YOUPI_MERCHANT_ID=00000000-0000-0000-0000-000000000001  # public id, sent as X-Merchant-Id
YOUPI_WEBHOOK_SECRET=<shared secret>                     # HMAC-SHA256 webhook secret

# Your real UPI VPA - the QR the customer scans
YOUPI_UPI_ID=yourname@bank
YOUPI_PAYEE_NAME=Konkani Samudai

# Origins allowed to embed the checkout page (comma separated)
YOUPI_FRAME_ANCESTORS=http://localhost:5173
```

`YOUPI_PUBLIC_BASE_URL` is normally left empty: the server derives the public origin from the
incoming request, so the same build works on `http://localhost:4000` and on a LAN address such
as `http://192.168.0.150:4000` (the Flutter/scanner app).

On boot the gateway is pointed at this server automatically:

- the default merchant's webhook URL becomes `http://127.0.0.1:<API_PORT>/api/v1/payments/webhooks/youpi`,
- the merchant's webhook secret becomes `YOUPI_WEBHOOK_SECRET` (encrypted at rest by the gateway),
- the receiving UPI account is created from `YOUPI_UPI_ID` / `YOUPI_PAYEE_NAME`.

The gateway's admin API and its developer simulators are **not** exposed on the public port.
Enable them explicitly while testing:

```env
YOUPI_ALLOW_DEV_TOOLS=true   # POST /youpi/api/v1/checkout/:id/simulate-observation
```

## 3. Flow

1. `POST /api/v1/bookings` → pending booking (seats held).
2. `POST /api/v1/payments/youpi/orders` → creates a YouPI payment session and returns
   `orderId`, `amount`, `paymentId`, `checkoutUrl`, `scriptUrl`, `apiUrl`, `portalUrl`,
   `merchantKey`. All gateway URLs point back at this server's own origin.
3. The client loads `scriptUrl` (the SDK) with `data-api-url` / `data-portal-url` set to the
   gateway prefix, then calls `window.Youpi.pay({ checkoutUrl, order_id, amount, ... })`. The
   session already exists, so the SDK opens the checkout page instead of creating a second one.
4. The checkout page authenticates the customer (WhatsApp OTP), activates the session, shows the
   UPI QR and posts the result back to the storefront window.
5. On success the client calls `POST /api/v1/payments/youpi/confirm` — the server re-checks the
   status with the gateway, verifies the amount, and confirms the booking.
6. Independently, the **authoritative** webhook (`/api/v1/payments/webhooks/youpi`) confirms the
   booking. Browser callbacks alone never fulfil an order.

Booking confirmation page polls `GET /api/v1/bookings/:reference` so the ticket QR codes appear
as soon as the webhook lands.

## 4. Verifying the integration

```bash
# structural check of the gateway surface on one port
TEST_BASE=http://localhost:4000 npm --workspace server run youpi:smoke

# full loop: order -> checkout session -> bank observation -> signed webhook -> confirmed booking
# (needs a second instance with the developer tools enabled:
#  API_PORT=4100 YOUPI_ALLOW_DEV_TOOLS=true YOUPI_EXPOSE_DEV_OTP=true npm --workspace server run dev)
TEST_BASE=http://localhost:4100 npm --workspace server run youpi:e2e
```

`youpi:smoke` only reads, `youpi:e2e` inserts a temporary booking and deletes it again.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/payments/youpi/orders` | Create payment session for a booking |
| GET | `/api/v1/payments/youpi/status/:paymentId` | Poll gateway status |
| POST | `/api/v1/payments/youpi/confirm` | Verify + confirm after browser callback |
| POST | `/api/v1/payments/webhooks/youpi` | Authoritative signed webhook |
| POST | `/api/v1/payments/mock/complete` | Mock provider (still available for testing) |

## Notes on the vendored copy

`server/vendor/youpi-pg` is upstream code with two small local patches:

- `apps/checkout-portal/src/server.js` reads `YOUPI_CLIENT_API_BASE` for the base URL the
  checkout page uses for its own `/api/v1` calls. Unset, the behaviour is unchanged (`''`).
- `apps/checkout-portal/src/views/checkout.html` fills the OTP input with the `devOtp` value the
  core returns when `YOUPI_EXPOSE_DEV_OTP=true`, so the sign-in step can be completed without a
  paired WhatsApp number. The core only sends that value outside production.

Keep the patches when re-syncing the vendor tree.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `booking window closed` (alert right after pressing Book/Proceed) | The show's booking window has passed. `createHold` rejects holds outside `[booking_opens_at, booking_closes_at]`, and the seeded show closes 15 minutes before it starts. | Create a show with a future start time from the Admin page (`/admin`), or re-seed |
| `seat currently held` / `seat already booked` | A previous hold or booking still owns the seat. | Pick different seats, or wait for `HOLD_EXPIRY_SECONDS` |
| Checkout modal opens and closes instantly | The browser still runs the old client bundle, where the SDK creates its own session against `/api/v1/payments` (the movie API) instead of using the gateway prefix. | Hard-reload the page (Ctrl+Shift+R) |
| `Failed to load Youpi SDK` | The SDK script was not reachable. | Check `GET /youpi.js` on the API port |
| OTP never arrives | `berryprotocol` is not installed, so no WhatsApp message is sent. | Dev: `YOUPI_EXPOSE_DEV_OTP=true` (the code is auto-filled). Real: install `berryprotocol` and pair a number |

