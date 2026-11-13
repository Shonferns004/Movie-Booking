import express from 'express';
import { env } from './config/env.js';
import { startYoupiGateway } from './payments/youpi/gateway.js';
import { youpiGatewayMiddleware } from './payments/youpi/mount.js';
import { startRealtimeRelay, stopRealtimeRelay } from './realtime/relay.js';

/**
 * Gateway-only host (Render).
 *
 * The movie API runs on Cloudflare Workers; this process exists only to run the
 * embedded YouPI payment gateway and expose it on one public port, because the
 * gateway needs child processes, loopback ports and a database file/socket.
 *
 * Everything is served under the same prefixes the Worker and the browser expect:
 *
 *   /youpi/api/*    payment core
 *   /checkout/*     hosted UPI checkout page
 *   /youpi/admin    merchant admin panel
 *   /youpi/observer Android SMS observer endpoints
 *   /youpi.js       browser SDK
 *
 * Start with `npm run start:gateway`. Render sets PORT; health check is /health.
 */

const app = express();

// Health must answer before the gateway finishes booting: Render restarts a service
// whose health check fails, and a cold start can take a while.
app.get(['/health', '/youpi/health'], (req, res) => {
  res.json({ ok: true, service: 'youpi-gateway' });
});

app.use(youpiGatewayMiddleware);

const gateway = await startYoupiGateway();
if (!gateway) {
  console.error('[gateway-only] YOUPI_ENABLED=false — nothing to serve');
  process.exit(1);
}

app.listen(env.API_PORT, '0.0.0.0', () => {
  console.log(`[gateway-only] listening on http://0.0.0.0:${env.API_PORT}`);
  console.log(`[gateway-only] core=${gateway.corePort} portal=${gateway.portalPort} admin=${gateway.adminPort ?? '-'}`);
  // Realtime relay: one Neon subscription here, events pushed to the Worker.
  startRealtimeRelay();
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(`[gateway-only] ${signal} received, shutting down`);
    try {
      stopRealtimeRelay();
      await gateway.close?.();
    } finally {
      process.exit(0);
    }
  });
}
