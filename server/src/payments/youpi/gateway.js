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
  // Loopback only. The gateway is never published directly; the movie API proxies it
  // through the single public port.
  process.env.YOUPI_BIND_HOST = '127.0.0.1';
  process.env.BASE_PAYMENT_API_URL = `http://127.0.0.1:${env.YOUPI_GATEWAY_API_PORT}`;
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
 */
export function startYoupiGateway() {
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

    await configureMerchant();

    console.log(
      `[YOUPI] gateway ready (core 127.0.0.1:${env.YOUPI_GATEWAY_API_PORT}, ` +
        `portal 127.0.0.1:${env.YOUPI_GATEWAY_PORTAL_PORT})`
    );

    return {
      corePort: env.YOUPI_GATEWAY_API_PORT,
      portalPort: env.YOUPI_GATEWAY_PORTAL_PORT,
      close: async () => {
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
