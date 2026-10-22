import { env } from './config/env.js';
import app from './app.js';
import { startYoupiGateway } from './payments/youpi/gateway.js';

// The embedded YouPI PG gateway (payment core + checkout portal) is started here so
// the whole stack - movie API and UPI gateway - runs from one process and one port.
try {
  await startYoupiGateway();
} catch (err) {
  console.error('[YOUPI] gateway failed to start:', err.message);
}

app.listen(env.API_PORT, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${env.API_PORT}`);
});
