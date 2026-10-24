import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './modules/auth/routes.js';
import movieRoutes from './modules/movies/routes.js';
import theatreRoutes from './modules/theatres/routes.js';
import showRoutes from './modules/shows/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import bookingRoutes from './modules/bookings/routes.js';
import paymentRoutes from './modules/payments/routes.js';
import ticketRoutes from './modules/tickets/routes.js';
import staffRoutes from './modules/staff/routes.js';
import adminRoutes from './modules/admin/routes.js';
import { errorMiddleware } from './middleware/error.js';
import { youpiGatewayMiddleware } from './payments/youpi/mount.js';
import internalRoutes from './modules/internal/routes.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(morgan('dev'));
// The embedded YouPI PG gateway is mounted before the security headers and the body
// parser: it streams its own request bodies and ships its own CSP/CORS headers.
app.use(youpiGatewayMiddleware);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/movies', movieRoutes);
app.use('/api/v1/theatres', theatreRoutes);
app.use('/api/v1/shows', showRoutes);
app.use('/api/v1/seat-holds', inventoryRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/internal', internalRoutes);
app.use('/api/v1/admin', adminRoutes);

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

app.use(errorMiddleware);
export default app;
