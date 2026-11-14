# Deploying the API to Cloudflare Workers

The movie API runs on Workers against **Neon Postgres** (through Hyperdrive) and stores
posters in **Neon Object Storage**. The YouPI payment gateway does **not** run on
Workers - it spawns child processes, listens on localhost ports and keeps a SQLite file.
Keep it on Render (or any Node host) and let the API call it over HTTPS.

```
browser / app ──► Cloudflare Worker (Express API) ──Hyperdrive──► Neon Postgres
                        │                                   └──► Neon Object Storage
                        └──HTTPS──► Node host (YouPI gateway: API + checkout + admin)
```

| Concern | Node host (Render) | Cloudflare Worker |
| --- | --- | --- |
| `src/app-core.js` routes | yes | yes |
| Postgres | `pg.Pool` from `DATABASE_URL` | Hyperdrive, one `pg` client per request |
| Poster storage | Neon bucket (or Supabase/Cloudinary/disk) | Neon bucket (memory upload, no disk) |
| Embedded YouPI gateway | yes | no - HTTP to the Node host |
| `RUN_WORKER` loop | yes | no - Cron Trigger calls `runTick()` |
| Keep-alive ping | n/a | Cron Trigger writes one `temp` row / 2 days |
| `/uploads`, built SPAs | `express.static` | not served (use Workers Assets / R2) |
| SMTP email | `nodemailer` | no (Workers has no SMTP) - keep `EMAIL_PROVIDER=console` |

## 1. Hyperdrive (already configured)

`wrangler.jsonc` points at a Hyperdrive config named `movie-db` for the Neon database
`neondb`. The id lives in the config; the connection string does not.

To recreate it (for a different branch or a rotated password):

```sh
cd server/movie-worker
npx wrangler login
npx wrangler hyperdrive create movie-db \
  --connection-string="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
```

then paste the returned `id` into `wrangler.jsonc`.

> Neon's pooler (`-pooler.` in the hostname) is fine as the Hyperdrive origin. Use a
> dedicated database role, and rotate the password if it was ever shared.

The schema is `server/database/full_schema.sql`:

```sh
psql "$DATABASE_URL" -f server/database/full_schema.sql
```

## 2. Neon Object Storage (posters)

1. Neon Console → project → branch → **Object storage** → **New bucket**
   (name e.g. `movie-posters`, access level **public_read**).
2. Create a credential with scopes `storage:read` and `storage:write`.
3. Read the branch endpoint:

```sh
curl "https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/storage"
# → { "s3_endpoint": "https://br-xxxx.storage.c-8.us-east-2.aws.neon.tech",
#     "region": "us-east-2", "force_path_style": true }
```

4. Put the endpoint/bucket in `vars` and the keys in secrets:

```sh
npx wrangler secret put NEON_STORAGE_ACCESS_KEY_ID     # token_id (nak_live_...)
npx wrangler secret put NEON_STORAGE_SECRET_ACCESS_KEY # s3_secret_access_key (nsk_live_...)
```

```
NEON_STORAGE_ENDPOINT=https://br-xxxx.storage.c-8.us-east-2.aws.neon.tech
NEON_STORAGE_REGION=us-east-2
NEON_STORAGE_BUCKET=movie-posters
```

Uploads go through `src/integrations/neon-storage.js`. It signs S3 requests with
`aws4fetch`, so no AWS SDK in the bundle. A `public_read` bucket means posters are
served straight from the branch endpoint, e.g.

```
https://br-xxxx.storage.c-8.us-east-2.aws.neon.tech/movie-posters/movies/<id>/poster-<ts>.jpg
```

Supabase Storage and Cloudinary remain as fallbacks; the order is
Neon → Supabase → Cloudinary → local disk (Node only).

## 3. Add secrets

```sh
npx wrangler secret put JWT_SECRET
npx wrangler secret put JWT_REFRESH_SECRET
npx wrangler secret put INTERNAL_CRON_SECRET   # protects /api/v1/internal/* endpoints
npx wrangler secret put YOUPI_WEBHOOK_SECRET
npx wrangler secret put ADMIN_TOKEN            # /api/v1/admin/* is OPEN when this is unset
```

Non-secret values (`APP_BASE_URL`, `YOUPI_API_URL`, `NEON_STORAGE_*` endpoint/bucket)
live in the `vars` block of `wrangler.jsonc`.

For the split deployment, point the API at the Node host:

```
YOUPI_API_URL=https://your-service.onrender.com/youpi
YOUPI_PUBLIC_BASE_URL=https://your-service.onrender.com
```

`YOUPI_ENABLED` must stay `false` on Workers: it only gates the *embedded* gateway.

## 4. Local development

```sh
cd server/movie-worker
npx wrangler dev          # http://localhost:8787/health
```

Local secrets go in `.dev.vars` (git-ignored). `wrangler dev` emulates Hyperdrive
against `hyperdrive[0].localConnectionString` (a local Postgres by default). To use the
real Neon database locally:

```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "<neon connection string>"
npx wrangler dev
```

or `npx wrangler dev --remote`, which uses the deployed Hyperdrive config.

## 5. Deploy

```sh
npx wrangler deploy
npx wrangler tail          # live logs
```

## 6. Background work and the keep-alive

`triggers.crons` runs every minute and, in order:

1. `recordKeepAlive()` - writes **one row to `temp` every two days**. Free-tier Neon
   suspends when idle and can be removed after long inactivity; the row keeps the
   project alive. It is guarded, so running the cron every minute still produces one
   row per 48 hours.
2. `runTick()` - seat-hold expiry, delayed publishing, email outbox.

Manual/external alternative to cron:

```sh
curl -H "Authorization: Bearer $INTERNAL_CRON_SECRET" \
  https://crm-backend.YOUR-SUBDOMAIN.workers.dev/api/v1/internal/keepalive
# add ?force=1 to always insert a row
```

The `temp` table is created on demand and also declared in `database/full_schema.sql`.

## 7. Payments (YouPI gateway on Render, API on Workers)

The gateway cannot run on Workers, so it gets its own Node service while the API stays
on Cloudflare:

```
browser / app ──► Worker (API) ──HTTPS──► youpi-gateway.onrender.com
                     ▲                              │
                     └──── webhook (payment.success)─┘
```

1. **Deploy the gateway** with `render.gateway.yaml`:
   Dashboard → **New** → **Blueprint** → select this repo → point it at that file.
   Then fill the `sync: false` values:

   | Variable | Value |
   | --- | --- |
   | `YOUPI_DATABASE_URL` | the Neon URL (same as `DATABASE_URL`; tables go in the `youpi` schema) |
   | `YOUPI_PUBLIC_BASE_URL` | `https://youpi-gateway.onrender.com` |
   | `YOUPI_WEBHOOK_URL` | `https://movie-worker.<subdomain>.workers.dev/api/v1/payments/webhooks/youpi` |
   | `YOUPI_WEBHOOK_SECRET` | same value as the Worker secret |
   | `YOUPI_FRAME_ANCESTORS` | your frontend origin |

   The service runs `npm run start:gateway` (`src/gateway-only.js`): just the gateway
   plus the single-port proxy, no API routes and no maintenance loop.

2. **Point the Worker at it** (`vars` in `wrangler.jsonc`, then `npx wrangler deploy`):

   ```
   YOUPI_API_URL=https://youpi-gateway.onrender.com/youpi
   YOUPI_PUBLIC_BASE_URL=https://youpi-gateway.onrender.com
   ```

3. **Keep Render awake.** Render free stops a service after ~15 idle minutes (~50s
   cold start). The Worker's cron calls `GET <YOUPI_API_URL>/health` every 5 minutes,
   which is enough to hold it open (288 requests/day, well inside the free 750
   instance-hours). Watch it with `npx wrangler tail` — you should see
   `[cron] gateway warmup 200`.

   Free-tier caveats: no disk (hence the Neon database for the gateway) and a restart
   on every deploy, so the `generateValue` secrets in the blueprint must stay stable
   or enrolled Android devices will unpair.

4. **Verify**: `POST /api/v1/payments/youpi/orders` should return `201` with a
   `scriptUrl`, and `https://youpi-gateway.onrender.com/health` should return
   `{"ok":true,"service":"youpi-gateway"}`.

Without `YOUPI_API_URL` the API answers with
`503 payment gateway is not configured on this deployment: set YOUPI_API_URL ...`.

### Unique payment amounts

Every YouPI order adds a **unique paise offset** (₹0.01–₹0.99) to the booking total
before creating the gateway session, for example ₹200.47. The observer only sees the
amount in the bank SMS, so this is what lets the gateway route a credit to the exact
booking even when two users pay at once, a payment arrives before its queued session
becomes active, or an unrelated transfer has the same rupee value.

- `payments.amount_minor` stores the payable amount; `bookings.total_minor` remains the
  ticket price. The difference is the verification offset (shown in checkout).
- Offsets are unique among open orders and recent successes; abandoned orders release
  their offset after 15 minutes.
- If a credit matches a **QUEUED** session, the gateway answers `409` with
  `retry: true` instead of rejecting it. The observer keeps the message pending and
  retries for up to 15 minutes, when the queue promotes it.

## 8. Realtime (Neon Realtime → all apps)

```
Neon Postgres ──Realtime WS──► Node host (relay) ──HTTPS──► Worker DO ──WS──► apps
```

Neon's client SDK is JS/TS only (no Dart), and its WebSocket does **not** survive in the
Workers runtime — but it works in Node. So the always-on Node host holds the single
subscription and POSTs change events to the Worker, whose Durable Object
(`RealtimeHub`) fans them out as `{ "type": "change", "topic": "..." }`:

| Topic | Watches | Apps |
| --- | --- | --- |
| `catalog` | movies, theatres, auditoriums, shows | admin app, web client |
| `seats` | seat holds, bookings, per-seat status | web seat picker, admin app |
| `payments` | payments, tickets | pay/observer app, admin app |

Events carry no rows — clients refetch the endpoints they already use. `WSS
/api/v1/realtime` is the socket; `POST /api/v1/internal/realtime` is the relay's private
publish endpoint (Bearer `INTERNAL_CRON_SECRET`).

**The Node host needs:**

```
NEON_REALTIME_URL=https://<branch>.rt.c-8.<region>.aws.neon.tech
NEON_REALTIME_SECRET=<branch secret from Console → Realtime → Copy secret>
INTERNAL_CRON_SECRET=<same value as the Worker secret>
# optional, defaults to the deployed Worker:
REALTIME_RELAY_URL=https://movie-worker.<subdomain>.workers.dev/api/v1/internal/realtime
```

The relay starts automatically from `npm run start:gateway` (and from `npm start`).
`GET /status` shows the live subscription count and the last topic received.

**Enabling Neon Realtime** (once per branch): Console → **Postgres database** →
**Realtime** → **Enable Realtime**. ⚠️ This turns on logical replication for the project
and **suspends every compute once**; `wal_level` stays `logical` afterwards. Free in beta.

## Things to check before you rely on it

- **Rate limiting** is an in-memory map, so it is per isolate on Workers. Use the
  Workers Rate Limiting binding or a Durable Object if it has to be global.
- **Poster files** served from `/uploads` do not exist on the Worker.
- **`express.json` encoding**: the Worker aliases `iconv-lite` to a UTF-8 shim
  (`src/iconv-lite-shim.cjs`) because its browser build crashes Workers. JSON requests
  are fine; any other charset is rejected.
