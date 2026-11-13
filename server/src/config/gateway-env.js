import './env.js';

/**
 * Configuration for the embedded YouPI gateway.
 *
 * That gateway only runs on the Node host (it spawns child processes, listens on
 * localhost ports and keeps a SQLite file), so these keys are deliberately kept out of
 * `env.js`: nothing on Cloudflare Workers reads them.
 *
 * Reserved for `src/payments/youpi/*`. Every value still comes from the same `.env`.
 */
export const gatewayEnv = {
  YOUPI_GATEWAY_URL: process.env.YOUPI_GATEWAY_URL || '',
  YOUPI_GATEWAY_API_PORT: Number(process.env.YOUPI_GATEWAY_API_PORT || 6100),
  YOUPI_GATEWAY_PORTAL_PORT: Number(process.env.YOUPI_GATEWAY_PORTAL_PORT || 7000),
  YOUPI_CLIENT_API_BASE: process.env.YOUPI_CLIENT_API_BASE || '/youpi',
  // Merchant admin panel (WhatsApp pairing, APK download) and the local SMS observer.
  YOUPI_ADMIN_ENABLED: process.env.YOUPI_ADMIN_ENABLED !== 'false',
  YOUPI_ADMIN_PORT: Number(process.env.YOUPI_ADMIN_PORT || 6001),
  YOUPI_OBSERVER_ENABLED: process.env.YOUPI_OBSERVER_ENABLED === 'true',
  YOUPI_OBSERVER_PORT: Number(process.env.YOUPI_OBSERVER_PORT || 6002),
  YOUPI_GMAIL_PORT: Number(process.env.YOUPI_GMAIL_PORT || 6003),
  // Google OAuth client for the Gmail observer (create one in Google Cloud Console).
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || '',
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || '',
  // The gateway's SQL is SQLite-flavored (integer booleans, datetime('now')), so it
  // persists to SQLite by default. It must not inherit the movie API's Postgres URL.
  YOUPI_DATABASE_URL: process.env.YOUPI_DATABASE_URL || process.env.DATABASE_URL || 'sqlite',
  // Optional absolute path for the gateway SQLite file (defaults to
  // vendor/youpi-pg/data/youpi_pg.sqlite, which is on the Render disk).
  YOUPI_SQLITE_PATH: process.env.YOUPI_SQLITE_PATH || '',
  YOUPI_WEBHOOK_URL: process.env.YOUPI_WEBHOOK_URL || '',
  YOUPI_ALLOW_ADMIN: process.env.YOUPI_ALLOW_ADMIN === 'true',
  YOUPI_ALLOW_DEV_TOOLS: process.env.YOUPI_ALLOW_DEV_TOOLS === 'true',
};
