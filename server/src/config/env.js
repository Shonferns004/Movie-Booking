import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_WORKERS } from './runtime.js';

// On Workers there is no project .env: variables and secrets arrive as bindings and
// are already on process.env. Reading dotenv there would only touch a stub filesystem,
// and `import.meta.url` is not available in the bundle.
if (!IS_WORKERS) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  dotenv.config();
}

/**
 * Configuration for the movie API.
 *
 * Only keys that code in this repository actually reads are listed; anything omitted
 * here falls back to the default shown. Configuration for the embedded YouPI gateway -
 * which runs on the Node host only - lives in `gateway-env.js`.
 *
 * On Workers every value comes from `vars`/secrets in wrangler.jsonc.
 */
export const env = {
  // --- Database -------------------------------------------------------------
  DATABASE_URL: process.env.DATABASE_URL,

  // --- API ------------------------------------------------------------------
  API_PORT: Number(process.env.PORT || process.env.API_PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || "development",
  // Set to 1 when the Node host is behind a trusted reverse proxy so Express
  // derives req.ip from the proxy chain instead of trusting caller headers.
  TRUST_PROXY: process.env.TRUST_PROXY || "",
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  // Short access tokens; refresh tokens are rotated and revocable in `sessions`.
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || "1h",
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || "30d",
  APP_BASE_URL: process.env.APP_BASE_URL || "http://localhost:5173",

  // Explicit opt-in for returning a gateway development OTP. Never enable this
  // in production; the API no longer infers it from an undefined NODE_ENV.
  EXPOSE_DEV_OTP: process.env.EXPOSE_DEV_OTP === "true",
  // Mock payment completion is a local-development aid only.
  ALLOW_MOCK_PAYMENTS: process.env.ALLOW_MOCK_PAYMENTS === "true",
  // Optional shared secret for the generic provider webhook. Unset = route off.
  GENERIC_WEBHOOK_SECRET: process.env.GENERIC_WEBHOOK_SECRET || "",
  // HMAC key for signed guest booking links. Falls back to JWT_SECRET.
  GUEST_ACCESS_SECRET:
    process.env.GUEST_ACCESS_SECRET || process.env.JWT_SECRET || "",

  // --- Payments -------------------------------------------------------------
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || "mock",
  // Allow the request body to select a payment provider. Off by default: the
  // provider is a server configuration, not caller input.
  ALLOW_PROVIDER_OVERRIDE: process.env.ALLOW_PROVIDER_OVERRIDE === "true",
  // Gates both the embedded gateway (Node) and its cleanup job (cron).
  YOUPI_ENABLED: process.env.YOUPI_ENABLED !== "false",
  // Base URL for server-to-server calls. On Workers point this at the Node host,
  // e.g. https://your-service.onrender.com/youpi.
  YOUPI_API_URL:
    process.env.YOUPI_API_URL ||
    // Workers has no loopback gateway: the URL must be set explicitly (point it at
    // the Node host, e.g. https://your-service.onrender.com/youpi).
    (IS_WORKERS
      ? ""
      : `http://127.0.0.1:${Number(process.env.PORT || process.env.API_PORT || 4000)}/youpi`),
  // Public origin used to build checkout links.
  YOUPI_PUBLIC_BASE_URL: process.env.YOUPI_PUBLIC_BASE_URL || "",
  YOUPI_MERCHANT_ID:
    process.env.YOUPI_MERCHANT_ID || "00000000-0000-0000-0000-000000000001",
  YOUPI_UPI_ID: process.env.YOUPI_UPI_ID || "",
  YOUPI_PAYEE_NAME: process.env.YOUPI_PAYEE_NAME || "",
  YOUPI_WEBHOOK_SECRET: process.env.YOUPI_WEBHOOK_SECRET || "",
  // How long a payable amount stays reserved. Longer than the gateway's active
  // window so a queued session cannot have its amount reissued.
  YOUPI_AMOUNT_HOLD_MINUTES: Number(process.env.YOUPI_AMOUNT_HOLD_MINUTES || 60),
  // Also used by the API's CORS allow-list. When it is not set, allow the customer
  // app (APP_BASE_URL) and the local dev origins to embed the checkout page.
  YOUPI_FRAME_ANCESTORS:
    process.env.YOUPI_FRAME_ANCESTORS
    || [
      process.env.APP_BASE_URL,
      "http://localhost:5173",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5175",
    ].filter(Boolean).join(","),

  // --- Email ----------------------------------------------------------------
  // console = log only. Workers has no SMTP sockets, so keep it on `console` there.
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || "console",
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || "no-reply@movie.local",

  // --- Maintenance ----------------------------------------------------------
  WORKER_POLL_INTERVAL_MS: Number(process.env.WORKER_POLL_INTERVAL_MS || 5000),
  // Runs the maintenance loop inside the web process (Node single-service hosts).
  // False on Workers: a Cron Trigger calls runTick() instead.
  RUN_WORKER: process.env.RUN_WORKER === "true",
  // Bearer token for /api/v1/internal/tick and /api/v1/internal/keepalive.
  INTERNAL_CRON_SECRET:
    process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET || "",
  HOLD_EXPIRY_SECONDS: Number(process.env.HOLD_EXPIRY_SECONDS || 600),
  MAX_SEATS_PER_BOOKING: Number(process.env.MAX_SEATS_PER_BOOKING || 10),

  // --- Cancellations & refunds ---------------------------------------------
  // Refund tiers as "hoursBeforeShow:percent", highest first. The customer sees this
  // estimate; staff approve the request and pay the refund by UPI.
  REFUND_TIERS: process.env.REFUND_TIERS || "24:100,2:50",
  CANCELLATION_ENABLED: process.env.CANCELLATION_ENABLED !== "false",

  // --- Object storage -------------------------------------------------------

  NEON_STORAGE_ENDPOINT:
    process.env.NEON_STORAGE_ENDPOINT ||
    "https://br-twilight-term-bdc6qrfo.storage.c-8.us-east-2.aws.neon.tech",
  NEON_STORAGE_REGION: process.env.NEON_STORAGE_REGION || "us-east-2",
  NEON_STORAGE_BUCKET: process.env.NEON_STORAGE_BUCKET || "movies",
  // Never ship real object-storage credentials as source defaults. Uploads
  // stay disabled until the operator supplies these values.
  NEON_STORAGE_ACCESS_KEY_ID: process.env.NEON_STORAGE_ACCESS_KEY_ID || "",
  NEON_STORAGE_SECRET_ACCESS_KEY: process.env.NEON_STORAGE_SECRET_ACCESS_KEY || "",
  NEON_STORAGE_PUBLIC_URL: process.env.NEON_STORAGE_PUBLIC_URL || "",

  // --- Neon Realtime (live queries) ---
  // Enabled per branch in the Neon Console. The secret stays server-side: the Worker
  // holds the subscription and pushes changes to the apps.
  NEON_REALTIME_URL: process.env.NEON_REALTIME_URL || "",
  NEON_REALTIME_SECRET: process.env.NEON_REALTIME_SECRET || "",
  NEON_REALTIME_DB: process.env.NEON_REALTIME_DB || "neondb",
  // Where the Node relay posts change events (the Worker's internal realtime endpoint).
  REALTIME_RELAY_URL:
    process.env.REALTIME_RELAY_URL ||
    "https://movie-worker.konkani-samudai.workers.dev/api/v1/internal/realtime",
};
