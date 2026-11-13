import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://localhost:4000';

/**
 * `/api` and `/uploads` are the movie API. The remaining paths belong to the
 * embedded YouPI gateway (`/youpi.js`, the hosted `/checkout/:paymentId` page and
 * its assets), so the SDK modal can load on the Vite origin during development.
 */
const proxy = {
  '/api': backend,
  '/uploads': backend,
  '/youpi': backend,
  // Only the hosted payment page (/checkout/<paymentId>), not the SPA's /checkout route.
  '^/checkout/': backend,
  '/css': backend,
  '/icons': backend,
  '/js': backend,
};

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5175, proxy },
  preview: { host: '0.0.0.0', port: 5175, proxy },
});
