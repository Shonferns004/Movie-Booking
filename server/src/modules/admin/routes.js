import { Router } from 'express';
import crypto from 'node:crypto';
import * as admin from './service.js';
import * as auth from '../auth/service.js';
import { unauthorized } from '../../utils/errors.js';

const router = Router();

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Shared-secret or ADMIN-JWT guard for the seat-builder/admin API.
 * Fails closed when the shared secret is absent; an authenticated ADMIN JWT
 * still works, so a Worker without ADMIN_TOKEN is not open to anonymous callers.
 */
function adminOnly(req, res, next) {
  const expected = String(process.env.ADMIN_TOKEN || '').trim();
  const supplied = req.headers['x-admin-token'];
  if (expected && safeEqual(supplied, expected)) return next();

  // Allow authenticated admin users (the Flutter app and website use JWT).
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (jwt) {
    try {
      const payload = auth.verifyToken(jwt);
      auth.getUserAuthState(payload.sub).then((state) => {
        if (state && state.status === 'active' && state.roles.includes('ADMIN')) return next();
        next(unauthorized('Invalid admin token'));
      }).catch(() => next(unauthorized('Invalid admin token')));
      return;
    } catch {
      // fall through to the shared-secret decision
    }
  }

  if (!expected) return next(unauthorized('Admin access is not configured'));
  next(unauthorized('Invalid admin token'));
}

router.use(adminOnly);

// The private admin APK uses this to obtain the YouPI gateway admin token
// without hard-coding it or asking the operator to paste it. Only an
// authenticated admin session can read it.
router.get('/youpi-token', (req, res) => {
  const token = String(process.env.ADMIN_API_TOKEN || '').trim();
  if (!token) {
    res.status(503).json({
      error: 'Gateway admin token is not configured on the server.',
    });
    return;
  }
  res.json({ token });
});

// ---------------------------------------------------------------- theatres

router.get('/theatres', async (req, res, next) => {
  try { res.json({ theatres: await admin.listTheatres() }); } catch (e) { next(e); }
});

router.post('/theatres', async (req, res, next) => {
  try { res.status(201).json({ theatre: await admin.createTheatre(req.body || {}) }); } catch (e) { next(e); }
});

router.patch('/theatres/:id', async (req, res, next) => {
  try { res.json({ theatre: await admin.updateTheatre(req.params.id, req.body || {}) }); } catch (e) { next(e); }
});

router.delete('/theatres/:id', async (req, res, next) => {
  try { res.json(await admin.deleteTheatre(req.params.id)); } catch (e) { next(e); }
});

// ------------------------------------------------------------- auditoriums

router.get('/theatres/:id/auditoriums', async (req, res, next) => {
  try { res.json({ auditoriums: await admin.listAuditoriums(req.params.id) }); } catch (e) { next(e); }
});

router.post('/theatres/:id/auditoriums', async (req, res, next) => {
  try {
    res.status(201).json({ auditorium: await admin.createAuditorium(req.params.id, req.body || {}) });
  } catch (e) { next(e); }
});

router.patch('/auditoriums/:id', async (req, res, next) => {
  try { res.json({ auditorium: await admin.updateAuditorium(req.params.id, req.body || {}) }); } catch (e) { next(e); }
});

router.delete('/auditoriums/:id', async (req, res, next) => {
  try { res.json(await admin.deleteAuditorium(req.params.id)); } catch (e) { next(e); }
});

// ------------------------------------------------------------ seat layouts

router.get('/auditoriums/:id/layout', async (req, res, next) => {
  try { res.json(await admin.getLayout(req.params.id)); } catch (e) { next(e); }
});

router.post('/auditoriums/:id/layout', async (req, res, next) => {
  try { res.status(201).json(await admin.saveLayout(req.params.id, req.body || {})); } catch (e) { next(e); }
});

// --------------------------------------------------------- seat categories

router.get('/seat-categories', async (req, res, next) => {
  try { res.json({ categories: await admin.listCategories() }); } catch (e) { next(e); }
});

router.post('/seat-categories', async (req, res, next) => {
  try { res.status(201).json({ category: await admin.createCategory(req.body || {}) }); } catch (e) { next(e); }
});

export default router;
