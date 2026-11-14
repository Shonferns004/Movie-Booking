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
import communityRoutes from './modules/community/routes.js';
import internalRoutes from './modules/internal/routes.js';
import { errorMiddleware } from './middleware/error.js';
import { env } from './config/env.js';
import { IS_WORKERS } from './config/runtime.js';

/**
 * `morgan('dev')` builds its colored line with `new Function`, which Workers forbids.
 * A plain function format sidesteps the eval and works on both hosts.
 */
function requestLogger() {
  if (!IS_WORKERS) return morgan('dev');
  return morgan((tokens, req, res) => [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    `${tokens['response-time'](req, res)} ms`,
  ].join(' '));
}

/**
 * The HTTP API, independent of the host.
 *
 * This module deliberately contains nothing that needs a filesystem or a local port,
 * so it can be bundled into a Cloudflare Worker. Anything host specific - the embedded
 * YouPI gateway, uploaded posters, the built SPAs - is attached by `app.js` (Node) or
 * left out by the Worker entry.
 *
 * @param {object} options
 * @param {Function[]} [options.before] Middleware mounted before the body parser (the
 *   YouPI gateway proxy needs the untouched request stream).
 * @param {(app: import('express').Express) => void} [options.extend] Hook to add routes
 *   just before the error handler.
 */
export function createApp({
  before = /** @type {Function[]} */ ([]),
  extend = null,
} = {}) {
  const app = express();

  app.use(requestLogger());
  for (const middleware of before) app.use(middleware);

  // Restrict CORS to known origins instead of reflecting any origin.
  const allowedOrigins = new Set(
    [
      env.APP_BASE_URL,
      env.YOUPI_FRAME_ANCESTORS,
      'http://localhost:5173',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5175',
    ]
      .flatMap((v) => String(v || '').split(','))
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...allowedOrigins],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      // "null" is what a browser sends for a local file:// page - the root status.html
      // dashboard is meant to be opened straight from disk.
      if (origin === 'null') return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      // Vite moves to the next free port in development; allow any localhost port
      // instead of failing with a confusing CORS 403.
      if (env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }
      // A rejected origin is a client error, not a server failure: 403 keeps it out of
      // the 5xx error metrics instead of surfacing as "Internal server error".
      const error = new Error(`CORS origin not allowed: ${origin}`);
      error.status = 403;
      return callback(error);
    },
    credentials: true,
  }));

  app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'auth' }));
  app.use('/api/v1/payments', rateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: 'payments' }));

  app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'movie-booking-api' }));

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
  app.use('/api/v1/community', communityRoutes);

  if (extend) extend(app);

  app.use(errorMiddleware);
  return app;
}

// Simple in-memory rate limiter for auth and payment endpoints.
const rateLimitBuckets = new Map();

function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = keyPrefix + ':' + ip;
    const now = Date.now();
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      rateLimitBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Workers cannot keep a module level timer between requests, and the per-isolate
// bucket map is short lived there anyway.
if (!IS_WORKERS) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitBuckets) {
      if (now - bucket.start > 10 * 60 * 1000) rateLimitBuckets.delete(key);
    }
  }, 60 * 1000).unref();
}
