import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app-core.js';
import { youpiGatewayMiddleware } from './payments/youpi/mount.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Node host entry (Render, local dev).
 *
 * The routes and middleware live in app-core.js so the same API can run on Cloudflare
 * Workers. This file only adds what needs a real filesystem or a local port: the
 * embedded YouPI gateway proxy, uploaded media and the built frontends.
 */
function mountHostAssets(app) {
  const uploadDir = path.resolve(process.cwd(), 'uploads');
  // Uploaded media is referenced from the client origin, so it must not be locked
  // to same-origin by helmet's default Cross-Origin-Resource-Policy.
  app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  }));

  // Seat-builder admin UI (Vite build output). Mounted before the customer SPA so
  // /admin is not swallowed by the catch-all below.
  const adminDist = path.resolve(__dirname, '../../admin/dist');
  if (fs.existsSync(path.join(adminDist, 'index.html'))) {
    app.use('/admin', express.static(adminDist, { index: false, maxAge: '1h' }));
    app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  }

  // Serve the built SPA when it exists (Vercel / single-host deployments). In dev the
  // Vite dev server serves the client, so the folder is usually absent and this is a no-op.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/.*/, (req, res, next) => {
      // API and gateway paths must keep returning JSON errors, not the SPA shell.
      if (/^\/(api|youpi|uploads|checkout|css|icons|js|admin)(\/|$)/.test(req.path) || req.path === '/youpi.js') {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
}

// The embedded YouPI PG gateway is mounted before the security headers and the body
// parser: it streams its own request bodies and ships its own CSP/CORS headers.
const app = createApp({
  before: [youpiGatewayMiddleware],
  extend: mountHostAssets,
});

export default app;
