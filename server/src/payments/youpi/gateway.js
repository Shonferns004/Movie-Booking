import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { env } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the vendored YouPI PG checkout (packages + the two apps we run). */
export const VENDOR_ROOT = path.resolve(__dirname, '../../../vendor/youpi-pg');

/** Merchant the gateway seeds on first boot. */
export const DEFAULT_MERCHANT_ID = '00000000-0000-0000-0000-000000000001';

let startPromise = null;

function vendorUrl(...parts) {
  return pathToFileURL(path.join(VENDOR_ROOT, ...parts)).href;
}

/**
 * The vendored gateway reads its configuration from the process environment, so it
 * has to be populated before the modules are imported.
 */
function configureGatewayEnv() {
  process.env.PAYMENT_API_PORT = String(env.YOUPI_GATEWAY_API_PORT);
  process.env.CHECKOUT_PORTAL_PORT = String(env.YOUPI_GATEWAY_PORTAL_PORT);
  process.env.MERCHANT_ADMIN_PORT = String(env.YOUPI_ADMIN_PORT);
  process.env.SMS_OBSERVER_PORT = String(env.YOUPI_OBSERVER_PORT);
  // Loopback only. The gateway is never published directly; the movie API proxies it
  // through the single public port.
  process.env.YOUPI_BIND_HOST = '127.0.0.1';
  process.env.BASE_PAYMENT_API_URL = `http://127.0.0.1:${env.YOUPI_GATEWAY_API_PORT}`;
  // The Gmail observer's OAuth callback comes back through this server's own port.
  process.env.GMAIL_OBSERVER_PORT = String(env.YOUPI_GMAIL_PORT);
  if (!process.env.GMAIL_REDIRECT_URI) {
    process.env.GMAIL_REDIRECT_URI = `http://127.0.0.1:${env.API_PORT}/youpi/gmail/oauth/callback`;
  }
  // Prefix the checkout page uses for its own /api/v1 calls (local patch in the portal).
  process.env.YOUPI_CLIENT_API_BASE = env.YOUPI_CLIENT_API_BASE;
  // Our webhook target is the movie API on loopback, which the gateway's SSRF guard
  // rejects unless private targets are explicitly allowed.
  process.env.YOUPI_ALLOW_PRIVATE_WEBHOOKS = 'true';
  if (env.YOUPI_ALLOW_DEV_TOOLS) process.env.YOUPI_ALLOW_DEV_TOOLS = 'true';
  if (env.YOUPI_FRAME_ANCESTORS) process.env.CHECKOUT_FRAME_ANCESTORS = env.YOUPI_FRAME_ANCESTORS;
}

/**
 * Points the gateway's default merchant at this server's webhook endpoint and makes
 * sure a receiving UPI account exists. Without this the gateway would post webhooks
 * to its upstream default URL and the booking would never be confirmed.
 */
async function configureMerchant() {
  const { getDatabase, MerchantRepository, ReceivingAccountRepository } = await import('@youpi/db');
  const db = getDatabase();
  const merchantRepo = new MerchantRepository(db);
  const merchant =
    merchantRepo.findById(env.YOUPI_MERCHANT_ID) ||
    (typeof merchantRepo.getDefault === 'function' ? merchantRepo.getDefault() : null) ||
    merchantRepo.findAll()[0];
  if (!merchant) return null;

  const webhookUrl =
    env.YOUPI_WEBHOOK_URL || `http://127.0.0.1:${env.API_PORT}/api/v1/payments/webhooks/youpi`;
  const updates = {};
  if (merchant.webhookUrl !== webhookUrl) updates.webhookUrl = webhookUrl;
  if (env.YOUPI_WEBHOOK_SECRET && merchant.webhookSecret !== env.YOUPI_WEBHOOK_SECRET) {
    updates.webhookSecret = env.YOUPI_WEBHOOK_SECRET;
  }
  if (Object.keys(updates).length) {
    merchantRepo.update(merchant.id, updates);
    console.log(`[YOUPI] merchant ${merchant.id} webhook -> ${webhookUrl}`);
  }

  if (env.YOUPI_UPI_ID) {
    const accountRepo = new ReceivingAccountRepository(db);
    try {
      accountRepo.upsertActiveForMerchant(
        merchant.id,
        env.YOUPI_UPI_ID,
        env.YOUPI_PAYEE_NAME || merchant.businessName
      );
      console.log(`[YOUPI] receiving account -> ${env.YOUPI_UPI_ID}`);
    } catch (e) {
      console.warn(`[YOUPI] could not update receiving account: ${e.message}`);
    }
  }

  return merchant;
}

/**
 * Boots the vendored YouPI PG payment core and checkout portal inside this process.
 * Both stay on loopback; the movie API is the only public entry point.
 *
 * When YOUPI_GATEWAY_URL is set the gateway runs somewhere else (always-on host)
 * and this process only proxies to it - nothing is booted locally.
 */
export function startYoupiGateway() {
  if (env.YOUPI_GATEWAY_URL) {
    console.log(`[YOUPI] using remote gateway ${env.YOUPI_GATEWAY_URL}`);
    return Promise.resolve({
      remote: true,
      targetUrl: env.YOUPI_GATEWAY_URL.replace(/\/$/, ''),
      corePort: env.YOUPI_GATEWAY_API_PORT,
      portalPort: env.YOUPI_GATEWAY_PORTAL_PORT,
      close: async () => {},
    });
  }
  if (!env.YOUPI_ENABLED) return Promise.resolve(null);
  if (startPromise) return startPromise;

  startPromise = (async () => {
    configureGatewayEnv();

    const { createPaymentApp } = await import(vendorUrl('apps', 'payment-api', 'src', 'index.js'));
    const { CheckoutServer } = await import(vendorUrl('apps', 'checkout-portal', 'src', 'server.js'));

    const core = createPaymentApp();
    await new Promise((resolve, reject) => {
      core.rawServer.once('error', reject);
      core.rawServer.listen(env.YOUPI_GATEWAY_API_PORT, '127.0.0.1', resolve);
    });

    const portal = new CheckoutServer();
    const portalServer = portal.createServer();
    await new Promise((resolve, reject) => {
      portalServer.once('error', reject);
      portalServer.listen(env.YOUPI_GATEWAY_PORTAL_PORT, '127.0.0.1', resolve);
    });

    // Merchant admin panel (WhatsApp pairing, APK download, service management).
    let admin = null;
    if (env.YOUPI_ADMIN_ENABLED) {
      const { startAdminServer } = await import(vendorUrl('apps', 'merchant-admin', 'src', 'index.js'));
      admin = await startAdminServer(env.YOUPI_ADMIN_PORT, { apiBaseUrl: '/youpi' });
    }

    // Local SMS observer (reads Google Messages in a browser and forwards bank SMS).
    let observer = null;
    if (env.YOUPI_OBSERVER_ENABLED) {
      const { startSmsObserver } = await import(vendorUrl('apps', 'sms-observer', 'src', 'index.js'));
      observer = await startSmsObserver(env.YOUPI_OBSERVER_PORT);
    }

    // Gmail observer (official Google OAuth: reads bank credit emails).
    let gmail = null;
    if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET) {
      const { startGmailObserver } = await import(vendorUrl('apps', 'gmail-observer', 'src', 'index.js'));
      gmail = await startGmailObserver(env.YOUPI_GMAIL_PORT);
    }

    await configureMerchant();

    console.log(
      `[YOUPI] gateway ready (core 127.0.0.1:${env.YOUPI_GATEWAY_API_PORT}, ` +
        `portal 127.0.0.1:${env.YOUPI_GATEWAY_PORTAL_PORT}` +
        (admin ? `, admin 127.0.0.1:${env.YOUPI_ADMIN_PORT}` : '') +
        (observer ? `, observer 127.0.0.1:${env.YOUPI_OBSERVER_PORT}` : '') +
        (gmail ? `, gmail 127.0.0.1:${env.YOUPI_GMAIL_PORT}` : '') +
        ')'
    );

    return {
      corePort: env.YOUPI_GATEWAY_API_PORT,
      portalPort: env.YOUPI_GATEWAY_PORTAL_PORT,
      adminPort: admin ? admin.port : null,
      observerPort: observer ? observer.port : null,
      gmailPort: gmail ? gmail.port : null,
      close: async () => {
        if (gmail) await gmail.close();
        if (observer) await observer.close();
        if (admin) await admin.close();
        await new Promise((resolve) => portalServer.close(resolve));
        await new Promise((resolve) => core.rawServer.close(resolve));
        if (typeof core.destroy === 'function') core.destroy();
      },
    };
  })().catch((err) => {
    startPromise = null;
    throw err;
  });

  return startPromise;
}

/** The gateway is started lazily on first use, so the API can boot without it. */
export function getYoupiGateway() {
  return startYoupiGateway();
}
